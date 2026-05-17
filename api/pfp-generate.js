// Vercel serverless — CHOG PFP Studio
// Free: 1 per X account · Paid: 0.1 MON = 10 credits (wallet)
const crypto = require('crypto');

const SB_URL = 'https://phjolzvyewacjqausmxx.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const SESSION_SECRET = process.env.SESSION_SECRET || 'chog-pfp-fallback-secret';
const MONAD_RPC  = 'https://rpc.monad.xyz';
const DEV_WALLET = '0xf9bb715c1DC21EB661FCaC75d45BCf470235e0d8';
const CREDITS_PER_PAYMENT = 5;

const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

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

/* ── Supabase: wallet credits ── */
async function getWalletRow(wallet) {
  const r = await fetch(`${SB_URL}/rest/v1/pfp_credits?wallet=eq.${wallet.toLowerCase()}`, { headers: SB_HEADERS });
  const rows = await r.json();
  return rows[0] || null;
}

async function upsertWallet(wallet, credits, usedTxhashes) {
  const body = { wallet: wallet.toLowerCase(), credits, used_txhashes: usedTxhashes };
  console.log('[upsertWallet] POST body:', JSON.stringify(body));
  console.log('[upsertWallet] SB_KEY prefix:', SB_KEY.slice(0, 20));
  const r = await fetch(`${SB_URL}/rest/v1/pfp_credits`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log('[upsertWallet] response status:', r.status, 'body:', text);
  if (!r.ok) {
    throw new Error(`Supabase ${r.status}: ${text}`);
  }
  try { return JSON.parse(text); } catch { return null; }
}

/* ── Supabase: twitter free credits ── */
async function getTwitterRow(twitterId) {
  const r = await fetch(`${SB_URL}/rest/v1/pfp_twitter?twitter_id=eq.${twitterId}`, { headers: SB_HEADERS });
  const rows = await r.json();
  return rows[0] || null;
}

async function ensureTwitterRow(twitterId) {
  // Create row with used_free=false if missing — idempotent
  const r = await fetch(`${SB_URL}/rest/v1/pfp_twitter`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ twitter_id: twitterId, used_free: false }),
  });
  return r.ok;
}

async function markFreeUsed(twitterId) {
  // UPSERT — creates row with used_free=true if missing, updates if exists
  const r = await fetch(`${SB_URL}/rest/v1/pfp_twitter`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({ twitter_id: twitterId, used_free: true }),
  });
  const data = await r.json();
  if (!r.ok) console.error('[markFreeUsed] failed:', r.status, data);
  return r.ok;
}

/* ── on-chain payment verification ── */
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
  const required = BigInt('0x16345785D8A0000'); // 0.1 MON

  if (to !== DEV_WALLET.toLowerCase()) return { ok: false, reason: 'Wrong recipient' };
  if (from !== fromWallet.toLowerCase()) return { ok: false, reason: 'Sender mismatch' };
  if (val < required) return { ok: false, reason: 'Insufficient amount' };
  return { ok: true };
}

