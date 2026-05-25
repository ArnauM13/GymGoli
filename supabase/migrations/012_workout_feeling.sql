-- 012: Whole-workout feeling
-- Adds the feeling column on workouts so a general feeling (1–5) can be saved
-- for an entire workout (distinct from per-exercise feeling stored in entries).

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS feeling smallint
    CHECK (feeling BETWEEN 1 AND 5);
