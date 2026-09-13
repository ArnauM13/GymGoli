-- Migració 037: el feed sap filtrar per esport
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ══════════════════════════════════════════════════════════════════════════════
-- «Ensenya'm tots els pàdels» no tenia qui la contestés. `activity_feed` sabia
-- filtrar per nom d'exercici (`p_search`) i per tipus d'entrenament
-- (`p_category`) —les dues preguntes del gimnàs—, però no per esport, i el
-- filtre d'esport de l'Historial s'ho havia de manegar al dispositiu: mirar
-- els mesos que ja hi havia carregats i, si el pàdel era de fa tres anys,
-- anar-ne demanant més a veure si en sortia cap. Dotze consultes per no
-- trobar-lo, i després donar l'historial per esgotat.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- LA SOLUCIÓ: UN FILTRE MÉS, EL TERCER
-- ══════════════════════════════════════════════════════════════════════════════
-- `p_sport` es comporta com els altres dos, amb la simetria que ja hi havia:
--
--   p_search / p_category  →  preguntes del gimnàs: els esports en queden fora
--   p_sport                →  pregunta d'esport:    el gimnàs en queda fora
--
-- Cap activitat és un tipus d'entrenament **i** un esport, o sigui que els dos
-- costats de la UNION s'exclouen sols i la consulta no en llegeix cap dels
-- dos de més. La meitat d'esports hi va de dret per
-- `sport_sessions (user_id, sport_id, date DESC)` — l'índex existeix des de la
-- migració 033, que el va posar per als rècords del detall.
--
-- El que en surt és el de sempre: una fila per activitat amb el que necessita
-- la targeta plegada i **cap sèrie**. Demanar tots els pàdels de vuit anys és
-- una consulta i una resposta petita, no trenta-sis consultes.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- LA SIGNATURA CANVIA
-- ══════════════════════════════════════════════════════════════════════════════
-- Afegir un paràmetre amb DEFAULT deixaria dues funcions que accepten la
-- mateixa crida de cinc arguments, i PostgREST no sabria quina triar
-- (`PGRST203`). Per això la de cinc es deixa anar primer: n'hi ha d'haver una,
-- i és aquesta. El client sempre l'hi passa, encara que sigui NULL.

DROP FUNCTION IF EXISTS activity_feed(date, date, real, text, text);
DROP FUNCTION IF EXISTS activity_feed(date, date, real, text, text, uuid);

CREATE FUNCTION activity_feed(
  p_from       date,
  p_to         date,
  p_bodyweight real DEFAULT NULL,
  p_search     text DEFAULT NULL,
  p_category   text DEFAULT NULL,
  p_sport      uuid DEFAULT NULL
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
    -- Un esport no és cap tipus d'entrenament: filtrant per un, la meitat del
    -- gimnàs no hi té res a dir.
    AND p_sport IS NULL

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
    -- I quan la pregunta és «tots els pàdels», són **els seus** i prou. Hi va
    -- de dret per `sport_sessions (user_id, sport_id, date DESC)`, l'índex de
    -- la migració 033.
    AND (p_sport IS NULL OR s.sport_id = p_sport)

  -- Del dia més recent al més antic, i dins d'un dia per ordre d'alta, com
  -- fins ara: en una UNION l'ordre només pot anar per posició, i posar-hi un
  -- COALESCE demanaria embolcallar la consulta per no res. L'ordre de dins
  -- d'un dia el decideix qui el pinta (`groupDayFeed`): els plans al davant i
  -- la resta per `COALESCE(started_at, created_at)`. Aquí només cal que sigui
  -- total i estable, que és el que demana la paginació.
  ORDER BY 3 DESC, 8 DESC, 2 DESC;
$$;

REVOKE ALL     ON FUNCTION activity_feed(date, date, real, text, text, uuid) FROM public;
GRANT  EXECUTE ON FUNCTION activity_feed(date, date, real, text, text, uuid) TO authenticated;
