-- 013: Migrate text+CHECK enum-like columns to PostgreSQL native ENUM types.
--
-- Targets only the tables present in this installation:
--   exercises, workouts, sport_sessions, goal_history
-- Trainer tables (user_profiles, trainer_clients, trainer_proposals) are
-- excluded — they will be handled in a future migration once introduced.
--
-- Columns from optional migrations (009, 011) are converted conditionally:
-- the DO blocks check for column existence so the script is safe regardless
-- of whether those migrations have been applied.
--
-- Run the cleanup block first if a previous attempt partially created types:
--   DROP TYPE IF EXISTS exercise_category_t CASCADE;
--   DROP TYPE IF EXISTS workout_status_t    CASCADE;
--   DROP TYPE IF EXISTS planned_source_t    CASCADE;
--   DROP TYPE IF EXISTS sport_status_t      CASCADE;
--   DROP TYPE IF EXISTS goal_mode_t         CASCADE;

-- ─── 1. Create ENUM types ────────────────────────────────────────────────────

CREATE TYPE exercise_category_t AS ENUM ('push', 'pull', 'legs');
CREATE TYPE workout_status_t    AS ENUM ('planned', 'done');
CREATE TYPE planned_source_t    AS ENUM ('self', 'trainer');
CREATE TYPE sport_status_t      AS ENUM ('planned', 'done');
CREATE TYPE goal_mode_t         AS ENUM ('combined', 'separate');

-- ─── 2. exercises.category ───────────────────────────────────────────────────
-- Always present (schema.sql). Drop the text CHECK before converting.

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_category_check;

ALTER TABLE exercises
  ALTER COLUMN category TYPE exercise_category_t
    USING category::exercise_category_t;

-- ─── 3. workouts.categories ──────────────────────────────────────────────────
-- Always present (schema.sql). No CHECK constraint — just reset the default.
-- A helper function is needed because USING cannot contain a subquery.

CREATE OR REPLACE FUNCTION _tmp_cast_categories(text[])
  RETURNS exercise_category_t[]
  LANGUAGE sql IMMUTABLE AS
  'SELECT array_agg(v::exercise_category_t) FROM unnest($1) v';

ALTER TABLE workouts
  ALTER COLUMN categories DROP DEFAULT;

ALTER TABLE workouts
  ALTER COLUMN categories TYPE exercise_category_t[]
    USING _tmp_cast_categories(categories);

ALTER TABLE workouts
  ALTER COLUMN categories SET DEFAULT '{}'::exercise_category_t[];

DROP FUNCTION _tmp_cast_categories;

-- ─── 4. workouts.status + planned_source  (migration 009 — conditional) ─────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'workouts'
      AND column_name  = 'status'
  ) THEN
    ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_status_check;
    ALTER TABLE workouts ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE workouts ALTER COLUMN status
      TYPE workout_status_t USING status::workout_status_t;
    ALTER TABLE workouts ALTER COLUMN status SET DEFAULT 'done'::workout_status_t;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'workouts'
      AND column_name  = 'planned_source'
  ) THEN
    ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_planned_source_check;
    ALTER TABLE workouts ALTER COLUMN planned_source
      TYPE planned_source_t USING planned_source::planned_source_t;
  END IF;
END;
$$;

-- ─── 5. sport_sessions.status  (migration 011 — conditional) ─────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'sport_sessions'
      AND column_name  = 'status'
  ) THEN
    ALTER TABLE sport_sessions DROP CONSTRAINT IF EXISTS sport_sessions_status_check;
    ALTER TABLE sport_sessions ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE sport_sessions ALTER COLUMN status
      TYPE sport_status_t USING status::sport_status_t;
    ALTER TABLE sport_sessions ALTER COLUMN status SET DEFAULT 'done'::sport_status_t;
  END IF;
END;
$$;

-- ─── 6. goal_history.goal_mode ───────────────────────────────────────────────
-- Table exists (migration 010 applied).

ALTER TABLE goal_history DROP CONSTRAINT IF EXISTS goal_history_goal_mode_check;

ALTER TABLE goal_history
  ALTER COLUMN goal_mode DROP DEFAULT;

ALTER TABLE goal_history
  ALTER COLUMN goal_mode TYPE goal_mode_t
    USING goal_mode::goal_mode_t;

ALTER TABLE goal_history
  ALTER COLUMN goal_mode SET DEFAULT 'combined'::goal_mode_t;
