// Twitter OAuth 2.0 PKCE — redirect to Twitter login
const crypto = require('crypto');

const CLIENT_ID   = process.env.TWITTER_CLIENT_ID;
const REDIRECT_URI = 'https://monad-terminal.xyz/api/twitter-callback';

module.exports = async function handler(req, res) {
  if (!CLIENT_ID) return res.status(500).json({ error: 'TWITTER_CLIENT_ID not set' });

  const verifier  = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state     = crypto.randomBytes(12).toString('hex');

  // Store verifier + state in short-lived cookie
  const pkce = Buffer.from(JSON.stringify({ verifier, state })).toString('base64url');
  res.setHeader('Set-Cookie', `pfp_pkce=${pkce}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);

  const url = new URL('https://twitter.com/i/oauth2/authorize');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('scope', 'tweet.read users.read');
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  res.writeHead(302, { Location: url.toString() });
  res.end();
};
