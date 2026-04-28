export interface UserSettings {
  metricsEnabled: boolean;
  weeklyActivityGoal: number | null;
  onboardingDone: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  metricsEnabled: false,
  weeklyActivityGoal: null,
  onboardingDone: false,
};
