-- Migration 029: escalabilitat de dades i ús des de diversos dispositius
--
-- Quatre coses que fallaven a mesura que un compte acumula història o
-- s'obre des de més d'un lloc alhora. Executa-la a: Supabase Dashboard →
-- SQL Editor → New query. És idempotent.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ÍNDEX PER A LA CONSULTA DE CANVIS
-- ══════════════════════════════════════════════════════════════════════════════
-- `refreshLoaded()` demana «què ha canviat des de l'última vegada»
--   ... where user_id = ? and updated_at >= ? order by updated_at
-- i és la consulta més freqüent de l'app: es dispara cada cop que tornes a la
-- pestanya. Amb l'índex per (user_id, date) que hi havia, el servidor havia de
-- llegir totes les files de l'usuari i comparar-les una a una; ara hi va
-- directe. `updated_at` pot ser nul a files molt velles, i per això
-- NULLS LAST: així l'índex serveix l'ordenació sencera.

CREATE INDEX IF NOT EXISTS workouts_user_updated_at_idx
  ON workouts (user_id, updated_at DESC NULLS LAST);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. ÍNDEX PER A «TOTS ELS ENTRENAMENTS D'AQUEST EXERCICI»
-- ══════════════════════════════════════════════════════════════════════════════
-- El progrés i les estadístiques d'un exercici demanaven les seves sessions
-- amb `entries::text ilike '%"exerciseId":"…"%'`: convertir tot el blob jsonb
-- a text obliga a llegir i convertir *cada* entrenament de l'usuari a cada
-- consulta, i cap índex hi pot ajudar (és la mateixa trampa que la migració
-- 020 va treure de la cerca de l'historial).
--
-- El client ara ho demana amb contenció de jsonb:
--   entries @> '[{"exerciseId": "…"}]'
-- que aquest índex resol de dret. `jsonb_path_ops` és la meitat de gran que
-- l'operador per defecte i cobreix exactament aquesta pregunta.

CREATE INDEX IF NOT EXISTS workouts_entries_gin_idx
  ON workouts USING gin (entries jsonb_path_ops);

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. PARÀMETRES: FUSIONAR PER CAMPS, NO ESCRIURE EL BLOC SENCER
-- ══════════════════════════════════════════════════════════════════════════════
-- `user_settings.settings` és un sol jsonb i el client hi escrivia tot el que
-- tenia a memòria. Com que només el llegia en entrar, dos dispositius oberts
-- alhora es desfeien la feina: canviaves l'objectiu setmanal al mòbil i, en
-- tocar el tema fosc a l'ordinador (que encara tenia la versió del matí),
-- l'objectiu tornava enrere. No hi havia cap conflicte a detectar — l'última
-- escriptura simplement se'n duia la resta.
--
-- Aquesta funció rep només el que s'ha canviat i el fusiona amb el que hi ha,
-- dins la mateixa sentència: els camps que no surten al pedaç no es toquen.
-- `SECURITY DEFINER` amb `auth.uid()` fixat aquí dins — el client no tria a
-- quina fila escriu, i per tant no cal confiar-hi.

CREATE OR REPLACE FUNCTION merge_user_settings(p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no autenticat';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'el pedaç ha de ser un objecte jsonb';
  END IF;

  INSERT INTO user_settings (user_id, settings, updated_at)
  VALUES (v_uid, p_patch, now())
  ON CONFLICT (user_id) DO UPDATE
    SET settings   = user_settings.settings || excluded.settings,
        updated_at = now()
  RETURNING settings INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL     ON FUNCTION merge_user_settings(jsonb) FROM public;
GRANT  EXECUTE ON FUNCTION merge_user_settings(jsonb) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. CATÀLEG INICIAL D'EXERCICIS: UNA SOLA VEGADA, ENCARA QUE ENTRIS DE DOS LLOCS
-- ══════════════════════════════════════════════════════════════════════════════
-- El client mirava quants exercicis tenia l'usuari i, si cap, inseria el
-- catàleg per defecte. Són dues peticions amb segons pel mig: estrenar l'app
-- al mòbil i a l'ordinador alhora feia que tots dos veiessin zero i tots dos
-- sembressin, i l'usuari es trobava el catàleg duplicat. La taula no té cap
-- restricció d'unicitat que ho aturés, i no se n'hi pot afegir una ara sense
-- decidir quin duplicat s'esborra — i els entrenaments ja fets apunten als
-- seus ids.
--
-- Aquí la comprovació i la inserció són la mateixa transacció, i el pany per
-- usuari fa esperar el segon dispositiu: quan entra, ja hi troba el catàleg i
-- no fa res. `p_rows` és el mateix catàleg que porta el client (així no cal
-- mantenir-lo en dos llocs), però `user_id` el posa la funció: el que digui
-- el client s'ignora.

CREATE OR REPLACE FUNCTION seed_default_exercises(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_inserted integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no autenticat';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows ha de ser un array jsonb';
  END IF;

  -- Dos dispositius que arrenquen alhora fan cua aquí. El pany es deixa anar
  -- sol quan acaba la transacció.
  PERFORM pg_advisory_xact_lock(hashtext('gymgoli_seed_exercises:' || v_uid::text));

  IF EXISTS (SELECT 1 FROM exercises WHERE user_id = v_uid) THEN
    RETURN 0;
  END IF;

  INSERT INTO exercises (
    user_id, name, category, subcategory, notes, muscles, description,
    sets_min, sets_max, reps_min, reps_max,
    unilateral, load_type, bodyweight_factor, weight_step
  )
  SELECT
    v_uid,
    r ->> 'name',
    r ->> 'category',
    NULLIF(r ->> 'subcategory', ''),
    NULLIF(r ->> 'notes', ''),
    CASE WHEN jsonb_typeof(r -> 'muscles') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(r -> 'muscles'))
         END,
    NULLIF(r ->> 'description', ''),
    (r ->> 'sets_min')::smallint,
    (r ->> 'sets_max')::smallint,
    (r ->> 'reps_min')::smallint,
    (r ->> 'reps_max')::smallint,
    COALESCE((r ->> 'unilateral')::boolean, false),
    COALESCE(NULLIF(r ->> 'load_type', ''), 'weighted'),
    (r ->> 'bodyweight_factor')::real,
    (r ->> 'weight_step')::real
  FROM jsonb_array_elements(p_rows) AS r
  WHERE COALESCE(r ->> 'name', '') <> ''
    AND COALESCE(r ->> 'category', '') <> '';

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL     ON FUNCTION seed_default_exercises(jsonb) FROM public;
GRANT  EXECUTE ON FUNCTION seed_default_exercises(jsonb) TO authenticated;
