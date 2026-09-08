-- Migració 033: les últimes consultes que baixaven tot l'historial
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent.
-- Requereix la 031 (`activity_feed`).
--
-- ══════════════════════════════════════════════════════════════════════════════
-- QUÈ QUEDAVA
-- ══════════════════════════════════════════════════════════════════════════════
-- La migració 031 va deixar l'app demanant l'activitat per trams. Quedaven dos
-- llocs que encara es baixaven **tota la vida de l'usuari amb totes les
-- sèries**, i tots dos per bons motius:
--
--   * **Buscar a l'historial.** Escriure «dominades» al Calendari havia de
--     trobar-les fessis dos mesos que entrenes o vuit anys, i el client només
--     pot buscar dins del que té. Així que es baixava tot i es filtrava aquí.
--
--   * **Gràfiques.** La llista d'exercicis ensenya el rècord de cadascun, i un
--     rècord calculat amb mitja història no és un rècord. Es baixava tot per
--     acabar quedant-se, de cada exercici, amb un sol número.
--
-- Les dues preguntes són bones; el que estava malament és qui les contestava.
-- Filtrar i agregar és feina del servidor: sap fer-ho amb índexs i torna el
-- resultat, no les dades per calcular-lo.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- 1. BUSCAR I FILTRAR, AL SERVIDOR
-- ══════════════════════════════════════════════════════════════════════════════
-- `activity_feed` accepta dos filtres opcionals. Sense ells es comporta
-- exactament com abans, o sigui que la 031 no es trenca.
--
--   * `p_search` — un tros de nom d'exercici. Va contra `exercise_names`, la
--     columna generada de la migració 020, que té índex trigram: buscar
--     «dominades» és una consulta indexada, no llegir-se cada entrenament.
--   * `p_category` — un tipus d'entrenament, contra `categories`.
--
-- Amb un filtre posat, el rang es pot demanar tan ample com calgui (tota la
-- vida de l'usuari, si cal): el que torna són **només les coincidències**, i
-- continuen sense portar cap sèrie. Els esports no tenen ni noms d'exercici ni
-- tipus, així que amb qualsevol dels dos filtres queden fora — que és el que
-- ja feia el client.
--
-- `\` escapa dins d'un LIKE, i els comodins del text que escriu l'usuari
-- s'escapen aquí perquè buscar «100%» no vulgui dir «tot el que comenci per
-- 100».

CREATE OR REPLACE FUNCTION activity_feed(
  p_from       date,
  p_to         date,
  p_bodyweight real DEFAULT NULL,
  p_search     text DEFAULT NULL,
  p_category   text DEFAULT NULL
)
RETURNS TABLE (
  kind            text,
  item_id         uuid,
  item_date       date,
  item_status     text,
  planned_source  text,
  feeling         smallint,
  notes           text,
  created_at      timestamptz,
  updated_at      timestamptz,
  category        text,
  categories      text[],
  exercise_names  text,
  exercise_count  smallint,
  set_count       smallint,
  warmup_count    smallint,
  volume          real,
  sport_id        uuid,
  subtype_id      text,
  duration        int,
  metrics         jsonb
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
    NULL::jsonb
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
    s.metrics
  FROM sport_sessions s
  WHERE s.user_id = auth.uid()
    AND s.date >= p_from
    AND s.date <= p_to
    -- Un esport no té noms d'exercici ni tipus d'entrenament: amb qualsevol
    -- dels dos filtres posat, la pregunta no va per ell.
    AND COALESCE(p_search, '')   = ''
    AND COALESCE(p_category, '') = ''

  ORDER BY 3 DESC, 8 DESC, 2 DESC;
$$;

REVOKE ALL     ON FUNCTION activity_feed(date, date, real, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION activity_feed(date, date, real, text, text) TO authenticated;

-- La signatura de tres arguments de la 031 ja no la crida ningú, i deixar-la
-- viva vol dir que una crida amb un paràmetre mal escrit resoldria contra ella
-- en comptes de fallar.
DROP FUNCTION IF EXISTS activity_feed(date, date, real);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. EL RÈCORD DE CADA EXERCICI
-- ══════════════════════════════════════════════════════════════════════════════
-- El que la llista de Gràfiques ensenya de cada exercici: quantes sessions hi
-- porta, quin és el pes més alt que hi has mogut i quan va ser l'última.
--
-- Són tres números per exercici. Abans, per treure'ls, viatjava l'historial
-- sencer amb totes les sèries de tots els exercicis.
--
-- Les d'escalfament no compten, com a tot arreu: un rècord és una sèrie de
-- feina. `gg_effective_weight` (migració 031) és el que fa que unes dominades
-- amb +5 kg comptin el pes corporal, la mateixa matemàtica que el client.

CREATE OR REPLACE FUNCTION exercise_records(p_bodyweight real DEFAULT NULL)
RETURNS TABLE (
  exercise_id uuid,
  sessions    int,
  max_weight  real,
  last_date   date
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    gg_try_uuid(e ->> 'exerciseId')       AS exercise_id,
    count(DISTINCT w.id)::int             AS sessions,
    COALESCE(max(
      greatest(
        gg_effective_weight(COALESCE((s ->> 'weight')::real, 0),      x.load_type::text, p_bodyweight, x.bodyweight_factor),
        gg_effective_weight(COALESCE((s ->> 'weightLeft')::real, 0),  x.load_type::text, p_bodyweight, x.bodyweight_factor),
        gg_effective_weight(COALESCE((s ->> 'weightRight')::real, 0), x.load_type::text, p_bodyweight, x.bodyweight_factor),
        COALESCE((
          SELECT max(gg_effective_weight(COALESCE((d ->> 'weight')::real, 0), x.load_type::text, p_bodyweight, x.bodyweight_factor))
          FROM jsonb_array_elements(
                 CASE WHEN jsonb_typeof(s -> 'drops') = 'array' THEN s -> 'drops' ELSE '[]'::jsonb END
               ) AS d
        ), 0)
      )
    ), 0)::real                            AS max_weight,
    max(w.date)                            AS last_date
  FROM workouts w,
  LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(w.entries) = 'array' THEN w.entries ELSE '[]'::jsonb END
  ) AS e
  LEFT JOIN LATERAL (
    SELECT ex.load_type, ex.bodyweight_factor
    FROM exercises ex
    WHERE ex.id = gg_try_uuid(e ->> 'exerciseId')
      AND ex.user_id = auth.uid()
  ) AS x ON true,
  LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e -> 'sets') = 'array' THEN e -> 'sets' ELSE '[]'::jsonb END
  ) AS s
  WHERE w.user_id = auth.uid()
    AND w.status <> 'planned'
    AND NOT COALESCE((s ->> 'warmup')::boolean, false)
    AND gg_try_uuid(e ->> 'exerciseId') IS NOT NULL
  GROUP BY 1;
$$;

REVOKE ALL     ON FUNCTION exercise_records(real) FROM public;
GRANT  EXECUTE ON FUNCTION exercise_records(real) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. ELS TOTALS
-- ══════════════════════════════════════════════════════════════════════════════
-- «Portes 312 entrenaments» és una xifra de tota la vida de l'usuari, i era
-- l'últim motiu pel qual Gràfiques es baixava tota la vida de l'usuari. Aquí
-- és un `count`.

CREATE OR REPLACE FUNCTION workout_totals()
RETURNS TABLE (
  total_done int,
  first_date date,
  last_date  date
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT count(*)::int, min(w.date), max(w.date)
  FROM workouts w
  WHERE w.user_id = auth.uid()
    AND w.status <> 'planned';
$$;

REVOKE ALL     ON FUNCTION workout_totals() FROM public;
GRANT  EXECUTE ON FUNCTION workout_totals() TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. ÍNDEX PER A «LES SESSIONS D'AQUEST ESPORT»
-- ══════════════════════════════════════════════════════════════════════════════
-- El detall d'una sessió d'esport ensenya els rècords i les mitjanes d'aquell
-- esport, i per treure'ls es baixaven **totes** les sessions de l'usuari. Ara
-- es demanen les d'aquell esport i prou; aquest índex hi va de dret.

CREATE INDEX IF NOT EXISTS sport_sessions_user_sport_date_idx
  ON sport_sessions (user_id, sport_id, date DESC);
