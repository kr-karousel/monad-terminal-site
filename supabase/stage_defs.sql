-- Run in Supabase SQL Editor
CREATE TABLE IF NOT EXISTS stage_defs (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  defs       JSONB   NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Single row that holds all stage data as { "0": [...], "1": [...], ... }
INSERT INTO stage_defs (id, defs) VALUES (1, '{}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

ALTER TABLE stage_defs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_read_stage_defs"   ON stage_defs FOR SELECT USING (true);
CREATE POLICY "allow_update_stage_defs" ON stage_defs FOR UPDATE USING (true);
