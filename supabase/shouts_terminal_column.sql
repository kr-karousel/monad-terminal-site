-- ══════════════════════════════════════════════════════
--  shouts 테이블에 터미널 구분 컬럼 추가
--  'mon'  → MON Terminal shout
--  'chog' → CHOG Terminal shout (기존 데이터 포함)
--  Supabase SQL Editor에서 실행
-- ══════════════════════════════════════════════════════

ALTER TABLE shouts ADD COLUMN IF NOT EXISTS terminal TEXT DEFAULT 'chog';

-- 기존 행 (terminal=NULL)은 CHOG로 처리하므로 별도 업데이트 불필요
-- (코드에서 .or('terminal.eq.chog,terminal.is.null') 로 처리)
