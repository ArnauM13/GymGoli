export interface UserSettings {
  metricsEnabled: boolean;
  weeklyActivityGoal: number | null;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  metricsEnabled: false,
  weeklyActivityGoal: null,
};
