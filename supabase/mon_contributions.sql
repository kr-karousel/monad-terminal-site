-- ══════════════════════════════════════════════════════
--  MON Terminal: 별도 contributions 테이블
--  CHOG terminal의 contributions 테이블과 완전 분리
--  Supabase SQL Editor에서 실행
-- ══════════════════════════════════════════════════════

-- 1. 테이블 생성
CREATE TABLE IF NOT EXISTS mon_contributions (
  address        TEXT PRIMARY KEY,
  chat_pts       INTEGER   DEFAULT 0,
  last_chat_hour BIGINT    DEFAULT 0,
  nick_count     INTEGER   DEFAULT 0,
  shout_count    INTEGER   DEFAULT 0,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 2. RLS
ALTER TABLE mon_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all_mon_contrib" ON mon_contributions
  USING (true) WITH CHECK (true);

-- 3. Realtime 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE mon_contributions;

-- 4. RPC: 채팅 포인트 (시간당 1회 누적)
CREATE OR REPLACE FUNCTION mon_add_chat_point(p_address TEXT, p_hour BIGINT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO mon_contributions (address, chat_pts, last_chat_hour)
  VALUES (p_address, 1, p_hour)
  ON CONFLICT (address) DO UPDATE
    SET chat_pts       = mon_contributions.chat_pts
                        + CASE WHEN mon_contributions.last_chat_hour < p_hour THEN 1 ELSE 0 END,
        last_chat_hour = GREATEST(mon_contributions.last_chat_hour, p_hour),
        updated_at     = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. RPC: 닉네임 포인트
CREATE OR REPLACE FUNCTION mon_add_nick_point(p_address TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO mon_contributions (address, nick_count)
  VALUES (p_address, 1)
  ON CONFLICT (address) DO UPDATE
    SET nick_count = mon_contributions.nick_count + 1,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. RPC: 외치기 포인트
CREATE OR REPLACE FUNCTION mon_add_shout_point(p_address TEXT)
RETURNS VOID AS $$
BEGIN
  INSERT INTO mon_contributions (address, shout_count)
  VALUES (p_address, 1)
  ON CONFLICT (address) DO UPDATE
    SET shout_count = mon_contributions.shout_count + 1,
        updated_at  = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
