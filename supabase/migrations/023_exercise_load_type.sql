-- Migration 023: exercise load type (bodyweight / assisted volume)
-- Lets bodyweight exercises (dominades, fons…) count their real load towards
-- volume, folding in the user's bodyweight from user_settings.
-- Run this in the Supabase SQL Editor.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS load_type text NOT NULL DEFAULT 'weighted';

-- Seed the built-in bodyweight exercise for existing users.
UPDATE exercises SET load_type = 'bodyweight'
  WHERE name = 'Dominades' AND load_type = 'weighted';
