-- Migració 035: un dia s'ordena per quan s'ha fet cada cosa
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ══════════════════════════════════════════════════════════════════════════════
-- Un dia es llegeix com es va viure: la cursa del matí abans del gimnàs de la
-- tarda. L'app, però, ordenava per l'alta de la fila (`created_at`), i amb un
-- pla això no és el mateix: un pàdel apuntat dilluns per dijous es va crear
-- dilluns, i dijous, un cop jugat, sortia per davant de tot el que s'havia fet
-- abans aquell dia.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- LA SOLUCIÓ: UNA HORA MÉS, NOMÉS QUAN CAL
-- ══════════════════════════════════════════════════════════════════════════════
-- `started_at` és quan l'activitat es va fer de debò, i **només s'escriu quan
-- un pla passa a estar fet**. La resta de files es queden a NULL, que vol dir
-- el que ja volien dir: van néixer amb l'activitat i `created_at` ja és l'hora
-- bona. La migració no reescriu ni una fila.
--
--   ordre del dia = COALESCE(started_at, created_at)
--
-- Com `session_group_id` (migració 034), és una columna escalar d'una fila que
-- ja se sincronitza: puja pel camí de sempre (`rev`/`syncedRev`) i, en un
-- conflicte, es resol com la resta de camps. La sincronització no s'assabenta
-- que això existeix.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. LA COLUMNA
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workouts       ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE sport_sessions ADD COLUMN IF NOT EXISTS started_at timestamptz;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. EL FEED HO HA DE PORTAR
-- ══════════════════════════════════════════════════════════════════════════════
-- `activity_feed` (migracions 031, 033 i 034) és l'única consulta que porta un
-- tram d'activitat, i és amb el que es pinten les targetes: sense l'hora, un
-- pla ja fet es tornaria a col·locar pel dia que es va apuntar fins que algú
-- n'obrís les sèries.
--
-- Afegir una columna al resultat vol dir refer la funció: `CREATE OR REPLACE`
-- no pot canviar el tipus de retorn. La resta del cos és el de la 034, i
-- l'ordre de sortida no canvia: qui pinta el dia és qui l'ordena.

DROP FUNCTION IF EXISTS activity_feed(date, date, real, text, text);

CREATE FUNCTION activity_feed(
  p_from       date,
  p_to         date,
  p_bodyweight real DEFAULT NULL,
  p_search     text DEFAULT NULL,
  p_category   text DEFAULT NULL
)
RETURNS TABLE (
  kind             text,
  item_id          uuid,
  item_date        date,
  item_status      text,
  planned_source   text,
  feeling          smallint,
  notes            text,
  created_at       timestamptz,
  started_at       timestamptz,
  updated_at       timestamptz,
  category         text,
  categories       text[],
  exercise_names   text,
  exercise_count   smallint,
  set_count        smallint,
  warmup_count     smallint,
  volume           real,
  sport_id         uuid,
  subtype_id       text,
  duration         int,
  metrics          jsonb,
  session_group_id uuid
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    'workout'::text,
    w.id,
    w.date,
    w.status::text,
    w.planned_source::text,
    w.feeling,
    w.notes,
    w.created_at,
    w.started_at,
    w.updated_at,
    w.category,
    w.categories::text[],
    w.exercise_names,
    w.exercise_count,
    w.set_count,
    w.warmup_count,
    workout_volume(w.entries, auth.uid(), p_bodyweight),
    NULL::uuid,
    NULL::text,
    NULL::int,
    NULL::jsonb,
    w.session_group_id
  FROM workouts w
  WHERE w.user_id = auth.uid()
    AND w.date >= p_from
    AND w.date <= p_to
    AND (
      p_search IS NULL OR p_search = ''
      OR w.exercise_names ILIKE
         '%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    )
    AND (p_category IS NULL OR p_category = '' OR p_category = ANY (w.categories::text[]))

  UNION ALL

  SELECT
    'sport'::text,
    s.id,
    s.date,
    s.status::text,
    s.planned_source::text,
    s.feeling,
    s.notes,
    s.created_at,
    s.started_at,
    s.updated_at,
    NULL::text,
    NULL::text[],
    NULL::text,
    NULL::smallint,
    NULL::smallint,
    NULL::smallint,
    NULL::real,
    s.sport_id,
    s.subtype_id,
    s.duration,
    s.metrics,
    s.session_group_id
  FROM sport_sessions s
  WHERE s.user_id = auth.uid()
    AND s.date >= p_from
    AND s.date <= p_to
    -- Un esport no té noms d'exercici ni tipus d'entrenament: amb qualsevol
    -- dels dos filtres posat, la pregunta no va per ell.
    AND COALESCE(p_search, '')   = ''
    AND COALESCE(p_category, '') = ''

  -- Del dia més recent al més antic, i dins d'un dia per ordre d'alta, com
  -- fins ara: en una UNION l'ordre només pot anar per posició, i posar-hi un
  -- COALESCE demanaria embolcallar la consulta per no res. L'ordre de dins
  -- d'un dia el decideix qui el pinta (`groupDayFeed`): els plans al davant i
  -- la resta per `COALESCE(started_at, created_at)`. Aquí només cal que sigui
  -- total i estable, que és el que demana la paginació.
  ORDER BY 3 DESC, 8 DESC, 2 DESC;
$$;

REVOKE ALL     ON FUNCTION activity_feed(date, date, real, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION activity_feed(date, date, real, text, text) TO authenticated;
