-- Migration 025: exercise bodyweight factor
-- Fraction of bodyweight actually moved by a bodyweight/assisted exercise
-- (e.g. ~1 for dominades/fons, ~0.65 for flexions). Null → treated as 1.
-- Run this in the Supabase SQL Editor.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS bodyweight_factor real;

-- The built-in bodyweight exercise moves the whole bodyweight.
UPDATE exercises SET bodyweight_factor = 1
  WHERE name = 'Dominades' AND load_type = 'bodyweight' AND bodyweight_factor IS NULL;
