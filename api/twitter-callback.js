// Twitter OAuth 2.0 PKCE — exchange code, set session cookie
const crypto = require('crypto');

const CLIENT_ID     = process.env.TWITTER_CLIENT_ID;
const CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'chog-pfp-fallback-secret';
const REDIRECT_URI  = 'https://monad-terminal.xyz/api/twitter-callback';
const SB_URL = 'https://phjolzvyewacjqausmxx.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBoam9senZ5ZXdhY2pxYXVzbXh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMDY5NzIsImV4cCI6MjA5MDY4Mjk3Mn0.XDNfHWN7NdzBHffE6-YgMMR8skNMR7blTJVu1EbvPrY';
const SB_HEADERS = { 'apikey': SB_KEY, 'Authorization': `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

function parseCookies(str = '') {
  return Object.fromEntries(
    str.split(';').map(c => {
      const [k, ...v] = c.trim().split('=');
      return [k.trim(), decodeURIComponent(v.join('='))];
    }).filter(([k]) => k)
  );
}

function makeSession(data) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

module.exports = async function handler(req, res) {
  const { code, state, error } = req.query || {};

  if (error || !code) {
    return res.writeHead(302, { Location: '/chog/pfp?error=denied' }), res.end();
  }

  // Verify PKCE cookie
  const cookies = parseCookies(req.headers.cookie);
  const pkceRaw = cookies['pfp_pkce'];
  if (!pkceRaw) return res.writeHead(302, { Location: '/chog/pfp?error=session' }), res.end();

  let pkce;
  try { pkce = JSON.parse(Buffer.from(pkceRaw, 'base64url').toString()); }
  catch { return res.writeHead(302, { Location: '/chog/pfp?error=session' }), res.end(); }

  if (pkce.state !== state) {
    return res.writeHead(302, { Location: '/chog/pfp?error=state' }), res.end();
  }

  // Exchange code for access token
  const tokenBody = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    code_verifier: pkce.verifier,
  });

  // Use Basic auth if client secret exists (confidential client), else public client
  const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (CLIENT_SECRET) {
    tokenHeaders['Authorization'] = `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`;
  }

  const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: tokenHeaders,
    body: tokenBody.toString(),
  });
  const tokens = await tokenRes.json();
  if (!tokens.access_token) {
    return res.writeHead(302, { Location: '/chog/pfp?error=token' }), res.end();
  }

  // Get Twitter user profile
  const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url,username', {
    headers: { 'Authorization': `Bearer ${tokens.access_token}` },
  });
  const { data: user } = await userRes.json();
  if (!user?.id) {
    return res.writeHead(302, { Location: '/chog/pfp?error=user' }), res.end();
  }

  const avatar = (user.profile_image_url || '').replace('_normal', '_400x400');

  // Upsert to Supabase — only insert on first login, don't overwrite used_free
  await fetch(`${SB_URL}/rest/v1/pfp_twitter`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ twitter_id: user.id, username: user.username, avatar_url: avatar }),
  });

  // Set session cookie (30 days)
  const session = makeSession({ id: user.id, username: user.username, avatar });
  const cookies30d = `pfp_session=${encodeURIComponent(session)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${30 * 24 * 3600}`;
  const clearPkce  = `pfp_pkce=; Path=/; HttpOnly; Max-Age=0`;

  res.setHeader('Set-Cookie', [clearPkce, cookies30d]);
  res.writeHead(302, { Location: '/chog/pfp?login=ok' });
  res.end();
};
