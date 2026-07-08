-- 023: Configurable exercise categories
--
-- Categories were hardcoded to a Postgres ENUM ('push','pull','legs') on
-- exercises/workouts (see 013_enum_types.sql), plus a duplicate text+CHECK
-- representation (which also allows 'mixed') on templates/shared_workouts.
-- This migration introduces a per-user `exercise_categories` table (same
-- shape and RLS convention as `sports`) and widens every category-bearing
-- column to plain `text` so it can hold arbitrary user-defined values.
--
-- KEY DESIGN CHOICE: the stable value stored on exercises/workouts/templates/
-- shared_workouts remains a short *slug* (`key`), not the row's uuid `id`
-- and not the mutable display `name`. This means the 3 existing default
-- rows ('push','pull','legs') need zero data backfill — every existing
-- category/categories value already IS a valid key — and renaming a
-- category later never invalidates references. Seeding the 3 defaults for
-- each user happens client-side, lazily, the same way CategoryService
-- mirrors SportService's `_seedDefaults`.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. New table: exercise_categories
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exercise_categories (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  key        text        NOT NULL,
  name       text        NOT NULL,
  icon       text        NOT NULL DEFAULT 'fitness_center',
  color      text        NOT NULL DEFAULT '#006874',
  muscles    text,
  sort_order integer     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

ALTER TABLE exercise_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users own exercise categories" ON exercise_categories;
CREATE POLICY "users own exercise categories" ON exercise_categories FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS exercise_categories_user_id_idx
  ON exercise_categories (user_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. exercises.category: exercise_category_t → text
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE exercises
  ALTER COLUMN category TYPE text USING category::text;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. workouts.categories: exercise_category_t[] → text[]
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workouts
  ALTER COLUMN categories TYPE text[] USING categories::text[];

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. templates.category / shared_workouts.category: drop the fixed-
--    vocabulary CHECK constraints (never converted to the enum in 013).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE templates DROP CONSTRAINT IF EXISTS templates_category_check;
ALTER TABLE shared_workouts DROP CONSTRAINT IF EXISTS shared_workouts_category_check;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. Drop the now-unused enum type.
--    Safe: exercises.category and workouts.categories were its only two
--    dependents (see 013_enum_types.sql), both widened above.
-- ═══════════════════════════════════════════════════════════════════════════════

DROP TYPE IF EXISTS exercise_category_t;
