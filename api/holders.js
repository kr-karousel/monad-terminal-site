// Vercel serverless function — server-side proxy for BlockVision holder API
// Fixes CORS issues that prevent browser from fetching holder data directly

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { contract, limit = '50' } = req.query;
  if (!contract) {
    return res.status(400).json({ error: 'Missing contract parameter' });
  }

  const BV_URL = `https://api.blockvision.org/v2/monad/token/holders?contractAddress=${contract}&limit=${limit}`;

  try {
    const response = await fetch(BV_URL, {
      headers: {
        'accept': 'application/json',
        'User-Agent': 'monad-terminal/1.0'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `BlockVision returned ${response.status}` });
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
