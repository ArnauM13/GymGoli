-- Migration 007: Trainer mode
-- Tables: user_profiles, trainer_invites, trainer_clients, trainer_proposals
-- Modified: workouts (source_proposal_id + trainer read policy)

-- ── user_profiles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_profiles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'trainer')),
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_own" ON user_profiles
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Trainers and clients can read each other's profile (for display names)
CREATE POLICY "profiles_related" ON user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainer_clients tc
      WHERE tc.status = 'active'
        AND (
          (tc.trainer_id = auth.uid() AND tc.client_id = user_profiles.user_id)
          OR
          (tc.client_id  = auth.uid() AND tc.trainer_id = user_profiles.user_id)
        )
    )
  );

-- ── trainer_invites ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trainer_invites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code       varchar(8)  NOT NULL,
  token      uuid        NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at    timestamptz,
  client_id  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)
);

ALTER TABLE trainer_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invites_trainer_all" ON trainer_invites
  FOR ALL
  USING (auth.uid() = trainer_id)
  WITH CHECK (auth.uid() = trainer_id);

-- ── trainer_clients ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trainer_clients (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id  uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status     text        NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trainer_id, client_id)
);

ALTER TABLE trainer_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_trainer_all" ON trainer_clients
  FOR ALL
  USING (auth.uid() = trainer_id)
  WITH CHECK (auth.uid() = trainer_id);

CREATE POLICY "clients_client_select" ON trainer_clients
  FOR SELECT USING (auth.uid() = client_id);

CREATE POLICY "clients_client_update" ON trainer_clients
  FOR UPDATE USING (auth.uid() = client_id);

-- ── trainer_proposals ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trainer_proposals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_type text        NOT NULL CHECK (proposal_type IN ('specific', 'weekly')),
  date          date,
  weekday       smallint    CHECK (weekday BETWEEN 0 AND 6),
  entries       jsonb       NOT NULL DEFAULT '[]',
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_type_check CHECK (
    (proposal_type = 'specific' AND date IS NOT NULL AND weekday IS NULL)
    OR
    (proposal_type = 'weekly'   AND weekday IS NOT NULL AND date IS NULL)
  )
);

ALTER TABLE trainer_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "proposals_trainer_all" ON trainer_proposals
  FOR ALL
  USING (auth.uid() = trainer_id)
  WITH CHECK (auth.uid() = trainer_id);

CREATE POLICY "proposals_client_select" ON trainer_proposals
  FOR SELECT USING (auth.uid() = client_id);

-- ── workouts: add source_proposal_id ─────────────────────────────────────────
ALTER TABLE workouts
  ADD COLUMN IF NOT EXISTS source_proposal_id uuid
    REFERENCES trainer_proposals(id) ON DELETE SET NULL;

-- ── workouts: trainer read policy ────────────────────────────────────────────
-- Drop any leftover attempt before creating; idempotent on re-run.
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

-- ── Functions ─────────────────────────────────────────────────────────────────

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
  WHERE code = upper(p_code)
    AND used_at IS NULL
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
  WHERE token = p_token
    AND used_at IS NULL
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

  RETURN jsonb_build_object('success', true, 'trainer_id', v_invite.trainer_id::text);
END;
$$;
