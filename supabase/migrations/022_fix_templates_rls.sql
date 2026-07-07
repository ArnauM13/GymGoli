-- 022: Re-apply RLS policy for templates
-- Saving a template fails with "new row violates row-level security policy
-- for table templates" (Postgres 42501) — this is the exact error Postgres
-- raises both when a policy's check fails AND when RLS is enabled with no
-- matching policy at all, which points at migration 016 not having been
-- (fully) applied to this database. This migration is a no-op if 016 already
-- ran cleanly, and fixes it otherwise.

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
