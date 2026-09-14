-- Migració 038: la cadència de cada activitat, en una fila per activitat
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent.
-- Requereix la 031 (`activity_feed`).
--
-- ══════════════════════════════════════════════════════════════════════════════
-- EL PROBLEMA
-- ══════════════════════════════════════════════════════════════════════════════
-- El suggeriment d'Entrenament vol contestar dues preguntes que són de tota la
-- vida de l'usuari, no dels últims tres mesos:
--
--   1. «Fa temps que no fem Pàdel, hi tornem?» — per dir-ho, cal saber que el
--      pàdel existeix a l'historial encara que l'última sessió sigui de fa mig
--      any.
--   2. «Cada quant ho fas, normalment?» — la cadència d'una activitat que fas
--      un cop cada deu dies no cap dins de la finestra recent si fa mesos que
--      no la toques.
--
-- El dispositiu només té la finestra recent (`RECENT_MONTHS`, tres mesos: vegeu
-- `WorkoutService.recentWindow()`), i això és exactament el que ha de tenir. Amb
-- només aquella finestra, una activitat dorment i una que no has fet mai es
-- llegeixen igual —cap sessió— i són coses molt diferents de dir.
--
-- Baixar més historial per saber-ho seria tornar al que la 031 i la 033 van
-- treure: la vida sencera de l'usuari viatjant per ensenyar una frase.
--
-- ══════════════════════════════════════════════════════════════════════════════
-- LA SOLUCIÓ
-- ══════════════════════════════════════════════════════════════════════════════
-- El mateix patró de sempre: **agregar és feina del servidor**. `activity_cadence()`
-- torna, de cada activitat que l'usuari ha fet alguna vegada, quatre números:
--
--   | columna        | què diu                                               |
--   | -------------- | ----------------------------------------------------- |
--   | `kind`         | 'gym' (tipus d'entrenament) o 'sport'                  |
--   | `activity_key` | el tipus (`push`, `bodypump`…) o l'id de l'esport      |
--   | `sessions`     | quantes n'ha fet, de sempre                            |
--   | `first_date`   | la primera                                             |
--   | `last_date`    | l'última                                               |
--
-- El que torna **no creix amb l'historial**: una fila per tipus d'entrenament i
-- una per esport, o sigui una desena llarga de files per a qui porta vuit anys
-- igual que per a qui en porta dos. Cap sèrie, cap entrada, cap nota.
--
-- Amb `first_date`, `last_date` i `sessions` se'n surt la cadència de tota la
-- vida ((last - first) / (sessions - 1)), que és la que val per a les activitats
-- que no són a la finestra recent. Les que hi són continuen calculant-la amb les
-- dates de debò, que és més fi.
--
-- Només compta el que s'ha fet: un planificat que no vas complir no és una
-- sessió, i comptar-lo diria que fas pàdel cada dimarts quan fa mesos que no
-- n'has fet cap.
--
-- L'índex que la sosté ja hi és des de la 029/034: `workouts (user_id, status,
-- date)` i `sport_sessions (user_id, status, date)`.

CREATE OR REPLACE FUNCTION activity_cadence()
RETURNS TABLE (
  kind         text,
  activity_key text,
  sessions     int,
  first_date   date,
  last_date    date
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- Gimnàs: una activitat per tipus d'entrenament. Un entrenament mixt
  -- (`categories` amb més d'un tipus) compta per a tots dos, igual que a
  -- l'historial i als filtres.
  SELECT
    'gym'::text            AS kind,
    cat::text              AS activity_key,
    count(DISTINCT w.id)::int AS sessions,
    min(w.date)            AS first_date,
    max(w.date)            AS last_date
  FROM workouts w,
  LATERAL unnest(
    -- Les files antigues porten el tipus a `category` i `categories` buit.
    CASE
      WHEN array_length(w.categories, 1) IS NULL AND w.category IS NOT NULL
        THEN ARRAY[w.category]
      ELSE w.categories::text[]
    END
  ) AS cat
  WHERE w.user_id = auth.uid()
    AND w.status  = 'done'
    AND cat IS NOT NULL
    AND cat <> ''
  GROUP BY cat

  UNION ALL

  SELECT
    'sport'::text,
    s.sport_id::text,
    count(*)::int,
    min(s.date),
    max(s.date)
  FROM sport_sessions s
  WHERE s.user_id = auth.uid()
    AND s.status  = 'done'
  GROUP BY s.sport_id;
$$;

REVOKE ALL     ON FUNCTION activity_cadence() FROM public;
GRANT  EXECUTE ON FUNCTION activity_cadence() TO authenticated;
