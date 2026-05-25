-- 011: Planned (future) sport sessions
-- Adds a status column so users can schedule sport sessions ahead of time,
-- mirroring the planned workouts feature (migration 009).

ALTER TABLE sport_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'done'
    CHECK (status IN ('planned', 'done'));

-- Fast lookups by user+status+date for the planning views
CREATE INDEX IF NOT EXISTS sport_sessions_user_status_date_idx
  ON sport_sessions (user_id, status, date);
