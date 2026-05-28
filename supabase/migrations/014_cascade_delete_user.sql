-- Make all per-user tables cascade-delete when the auth user is removed.
-- Without this, deleting a user fails with FK constraint violations on
-- exercises, workouts, sports, and sport_sessions.

ALTER TABLE exercises
  DROP CONSTRAINT exercises_user_id_fkey,
  ADD  CONSTRAINT exercises_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE CASCADE;

ALTER TABLE workouts
  DROP CONSTRAINT workouts_user_id_fkey,
  ADD  CONSTRAINT workouts_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE CASCADE;

ALTER TABLE sports
  DROP CONSTRAINT sports_user_id_fkey,
  ADD  CONSTRAINT sports_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE CASCADE;

ALTER TABLE sport_sessions
  DROP CONSTRAINT sport_sessions_user_id_fkey,
  ADD  CONSTRAINT sport_sessions_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE CASCADE;
