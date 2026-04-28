export type GoalMode = 'combined' | 'separate';
export type WeightUnit = 'kg' | 'lb';

export interface UserSettings {
  metricsEnabled: boolean;
  weeklyActivityGoal: number | null;
  weeklyGymGoal: number | null;
  weeklySportGoal: number | null;
  goalMode: GoalMode;
  darkMode: boolean;
  weightUnit: WeightUnit;
  onboardingDone: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  metricsEnabled: false,
  weeklyActivityGoal: null,
  weeklyGymGoal: null,
  weeklySportGoal: null,
  goalMode: 'combined',
  darkMode: false,
  weightUnit: 'kg',
  onboardingDone: false,
};
