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
  /** User asked to stop seeing the "set up a routine" reminder on Train. */
  routineHintDismissed: boolean;
  /** Built-in template suggestions (Plantilles page) the user dismissed. */
  dismissedBuiltInTemplateIds: string[];
  /** Ids of one-off discovery hints/nudges the user has dismissed
   *  (see AppHintService). */
  dismissedHints: string[];
  /** Off by default — advanced workout-editor features that clutter the
   *  set-adding flow for most users. */
  supersetsEnabled: boolean;
  dropsetsEnabled:  boolean;
  /** Off by default — logging Reps In Reserve per set. */
  rirEnabled: boolean;
  difficultyScale: DifficultyScale;
  /** User's bodyweight in kg, used to count bodyweight/assisted exercises
   *  (dominades, fons…) towards volume. Null = not set → those exercises fall
   *  back to their logged (added) weight only. */
  bodyweightKg: number | null;
  /** Advanced: let the user edit the per-exercise bodyweight factor (% of
   *  bodyweight moved) in the exercise form. Off by default — the catalog
   *  ships sensible values and most users never need to touch it. */
  bodyweightFactorEnabled: boolean;
  /** Highest {@link CATALOG_VERSION} the user has synced their catalog to.
   *  Below the current version → the "update catalog" prompt may show; once
   *  synced it's hidden even if the user later deletes a default metric/subtype,
   *  and it re-appears only when we ship a new catalog version (bump the const). */
  catalogSyncedVersion: number;
}

/** Bump whenever DEFAULT_EXERCISES or DEFAULT_SPORTS change in a way existing
 *  users should be offered — it re-arms the "Actualitzar el catàleg" prompt. */
export const CATALOG_VERSION = 1;

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
  dismissedHints: [],
  supersetsEnabled: false,
  dropsetsEnabled: false,
  rirEnabled: false,
  difficultyScale: 'emoji',
  bodyweightKg: null,
  bodyweightFactorEnabled: false,
  catalogSyncedVersion: 0,
};