/* ── handler ── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, wallet, txHash, image, chogStyle, bgTemplate, artStyle, customPrompt } = req.body || {};
  const session = getSession(req);

  // ── GET CREDITS ──────────────────────────────────
  if (action === 'credits') {
    let twitterRow = session ? await getTwitterRow(session.id) : null;
    // First-time login: create row so future checks are deterministic
    if (session && !twitterRow) {
      await ensureTwitterRow(session.id);
      twitterRow = await getTwitterRow(session.id);
    }
    const twitterFree = !!(twitterRow && !twitterRow.used_free);
    const walletCredits = wallet ? ((await getWalletRow(wallet))?.credits ?? 0) : 0;
    return res.json({ twitterFree, walletCredits, total: (twitterFree ? 1 : 0) + walletCredits });
  }

  // ── ADD CREDITS (0.1 MON payment) ────────────────
  if (action === 'pay') {
    if (!wallet) return res.status(400).json({ error: 'wallet required' });
    if (!txHash) return res.status(400).json({ error: 'txHash required' });

    const row = await getWalletRow(wallet);
    const usedTxhashes = row?.used_txhashes || [];

    if (usedTxhashes.includes(txHash.toLowerCase())) {
      return res.status(400).json({ error: 'Transaction already used' });
    }

    const verify = await verifyPayment(txHash, wallet);
    if (!verify.ok) return res.status(400).json({ error: verify.reason });

    const newCredits = (row?.credits ?? 0) + CREDITS_PER_PAYMENT;
    try {
      await upsertWallet(wallet, newCredits, [...usedTxhashes, txHash.toLowerCase()]);
    } catch (e) {
      console.error('[pay] DB write failed after on-chain verify:', e.message);
      return res.status(500).json({ error: 'Payment verified on-chain but DB save failed. Contact support with txHash: ' + txHash, dbError: e.message });
    }
    // Read back to confirm persistence
    const verifyRow = await getWalletRow(wallet);
    if (!verifyRow || verifyRow.credits !== newCredits) {
      console.error('[pay] DB read-back mismatch:', { expected: newCredits, got: verifyRow?.credits });
      return res.status(500).json({ error: 'Credits did not persist. txHash: ' + txHash });
    }
    return res.json({ ok: true, walletCredits: verifyRow.credits });
  }

  // ── GENERATE PFP ─────────────────────────────────
  if (action === 'generate') {
    if (!OPENAI_KEY) return res.status(500).json({ error: 'API key not configured' });
    if (!image) return res.status(400).json({ error: 'image required' });

    // Determine credit source: X free first, then wallet paid
    let useTwitterFree = false;
    let walletRow = null;

    if (session) {
      let twitterRow = await getTwitterRow(session.id);
      if (!twitterRow) {
        await ensureTwitterRow(session.id);
        twitterRow = await getTwitterRow(session.id);
      }
      // Only allow free if row exists AND used_free is false
      if (twitterRow && !twitterRow.used_free) useTwitterFree = true;
    }

    if (!useTwitterFree) {
      if (!wallet) return res.status(402).json({ error: 'Connect X for 1 free generation, or pay 0.1 MON for more.' });
      walletRow = await getWalletRow(wallet);
      if (!walletRow || walletRow.credits < 1) {
        return res.status(402).json({ error: 'No credits left. Pay 0.1 MON to get 5 more.' });
      }
    }

    // Deduct credit before generating (prevents double-spend on API failure)
    if (useTwitterFree) {
      await markFreeUsed(session.id);
    } else {
      await upsertWallet(wallet, walletRow.credits - 1, walletRow.used_txhashes || []);
    }

    // Load both images: base CHOG + user reference (no vision text step — same as ChatGPT)
    const baseUrl = chogStyle || 'https://monad-terminal.xyz/chog/pfp/CHOG.jpg';
    const baseRes = await fetch(baseUrl);
    if (!baseRes.ok) return res.status(500).json({ error: 'Failed to load CHOG base image' });
    const baseBuf = Buffer.from(await baseRes.arrayBuffer());

    // image is a base64 data URL like "data:image/jpeg;base64,..."
    const refMatch = image.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (!refMatch) return res.status(400).json({ error: 'Reference image must be a base64 data URL' });
    const refMime = refMatch[1];
    const refBuf = Buffer.from(refMatch[2], 'base64');

    // Simple direct prompt — like ChatGPT's working prompt
    const bgPart = bgTemplate ? ` Use this background: ${bgTemplate}.` : ' Keep the original blue background of the first image.';
    const stylePart = artStyle ? ` Apply art style: ${artStyle}.` : '';
    const extraPart = customPrompt ? ` Also: ${customPrompt.trim()}.` : '';
    const chogPrompt = `The FIRST image is the ABSOLUTE base image. It is an IMMUTABLE ANCHOR.

Preserve the FIRST image almost entirely:
- same face proportions
- same line thickness
- same flat coloring
- same facial expression
- same hair shape and silhouette
- same framing and crop
- same background color
- same hand-drawn simplicity
- same overall drawing imperfections

DO NOT:
- change the art style
- add realism
- add rendering
- add texture
- add gradients
- add detailed shading
- change proportions
- redesign the character
- reinterpret the composition

The SECOND image is ONLY a clothing/accessory reference.
Transfer ONLY:
- hat/headwear
- glasses/sunglasses
- clothing colors and outfit
- accessories/items
- fashion concept

Keep the FIRST image visually dominant.

The final image should look like: "the FIRST image character wearing the SECOND image outfit."
NOT: "a fusion of both images."

If any conflict occurs between the two images, ALWAYS prioritize the FIRST image.
The SECOND image must never affect:
- face structure
- drawing style
- rendering style
- composition
- camera framing
- character proportions

This is IDENTITY LOCK + ATTRIBUTE REPLACEMENT — not style transfer.
The character identity is fixed by the FIRST image. Only the outfit is replaced from the SECOND image.${bgPart}${stylePart}${extraPart}`;

    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('prompt', chogPrompt);
    form.append('n', '1');
    form.append('size', '1024x1024');
    form.append('quality', 'high');
    form.append('input_fidelity', 'high');
    // Pass BOTH images — base CHOG first, then user reference
    form.append('image[]', new Blob([baseBuf], { type: 'image/png' }), 'chog_base.png');
    form.append('image[]', new Blob([refBuf], { type: refMime }), 'reference.' + refMime.split('/')[1]);

    const genRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    const gd = await genRes.json();
    if (gd.error) return res.status(500).json({ error: gd.error.message });

    // gpt-image-1 returns b64_json by default; dall-e-3 returns url
    const img = gd.data[0];
    const imageUrl = img.url || (img.b64_json ? `data:image/png;base64,${img.b64_json}` : null);
    if (!imageUrl) return res.status(500).json({ error: 'No image returned' });

    const walletCreditsNow = walletRow ? walletRow.credits - 1 : (wallet ? ((await getWalletRow(wallet))?.credits ?? 0) : 0);
    const twitterFreeNow = useTwitterFree ? false : (session ? !!(await getTwitterRow(session.id) && !(await getTwitterRow(session.id)).used_free) : false);

    return res.json({
      ok: true,
      url: imageUrl,
      twitterFree: twitterFreeNow,
      walletCredits: walletCreditsNow,
      total: (twitterFreeNow ? 1 : 0) + walletCreditsNow,
    });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
