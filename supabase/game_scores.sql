-- ══════════════════════════════════════════════════════
--  Game Leaderboard: game_scores
--  Run in Supabase SQL Editor
-- ══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS game_scores (
  id             BIGSERIAL PRIMARY KEY,
  nickname       TEXT        NOT NULL,
  stage          INTEGER     NOT NULL,
  clear_time_ms  REAL        NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast leaderboard queries
CREATE INDEX IF NOT EXISTS idx_game_scores_stage_time ON game_scores (stage, clear_time_ms ASC);

-- RLS
ALTER TABLE game_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read_game_scores"  ON game_scores FOR SELECT USING (true);
CREATE POLICY "allow_insert_game_scores" ON game_scores FOR INSERT WITH CHECK (true);

-- RPC: top 10 best times per unique nickname for a stage
CREATE OR REPLACE FUNCTION game_top10(p_stage INTEGER)
RETURNS TABLE(nickname TEXT, clear_time_ms REAL) AS $$
  SELECT nickname, MIN(clear_time_ms) AS clear_time_ms
  FROM game_scores
  WHERE stage = p_stage
  GROUP BY nickname
  ORDER BY clear_time_ms ASC
  LIMIT 10;
$$ LANGUAGE SQL STABLE;

-- RPC: count of distinct players faster than given time (for rank = result + 1)
CREATE OR REPLACE FUNCTION game_rank(p_stage INTEGER, p_time REAL)
RETURNS BIGINT AS $$
  SELECT COUNT(DISTINCT nickname)
  FROM game_scores
  WHERE stage = p_stage
    AND clear_time_ms < p_time;
$$ LANGUAGE SQL STABLE;
