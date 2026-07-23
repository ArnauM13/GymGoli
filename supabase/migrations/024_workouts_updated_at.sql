-- Migration 024: workouts.updated_at (activity timestamp)
-- Lets the app tell a session still being trained from one abandoned hours
-- ago, so live-training aids (e.g. next-exercise suggestions) go quiet once a
-- workout has been idle for a while.
-- Run this in the Supabase SQL Editor.

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- Backfill existing rows from created_at so history keeps a sensible value.
UPDATE workouts SET updated_at = created_at WHERE updated_at IS NULL;

ALTER TABLE workouts
  ALTER COLUMN updated_at SET DEFAULT now();
