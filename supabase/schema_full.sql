-- GymGoli – Schema complet i idempotent
-- Consolida totes les migracions (001–018).
-- Segur de re-executar: usa IF NOT EXISTS, DROP … IF EXISTS i OR REPLACE.
-- Executa a: Supabase Dashboard → SQL Editor → New query

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. TAULES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exercises (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name        text        NOT NULL,
  category    text        NOT NULL CHECK (category IN ('push', 'pull', 'legs')),
  subcategory text,
  notes       text,
  muscles     text[]      DEFAULT NULL,
  description text        DEFAULT NULL,
  sets_min    smallint    DEFAULT NULL,
  sets_max    smallint    DEFAULT NULL,
  reps_min    smallint    DEFAULT NULL,
  reps_max    smallint    DEFAULT NULL,
  created_at  timestamptz DEFAULT now()
);

-- trainer_proposals ha d'existir abans que workouts pugui referenciar-la
CREATE TABLE IF NOT EXISTS user_profiles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'trainer')),
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trainer_invites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  code       varchar(8)  NOT NULL UNIQUE,
  token      uuid        NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at    timestamptz,
  client_id  uuid        REFERENCES auth.users ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trainer_clients (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  client_id  uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, client_id)
);

CREATE TABLE IF NOT EXISTS trainer_proposals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id    uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  client_id     uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  proposal_type text        NOT NULL CHECK (proposal_type IN ('specific', 'weekly')),
  date          date,
  weekday       smallint    CHECK (weekday BETWEEN 0 AND 6),
  entries       jsonb       NOT NULL DEFAULT '[]',
  notes         text,
  status        text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_type_check CHECK (
    (proposal_type = 'specific' AND date    IS NOT NULL AND weekday IS NULL) OR
    (proposal_type = 'weekly'   AND weekday IS NOT NULL AND date    IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS workouts (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date               date        NOT NULL,
  entries            jsonb       NOT NULL DEFAULT '[]',
  categories         text[]      NOT NULL DEFAULT '{}',
  category           text,
  notes              text,
  status             text        NOT NULL DEFAULT 'done' CHECK (status IN ('planned', 'done')),
  planned_source     text        CHECK (planned_source IN ('self', 'trainer')),
  feeling            smallint    CHECK (feeling BETWEEN 1 AND 5),
  source_proposal_id uuid        REFERENCES trainer_proposals(id) ON DELETE SET NULL,
  created_at         timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sports (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name        text        NOT NULL,
  icon        text        NOT NULL DEFAULT 'sports',
  color       text        NOT NULL DEFAULT '#006874',
  subtypes    jsonb       NOT NULL DEFAULT '[]',
  metric_defs jsonb       NOT NULL DEFAULT '[]',
  created_at  timestamptz DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS sport_sessions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  date             date        NOT NULL,
  sport_id         uuid        NOT NULL REFERENCES sports ON DELETE CASCADE,
  duration_minutes integer,
  duration         integer,
  notes            text,
  subtype_id       text,
  feeling          smallint    CHECK (feeling BETWEEN 1 AND 5),
  metrics          jsonb       DEFAULT '{}',
  status           text        NOT NULL DEFAULT 'done' CHECK (status IN ('planned', 'done')),
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_settings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL UNIQUE REFERENCES auth.users ON DELETE CASCADE,
  settings   jsonb       NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS goal_history (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  effective_from       date        NOT NULL,
  goal_mode            text        NOT NULL DEFAULT 'combined' CHECK (goal_mode IN ('combined', 'separate')),
  weekly_activity_goal int,
  weekly_gym_goal      int,
  weekly_sport_goal    int,
  created_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name       text        NOT NULL,
  category   text        NOT NULL CHECK (category IN ('push', 'pull', 'legs', 'mixed')),
  entries    jsonb       NOT NULL DEFAULT '[]',
  use_count  integer     NOT NULL DEFAULT 0,
  last_used  date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- No user reference at all: only the workout's name + exercises are needed
-- to preview and import it, so sharing carries no dependency on the
-- sender's account.
CREATE TABLE IF NOT EXISTS shared_workouts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  category   text        NOT NULL CHECK (category IN ('push', 'pull', 'legs', 'mixed')),
  entries    jsonb       NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. COLUMNES QUE PODRIEN FALTAR (taules creades abans de les migracions)
-- ══════════════════════════════════════════════════════════════════════════════

-- exercises
ALTER TABLE exercises
  ADD COLUMN IF NOT EXISTS muscles     text[]   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description text     DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sets_min    smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sets_max    smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reps_min    smallint DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS reps_max    smallint DEFAULT NULL;

-- sports
ALTER TABLE sports
  ADD COLUMN IF NOT EXISTS subtypes    jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS metric_defs jsonb NOT NULL DEFAULT '[]';

-- sport_sessions
ALTER TABLE sport_sessions
  ADD COLUMN IF NOT EXISTS subtype_id text,
  ADD COLUMN IF NOT EXISTS duration   integer,
  ADD COLUMN IF NOT EXISTS feeling    smallint CHECK (feeling BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS metrics    jsonb    DEFAULT '{}';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sport_sessions' AND column_name = 'status'
  ) THEN
    ALTER TABLE sport_sessions
      ADD COLUMN status text NOT NULL DEFAULT 'done' CHECK (status IN ('planned', 'done'));
  END IF;
END $$;

-- workouts
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS feeling            smallint CHECK (feeling BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS source_proposal_id uuid     REFERENCES trainer_proposals(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'status'
  ) THEN
    ALTER TABLE workouts
      ADD COLUMN status text NOT NULL DEFAULT 'done' CHECK (status IN ('planned', 'done'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'workouts' AND column_name = 'planned_source'
  ) THEN
    ALTER TABLE workouts
      ADD COLUMN planned_source text CHECK (planned_source IN ('self', 'trainer'));
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. CONSTRAINTS
-- ══════════════════════════════════════════════════════════════════════════════

-- Permet múltiples entrenaments per dia (elimina la restricció antiga)
ALTER TABLE workouts DROP CONSTRAINT IF EXISTS workouts_user_id_date_key;

-- FK amb CASCADE DELETE (per si les taules es van crear sense CASCADE)
ALTER TABLE exercises
  DROP CONSTRAINT IF EXISTS exercises_user_id_fkey,
  ADD  CONSTRAINT exercises_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE CASCADE;

ALTER TABLE workouts
  DROP CONSTRAINT IF EXISTS workouts_user_id_fkey,
  ADD  CONSTRAINT workouts_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE CASCADE;

ALTER TABLE sports
  DROP CONSTRAINT IF EXISTS sports_user_id_fkey,
  ADD  CONSTRAINT sports_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE CASCADE;

ALTER TABLE sport_sessions
  DROP CONSTRAINT IF EXISTS sport_sessions_user_id_fkey,
  ADD  CONSTRAINT sport_sessions_user_id_fkey
       FOREIGN KEY (user_id) REFERENCES auth.users ON DELETE CASCADE;

-- ══════════════════════════════════════════════════════════════════════════════
-- 4. ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE exercises        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE sport_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE goal_history     ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_workouts  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_invites  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_clients  ENABLE ROW LEVEL SECURITY;
ALTER TABLE trainer_proposals ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- 5. POLÍTIQUES (DROP IF EXISTS + CREATE)
-- ══════════════════════════════════════════════════════════════════════════════

-- exercises
DROP POLICY IF EXISTS "users own exercises"         ON exercises;
CREATE POLICY "users own exercises" ON exercises FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- workouts (usuari propi)
DROP POLICY IF EXISTS "users own workouts"          ON workouts;
CREATE POLICY "users own workouts" ON workouts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- workouts (entrenador llegeix entrenaments dels seus clients)
DROP POLICY IF EXISTS "workouts_trainer_read_clients" ON workouts;
CREATE POLICY "workouts_trainer_read_clients" ON workouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainer_clients tc
      WHERE tc.trainer_id = auth.uid()
        AND tc.client_id  = workouts.user_id
        AND tc.status     = 'active'
    )
  );

-- sports
DROP POLICY IF EXISTS "users own sports"            ON sports;
CREATE POLICY "users own sports" ON sports FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- sport_sessions
DROP POLICY IF EXISTS "users own sport_sessions"    ON sport_sessions;
CREATE POLICY "users own sport_sessions" ON sport_sessions FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- user_settings (usuari propi)
DROP POLICY IF EXISTS "users own settings"          ON user_settings;
CREATE POLICY "users own settings" ON user_settings FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- user_settings (entrenador llegeix configuració dels seus clients)
DROP POLICY IF EXISTS "trainer_read_client_settings" ON user_settings;
CREATE POLICY "trainer_read_client_settings" ON user_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainer_clients tc
      WHERE tc.trainer_id = auth.uid()
        AND tc.client_id  = user_settings.user_id
        AND tc.status     = 'active'
    )
  );

-- goal_history
DROP POLICY IF EXISTS goal_history_own              ON goal_history;
CREATE POLICY goal_history_own ON goal_history FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- templates
DROP POLICY IF EXISTS "users own templates"         ON templates;
CREATE POLICY "users own templates" ON templates FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- shared_workouts (no owner — any authenticated user can create/read by id)
DROP POLICY IF EXISTS "owners create shared workouts" ON shared_workouts;
DROP POLICY IF EXISTS "authenticated users create shared workouts" ON shared_workouts;
CREATE POLICY "authenticated users create shared workouts" ON shared_workouts FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated users read shared workouts by id" ON shared_workouts;
CREATE POLICY "authenticated users read shared workouts by id" ON shared_workouts FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- user_profiles (propi)
DROP POLICY IF EXISTS "profiles_own"                ON user_profiles;
CREATE POLICY "profiles_own" ON user_profiles
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- user_profiles (entrenador ↔ client llegeix el nom de l'altre)
DROP POLICY IF EXISTS "profiles_related"            ON user_profiles;
CREATE POLICY "profiles_related" ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainer_clients tc
      WHERE tc.status = 'active'
        AND (
          (tc.trainer_id = auth.uid() AND tc.client_id  = user_profiles.user_id)
          OR
          (tc.client_id  = auth.uid() AND tc.trainer_id = user_profiles.user_id)
        )
    )
  );

-- trainer_invites
DROP POLICY IF EXISTS "invites_trainer_all"         ON trainer_invites;
CREATE POLICY "invites_trainer_all" ON trainer_invites FOR ALL
  USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);

-- trainer_clients
DROP POLICY IF EXISTS "clients_trainer_all"         ON trainer_clients;
DROP POLICY IF EXISTS "clients_client_select"       ON trainer_clients;
DROP POLICY IF EXISTS "clients_client_update"       ON trainer_clients;
CREATE POLICY "clients_trainer_all"   ON trainer_clients FOR ALL
  USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);
