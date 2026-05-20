// Vercel serverless — CHOG PFP Studio
const crypto = require('crypto');
const zlib   = require('zlib');
const Jimp   = require('jimp');

const SB_URL  = 'https://phjolzvyewacjqausmxx.supabase.co';
const SB_KEY  = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';
const OPENAI_KEY      = process.env.OPENAI_API_KEY;
const SESSION_SECRET  = process.env.SESSION_SECRET || 'chog-pfp-fallback-secret';
const MONAD_RPC       = 'https://rpc.monad.xyz';
const DEV_WALLET      = '0xf9bb715c1DC21EB661FCaC75d45BCf470235e0d8';
const CREDITS_PER_PAYMENT = 10;
const DEV_WALLETS = ['0x536bcf80556e021fbc3022c45799be409a22e864'];

const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

/* ── PNG mask generator ─────────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// zones: array of [x1, y1, x2, y2] as 0-1 proportions — transparent = edit, opaque = preserve
function makeMaskPng(w, h, zones) {
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(h * stride, 0);

  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < w; x++) raw[y * stride + 1 + x * 4 + 3] = 255;
  }

  for (const [rx1, ry1, rx2, ry2] of zones) {
    const px1 = Math.max(0, Math.floor(rx1 * w));
    const py1 = Math.max(0, Math.floor(ry1 * h));
    const px2 = Math.min(w, Math.ceil(rx2 * w));
    const py2 = Math.min(h, Math.ceil(ry2 * h));
    for (let y = py1; y < py2; y++)
      for (let x = px1; x < px2; x++)
        raw[y * stride + 1 + x * 4 + 3] = 0;
  }

  const compressed = zlib.deflateSync(raw);

  function mkChunk(type, data) {
    const lenBuf = Buffer.alloc(4); lenBuf.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    mkChunk('IHDR', ihdr),
    mkChunk('IDAT', compressed),
    mkChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ── image dimension parser (JPEG + PNG, no deps) ── */
function getImageDimensions(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i + 4 <= buf.length) {
      if (buf[i] !== 0xFF) break;
      const marker = buf[i + 1];
      const segLen  = buf.readUInt16BE(i + 2);
      if (marker >= 0xC0 && marker <= 0xC3) {
        return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      }
      if (marker === 0xD9 || marker === 0xDA) break;
      i += 2 + segLen;
    }
  }
  return { w: 1024, h: 1024 };
}

/* ── helpers ── */
function parseCookies(str = '') {
  return Object.fromEntries(
    str.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    }).filter(([k]) => k)
  );
}

function verifySession(token) {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (expected !== sig) return null;
  try { return JSON.parse(Buffer.from(payload, 'base64url').toString()); }
  catch { return null; }
}

function makeBatchToken(wallet) {
  const payload = Buffer.from(JSON.stringify({ wallet: wallet.toLowerCase(), exp: Date.now() + 180000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

function verifyBatchToken(token, wallet) {
  if (!token || !wallet) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  if (expected !== sig) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.wallet === wallet.toLowerCase() && data.exp > Date.now();
  } catch { return false; }
}

function getSession(req) {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies['pfp_session'];
  return raw ? verifySession(raw) : null;
}

/* ── Supabase ── */
async function getWalletRow(wallet) {
  const r = await fetch(`${SB_URL}/rest/v1/pfp_credits?wallet=eq.${wallet.toLowerCase()}`, { headers: SB_HEADERS });
  const rows = await r.json();
  return rows[0] || null;
}

async function uploadToStorage(imageData, wallet) {
  const filename = `${wallet.toLowerCase().slice(2, 10)}_${Date.now()}.png`;
  let buffer;
  try {
    if (typeof imageData === 'string' && imageData.startsWith('data:')) {
      buffer = Buffer.from(imageData.split(',')[1], 'base64');
    } else {
      const r = await fetch(imageData);
      buffer = Buffer.from(await r.arrayBuffer());
    }
  } catch (e) { console.warn('[storage] buffer error:', e.message); return null; }

  const r = await fetch(`${SB_URL}/storage/v1/object/pfp-history/${filename}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${SB_KEY}`, 'apikey': SB_KEY, 'Content-Type': 'image/png', 'x-upsert': 'false' },
    body: buffer,
  });
  if (!r.ok) { console.warn('[storage] upload failed:', r.status, await r.text()); return null; }
  return `${SB_URL}/storage/v1/object/public/pfp-history/${filename}`;
}

async function addToWalletHistory(wallet, imageUrl) {
  const row = await getWalletRow(wallet);
  const prev = Array.isArray(row?.recent_history) ? row.recent_history : [];
  const next = [imageUrl, ...prev].slice(0, 10);
  await fetch(`${SB_URL}/rest/v1/pfp_credits`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
    body: JSON.stringify({ wallet: wallet.toLowerCase(), recent_history: next }),
  });
  return next;
}

