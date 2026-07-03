-- 020: Fix Historial's "search by exercise name" always returning nothing.
--
-- loadWorkoutPage() searched with:
--   .filter('entries::text', 'ilike', `%${search}%`)
-- which casts the whole `entries` jsonb blob (ids, sets, weights, notes —
-- not just names) to text before matching, an unreliable and unindexable
-- pattern that depends on undocumented PostgREST cast-in-filter behavior.
--
-- Replaces it with a generated, stored column that holds just the
-- exercise names of a workout as plain space-joined text, filtered with a
-- plain `.ilike()` — a fully standard, guaranteed-supported column filter.

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS exercise_names text
  GENERATED ALWAYS AS (
    (SELECT string_agg(entry ->> 'exerciseName', ' ') FROM jsonb_array_elements(entries) AS entry)
  ) STORED;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS workouts_exercise_names_trgm_idx
  ON workouts USING gin (exercise_names gin_trgm_ops);
