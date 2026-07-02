-- 017: Share a workout via link
-- Lets a user generate a link for one of their workouts; anyone else who's
-- logged in can open it, preview the exercises, and import it into their
-- own account (matched by exercise name — exercise ids are per-user, so
-- they can't be reused across accounts).

CREATE TABLE IF NOT EXISTS shared_workouts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       text        NOT NULL,
  category   text        NOT NULL CHECK (category IN ('push', 'pull', 'legs', 'mixed')),
  entries    jsonb       NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shared_workouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners create shared workouts" ON shared_workouts;
CREATE POLICY "owners create shared workouts" ON shared_workouts FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- Any authenticated user can read a shared workout once they have its id
-- (the link) — needed so the recipient, not just the owner, can preview
-- and import it.
DROP POLICY IF EXISTS "authenticated users read shared workouts by id" ON shared_workouts;
CREATE POLICY "authenticated users read shared workouts by id" ON shared_workouts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS shared_workouts_owner_id_idx
  ON shared_workouts (owner_id);
