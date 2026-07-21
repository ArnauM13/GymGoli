import { WeeklyPlan } from './weekly-plan.model';

export type GoalMode = 'combined' | 'separate';
export type WeightUnit = 'kg' | 'lb';
export type ThemeMode = 'light' | 'dark' | 'system';
export type FitnessGoal = 'strength' | 'fitness' | 'weight' | 'sport';
/** How exercise/set difficulty is entered and shown — the same underlying
 *  1-5 feeling value, either as an emoji picker or a 1-10 numeric scale. */
export type DifficultyScale = 'emoji' | 'numeric';

export const FITNESS_GOAL_LABELS: Record<FitnessGoal, string> = {
  strength: 'Guanyar força',
  fitness:  'Millorar forma',
  weight:   'Perdre pes',
  sport:    'Practicar esport',
};

export const FITNESS_GOAL_EMOJIS: Record<FitnessGoal, string> = {
  strength: '💪',
  fitness:  '🏃',
  weight:   '⚖️',
  sport:    '⚽',
};

export const FITNESS_GOAL_WEEKLY_DEFAULTS: Record<FitnessGoal, number> = {
  strength: 3,
  fitness:  3,
  weight:   4,
  sport:    3,
};

export interface UserSettings {
  metricsEnabled: boolean;
  weeklyActivityGoal: number | null;
  weeklyGymGoal: number | null;
  weeklySportGoal: number | null;
  goalMode: GoalMode;
  themeMode: ThemeMode;
  weightUnit: WeightUnit;
  restTimerSeconds: number;
  onboardingDone: boolean;
  fitnessGoal: FitnessGoal | null;
  weeklyPlan: WeeklyPlan | null;
  /** Last date (inclusive) the recurring routine was materialized to as
   *  planned workouts/sessions — lets the app re-apply the routine before
   *  the horizon runs out instead of silently stopping after ~3 months. */
  routineMaterializedUntil?: string;
  /** User asked to stop seeing the "set up a routine" reminder on Train. */
  routineHintDismissed: boolean;
  /** Built-in template suggestions (Plantilles page) the user dismissed. */
  dismissedBuiltInTemplateIds: string[];
  /** Off by default — advanced workout-editor features that clutter the
   *  set-adding flow for most users. */
  supersetsEnabled: boolean;
  dropsetsEnabled:  boolean;
  /** Off by default — logging Reps In Reserve per set. */
  rirEnabled: boolean;
  difficultyScale: DifficultyScale;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  metricsEnabled: false,
  weeklyActivityGoal: null,
  weeklyGymGoal: null,
  weeklySportGoal: null,
  goalMode: 'combined',
  themeMode: 'system',
  weightUnit: 'kg',
  restTimerSeconds: 90,
  onboardingDone: false,
  fitnessGoal: null,
  weeklyPlan: null,
  routineHintDismissed: false,
  dismissedBuiltInTemplateIds: [],
  supersetsEnabled: false,
  dropsetsEnabled: false,
  rirEnabled: false,
  difficultyScale: 'emoji',
};
