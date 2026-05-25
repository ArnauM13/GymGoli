-- 013: Migrate string CHECK columns to PostgreSQL native ENUM types.
--
-- Motivation: text + CHECK constraints store per-row UTF-8 strings and offer
-- no query-plan benefit. PostgreSQL ENUMs are stored internally as 4-byte OIDs
-- (numeric), validated at write-time, and self-documenting in pg_type without
-- requiring extra join tables. For fixed vocabulary sets like status or
-- planned_source this is the recommended PostgreSQL pattern.
--
-- No application-code changes are needed: the driver returns ENUM values as
-- plain strings, so the TypeScript service layer is transparent to this change.
--
-- Run order: after 009 (workouts.status / planned_source) and 011 (sport_sessions.status).

-- ── Create enum types ─────────────────────────────────────────────────────────

CREATE TYPE workout_status_t AS ENUM ('planned', 'done');
CREATE TYPE planned_source_t AS ENUM ('self', 'trainer');
CREATE TYPE sport_status_t   AS ENUM ('planned', 'done');

-- ── workouts.status ───────────────────────────────────────────────────────────

ALTER TABLE workouts
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE workouts
  ALTER COLUMN status TYPE workout_status_t
    USING status::workout_status_t;

ALTER TABLE workouts
  ALTER COLUMN status SET DEFAULT 'done'::workout_status_t;

-- ── workouts.planned_source ───────────────────────────────────────────────────

ALTER TABLE workouts
  ALTER COLUMN planned_source TYPE planned_source_t
    USING planned_source::planned_source_t;

-- ── sport_sessions.status ─────────────────────────────────────────────────────

ALTER TABLE sport_sessions
  ALTER COLUMN status DROP DEFAULT;

ALTER TABLE sport_sessions
  ALTER COLUMN status TYPE sport_status_t
    USING status::sport_status_t;

ALTER TABLE sport_sessions
  ALTER COLUMN status SET DEFAULT 'done'::sport_status_t;
