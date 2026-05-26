-- 013: Migrate all text+CHECK enum-like columns to PostgreSQL native ENUM types.
--
-- MOTIVATION
-- ----------
-- text + CHECK constraints store per-row UTF-8 strings and perform string
-- comparison at write time. PostgreSQL native ENUMs are stored internally as
-- 4-byte OIDs (numeric), validated at write-time by the type system, and
-- self-documenting via pg_type — without extra join tables or indexes.
--
-- IMPACT ON APPLICATION CODE
-- --------------------------
-- No changes required. The Supabase/PostgREST driver returns ENUM values as
-- plain strings. All TypeScript types remain unchanged.
--
-- ROBUSTNESS
-- ----------
-- Sections that depend on optional migrations (007, 010) are wrapped in
-- DO $$ blocks that check for table existence first, so this migration is
-- safe to run regardless of which prior migrations have been applied.
--
-- PRE-REQUISITES: migrations 001 (schema), 002, 009, 011.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Create ENUM types (always)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TYPE exercise_category_t AS ENUM ('push', 'pull', 'legs');
CREATE TYPE workout_status_t    AS ENUM ('planned', 'done');
CREATE TYPE planned_source_t    AS ENUM ('self', 'trainer');
CREATE TYPE sport_status_t      AS ENUM ('planned', 'done');
CREATE TYPE user_role_t         AS ENUM ('user', 'trainer');
CREATE TYPE client_status_t     AS ENUM ('active', 'removed');
CREATE TYPE proposal_type_t     AS ENUM ('specific', 'weekly');
CREATE TYPE goal_mode_t         AS ENUM ('combined', 'separate');

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. exercises.category  (schema.sql — always exists)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE exercises DROP CONSTRAINT IF EXISTS exercises_category_check;

ALTER TABLE exercises
  ALTER COLUMN category TYPE exercise_category_t
    USING category::exercise_category_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. workouts.categories + workouts.status + workouts.planned_source
--    (schema.sql + 009 — always exists)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_status_check;
ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_planned_source_check;

ALTER TABLE workouts
  ALTER COLUMN categories DROP DEFAULT;

ALTER TABLE workouts
  ALTER COLUMN categories TYPE exercise_category_t[]
    USING ARRAY(SELECT unnest(categories)::exercise_category_t);

ALTER TABLE workouts
  ALTER COLUMN categories SET DEFAULT '{}'::exercise_category_t[];

ALTER TABLE workouts
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE workouts
  ALTER COLUMN status TYPE workout_status_t
    USING status::workout_status_t;

ALTER TABLE workouts
  ALTER COLUMN status SET DEFAULT 'done'::workout_status_t;

ALTER TABLE workouts
  ALTER COLUMN planned_source TYPE planned_source_t
    USING planned_source::planned_source_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. sport_sessions.status  (002 + 011 — always exists)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE sport_sessions DROP CONSTRAINT IF EXISTS sport_sessions_status_check;

ALTER TABLE sport_sessions
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE sport_sessions
  ALTER COLUMN status TYPE sport_status_t
    USING status::sport_status_t;

ALTER TABLE sport_sessions
  ALTER COLUMN status SET DEFAULT 'done'::sport_status_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. user_profiles.role  (migration 007 — conditional)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
  ) THEN
    ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
    ALTER TABLE user_profiles ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE user_profiles ALTER COLUMN role TYPE user_role_t USING role::user_role_t;
    ALTER TABLE user_profiles ALTER COLUMN role SET DEFAULT 'user'::user_role_t;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. trainer_clients.status  (migration 007 — conditional)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trainer_clients'
  ) THEN
    ALTER TABLE trainer_clients DROP CONSTRAINT IF EXISTS trainer_clients_status_check;
    ALTER TABLE trainer_clients ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE trainer_clients ALTER COLUMN status TYPE client_status_t USING status::client_status_t;
    ALTER TABLE trainer_clients ALTER COLUMN status SET DEFAULT 'active'::client_status_t;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. trainer_proposals.proposal_type  (migration 007 — conditional)
--    The named cross-field CONSTRAINT proposal_type_check uses implicit cast
--    (proposal_type = 'specific') — remains valid after ENUM conversion.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'trainer_proposals'
  ) THEN
    ALTER TABLE trainer_proposals DROP CONSTRAINT IF EXISTS trainer_proposals_proposal_type_check;
    ALTER TABLE trainer_proposals ALTER COLUMN proposal_type TYPE proposal_type_t
      USING proposal_type::proposal_type_t;
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. goal_history.goal_mode  (migration 010 — conditional)
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'goal_history'
  ) THEN
    ALTER TABLE goal_history DROP CONSTRAINT IF EXISTS goal_history_goal_mode_check;
    ALTER TABLE goal_history ALTER COLUMN goal_mode DROP DEFAULT;
    ALTER TABLE goal_history ALTER COLUMN goal_mode TYPE goal_mode_t USING goal_mode::goal_mode_t;
    ALTER TABLE goal_history ALTER COLUMN goal_mode SET DEFAULT 'combined'::goal_mode_t;
  END IF;
END;
$$;
