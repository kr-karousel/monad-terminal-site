-- PFP Studio 크레딧 테이블
-- Supabase SQL Editor에서 실행

CREATE TABLE IF NOT EXISTS pfp_credits (
  wallet       TEXT PRIMARY KEY,
  credits      INTEGER NOT NULL DEFAULT 1,
  used_txhashes TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS pfp_credits_wallet_idx ON pfp_credits(wallet);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_pfp_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pfp_credits_updated_at ON pfp_credits;
CREATE TRIGGER pfp_credits_updated_at
  BEFORE UPDATE ON pfp_credits
  FOR EACH ROW EXECUTE FUNCTION update_pfp_credits_updated_at();
