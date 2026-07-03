-- 018: Shared workouts carry no user reference at all
-- Only the workout's name and exercises are needed to preview and import
-- it — dropping owner_id removes any dependency on the sender's account
-- (and the RLS check that was denying reads with a 403).

-- Policies referencing owner_id must go before the column is dropped.
DROP POLICY IF EXISTS "owners create shared workouts" ON shared_workouts;
DROP POLICY IF EXISTS "authenticated users read shared workouts by id" ON shared_workouts;

DROP INDEX IF EXISTS shared_workouts_owner_id_idx;
ALTER TABLE shared_workouts DROP CONSTRAINT IF EXISTS shared_workouts_owner_id_fkey;
ALTER TABLE shared_workouts DROP COLUMN IF EXISTS owner_id;

CREATE POLICY "authenticated users create shared workouts" ON shared_workouts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated users read shared workouts by id" ON shared_workouts FOR SELECT
  USING (auth.uid() IS NOT NULL);