async function upsertWallet(wallet, credits, usedTxhashes) {
  const body = { wallet: wallet.toLowerCase(), credits, used_txhashes: usedTxhashes };
  const r = await fetch(`${SB_URL}/rest/v1/pfp_credits`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { return null; }
}

async function getTwitterRow(twitterId) {
  const r = await fetch(`${SB_URL}/rest/v1/pfp_twitter?twitter_id=eq.${twitterId}`, { headers: SB_HEADERS });
  const rows = await r.json();
  return rows[0] || null;
}

async function ensureTwitterRow(twitterId) {
  const r = await fetch(`${SB_URL}/rest/v1/pfp_twitter`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ twitter_id: twitterId, used_free: false }),
  });
  return r.ok;
}

async function markFreeUsed(twitterId) {
  const r = await fetch(`${SB_URL}/rest/v1/pfp_twitter`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ twitter_id: twitterId, used_free: true }),
  });
  const data = await r.json();
  if (!r.ok) console.error('[markFreeUsed] failed:', r.status, data);
  return r.ok;
}

async function verifyPayment(txHash, fromWallet) {
  const rpcRes = await fetch(MONAD_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getTransactionByHash', params: [txHash] }),
  });
  const { result: tx } = await rpcRes.json();
  if (!tx) return { ok: false, reason: 'Transaction not found' };
  const to   = (tx.to || '').toLowerCase();
  const from = (tx.from || '').toLowerCase();
  const val  = BigInt(tx.value || '0x0');
  const required = BigInt('0x56bc75e2d63100000');
  if (to   !== DEV_WALLET.toLowerCase()) return { ok: false, reason: 'Wrong recipient' };
  if (from !== fromWallet.toLowerCase()) return { ok: false, reason: 'Sender mismatch' };
  if (val  < required)                   return { ok: false, reason: 'Insufficient amount' };
  return { ok: true };
}

