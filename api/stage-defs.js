// Vercel serverless — dev editor stage defs persistence
const SB_URL = 'https://phjolzvyewacjqausmxx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';
const HEADERS = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — return full defs object { "0": [...], "1": [...], ... }
  if (req.method === 'GET') {
    const r = await fetch(`${SB_URL}/rest/v1/stage_defs?id=eq.1&select=defs`, { headers: HEADERS });
    if (!r.ok) return res.status(500).json({ error: 'DB error' });
    const rows = await r.json();
    return res.status(200).json(rows[0]?.defs || {});
  }

  // POST — save one stage: { stageIdx: number, entries: [...] }
  if (req.method === 'POST') {
    const { stageIdx, entries } = req.body || {};
    if (stageIdx == null || !Array.isArray(entries)) return res.status(400).json({ error: 'Bad body' });

    // Read current defs, patch the one stage, write back
    const getR = await fetch(`${SB_URL}/rest/v1/stage_defs?id=eq.1&select=defs`, { headers: HEADERS });
    const rows = await getR.json();
    const current = rows[0]?.defs || {};
    current[String(stageIdx)] = entries;

    await fetch(`${SB_URL}/rest/v1/stage_defs?id=eq.1`, {
      method: 'PATCH',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ defs: current, updated_at: new Date().toISOString() }),
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
