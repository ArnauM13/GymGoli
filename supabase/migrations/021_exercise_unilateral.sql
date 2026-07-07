-- Migration 021: unilateral exercises (per-side weight logging)
-- Run this in the Supabase SQL Editor.

ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS unilateral boolean DEFAULT false;
