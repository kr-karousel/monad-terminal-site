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
const CREDITS_PER_PAYMENT = 5;

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
  // PNG: 8-byte sig + IHDR (width @ 16, height @ 20)
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  // JPEG: scan for SOF0/SOF1/SOF2/SOF3 markers
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
  return { w: 1024, h: 1024 }; // fallback
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
  const required = BigInt('0x16345785D8A0000');
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
  const { action, wallet, txHash, image, chogStyle, bgTemplate, artStyle, customPrompt } = req.body || {};
  const session = getSession(req);

  if (action === 'credits') {
    let twitterRow = session ? await getTwitterRow(session.id) : null;
    if (session && !twitterRow) {
      await ensureTwitterRow(session.id);
      twitterRow = await getTwitterRow(session.id);
    }
    const twitterFree = !!(twitterRow && !twitterRow.used_free);
    const walletCredits = wallet ? ((await getWalletRow(wallet))?.credits ?? 0) : 0;
    return res.json({ twitterFree, walletCredits, total: (twitterFree ? 1 : 0) + walletCredits });
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

  if (action === 'generate') {
    if (!OPENAI_KEY) return res.status(500).json({ error: 'API key not configured' });
    if (!image)      return res.status(400).json({ error: 'image required' });

    let useTwitterFree = false, walletRow = null;
    if (session) {
      let twitterRow = await getTwitterRow(session.id);
      if (!twitterRow) { await ensureTwitterRow(session.id); twitterRow = await getTwitterRow(session.id); }
      if (twitterRow && !twitterRow.used_free) useTwitterFree = true;
    }
    if (!useTwitterFree) {
      if (!wallet) return res.status(402).json({ error: 'Connect X for 1 free generation, or pay 0.1 MON for more.' });
      walletRow = await getWalletRow(wallet);
      if (!walletRow || walletRow.credits < 1)
        return res.status(402).json({ error: 'No credits left. Pay 0.1 MON to get 5 more.' });
    }

    if (useTwitterFree) await markFreeUsed(session.id);
    else await upsertWallet(wallet, walletRow.credits - 1, walletRow.used_txhashes || []);

    // STEP 1+2 in parallel: vision extraction + base image fetch
    let styleFilename = '2.png';
    if (chogStyle) {
      if (chogStyle.includes('3.png'))      styleFilename = '3.png';
      else if (chogStyle.includes('CH_og')) styleFilename = 'CH_og.png';
      else if (chogStyle.includes('2.png')) styleFilename = '2.png';
    }

    const [visionRes, baseImgRes] = await Promise.all([
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini', max_tokens: 200,
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: image } },
              { type: 'text', text: 'Analyze the character\'s WORN/STYLED elements only. Return ONLY a JSON object: {"hair": "describe hair color and style shape", "hat": "headwear if any, else null", "glasses": "eyewear if any, else null", "clothing": "describe the outfit/jacket/top — color, style, notable details like epaulettes/patterns"}. Do NOT include weapons, held props, or items in hands. Focus on what is physically on the body. No markdown, raw JSON only.' }
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

    // Nearest-neighbor upscale to 1024x1024 PNG — prevents API from smoothing/reinterpreting
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

    // STEP 3: build prompt
    const extraPart = customPrompt ? ` ${customPrompt.trim()}.` : '';
    const bgPart    = bgTemplate   ? `Background: ${bgTemplate}.` : '';

    // STEP 4: generate — gpt-image-1 edits+mask (CHOG is the skeleton, never reinterpreted)
    let imageUrl;

    // Mask zones: transparent = editable, opaque = preserved
    // Face zone (eyes/nose/cheeks) is always protected — only hair + outfit change
    const { w: IMG_W, h: IMG_H } = getImageDimensions(baseBuffer);
    const editZones = [
      [0.05, 0.00, 0.95, 0.38], // hair / hat area (top)
      [0.05, 0.58, 0.95, 1.00], // outfit area (bottom)
    ];
    if (semantics.glasses) editZones.push([0.15, 0.36, 0.85, 0.52]); // glasses strip
    const maskBuffer = makeMaskPng(IMG_W, IMG_H, editZones);

    const styleDesc = [
      semantics.hair    ? `hair: ${semantics.hair}`       : null,
      semantics.hat     ? `headwear: ${semantics.hat}`    : null,
      semantics.glasses ? `glasses: ${semantics.glasses}` : null,
      `outfit: ${semantics.clothing || 'casual outfit'}`,
    ].filter(Boolean).join(', ');

    const editPrompt = `Edit ONLY the transparent masked regions of this CHOG hedgehog cartoon. Do NOT redraw or touch the face, eyes, nose, or cheeks. Preserve the exact drawing style: keep the thick black outlines as-is, flat solid colors, same proportions, same crude cartoon feel. Do NOT clean up lines, do NOT add shading or gradients, do NOT polish or vectorize. In the editable (masked) regions apply: ${styleDesc}. NO weapons.${bgPart ? ' ' + bgPart : ''}${extraPart}`;

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', editPrompt);
    form.append('n', '1');
    form.append('size', '1024x1024');
    form.append('quality', 'medium');
    form.append('input_fidelity', 'high');
    form.append('response_format', 'b64_json');
    form.append('image', new Blob([baseBuffer], { type: 'image/png' }), 'chog.png');
    form.append('mask',  new Blob([maskBuffer], { type: 'image/png' }), 'mask.png');

    {
      const genRes = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
        body: form,
      });
      const rawText2 = await genRes.text();
      let gd2;
      try { gd2 = JSON.parse(rawText2); }
      catch { return res.status(500).json({ error: `OpenAI non-JSON response: ${rawText2.slice(0, 200)}` }); }
      if (gd2.error) return res.status(500).json({ error: gd2.error.message });
      const img = gd2.data[0];
      imageUrl = img.url || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : null);
    }

    if (!imageUrl) return res.status(500).json({ error: 'No image returned' });

    const walletCreditsNow = walletRow ? walletRow.credits - 1 : (wallet ? ((await getWalletRow(wallet))?.credits ?? 0) : 0);
    const twitterFreeNow   = useTwitterFree ? false : (session ? !!(await getTwitterRow(session.id) && !(await getTwitterRow(session.id)).used_free) : false);

    return res.json({ ok: true, url: imageUrl, twitterFree: twitterFreeNow, walletCredits: walletCreditsNow, total: (twitterFreeNow ? 1 : 0) + walletCreditsNow });
  }

  return res.status(400).json({ error: 'Unknown action' });
}
