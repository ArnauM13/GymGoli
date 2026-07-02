-- 016: Cloud-sync workout templates ("rutines")
-- Templates currently live only in localStorage (see TemplateService),
-- so they don't survive a device change or reinstall. This adds a
-- per-user templates table, mirroring the sports/exercises pattern,
-- so the app can sync them the same way it already does everything else.

CREATE TABLE IF NOT EXISTS templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       text        NOT NULL,
  category   text        NOT NULL CHECK (category IN ('push', 'pull', 'legs', 'mixed')),
  entries    jsonb       NOT NULL DEFAULT '[]',
  use_count  integer     NOT NULL DEFAULT 0,
  last_used  date,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own templates" ON templates;
CREATE POLICY "users own templates" ON templates FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS templates_user_id_idx
  ON templates (user_id);
