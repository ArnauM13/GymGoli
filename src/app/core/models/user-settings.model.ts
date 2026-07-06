import { WeeklyPlan } from './weekly-plan.model';

export type GoalMode = 'combined' | 'separate';
export type WeightUnit = 'kg' | 'lb';
export type ThemeMode = 'light' | 'dark' | 'system';
export type FitnessGoal = 'strength' | 'fitness' | 'weight' | 'sport';

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
  /** User asked to stop seeing the "set up a routine" reminder on Train. */
  routineHintDismissed: boolean;
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
};
