// Return current X session + free credit status
const crypto = require('crypto');
const SESSION_SECRET = process.env.SESSION_SECRET || 'chog-pfp-fallback-secret';
const SB_URL = 'https://phjolzvyewacjqausmxx.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies['pfp_session'];
  if (!raw) return res.json({ loggedIn: false });

  const session = verifySession(raw);
  if (!session) return res.json({ loggedIn: false });

  // Check if free generation used
  const r = await fetch(`${SB_URL}/rest/v1/pfp_twitter?twitter_id=eq.${session.id}`, {
    headers: { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}` },
  });
  const rows = await r.json();
  const row = rows[0];

  return res.json({
    loggedIn: true,
    id: session.id,
    username: session.username,
    avatar: session.avatar,
    usedFree: row?.used_free ?? false,
  });
};