/* ── handler ── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    return await _handler(req, res);
  } catch (e) {
    console.error('[pfp-generate] unhandled:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
};

async function _handler(req, res) {
  const { action, wallet, txHash, image, chogStyle, customPrompt } = req.body || {};
  const session = getSession(req);

  const isDevWallet = wallet && DEV_WALLETS.includes(wallet.toLowerCase());

  if (action === 'credits') {
    let twitterRow = session ? await getTwitterRow(session.id) : null;
    if (session && !twitterRow) {
      await ensureTwitterRow(session.id);
      twitterRow = await getTwitterRow(session.id);
    }
    const twitterFree = !!(twitterRow && !twitterRow.used_free);
    const walletRow = wallet ? await getWalletRow(wallet) : null;
    const walletCredits = isDevWallet ? 9999 : (walletRow?.credits ?? 0);
    const history = walletRow?.recent_history || [];
    return res.json({ twitterFree, walletCredits, total: (twitterFree ? 1 : 0) + walletCredits, history });
  }

  if (action === 'pay') {
    if (!wallet) return res.status(400).json({ error: 'wallet required' });
    if (!txHash) return res.status(400).json({ error: 'txHash required' });
    const row = await getWalletRow(wallet);
    const usedTxhashes = row?.used_txhashes || [];
    if (usedTxhashes.includes(txHash.toLowerCase()))
      return res.status(400).json({ error: 'Transaction already used' });
    const verify = await verifyPayment(txHash, wallet);
    if (!verify.ok) return res.status(400).json({ error: verify.reason });
    const newCredits = (row?.credits ?? 0) + CREDITS_PER_PAYMENT;
    try { await upsertWallet(wallet, newCredits, [...usedTxhashes, txHash.toLowerCase()]); }
    catch (e) { return res.status(500).json({ error: 'Payment verified but DB save failed. txHash: ' + txHash, dbError: e.message }); }
    const verifyRow = await getWalletRow(wallet);
    if (!verifyRow || verifyRow.credits !== newCredits)
      return res.status(500).json({ error: 'Credits did not persist. txHash: ' + txHash });
    return res.json({ ok: true, walletCredits: verifyRow.credits });
  }

  if (action === 'refund') {
    if (!wallet) return res.status(400).json({ error: 'wallet required' });
    const { batchToken, count } = req.body || {};
    if (!batchToken || !verifyBatchToken(batchToken, wallet))
      return res.status(403).json({ error: 'Invalid or expired batch token' });
    const refundCount = Math.min(Math.max(parseInt(count) || 0, 1), 10);
    const row = await getWalletRow(wallet);
    const newCredits = (row?.credits ?? 0) + refundCount;
    await upsertWallet(wallet, newCredits, row?.used_txhashes || []);
    console.log('[refund] wallet:', wallet, 'count:', refundCount, 'newCredits:', newCredits);
    return res.json({ ok: true, walletCredits: newCredits });
  }

  if (action === 'generate') {
    if (!OPENAI_KEY) return res.status(500).json({ error: 'API key not configured' });
    if (!image)      return res.status(400).json({ error: 'image required' });

    const { batchMode, batchToken } = req.body || {};
    let useTwitterFree = false, walletRow = null, outBatchToken = null;

    if (batchToken) {
      // Subsequent batch call — verify token, skip credit deduction
      if (!wallet || !verifyBatchToken(batchToken, wallet))
        return res.status(403).json({ error: 'Invalid or expired batch token' });
    } else if (batchMode) {
      // First batch call — deduct 10 credits atomically up front
      if (!wallet) return res.status(402).json({ error: 'Wallet required for batch generate' });
      if (isDevWallet) {
        outBatchToken = makeBatchToken(wallet);
      } else {
        walletRow = await getWalletRow(wallet);
        if (!walletRow || walletRow.credits < 10)
          return res.status(402).json({ error: 'Need 10 credits for batch generate. Pay 100 MON to top up.' });
        await upsertWallet(wallet, walletRow.credits - 10, walletRow.used_txhashes || []);
        outBatchToken = makeBatchToken(wallet);
      }
    } else {
      // Normal single generation
      if (session) {
        let twitterRow = await getTwitterRow(session.id);
        if (!twitterRow) { await ensureTwitterRow(session.id); twitterRow = await getTwitterRow(session.id); }
        if (twitterRow && !twitterRow.used_free) useTwitterFree = true;
      }
      if (!useTwitterFree) {
        if (!wallet) return res.status(402).json({ error: 'Connect X for 1 free generation, or pay 100 MON for more.' });
        if (!isDevWallet) {
          walletRow = await getWalletRow(wallet);
          if (!walletRow || walletRow.credits < 1)
            return res.status(402).json({ error: 'No credits left. Pay 100 MON to get 10 more.' });
        }
      }
      if (useTwitterFree) await markFreeUsed(session.id);
      else if (!isDevWallet) await upsertWallet(wallet, walletRow.credits - 1, walletRow.used_txhashes || []);
    }

    // Base image: 2.png or 3.png (default 3.png)
    const styleFilename = (chogStyle === '2') ? '2.png' : '3.png';

    const [visionRes, baseImgRes] = await Promise.all([
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o', max_tokens: 600,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: image, detail: 'high' } },
              { type: 'text', text: 'Extract abstract traits ONLY — do NOT describe exact appearance details. Return ONLY this JSON (no markdown): {"hair_color": "primary color name only (e.g. pink, black, blonde, brown) — single word", "hair_silhouette": "rough silhouette category ONLY: short / medium / long / spiky / twin-tails / ponytail / bob / bald — pick one, no details", "hat": "hat type + color in 1-3 words, or null", "hairpin": "accessory type + color + position in under 8 words, or null", "glasses": "glasses type + color, or null", "mouth_type": "expression category only: smile / grin / smirk / tongue-out / fang / open / neutral — pick one, or null", "outfit": "garment categories + main colors only — no patterns, no rendering details, under 12 words", "accessories": "category list only (e.g. scarf-red, belt-brown), or null", "eyelash": "true if character is clearly female or has prominent eyelashes, otherwise false"}' }
            ]
          }]
        }),
      }),
      fetch(`https://monad-terminal.xyz/chog/pfp/${styleFilename}`),
    ]);

    const vd = await visionRes.json();
    if (vd.error) return res.status(500).json({ error: vd.error.message });
    let semantics = { clothing: 'casual outfit' };
    try {
      const raw = vd.choices[0].message.content.trim().replace(/^```json|^```|```$/gm, '').trim();
      semantics = JSON.parse(raw);
    } catch {}
    console.log('[generate] semantics:', JSON.stringify(semantics));

    if (!baseImgRes.ok) throw new Error(`Failed to load base image: ${baseImgRes.status}`);
    const rawBaseBuffer = Buffer.from(await baseImgRes.arrayBuffer());

    // Nearest-neighbor upscale to 1024x1024 PNG
    let baseBuffer;
    try {
      const img = await Jimp.read(rawBaseBuffer);
      img.resize(1024, 1024, Jimp.RESIZE_NEAREST_NEIGHBOR);
      baseBuffer = await img.getBufferAsync(Jimp.MIME_PNG);
      console.log('[generate] base upscaled:', styleFilename, baseBuffer.length, 'bytes');
    } catch (e) {
      console.warn('[generate] jimp failed, using raw buffer:', e.message);
      baseBuffer = rawBaseBuffer;
    }

    const isFemale = semantics.eyelash === true || semantics.eyelash === 'true';
    const extraPart = customPrompt ? ` ${customPrompt.trim()}.` : '';

    // Build trait description for "only transfer" section
    const WEAPON_PATTERN = /\b(sword|swords|katana|blade|knife|knives|dagger|gun|pistol|rifle|weapon|weapons|spear|axe|bow|arrow|arrows|shuriken|kunai|bomb|grenade|cannon)\b/gi;
    const san = str => str ? str.replace(WEAPON_PATTERN, 'prop').replace(/\s{2,}/g, ' ').trim() : str;
    const hairAbstract = [semantics.hair_color, semantics.hair_silhouette].filter(Boolean).join(' ');
    const traitParts = [
      hairAbstract          ? `hair: ${san(hairAbstract)} (color + silhouette only)`                  : null,
      semantics.hat         ? `hat: ${san(semantics.hat)}`                                             : null,
      semantics.hairpin     ? `hair accessory: ${san(semantics.hairpin)}`                              : null,
      semantics.glasses     ? `glasses: ${san(semantics.glasses)}`                                     : null,
      semantics.mouth_type  ? `mouth: ${san(semantics.mouth_type)}`                                    : null,
      semantics.outfit || semantics.clothing ? `outfit: ${san(semantics.outfit || semantics.clothing)} (colors + categories only)` : null,
      semantics.accessories ? `accessories: ${san(semantics.accessories)}`                             : null,
    ].filter(Boolean).join('; ');

    const cigarettePart = chogStyle === '2' ? '\n- CIGARETTE: the cigarette hanging from the mouth corner is part of IMAGE 1 — keep it exactly.' : '';
    const eyelashPart = isFemale ? '\nFEMALE REFERENCE: the reference character is female or has prominent eyelashes. Keep IMAGE 1\'s eyes completely unchanged. On TOP of the unchanged eyes only, draw 3 thin short line strokes at the upper eyelid edge — decorative only, do NOT redraw the eye itself.' : '';

    const editPrompt = `You are doing a TRAIT TRANSPLANT onto a CHOG base model. You do NOT recreate, redraw, or adapt the reference character. You do NOT borrow the reference's art style, body, pose, or composition.

IMAGE 1 = CHOG base model. This IS the character. Its art style, composition, angle, face, and body framing MUST be reproduced exactly — this is the absolute foundation.
IMAGE 2 = Reference only. Borrow ONLY abstract traits: color, accessory category, expression category, garment category. Do NOT reference anything below the chest. Do NOT borrow its art style, rendering, anatomy, pose, or composition in any way.

⚠ PRIORITY #1 — ANGLE & COMPOSITION (overrides everything else):
The angle, framing, zoom, crop, and composition of IMAGE 1 are LOCKED. Do NOT adapt to the reference's body size, body angle, zoom level, or framing — even if the reference shows a full body, a different pose, or a different crop. The reference's composition is completely irrelevant. Output must match IMAGE 1's exact crop: extreme close-up, left-heavy framing, head and spikes bleeding off frame edges, blue background, same head tilt and face direction.

⚠ PRIORITY #2 — BASE ART STYLE (overrides reference style):
The art style of IMAGE 1 is the ONLY allowed art style. Thick uneven hand-drawn black outlines, flat solid colors only, zero gradients, zero shading, zero texture, limited color palette, primitive NFT line quality. The reference image's art style (whether anime, realistic, painterly, 3D, cel-shaded, etc.) must be COMPLETELY IGNORED. Re-render every transferred trait in IMAGE 1's exact art style — do NOT preserve any rendering quality from the reference.

⚠ PRIORITY #3 — PRIMITIVE & GOOFY (avoid prettification):
The result MUST stay primitive, chunky, slightly goofy, mascot-like — like a dumb-looking sticker. Do NOT make the character pretty, attractive, polished, or refined. Do NOT auto-feminize. Do NOT apply soft shading, blush rendering, glossy eyes, or anime aesthetics. CHOG charm is in being primitive and slightly ugly — embrace that.

⚠ PRIORITY #4 — FACE-CENTERED FRAMING, NO BODY BELOW CHEST:
The output is face-centered. There is no neck, chest, or anything below. Do NOT add human-like anatomy: no neck, no shoulders, no chest, no torso, no collarbone, no chibi anime body. Keep the exact same framing as IMAGE 1 — face and head dominate. The mascot's small round pink hands may appear only as they do in IMAGE 1.

━━━ PRESERVE EXACTLY (never change these) ━━━
• ANGLE & COMPOSITION — head angle, face tilt, body angle, framing, zoom, and crop must be identical to IMAGE 1. Extreme close-up, left-heavy framing, head and spikes bleeding off frame edges, blue background.
• ART STYLE — thick uneven black outlines, flat solid colors, zero gradients, zero shading, zero texture. Primitive hand-drawn NFT line quality. Match IMAGE 1's art style only.
• EYES — PIXEL-FOR-PIXEL match with IMAGE 1. Same eye shape, same eye size, same eye position, same large black pupils, same white highlight dot placement, same eye angle. Do NOT enlarge eyes. Do NOT redraw the eyes in any way. If the reference is female or has eyelashes, keep IMAGE 1's eyes completely unchanged and add only 3 thin short line strokes at the upper eyelid edge — decorative only.
• NOSE — PIXEL-FOR-PIXEL match with IMAGE 1. Same tiny pink dot, same exact size, same exact position. Do NOT enlarge it. Do NOT change its color. Do NOT redraw it.
• HAIR SILHOUETTE — spike shape of IMAGE 1 is the base and must be maintained. Hair exists ONLY above IMAGE 1's hairline — do NOT generate any hair below the hairline into the face area. If the reference has a clearly distinct major feature (e.g. long hair, twin-tails), reflect only that large-scale silhouette change strictly above the hairline — do NOT add bangs, side strands, or fine detail below the hairline.
• FACE — reproduce IMAGE 1's face line, cheeks, forehead, and proportions exactly. Do NOT redesign.
• MASCOT HANDS — IMAGE 1's small round pink mascot hands. The crossed-arms pose of IMAGE 1 must not be changed.${cigarettePart}

━━━ DO NOT (these are absolute) ━━━
• Do NOT use the reference's art style, rendering, line quality, shading, or color treatment in any way — IMAGE 1's art is the only standard.
• Do NOT recreate the reference character.
• Do NOT generate a human-like body, realistic neck, shoulders, chest, arms, torso, or collarbone.
• Do NOT make the character pretty, attractive, polished, or feminine-looking.
• Do NOT preserve the reference's anatomy, body proportions, or face structure.
• Do NOT preserve the reference's eyes — IMAGE 1's eyes are the only eyes allowed.
• Do NOT preserve detailed hair strands, anime bangs, layered side hair, or fine hair lines from the reference.
• Do NOT change the head angle, face direction, framing, or composition.
• Do NOT modernize, smooth, or refine IMAGE 1's primitive linework.
• Do NOT add anime shading, cel shading, glossy highlights, photorealistic detail, or texture.

━━━ ONLY TRANSFER (abstract traits only) from the LAST image ━━━
Extracted traits: ${traitParts || 'minimal changes only'}
• HAIR: borrow ONLY color identity and rough silhouette category. Reduce all hair into simple chunky geometric blocks — flat color shapes with thick black outlines. NO thin anime strands. NO layered anime bangs. NO side hair flow. NO realistic hair detail. NO fine lines. Think 3-5 large blob shapes max, like a primitive mascot.
• HAT / HEADWEAR: transplant the item shape and color, re-rendered in CHOG flat style. Place it at the topmost visible area of the hair. The frame crop is ABSOLUTE and overrides headwear placement — do NOT zoom out under any circumstances. The headwear MUST appear in the output even if partially cropped; however, if the frame crop leaves no room, it may be cut off — the crop always wins.
• HAIR ACCESSORIES (bows, ribbons, clips): transplant shape and color, re-rendered in CHOG flat style.
• OUTFIT: transplant garment categories and colors only. Re-render in CHOG flat style — no fabric detail, no folds, no shading.
• MOUTH: borrow expression category only (smile/grin/fang/etc), re-rendered with CHOG primitive line.
• Everything transferred MUST be re-rendered in IMAGE 1's primitive CHOG art style — thick uneven outlines, flat colors, no shading.
${eyelashPart}
The final result must be indistinguishable from an official CHOG collection NFT — primitive, flat, hand-drawn, chunky, slightly goofy, mascot-like. If it looks like polished anime, has a human body, or looks like a recreated character, you failed.${extraPart ? '\nExtra instruction: ' + extraPart : ''}`;

    // Convert user's reference image to buffer for direct submission
    let userRefBuffer = null;
    try {
      if (image.startsWith('data:')) {
        userRefBuffer = Buffer.from(image.split(',')[1], 'base64');
      } else {
        const r = await fetch(image);
        if (r.ok) userRefBuffer = Buffer.from(await r.arrayBuffer());
      }
    } catch (e) { console.warn('[gpt] user ref fetch failed:', e.message); }

    const form = new FormData();
    form.append('model', 'gpt-image-1.5');
    form.append('prompt', editPrompt);
    form.append('n', '1');
    form.append('size', '1024x1024');
    form.append('quality', 'medium');
    form.append('input_fidelity', 'high');
    // Image order: base (1st) → user reference (2nd)
    form.append('image[]', new Blob([baseBuffer], { type: 'image/png' }), 'chog.png');
    if (userRefBuffer) form.append('image[]', new Blob([userRefBuffer], { type: 'image/jpeg' }), 'reference.jpg');
    // No mask — restriction system prompt controls what changes

    const genRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    const rawText = await genRes.text();
    let gd;
    try { gd = JSON.parse(rawText); }
    catch { return res.status(500).json({ error: `OpenAI non-JSON response: ${rawText.slice(0, 200)}` }); }
    if (gd.error) {
      const isPolicyViolation = gd.error.code === 'content_policy_violation'
        || (gd.error.message || '').toLowerCase().includes('safety')
        || (gd.error.message || '').toLowerCase().includes('policy');
      return res.status(isPolicyViolation ? 451 : 500).json({ error: gd.error.message, policyViolation: isPolicyViolation });
    }
    const imgData = gd.data[0];
    const imageUrl = imgData.url || (imgData.b64_json ? `data:image/png;base64,${imgData.b64_json}` : null);

    if (!imageUrl) return res.status(500).json({ error: 'No image returned' });

    // Detect eye position (X + Y) with GPT-4o-mini, then nose-composite + crop
    const finalImageUrl = imageUrl;

    // Upload to Supabase Storage and persist history per wallet
    // batchToken requests skip history write to avoid race conditions — client handles batch history
    let persistentUrl = finalImageUrl;
    let history = [];
    if (wallet) {
      try {
        const stored = await uploadToStorage(finalImageUrl, wallet);
        if (stored) {
          persistentUrl = stored;
          if (!batchToken) history = await addToWalletHistory(wallet, stored);
        }
      } catch (e) { console.warn('[history] failed:', e.message); }
    }

    let walletCreditsNow;
    if (isDevWallet) {
      walletCreditsNow = 9999;
    } else if (batchMode) {
      walletCreditsNow = walletRow.credits - 10;
    } else if (batchToken) {
      walletCreditsNow = wallet ? ((await getWalletRow(wallet))?.credits ?? 0) : 0;
    } else {
      walletCreditsNow = walletRow ? walletRow.credits - 1 : (wallet ? ((await getWalletRow(wallet))?.credits ?? 0) : 0);
    }
    const twitterFreeNow = useTwitterFree ? false : (session ? !!(await getTwitterRow(session.id) && !(await getTwitterRow(session.id)).used_free) : false);

    return res.json({ ok: true, url: persistentUrl, history, twitterFree: twitterFreeNow, walletCredits: walletCreditsNow, total: (twitterFreeNow ? 1 : 0) + walletCreditsNow, ...(outBatchToken ? { batchToken: outBatchToken } : {}) });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
