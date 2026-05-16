// Vercel serverless — CHOG PFP Studio
// 1 free generation per wallet / 100 MON = +5 credits
const SB_URL = 'https://phjolzvyewacjqausmxx.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const MONAD_RPC  = 'https://rpc.monad.xyz';
const DEV_WALLET = '0x38A7d00c3494ACFF01c0d216A6115A2af1A72162';
const MON_PAYMENT = '0x16345785D3A00000'; // 100 MON in wei (hex)
const CREDITS_PER_PAYMENT = 5;

const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function sbGet(wallet) {
  const r = await fetch(`${SB_URL}/rest/v1/pfp_credits?wallet=eq.${wallet.toLowerCase()}`, {
    headers: SB_HEADERS,
  });
  const rows = await r.json();
  return rows[0] || null;
}

async function sbUpsert(wallet, credits, usedTxhashes) {
  await fetch(`${SB_URL}/rest/v1/pfp_credits`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      wallet: wallet.toLowerCase(),
      credits,
      used_txhashes: usedTxhashes,
    }),
  });
}

async function verifyPayment(txHash, fromWallet) {
  // Get transaction receipt from Monad RPC
  const rpcRes = await fetch(MONAD_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1,
      method: 'eth_getTransactionByHash',
      params: [txHash],
    }),
  });
  const { result: tx } = await rpcRes.json();
  if (!tx) return { ok: false, reason: 'Transaction not found' };

  const to   = (tx.to || '').toLowerCase();
  const from = (tx.from || '').toLowerCase();
  const val  = BigInt(tx.value || '0x0');
  const required = BigInt('0x16345785D3A00000'); // 100 MON

  if (to !== DEV_WALLET.toLowerCase()) return { ok: false, reason: 'Wrong recipient' };
  if (from !== fromWallet.toLowerCase()) return { ok: false, reason: 'Sender mismatch' };
  if (val < required) return { ok: false, reason: `Insufficient amount (got ${val}, need ${required})` };

  return { ok: true };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, wallet, txHash, image, chogStyle } = req.body || {};
  if (!wallet) return res.status(400).json({ error: 'wallet required' });

  // ── GET CREDITS ──────────────────────────────────
  if (req.method === 'GET' || action === 'credits') {
    const row = await sbGet(wallet);
    return res.json({ credits: row ? row.credits : 1 });
  }

  // ── ADD CREDITS (after 100 MON payment) ──────────
  if (action === 'pay') {
    if (!txHash) return res.status(400).json({ error: 'txHash required' });

    const row = await sbGet(wallet);
    const usedTxhashes = row?.used_txhashes || [];

    if (usedTxhashes.includes(txHash.toLowerCase())) {
      return res.status(400).json({ error: 'Transaction already used' });
    }

    const verify = await verifyPayment(txHash, wallet);
    if (!verify.ok) return res.status(400).json({ error: verify.reason });

    const newCredits = (row?.credits ?? 1) + CREDITS_PER_PAYMENT;
    await sbUpsert(wallet, newCredits, [...usedTxhashes, txHash.toLowerCase()]);
    return res.json({ ok: true, credits: newCredits });
  }

  // ── GENERATE PFP ─────────────────────────────────
  if (action === 'generate') {
    if (!OPENAI_KEY) return res.status(500).json({ error: 'API key not configured' });
    if (!image) return res.status(400).json({ error: 'image required' });

    // Check & decrement credits
    const row = await sbGet(wallet);
    const currentCredits = row?.credits ?? 1;
    if (currentCredits < 1) return res.status(402).json({ error: 'No credits. Pay 100 MON for 5 more.' });

    await sbUpsert(wallet, currentCredits - 1, row?.used_txhashes || []);

    // Step 1: GPT-4o vision → CHOG prompt
    const visionRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: chogStyle || 'https://monad-terminal.xyz/chog/pfp/CHOG.jpg' } },
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: `The first image is CHOG — a chibi hedgehog with spiky purple hair, large black eyes with white highlight dot, pink blush marks, cream beige round face, bold black outlines, flat 2D chibi cartoon style, blue background.

The second image is a reference. Write a DALL-E 3 prompt to recreate CHOG wearing the exact same outfit and accessories. Keep all CHOG visual traits. List every detail: hat (type+color), glasses, jacket/suit (type+color), held items, pose, expression.

Start: "CHOG chibi hedgehog NFT profile picture, spiky purple hair, large black eyes white highlight dot, pink blush marks on cheeks, cream beige round chibi face, bold black outlines, flat 2D chibi cartoon style,"
End: "solid bright blue background #00AAFF, square 1:1 format, no text, no watermark"

Output only the prompt, under 150 words.` }
          ]
        }]
      }),
    });
    const vd = await visionRes.json();
    if (vd.error) return res.status(500).json({ error: vd.error.message });
    const chogPrompt = vd.choices[0].message.content.trim();

    // Step 2: DALL-E 3 generate
    const genRes = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'dall-e-3', prompt: chogPrompt,
        n: 1, size: '1024x1024', quality: 'standard', response_format: 'url',
      }),
    });
    const gd = await genRes.json();
    if (gd.error) return res.status(500).json({ error: gd.error.message });

    return res.json({ ok: true, url: gd.data[0].url, credits: currentCredits - 1 });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
