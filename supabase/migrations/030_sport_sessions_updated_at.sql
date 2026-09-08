-- Migration 030: sport_sessions.updated_at, perquè els esports tinguin
-- consulta de canvis com els entrenaments.
--
-- `WorkoutProfileService` demana tot l'historial d'esports en entrar, i des
-- d'aquell moment `refreshLoaded()` el tornava a demanar **sencer** cada cop
-- que l'app recuperava el focus: cada canvi de pestanya, cada tornada des
-- d'una altra app. Els entrenaments fa temps que només demanen el que ha
-- canviat; les sessions d'esport no podien, perquè no hi havia cap columna
-- que digués quan s'havien tocat.
--
-- Executa-la a: Supabase Dashboard → SQL Editor → New query. És idempotent.
-- Mentre no s'executi, el client se n'adona sol i continua com abans.

ALTER TABLE sport_sessions
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Les que ja hi són: la seva data d'alta és tan bona marca com qualsevol, i
-- sense valor no sortirien mai a la consulta de canvis.
UPDATE sport_sessions SET updated_at = created_at WHERE updated_at IS NULL;

-- ── La marca la posa el servidor ─────────────────────────────────────────────
-- A `workouts` la marca la posa el client a posta: és la que decideix qui mana
-- quan dos dispositius toquen la mateixa sessió, i ha de ser la seva.
-- Aquí no hi ha cap guarda d'aquestes —una edició d'esport s'escriu per id—,
-- així que val més que la posi el servidor: cap client se la pot deixar, i el
-- marcador de la consulta de canvis viu tot en un sol rellotge.

CREATE OR REPLACE FUNCTION sport_sessions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sport_sessions_set_updated_at ON sport_sessions;
CREATE TRIGGER sport_sessions_set_updated_at
  BEFORE INSERT OR UPDATE ON sport_sessions
  FOR EACH ROW EXECUTE FUNCTION sport_sessions_touch_updated_at();

-- La consulta de canvis: user_id + updated_at, ordenat per updated_at.
CREATE INDEX IF NOT EXISTS sport_sessions_user_updated_at_idx
  ON sport_sessions (user_id, updated_at DESC NULLS LAST);
