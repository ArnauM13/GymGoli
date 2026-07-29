-- Migration 027: per-exercise weight step
-- Weight increment (kg) applied by the +/- arrows in the workout editor for a
-- given exercise. Null → the unit default (2.5 kg / 5 lb). Lets exercises with
-- finer or coarser jumps step by their own amount instead of a fixed 2.5.
-- Run this in the Supabase SQL Editor.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS weight_step real;