CREATE POLICY "clients_client_select" ON trainer_clients FOR SELECT
  USING (auth.uid() = client_id);
CREATE POLICY "clients_client_update" ON trainer_clients FOR UPDATE
  USING (auth.uid() = client_id);

-- trainer_proposals
DROP POLICY IF EXISTS "proposals_trainer_all"       ON trainer_proposals;
DROP POLICY IF EXISTS "proposals_client_select"     ON trainer_proposals;
DROP POLICY IF EXISTS "proposals_client_update"     ON trainer_proposals;
CREATE POLICY "proposals_trainer_all"   ON trainer_proposals FOR ALL
  USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);
CREATE POLICY "proposals_client_select" ON trainer_proposals FOR SELECT
  USING (auth.uid() = client_id);
CREATE POLICY "proposals_client_update" ON trainer_proposals FOR UPDATE
  USING (auth.uid() = client_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 6. ÍNDEXOS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS exercises_user_id_idx
  ON exercises (user_id);

CREATE INDEX IF NOT EXISTS workouts_user_id_date_idx
  ON workouts (user_id, date DESC);

CREATE INDEX IF NOT EXISTS workouts_user_status_date_idx
  ON workouts (user_id, status, date);

CREATE INDEX IF NOT EXISTS sports_user_id_idx
  ON sports (user_id);

CREATE INDEX IF NOT EXISTS sport_sessions_user_id_date_idx
  ON sport_sessions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS sport_sessions_user_status_date_idx
  ON sport_sessions (user_id, status, date);

CREATE INDEX IF NOT EXISTS user_settings_user_id_idx
  ON user_settings (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS goal_history_user_date_idx
  ON goal_history (user_id, effective_from);

CREATE INDEX IF NOT EXISTS templates_user_id_idx
  ON templates (user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- 7. FUNCIONS (SECURITY DEFINER per a invitacions d'entrenador)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION generate_trainer_invite()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_code  varchar(8);
  v_token uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM user_profiles WHERE user_id = auth.uid() AND role = 'trainer'
  ) THEN
    RETURN jsonb_build_object('error', 'Cal tenir el mode entrenador activat');
  END IF;

  LOOP
    v_code := upper(substring(
      translate(encode(gen_random_bytes(6), 'base64'), '+/=', 'XYZ'),
      1, 8
    ));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM trainer_invites
      WHERE code = v_code AND used_at IS NULL AND expires_at > now()
    );
  END LOOP;

  v_token := gen_random_uuid();

  INSERT INTO trainer_invites (trainer_id, code, token, expires_at)
  VALUES (auth.uid(), v_code, v_token, now() + interval '7 days');

  RETURN jsonb_build_object('code', v_code, 'token', v_token::text);
END;
$$;


CREATE OR REPLACE FUNCTION accept_trainer_invite(p_code text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_invite trainer_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite
  FROM trainer_invites
  WHERE code      = upper(p_code)
    AND used_at   IS NULL
    AND expires_at > now()
    AND client_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Codi invàlid o caducat');
  END IF;

  IF v_invite.trainer_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'No pots ser el teu propi entrenador');
  END IF;

  IF EXISTS (
    SELECT 1 FROM trainer_clients WHERE client_id = auth.uid() AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'Ja tens un entrenador actiu');
  END IF;

  UPDATE trainer_invites
     SET used_at = now(), client_id = auth.uid()
   WHERE id = v_invite.id;

  INSERT INTO trainer_clients (trainer_id, client_id, status)
  VALUES (v_invite.trainer_id, auth.uid(), 'active')
  ON CONFLICT (trainer_id, client_id) DO UPDATE SET status = 'active';

  INSERT INTO user_profiles (user_id, role)
  VALUES (auth.uid(), 'user')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'trainer_id', v_invite.trainer_id::text);
END;
$$;


CREATE OR REPLACE FUNCTION accept_trainer_invite_by_token(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_invite trainer_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_invite
  FROM trainer_invites
  WHERE token     = p_token
    AND used_at   IS NULL
    AND expires_at > now()
    AND client_id IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Enllaç invàlid o caducat');
  END IF;

  IF v_invite.trainer_id = auth.uid() THEN
    RETURN jsonb_build_object('error', 'No pots ser el teu propi entrenador');
  END IF;

  IF EXISTS (
    SELECT 1 FROM trainer_clients WHERE client_id = auth.uid() AND status = 'active'
  ) THEN
    RETURN jsonb_build_object('error', 'Ja tens un entrenador actiu');
  END IF;

  UPDATE trainer_invites
     SET used_at = now(), client_id = auth.uid()
   WHERE id = v_invite.id;

  INSERT INTO trainer_clients (trainer_id, client_id, status)
  VALUES (v_invite.trainer_id, auth.uid(), 'active')
  ON CONFLICT (trainer_id, client_id) DO UPDATE SET status = 'active';

  INSERT INTO user_profiles (user_id, role)
  VALUES (auth.uid(), 'user')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('success', true, 'trainer_id', v_invite.trainer_id::text);
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════════
-- 8. REALTIME
-- ══════════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE workouts;
