-- Migration 006: exercise guidance fields (muscles, description, sets/reps ranges)
-- Run this in the Supabase SQL Editor.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS muscles     text[]   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sets_min    smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sets_max    smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reps_min    smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reps_max    smallint DEFAULT NULL;
