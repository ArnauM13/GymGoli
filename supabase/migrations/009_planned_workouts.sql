-- 009: Planned (future) workouts
-- Adds status and planned_source columns so users can schedule workouts
-- ahead of time. Trainer proposals can also materialize as planned workouts.

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done'
    CHECK (status IN ('planned', 'done'));

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS planned_source text
    CHECK (planned_source IN ('self', 'trainer'));

-- Fast lookups by user+status+date for the calendar and planning views
CREATE INDEX IF NOT EXISTS workouts_user_status_date_idx
  ON workouts (user_id, status, date);
