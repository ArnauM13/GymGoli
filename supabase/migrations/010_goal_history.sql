-- 010: Goal history
-- Stores a snapshot of the user's goal settings each time they change,
-- so weekly compliance can be calculated against the goal that was active
-- at the time, even if settings were later modified.

CREATE TABLE IF NOT EXISTS goal_history (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  effective_from        date NOT NULL,
  goal_mode             text NOT NULL DEFAULT 'combined'
                        CHECK (goal_mode IN ('combined', 'separate')),
  weekly_activity_goal  int,
  weekly_gym_goal       int,
  weekly_sport_goal     int,
  created_at            timestamptz DEFAULT now()
);

-- Only one snapshot per user per date; upsert on change
CREATE UNIQUE INDEX IF NOT EXISTS goal_history_user_date_idx
  ON goal_history (user_id, effective_from);

ALTER TABLE goal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_history_own ON goal_history
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
