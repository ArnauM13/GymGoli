import type { GoalSnapshot } from './weekly-goal.model';
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
  /**
   * Els objectius de les setmanes passades, cadascun amb el dilluns des del
   * qual manava. Els camps de dalt són l'objectiu d'ara —el de la setmana en
   * curs i les següents—; aquí hi ha el que valia abans, perquè apujar-lo
   * avui no reescrigui les setmanes que ja s'han viscut. Vegeu
   * `weekly-goal.model.ts`.
   */
  goalHistory: GoalSnapshot[];
  themeMode: ThemeMode;
  weightUnit: WeightUnit;
  restTimerSeconds: number;
  onboardingDone: boolean;
  /** El tour guiat (Marley i Xoco) ja s'ha fet o s'ha saltat. Separat de
   *  {@link onboardingDone} perquè l'onboarding acaba amb una pregunta: qui
   *  no vulgui el tour aquell dia el té sempre a Perfil, a «Onboarding». */
  guidedTourDone: boolean;
  fitnessGoal: FitnessGoal | null;
  weeklyPlan: WeeklyPlan | null;
  /** User asked to stop seeing the "set up a routine" reminder on Train. */
  routineHintDismissed: boolean;
  /**
   * Dies concrets que l'usuari ha tret de la rutina («avui no»), per id de
   * projecció (`routine:<data>:gym:<tipus>`).
   *
   * La rutina ja no s'escriu com a 91 entrenaments planificats: es projecta al
   * calendari des d'aquest mateix `weeklyPlan` (vegeu
   * `RoutineProjectionService`). Esborrar-ne un dia, doncs, no és esborrar cap
   * fila — és dir que aquell dia no compta, i ha de quedar apuntat en algun
   * lloc o la regla el tornaria a proposar tot seguit.
   */
  dismissedRoutinePlans: string[];
  /** Built-in template suggestions (Plantilles page) the user dismissed. */
  dismissedBuiltInTemplateIds: string[];
  /** Ids of one-off discovery hints/nudges the user has dismissed
   *  (see AppHintService). */
  dismissedHints: string[];
  /** Insights: el dia (`YYYY-MM-DD`) en què es va tancar cada tipus. Tancar-ne
   *  un el silencia només aquell dia; l'endemà torna si encara és cert. */
  insightDismissedAt: Record<string, string>;
  /** Insights: el dia en què es va ensenyar cada tipus per última vegada, per
   *  respectar-ne el `cooldownDays`. */
  insightShownAt: Record<string, string>;
  /** Insights: les fites (`once`) ja celebrades, que no es tornen a celebrar
   *  mai. Es talla per quantitat, no per antiguitat. */
  insightCelebrated: string[];
  /** Dates amb una proposta de l'entrenador que l'usuari ha ignorat. */
  dismissedProposalDates: string[];
  /** Off by default — advanced workout-editor features that clutter the
   *  set-adding flow for most users. */
  supersetsEnabled: boolean;
  dropsetsEnabled:  boolean;
  /** On by default — the live "Sèrie activa" strip that suggests the next
   *  exercise while you train, learned from your own history and templates. */
  nextExerciseSuggestionEnabled: boolean;
  /** Off by default — logging Reps In Reserve per set. */
  rirEnabled: boolean;
  /** Off by default — manually logging the rest taken between sets (like a note). */
  manualRestEnabled: boolean;
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
export const CATALOG_VERSION = 2;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  metricsEnabled: false,
  weeklyActivityGoal: null,
  weeklyGymGoal: null,
  weeklySportGoal: null,
  goalMode: 'combined',
  goalHistory: [],
  themeMode: 'system',
  weightUnit: 'kg',
  restTimerSeconds: 90,
  onboardingDone: false,
  guidedTourDone: false,
  fitnessGoal: null,
  weeklyPlan: null,
  routineHintDismissed: false,
  dismissedRoutinePlans: [],
  dismissedBuiltInTemplateIds: [],
  dismissedHints: [],
  insightDismissedAt: {},
  insightShownAt: {},
  insightCelebrated: [],
  dismissedProposalDates: [],
  supersetsEnabled: false,
  dropsetsEnabled: false,
  nextExerciseSuggestionEnabled: true,
  rirEnabled: false,
  manualRestEnabled: false,
  difficultyScale: 'emoji',
  bodyweightKg: null,
  bodyweightFactorEnabled: false,
  catalogSyncedVersion: 0,
};
