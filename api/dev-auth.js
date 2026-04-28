// Dev mode authentication — password stored in Vercel env var, never in client HTML.
module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { pw } = req.body || {};
  const secret = process.env.DEV_PASSWORD;
  if (!secret || pw !== secret) {
    return res.status(401).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
};
