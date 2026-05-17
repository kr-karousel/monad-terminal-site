// Vercel serverless — CHOG PFP Studio
// Free: 1 per X account · Paid: 0.1 MON = 10 credits (wallet)
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

    // Vision: extract outfit/accessories text from reference image only
    const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: 'Describe ONLY the outfit and accessories visible in this image. Be specific: hat type and color, sunglasses/eyewear style, jacket/shirt/suit color and style, tie/bow, held objects, jewelry, badges, shoes if visible. Do NOT mention face features, hair color, skin tone, background, or expressions. Comma-separated list only, max 60 words.' }
          ]
        }]
      }),
    });
    const vd = await visionRes.json();
    if (vd.error) return res.status(500).json({ error: vd.error.message });
    const outfit = vd.choices[0].message.content.trim().replace(/^["']|["']$/g, '');

    const bgPart = bgTemplate
      ? `Solid flat background color: ${bgTemplate}.`
      : 'Solid flat background: bright blue #00AAFF.';
    const stylePart = artStyle ? `Art direction: ${artStyle}.` : '';
    const extraPart = customPrompt ? `Extra details: ${customPrompt.trim()}.` : '';

    // Read the CHOG style image directly from disk (reliable, no network issues)
    let styleFilename = 'CHOG.jpg';
    if (chogStyle) {
      if (chogStyle.includes('IMG_20260516')) styleFilename = 'IMG_20260516_025404_862.jpg';
      else if (chogStyle.includes('CH_og'))   styleFilename = 'CH_og.jpg';
      else if (chogStyle.includes('CHOG'))    styleFilename = 'CHOG.jpg';
    }
    const stylePath = path.join(__dirname, '../chog/pfp', styleFilename);
    console.log('[generate] chogStyle param:', chogStyle, '→ file:', styleFilename);
    const styleBuffer = fs.readFileSync(stylePath);

    const editPrompt = `This is a CHOG NFT character. Keep the character's face, head shape, spiky purple hair, dot eyes, pink blush cheeks, thick black cartoon outlines, and flat 2D chibi art style EXACTLY the same. Only change the outfit and accessories.

OUTFIT TO APPLY:
${outfit}${extraPart ? '\n' + extraPart : ''}

BACKGROUND: ${bgPart}
${stylePart}

STYLE RULES — do not break:
- Flat 2D cartoon illustration, bold solid colors, thick black outlines
- No gradients, no shading, no realistic textures
- Clean crisp edges, square frame, character centered
- Identical art style to the official CHOG NFT collection`;

    const form = new FormData();
    form.append('model', 'gpt-image-2');
    form.append('prompt', editPrompt);
    form.append('n', '1');
    form.append('size', '1024x1024');
    form.append('quality', 'high');
    form.append('image[]', new Blob([styleBuffer], { type: 'image/jpeg' }), 'chog.jpg');

    const genRes = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: form,
    });
    const gd = await genRes.json();
    if (gd.error) return res.status(500).json({ error: gd.error.message });

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
