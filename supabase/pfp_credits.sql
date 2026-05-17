-- PFP Studio tables — run in Supabase SQL Editor

-- Wallet-based paid credits (100 MON = 10 generations)
CREATE TABLE IF NOT EXISTS pfp_credits (
  wallet       TEXT PRIMARY KEY,
  credits      INTEGER NOT NULL DEFAULT 0,
  used_txhashes TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pfp_credits_wallet_idx ON pfp_credits(wallet);

CREATE OR REPLACE FUNCTION update_pfp_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pfp_credits_updated_at ON pfp_credits;
CREATE TRIGGER pfp_credits_updated_at
  BEFORE UPDATE ON pfp_credits
  FOR EACH ROW EXECUTE FUNCTION update_pfp_credits_updated_at();

-- X (Twitter) account — 1 free generation per account
CREATE TABLE IF NOT EXISTS pfp_twitter (
  twitter_id   TEXT PRIMARY KEY,
  username     TEXT,
  avatar_url   TEXT,
  used_free    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
