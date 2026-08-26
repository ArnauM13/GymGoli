-- Migration 028: allow user-created training types in every stored category
-- Run this in Supabase Dashboard → SQL Editor → New query
--
-- PROBLEMA
-- --------
-- La migració 026 va fer configurables els tipus d'entrenament: els que crea
-- l'usuari tenen un id UUID (training_types.id), i aquest id s'escriu a
-- workouts.categories / workouts.category i a exercises.category exactament
-- com els built-ins 'push' / 'pull' / 'legs'.
--
-- La base de dades, però, encara limitava aquests camps als tres valors
-- originals — amb un CHECK (schema inicial) o amb un ENUM natiu
-- exercise_category_t (migració 013). Qualsevol entrenament (o exercici, o
-- plantilla) etiquetat amb un tipus propi era rebutjat pel servidor amb un
-- error de tipus/constraint.
--
-- Com que l'escriptura passa per la cua de sincronització (SyncService), això
-- no es veia enlloc: l'entrenament quedava desat només en local, es continuava
-- mostrant a Inici (que llegeix la memòria cau del mes) i no apareixia MAI a
-- Historial, que consulta Supabase directament. D'aquí el símptoma "no es
-- veuen tots els entrenaments realitzats a l'historial, a la home sí".
--
-- SOLUCIÓ
-- -------
-- Obrir els camps a text lliure. El vocabulari passa a ser la taula
-- training_types (per usuari), que ja és qui mana a l'aplicació: el registre
-- de tipus resol nom, icona i color de qualsevol id.
--
-- Idempotent i segur de re-executar. Un cop aplicada, la cua pendent de cada
-- dispositiu es buida sola en obrir l'app i els entrenaments que faltaven
-- apareixen a l'historial.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Elimina els CHECK que limiten les categories a push/pull/legs[/mixed]
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text;
  c record;
BEGIN
  FOREACH t IN ARRAY ARRAY['exercises', 'workouts', 'templates', 'shared_workouts'] LOOP
    FOR c IN
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class     rel ON rel.oid = con.conrelid
      JOIN pg_namespace ns  ON ns.oid  = rel.relnamespace
      WHERE ns.nspname = 'public'
        AND rel.relname = t
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) ILIKE '%categor%'
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', t, c.conname);
    END LOOP;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Reverteix els ENUM de la migració 013 a text
--    (exercise_category_t → text, exercise_category_t[] → text[])
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'exercises'
      AND column_name = 'category' AND udt_name = 'exercise_category_t'
  ) THEN
    ALTER TABLE public.exercises ALTER COLUMN category DROP DEFAULT;
    ALTER TABLE public.exercises
      ALTER COLUMN category TYPE text USING category::text;
  END IF;
END $$;

DO $$
BEGIN
  -- Un array d'ENUM es veu com '_exercise_category_t' a udt_name.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'workouts'
      AND column_name = 'categories' AND udt_name = '_exercise_category_t'
  ) THEN
    ALTER TABLE public.workouts ALTER COLUMN categories DROP DEFAULT;
    -- Cast d'array directe: `USING` no admet subconsultes (0A000 "cannot use
    -- subquery in transform expression"), així que aquí no serveix el
    -- ARRAY(SELECT unnest(…)) que fa servir la migració 013. `enum[]::text[]`
    -- ja converteix element a element.
    ALTER TABLE public.workouts
      ALTER COLUMN categories TYPE text[] USING categories::text[];
    ALTER TABLE public.workouts ALTER COLUMN categories SET DEFAULT '{}';
  END IF;
END $$;

-- El tipus exercise_category_t es deixa creat (encara que ja no s'usi):
-- eliminar-lo no aporta res i falla si alguna instal·lació el referencia
-- des d'una altra columna.

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Índex per a les cerques per categoria de l'historial
--    (loadWorkoutPage filtra amb categories @> ARRAY[<tipus>])
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS workouts_categories_gin_idx
  ON workouts USING gin (categories);
