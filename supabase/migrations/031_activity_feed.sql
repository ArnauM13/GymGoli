-- Migració 031: recuperar l'activitat per rangs, en una sola crida
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ══════════════════════════════════════════════════════════════════════════════
-- Per pintar una targeta plegada l'app necessita saber sis coses: quin dia va
-- ser, de quin tipus, com va anar, quants exercicis, quantes sèries i quant
-- volum. De les sis, tres no es podien saber sense baixar-se `entries`
-- sencer — o sigui, cada sèrie, cada pes, cada repetició i cada nota de la
-- sessió — per acabar ensenyant tres números.
--
-- D'aquí sortien les dues coses que ofegaven l'app:
--
--   1. **El pes.** Tres mesos d'historial són uns quants centenars de
--      quilobytes de `jsonb` que viatgen per ensenyar «6 exerc · 21 sèr · 4.2t».
--   2. **El nombre de peticions.** Com que baixar-ho tot era car, el client ho
--      demanava a trossos: un mes per consulta, i encara per duplicat perquè
--      els entrenaments i els esports viuen a taules diferents. Obrir el
--      calendari i moure's sis mesos enrere eren dotze peticions.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- LA SOLUCIÓ
-- ══════════════════════════════════════════════════════════════════════════════
-- Dues peces:
--
--   1. **Els comptadors, calculats un cop i guardats** (§1). `exercise_count`,
--      `set_count` i `warmup_count` són columnes generades: Postgres les manté
--      sol a cada escriptura i no es poden desaparellar de les dades, perquè
--      són les dades.
--
--   2. **Un sol endpoint per rang** (§3): `activity_feed(des de, fins a)` torna
--      els entrenaments **i** les sessions d'esport d'aquell tram, amb el que
--      la targeta plegada necessita i res més. Un mes, una setmana, tres
--      mesos o un dia — el que canvia són els paràmetres, no el nombre de
--      crides.
--
-- El volum (§2) no pot ser una columna generada: depèn del pes corporal de
-- l'usuari i del tipus de càrrega de cada exercici, que viuen fora de la fila.
-- Es calcula dins l'endpoint, que sí que hi arriba.
--
-- Les sèries continuen existint i es demanen igual que sempre — quan l'usuari
-- obre una sessió (`ensureWorkoutEntries`), no abans.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ELS COMPTADORS D'UNA SESSIÓ, MANTINGUTS PER LA BASE DE DADES
-- ══════════════════════════════════════════════════════════════════════════════
-- Mateix patró que `exercise_names` (migració 020): una funció immutable sobre
-- `entries` i una columna generada que la crida. No hi ha cap disparador a
-- mantenir ni cap manera que el valor quedi endarrerit respecte de la sessió.
--
-- `jsonb_typeof(...) = 'array'` a tot arreu no és paranoia: hi ha files
-- antigues amb `entries` a `null` i entrades sense `sets`, i una columna
-- generada que peti deixaria la taula sense poder escriure-s'hi.

CREATE OR REPLACE FUNCTION workout_exercise_count(p_entries jsonb)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (CASE WHEN jsonb_typeof(p_entries) = 'array'
               THEN jsonb_array_length(p_entries) ELSE 0 END)::smallint
$$;

-- `p_warmup` tria quina de les dues xifres es compta. Són consultes separades
-- a posta: la targeta ensenya les sèries de feina i, a part, les d'escalfament
-- («21 sèr +3 🔥»), i sumar-les seria inflar el que l'usuari llegeix com a
-- feina feta.
CREATE OR REPLACE FUNCTION workout_set_count(p_entries jsonb, p_warmup boolean)
RETURNS smallint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((
    SELECT count(*)
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(p_entries) = 'array' THEN p_entries ELSE '[]'::jsonb END
         ) AS e,
         LATERAL jsonb_array_elements(
           CASE WHEN jsonb_typeof(e -> 'sets') = 'array' THEN e -> 'sets' ELSE '[]'::jsonb END
         ) AS s
    WHERE COALESCE((s ->> 'warmup')::boolean, false) = p_warmup
  ), 0)::smallint
$$;

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS exercise_count smallint
  GENERATED ALWAYS AS (workout_exercise_count(entries)) STORED;

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS set_count smallint
  GENERATED ALWAYS AS (workout_set_count(entries, false)) STORED;

ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS warmup_count smallint
  GENERATED ALWAYS AS (workout_set_count(entries, true)) STORED;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. EL VOLUM
-- ══════════════════════════════════════════════════════════════════════════════
-- El volum és l'única xifra de la targeta que no surt només de la sessió: una
-- dominada de 10 reps amb +5 kg no són 50 kg de volum, són el pes corporal de
-- qui la fa més els 5, i un exercici assistit són els quilos que *no* has
-- hagut de moure. Aquest context viu a `exercises` (com es carrega l'exercici
-- i quina fracció del cos mou) i a la configuració de l'usuari (el pes), i per
-- això no pot ser una columna generada: canviar-se el pes al perfil canviaria
-- el volum de tot l'historial, i una columna guardada es quedaria amb el vell.
--
-- Les tres funcions d'aquí són la traducció literal d'`effectiveRepWeight()`,
-- `setVolume()` i `workoutVolume()` de `shared/utils/workout-card.utils.ts`.
-- Han de donar el mateix número: una targeta que digui 4.2t plegada i 4.4t
-- desplegada és pitjor que no dir-ne cap.

