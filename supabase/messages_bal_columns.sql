-- ══════════════════════════════════════════════════════
--  messages 테이블에 터미널 구분용 잔고 컬럼 추가
--  MON Terminal  → mon_bal  IS NOT NULL
--  CHOG Terminal → chog_bal IS NOT NULL
--  Supabase SQL Editor에서 실행
-- ══════════════════════════════════════════════════════

ALTER TABLE messages ADD COLUMN IF NOT EXISTS mon_bal  BIGINT DEFAULT NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS chog_bal BIGINT DEFAULT NULL;
