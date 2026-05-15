-- Migration 008: Allow trainers to read client user_settings (read-only)
-- Trainers need to see client goals to plan appropriate workouts.

CREATE POLICY "trainer_read_client_settings" ON user_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM trainer_clients tc
      WHERE tc.trainer_id = auth.uid()
        AND tc.client_id  = user_settings.user_id
        AND tc.status     = 'active'
    )
  );
