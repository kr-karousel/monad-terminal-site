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

    // Step 1: extract outfit from reference image via vision
    const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 150,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: 'Analyze this image and return a JSON object with two fields: "skin" (ONLY return a non-default value if the main human/character clearly has noticeably dark or deeply pigmented skin — e.g. "warm brown", "dark brown", "deep brown". If skin is light, pale, peach, cream, anime-style, cartoon white, or unclear, always return "light peach") and "outfit" (clothing and accessories only: hats, eyewear, jacket/top color and style, tie, cape, hair accessories, held items, jewelry — short comma-separated list, max 50 words, exclude face, skin, hair, background). Return ONLY valid JSON: {"skin":"...","outfit":"..."}' }
          ]
        }]
      }),
    });
    const vd = await visionRes.json();
    if (vd.error) return res.status(500).json({ error: vd.error.message });
    let outfit = 'casual outfit', skinTone = 'light peach';
    try {
      const raw = vd.choices[0].message.content.trim().replace(/^```json|^```|```$/g, '').trim();
      const parsed = JSON.parse(raw);
      outfit = parsed.outfit || outfit;
      skinTone = parsed.skin || skinTone;
    } catch {
      outfit = vd.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    }

    const bgPart = bgTemplate || 'solid flat bright blue background #00AAFF, no gradients';
    const stylePart = artStyle ? `, ${artStyle}` : '';
    const extraPart = customPrompt ? ` ${customPrompt.trim()}.` : '';

    // Step 2: text-only generation — no style reference image contamination
    // Full character spec produces consistent CHOG NFT style every time
    const chogPrompt = `Flat 2D chibi cartoon NFT profile picture in the exact style of the CHOG NFT collection.

COMPOSITION (this is the signature CHOG NFT layout — follow exactly):
- The character is deliberately positioned toward the RIGHT side of the square frame
- LEFT side of the frame intentionally shows open background space (roughly 15-25% of width)
- RIGHT side and BOTTOM: the outfit, arms, and body bleed OFF the frame edges — no right margin, no bottom margin
- The head and face sit in the upper-center-to-right area
- Hair spikes fan out to the upper-left, partially occupying the left background space
- Top of hair spikes may be slightly cropped at the top edge

CAMERA ANGLE: Slight 3/4 turn — character faces slightly to one side, both eyes visible. Classic CHOG NFT pose.

CHARACTER: CHOG chibi character. Large round face with ${skinTone} skin color. Dark purple spiky hair with multiple sharp triangular spikes, thick black outlines. Eyes: two large solid black oval dots each with a white shine spot. Small round pink nose — always present. Round pink blush circles on each cheek. Small smile. Bold thick black cartoon outlines on everything.

OUTFIT (large, bleeds off right and bottom edges): ${outfit}.${extraPart}

BACKGROUND: ${bgPart}.

STYLE: Flat 2D cartoon${stylePart}, bold solid colors, thick black outlines, zero gradients, zero shading, CHOG NFT collection art style.`;

    const genRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-image-2',
        prompt: chogPrompt,
        n: 1,
        size: '1024x1024',
        quality: 'medium',
      }),
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
