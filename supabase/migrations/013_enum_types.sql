-- 013: Migrate all text+CHECK enum-like columns to PostgreSQL native ENUM types.
--
-- MOTIVATION
-- ----------
-- text + CHECK constraints store per-row UTF-8 strings and perform string
-- comparison at write time. PostgreSQL native ENUMs are stored internally as
-- 4-byte OIDs (numeric), validated at write-time by the type system, and
-- self-documenting via pg_type — without extra join tables or indexes.
-- For any fixed-vocabulary set this is the recommended PostgreSQL pattern.
--
-- IMPACT ON APPLICATION CODE
-- --------------------------
-- No changes required. The Supabase/PostgREST driver returns ENUM values as
-- plain strings, identical to the current text columns. All TypeScript types
-- (WorkoutStatus, PlannedSource, ExerciseCategory, etc.) remain unchanged.
--
-- COLUMNS MIGRATED
-- ----------------
-- exercises.category          text CHECK ('push','pull','legs')    → exercise_category_t
-- workouts.categories         text[]                               → exercise_category_t[]
-- workouts.status             text CHECK ('planned','done')        → workout_status_t
-- workouts.planned_source     text CHECK ('self','trainer')        → planned_source_t
-- sport_sessions.status       text CHECK ('planned','done')        → sport_status_t
-- user_profiles.role          text CHECK ('user','trainer')        → user_role_t
-- trainer_clients.status      text CHECK ('active','removed')      → client_status_t
-- trainer_proposals.proposal_type text CHECK ('specific','weekly') → proposal_type_t
-- goal_history.goal_mode      text CHECK ('combined','separate')   → goal_mode_t
--
-- PRE-REQUISITES: migrations 001 (schema), 007, 009, 010, 011 must be applied.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Create all ENUM types
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
-- 2. exercises.category
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE exercises
  ALTER COLUMN category TYPE exercise_category_t
    USING category::exercise_category_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. workouts.categories (text[] → exercise_category_t[])
--    Safe: the app never writes values outside ('push','pull','legs').
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workouts
  ALTER COLUMN categories TYPE exercise_category_t[]
    USING ARRAY(
      SELECT unnest(categories)::exercise_category_t
    );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. workouts.status
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workouts
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE workouts
  ALTER COLUMN status TYPE workout_status_t
    USING status::workout_status_t;

ALTER TABLE workouts
  ALTER COLUMN status SET DEFAULT 'done'::workout_status_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. workouts.planned_source
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workouts
  ALTER COLUMN planned_source TYPE planned_source_t
    USING planned_source::planned_source_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. sport_sessions.status
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE sport_sessions
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE sport_sessions
  ALTER COLUMN status TYPE sport_status_t
    USING status::sport_status_t;

ALTER TABLE sport_sessions
  ALTER COLUMN status SET DEFAULT 'done'::sport_status_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 7. user_profiles.role
--    Note: the existing function generate_trainer_invite() compares
--    role = 'trainer' — PostgreSQL implicitly casts the text literal, no
--    function changes needed.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_profiles
  ALTER COLUMN role DROP DEFAULT;

ALTER TABLE user_profiles
  ALTER COLUMN role TYPE user_role_t
    USING role::user_role_t;

ALTER TABLE user_profiles
  ALTER COLUMN role SET DEFAULT 'user'::user_role_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 8. trainer_clients.status
--    The RLS policy "profiles_related" compares tc.status = 'active';
--    implicit cast continues to work after this change.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE trainer_clients
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE trainer_clients
  ALTER COLUMN status TYPE client_status_t
    USING status::client_status_t;

ALTER TABLE trainer_clients
  ALTER COLUMN status SET DEFAULT 'active'::client_status_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 9. trainer_proposals.proposal_type
--    The cross-field CHECK constraint references proposal_type = 'specific'
--    and proposal_type = 'weekly'; implicit cast keeps it valid.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE trainer_proposals
  ALTER COLUMN proposal_type TYPE proposal_type_t
    USING proposal_type::proposal_type_t;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 10. goal_history.goal_mode
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE goal_history
  ALTER COLUMN goal_mode DROP DEFAULT;

ALTER TABLE goal_history
  ALTER COLUMN goal_mode TYPE goal_mode_t
    USING goal_mode::goal_mode_t;

ALTER TABLE goal_history
  ALTER COLUMN goal_mode SET DEFAULT 'combined'::goal_mode_t;
