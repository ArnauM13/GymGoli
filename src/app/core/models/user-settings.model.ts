export type GoalMode = 'combined' | 'separate';
export type WeightUnit = 'kg' | 'lb';
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
  darkMode: boolean;
  weightUnit: WeightUnit;
  restTimerSeconds: number;
  onboardingDone: boolean;
  fitnessGoal: FitnessGoal | null;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  metricsEnabled: false,
  weeklyActivityGoal: null,
  weeklyGymGoal: null,
  weeklySportGoal: null,
  goalMode: 'combined',
  darkMode: false,
  weightUnit: 'kg',
  restTimerSeconds: 90,
  onboardingDone: false,
  fitnessGoal: null,
};
