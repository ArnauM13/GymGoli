-- Migració 034: diverses activitats, una mateixa sessió
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ══════════════════════════════════════════════════════════════════════════════
-- Anar al gimnàs i acabar amb vint minuts de cinta són dues activitats i una
-- sola anada. Anar-hi al matí i jugar a futbol a la tarda també són dues
-- activitats, però són dues sortides de casa.
--
-- Fins ara l'app no sabia distingir-ho: comptava files. Les dues coses valien
-- «2 sessions», i la ratxa, el resum de la setmana i «X sessions els últims 7
-- dies» donaven per bo que cada fila era una anada.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- LA SOLUCIÓ: UNA ETIQUETA, NO UNA TAULA
-- ══════════════════════════════════════════════════════════════════════════════
-- `session_group_id` és un uuid opcional a `workouts` i a `sport_sessions`.
-- Les activitats que en comparteixen un són la mateixa sessió; una activitat
-- sense etiqueta és una sessió ella sola.
--
-- No hi ha cap fila mestra i no cal que n'hi hagi:
--
--   * **Res del que ja hi ha canvia.** Tot l'historial queda a NULL, que vol
--     dir exactament el que volia dir abans: una activitat, una sessió. La
--     migració no reescriu ni una fila.
--   * **La sincronització no s'assabenta que això existeix.** És una columna
--     escalar més d'una fila que ja se sincronitza: puja pel camí de sempre
--     (`rev`/`syncedRev`) i, en un conflicte, `mergeWorkouts()` la resol com
--     la resta de camps — mana la versió modificada més tard. Una taula nova
--     hauria volgut dir un segon objecte pendent, un altre conflicte a
--     resoldre i un lloc nou on una activitat pot quedar òrfena.
--   * **Esborrar no deixa restes.** Un grup amb una sola activitat és
--     indistingible de no tenir-ne cap: la targeta es pinta com sempre i no
--     hi ha res a netejar.
--
-- La invariant que sí que cal mantenir des del client: **un grup viu dins d'un
-- sol dia**. El magatzem local està partit per mes i el feed es demana per
-- trams; un grup a cavall de dos dies els trencaria tots dos.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. LA COLUMNA
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE workouts        ADD COLUMN IF NOT EXISTS session_group_id uuid;
ALTER TABLE sport_sessions  ADD COLUMN IF NOT EXISTS session_group_id uuid;

-- Índexs parcials: només indexen les files agrupades, que són les poques que
-- es busquen per grup. L'historial sense agrupar no els fa créixer.
CREATE INDEX IF NOT EXISTS workouts_session_group_idx
  ON workouts (user_id, session_group_id)
  WHERE session_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sport_sessions_session_group_idx
  ON sport_sessions (user_id, session_group_id)
  WHERE session_group_id IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. EL FEED HO HA DE PORTAR
-- ══════════════════════════════════════════════════════════════════════════════
-- `activity_feed` (migracions 031 i 033) és l'única consulta que porta un tram
-- d'activitat, i és amb el que es pinten les targetes: si el grup no hi viatja,
-- una sessió agrupada es veuria partida fins que algú n'obrís les sèries.
--
-- Afegir una columna al resultat vol dir refer la funció: `CREATE OR REPLACE`
-- no pot canviar el tipus de retorn. La resta del cos és el de la 033, sense
-- cap canvi de comportament.

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

  -- Del dia més recent al més antic, i dins d'un dia per ordre d'alta: és
  -- l'ordre en què es pinten les targetes.
  ORDER BY 3 DESC, 8 DESC, 2 DESC;
$$;

REVOKE ALL     ON FUNCTION activity_feed(date, date, real, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION activity_feed(date, date, real, text, text) TO authenticated;
