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
          model: 'gpt-4o', max_tokens: 400,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: image, detail: 'high' } },
              { type: 'text', text: 'Analyze this character image meticulously. Return ONLY this JSON (no markdown): {"hair": "exact color name, shape (e.g. twin tails, short bob, long wavy), volume, and texture", "hairpin": "LOOK CAREFULLY at every part of the hair — any bow, ribbon, clip, scrunchie, flower, pin, or decoration. Describe: exact color, size relative to head (small/medium/large/huge), shape, and exact location (e.g. left side, top-center, behind ear). If truly none, null", "hat": "any hat or hard headwear sitting ON TOP of the head — describe type, color, shape, or null", "face": "list every face detail: glasses type and color, eyelashes (long/short/none), blush marks, any cigar/cigarette/pipe in mouth, mask, eye makeup — describe each exactly, or null", "expression": "exact facial expression e.g. smug smirk, angry scowl, cheerful smile, winking, serious deadpan", "outfit": "every garment from top to bottom — exact colors for each piece, patterns (stripes/dots/plaid etc), collar shape, trim, ruffles, buttons, any text/logo with exact wording and placement", "accessories": "everything else: scarves, belts, jewelry, wings, tail, hand props — describe exactly, or null", "background": "background color or scene"}' }
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

    const WEAPON_PATTERN = /\b(sword|swords|katana|blade|knife|knives|dagger|gun|pistol|rifle|weapon|weapons|spear|axe|bow|arrow|arrows|shuriken|kunai|bomb|grenade|cannon)\b/gi;

    const sanitize = str => str ? str.replace(WEAPON_PATTERN, 'prop').replace(/\s{2,}/g, ' ').trim() : str;

    const styleDesc = [
      semantics.hair        ? `hair: ${sanitize(semantics.hair)}`                                                                          : null,
      semantics.hairpin     ? `hair accessory: ${sanitize(semantics.hairpin)}`                                                             : null,
      semantics.hat         ? `headwear: ${sanitize(semantics.hat)}`                                                                        : null,
      semantics.face        ? `face detail: ${sanitize(semantics.face)}`                                                                    : null,
      chogStyle === '2'     ? `mouth: cigarette hanging from corner of mouth — REQUIRED, always present, never omit`                        : null,
      `outfit: ${sanitize(semantics.outfit || semantics.clothing || 'casual outfit')}`,
      semantics.accessories ? `accessories: ${sanitize(semantics.accessories)}`                                                             : null,
    ].filter(Boolean).join('; ');

    // Build mandatory items reminder — things that must visibly appear in output
    const mandatoryItems = [
      semantics.hat         ? sanitize(semantics.hat)         : null,
      semantics.hairpin     ? sanitize(semantics.hairpin)     : null,
      semantics.accessories ? sanitize(semantics.accessories) : null,
      chogStyle === '2'     ? 'cigarette in mouth'            : null,
    ].filter(Boolean);
    const mandatoryReminder = mandatoryItems.length
      ? ` MUST visibly appear in final image (do not omit any): ${mandatoryItems.join(', ')}.`
      : '';

    const extraPart = customPrompt ? ` ${customPrompt.trim()}.` : '';

    const { w: IMG_W, h: IMG_H } = getImageDimensions(baseBuffer);
    const editZones = [
      [0.05, 0.00, 0.95, 0.32], // hair + top-of-head zone
      [0.10, 0.78, 0.90, 0.95], // outfit zone — pushed down to reduce body area
    ];
    if (chogStyle === '2')  editZones.push([0.20, 0.65, 0.80, 0.75]); // cigarette zone
    if (semantics.hat)      editZones.push([0.05, 0.00, 0.95, 0.20]); // hat zone (very top)
    if (semantics.hairpin)  editZones.push([0.05, 0.00, 0.95, 0.28]); // hairpin zone
    if (semantics.glasses)  editZones.push([0.22, 0.33, 0.78, 0.42]); // glasses zone
    const maskBuffer = makeMaskPng(IMG_W, IMG_H, editZones);

    const FACE_LOCK = 'CHOG\'s face is a large smooth oval/round shape — NOT a cat face, NOT a mouse face, NOT any animal face. The face silhouette is a plain round chibi oval with NO ears on top, NO snout, NO whiskers. FACE SHAPE IS ABSOLUTELY LOCKED to the base image — do NOT alter, reshape, or replace CHOG\'s face with any other character\'s face shape under any circumstances.';

    const ART_STYLE = chogStyle === '2'
      ? `⚠ ART STYLE IS LOCKED — maintain CHOG's exact style throughout: thick bold black outlines, flat solid colors, large circular anime eyes, cute chibi proportions, spiky purple hair. ${FACE_LOCK} NOSE (CRITICAL — must appear): small dark nose mark between the eyes and mouth — always visible, never omit. MOUTH IS REPLACED BY CIGARETTE (CRITICAL — LOCKED): a thick lit cigarette/cigar hangs from the corner of CHOG's mouth — ALWAYS present, NEVER omit. Do NOT adopt the reference image's face shape, art style, proportions, or shading. The reference provides ONLY accessories/outfit/hair to transplant onto CHOG — nothing else changes.`
      : `⚠ ART STYLE IS LOCKED — maintain CHOG's exact style throughout: thick bold black outlines, flat solid colors, large circular anime eyes, cute chibi proportions, spiky purple hair. ${FACE_LOCK} NOSE (CRITICAL — must appear): small dark nose mark between the eyes and mouth — always visible, never omit. Mouth = one thin slightly curved line, small and minimal, always present. Do NOT adopt the reference image's face shape, art style, proportions, or shading. The reference provides ONLY accessories/outfit/hair to transplant onto CHOG — nothing else changes.`;

    const COMPOSITION = 'COMPOSITION: close-up PFP portrait — face is large and dominant. Face occupies the LEFT 55% of the image horizontally. RIGHT frame edge slices through the face just past the right eye. VERTICAL FRAMING: eyes at approximately 40% from top, chin at approximately 85% from top, only collar/top of outfit visible in the bottom 10%. The top of the head bleeds off the top edge — not fully visible. Do NOT zoom out. Do NOT center. Accessories may bleed off any edge.';

    const editPrompt = `${ART_STYLE} ${COMPOSITION} Apply ONLY to the unmasked edit zones — ${styleDesc}.${mandatoryReminder}${extraPart ? ' ' + extraPart : ''}`;

    // Fetch example.jpg as additional style reference
    let exampleBuffer = null;
    try {
      const exRes = await fetch('https://monad-terminal.xyz/chog/pfp/example.jpg');
      if (exRes.ok) exampleBuffer = Buffer.from(await exRes.arrayBuffer());
    } catch (e) { console.warn('[gpt] example fetch failed:', e.message); }

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', editPrompt);
    form.append('n', '1');
    form.append('size', '1024x1024');
    form.append('quality', 'medium');
    form.append('input_fidelity', 'high');
    form.append('image[]', new Blob([baseBuffer], { type: 'image/png' }), 'chog.png');
    if (exampleBuffer) form.append('image[]', new Blob([exampleBuffer], { type: 'image/jpeg' }), 'example.jpg');
    form.append('mask',  new Blob([maskBuffer], { type: 'image/png' }), 'mask.png');

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
    let finalImageUrl = imageUrl;
    try {
      const eyeContent = imgData.url
        ? { type: 'image_url', image_url: { url: imgData.url, detail: 'low' } }
        : { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } };

      const eyeRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 40,
          messages: [{ role: 'user', content: [
            eyeContent,
            { type: 'text', text: 'The character faces LEFT. Find the character\'s LEFT eye — the eye on the RIGHT side of the image (viewer\'s perspective). If the character is wearing glasses or sunglasses, use the rightmost edge of the RIGHT lens frame. Return ONLY JSON: {"x": 0.XX, "y": 0.XX} where x = rightmost pixel of that eye or lens (0=left edge, 1=right edge), y = vertical center of that eye (0=top, 1=bottom).' }
          ]}]
        })
      });
      const eyeData = await eyeRes.json();
      const raw = eyeData.choices?.[0]?.message?.content?.trim() || '';
      const matchX = raw.match(/"x"\s*:\s*([\d.]+)/);
      const matchY = raw.match(/"y"\s*:\s*([\d.]+)/);
      const eyeX = matchX ? parseFloat(matchX[1]) : null;
      const eyeY = matchY ? parseFloat(matchY[1]) : null;
      console.log('[eye-detect] eyeX:', eyeX, 'eyeY:', eyeY, '| raw:', raw);



      const MARGIN = semantics.glasses ? 0.22 : 0.19;
      const MIN_CROP = 0.72;
      if (eyeX && eyeX > 0.25 && eyeX < 0.95) {
        const rawBuf = finalImageUrl.startsWith('data:')
          ? Buffer.from(finalImageUrl.split(',')[1], 'base64')
          : Buffer.from(await (await fetch(finalImageUrl)).arrayBuffer());
        const jimg = await Jimp.read(rawBuf);
        const cropFraction = Math.max(eyeX + MARGIN, MIN_CROP);
        const cropSide = Math.round(Math.min(cropFraction, 1.0) * jimg.bitmap.width);
        jimg.crop(0, jimg.bitmap.height - cropSide, cropSide, cropSide); // bottom-left
        const croppedBuf = await jimg.getBufferAsync(Jimp.MIME_PNG);
        finalImageUrl = `data:image/png;base64,${croppedBuf.toString('base64')}`;
        console.log('[eye-crop] eyeX:', eyeX, '→ cropSide:', cropSide);
      } else {
        console.log('[eye-crop] skipped — eyeX:', eyeX);
      }
    } catch (e) {
      console.warn('[eye-crop] failed, using original:', e.message);
    }

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