-- Un `exerciseId` que no sigui un uuid vàlid no ha de fer petar la consulta:
-- l'exercici simplement no es troba i la sèrie compta com a pes lliure, que és
-- el que fa el client quan no en coneix el tipus.
CREATE OR REPLACE FUNCTION gg_try_uuid(p_text text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_text::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- Els quilos que es mouen de debò en una repetició. Sense pes corporal (o amb
-- un exercici de pes lliure) és el que s'ha registrat, tal qual.
CREATE OR REPLACE FUNCTION gg_effective_weight(
  p_logged real, p_load_type text, p_bodyweight real, p_factor real
)
RETURNS real
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_bodyweight, 0) * COALESCE(p_factor, 1) > 0 AND p_load_type = 'bodyweight'
      THEN greatest(0, COALESCE(p_bodyweight, 0) * COALESCE(p_factor, 1) + p_logged)
    WHEN COALESCE(p_bodyweight, 0) * COALESCE(p_factor, 1) > 0 AND p_load_type = 'assisted'
      THEN greatest(0, COALESCE(p_bodyweight, 0) * COALESCE(p_factor, 1) - p_logged)
    ELSE p_logged
  END::real
$$;

-- El volum d'una sèrie: pes per repeticions, més les baixades de pes que hi
-- pengen. Una sèrie unilateral compta els dos costats per a les mateixes
-- repeticions — són dues cames, no una.
CREATE OR REPLACE FUNCTION gg_set_volume(
  p_set jsonb, p_load_type text, p_bodyweight real, p_factor real
)
RETURNS real
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (
    (CASE
       WHEN jsonb_typeof(p_set -> 'weightLeft')  = 'number'
        AND jsonb_typeof(p_set -> 'weightRight') = 'number'
         THEN gg_effective_weight((p_set ->> 'weightLeft')::real,  p_load_type, p_bodyweight, p_factor)
            + gg_effective_weight((p_set ->> 'weightRight')::real, p_load_type, p_bodyweight, p_factor)
       ELSE gg_effective_weight(COALESCE((p_set ->> 'weight')::real, 0), p_load_type, p_bodyweight, p_factor)
     END) * COALESCE((p_set ->> 'reps')::int, 0)
    + COALESCE((
        SELECT sum(
          gg_effective_weight(COALESCE((d ->> 'weight')::real, 0), p_load_type, p_bodyweight, p_factor)
          * COALESCE((d ->> 'reps')::int, 0)
        )
        FROM jsonb_array_elements(
               CASE WHEN jsonb_typeof(p_set -> 'drops') = 'array' THEN p_set -> 'drops' ELSE '[]'::jsonb END
             ) AS d
      ), 0)
  )::real
$$;

-- El volum d'una sessió sencera. Les sèries d'escalfament no hi entren: són
-- preparació, no feina, i inflar-hi el número faria que un dia de tècnica
-- semblés un dia fort.
CREATE OR REPLACE FUNCTION workout_volume(p_entries jsonb, p_uid uuid, p_bodyweight real)
RETURNS real
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(sum(
           gg_set_volume(s, x.load_type::text, p_bodyweight, x.bodyweight_factor)
         ), 0)::real
  FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(p_entries) = 'array' THEN p_entries ELSE '[]'::jsonb END
       ) AS e
  LEFT JOIN LATERAL (
    SELECT ex.load_type, ex.bodyweight_factor
    FROM exercises ex
    WHERE ex.id = gg_try_uuid(e ->> 'exerciseId')
      AND ex.user_id = p_uid
  ) AS x ON true,
  LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(e -> 'sets') = 'array' THEN e -> 'sets' ELSE '[]'::jsonb END
  ) AS s
  WHERE NOT COALESCE((s ->> 'warmup')::boolean, false)
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. L'ENDPOINT: L'ACTIVITAT D'UN RANG, EN UNA CRIDA
-- ══════════════════════════════════════════════════════════════════════════════
-- Torna les dues activitats barrejades i ordenades per dia, que és com les
-- llegeix l'usuari: el calendari, l'historial i l'activitat recent són tres
-- maneres de mirar la mateixa llista i cap d'elles té motiu per fer dues
-- consultes.
--
-- Els paràmetres són el rang, o sigui que serveix igual per a un dia, una
-- setmana, un mes o els últims tres mesos. `p_bodyweight` el porta el client
-- perquè el pes viu al seu `user_settings` i llegir-lo aquí seria una consulta
-- més per res.
--
-- `SECURITY INVOKER` (el que hi ha per defecte, dit en veu alta perquè es vegi
-- que és a posta): les polítiques RLS de les dues taules s'apliquen com a
-- qualsevol altra consulta i aquesta funció no pot ensenyar les dades de ningú
-- altre. El `user_id = auth.uid()` explícit hi és perquè el planificador faci
-- servir `(user_id, date)` en comptes de filtrar després.
--
-- Fixa't què **no** hi surt: `entries`. Aquest endpoint no porta cap sèrie
-- mai, per molt gran que sigui el rang.

CREATE OR REPLACE FUNCTION activity_feed(
  p_from       date,
  p_to         date,
  p_bodyweight real DEFAULT NULL
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

  -- Del dia més recent al més antic, i dins d'un dia per ordre d'alta: és
  -- l'ordre en què es pinten les targetes, i fer-lo aquí estalvia ordenar
  -- centenars de files a cada canvi de senyal al client.
  ORDER BY 3 DESC, 8 DESC, 2 DESC;
$$;

REVOKE ALL     ON FUNCTION activity_feed(date, date, real) FROM public;
GRANT  EXECUTE ON FUNCTION activity_feed(date, date, real) TO authenticated;
