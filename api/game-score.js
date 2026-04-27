// Vercel serverless — game leaderboard (save & fetch scores)
const SB_URL = 'https://phjolzvyewacjqausmxx.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';

const SB_HEADERS = {
  'apikey': SB_KEY,
  'Authorization': `Bearer ${SB_KEY}`,
  'Content-Type': 'application/json',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // POST — save a score
  if (req.method === 'POST') {
    const { nickname, stage, clear_time_ms } = req.body || {};
    if (!nickname || !stage || clear_time_ms == null) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    const nick = String(nickname).slice(0, 12).toUpperCase() || 'PLAYER';
    const stageNum = parseInt(stage, 10);
    const timeMs = parseFloat(clear_time_ms);
    if (isNaN(stageNum) || isNaN(timeMs) || timeMs <= 0) {
      return res.status(400).json({ error: 'Invalid values' });
    }
    await fetch(`${SB_URL}/rest/v1/game_scores`, {
      method: 'POST',
      headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ nickname: nick, stage: stageNum, clear_time_ms: timeMs }),
    });
    return res.status(201).json({ ok: true });
  }

  // GET — top 10 leaderboard + caller's rank
  if (req.method === 'GET') {
    const stage = parseInt(req.query.stage, 10);
    const myTime = parseFloat(req.query.score || '0');
    if (isNaN(stage)) return res.status(400).json({ error: 'Missing stage' });

    // Top 10 fastest times per nickname (best score per player)
    const top10Res = await fetch(
      `${SB_URL}/rest/v1/rpc/game_top10?p_stage=${stage}`,
      { headers: SB_HEADERS }
    );
    const top10 = top10Res.ok ? await top10Res.json() : [];

    // Rank: how many distinct players have a better (lower) time
    let rank = null;
    if (myTime > 0) {
      const rankRes = await fetch(
        `${SB_URL}/rest/v1/rpc/game_rank?p_stage=${stage}&p_time=${myTime}`,
        { headers: SB_HEADERS }
      );
      if (rankRes.ok) {
        const rankData = await rankRes.json();
        rank = (rankData ?? 0) + 1;
      }
    }

    return res.status(200).json({ top10: top10 || [], rank });
  }

  // DELETE — clear all scores for a stage
  if (req.method === 'DELETE') {
    const stage = parseInt(req.query.stage, 10);
    if (isNaN(stage)) return res.status(400).json({ error: 'Missing stage' });
    await fetch(`${SB_URL}/rest/v1/game_scores?stage=eq.${stage}`, {
      method: 'DELETE',
      headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
