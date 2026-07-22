export type FeelingLevel = 1 | 2 | 3 | 4 | 5;
export type WorkoutStatus = 'planned' | 'done';
/**
 * 'routine' = materialized from the persistent recurring routine
 * (Configuració > Estableix rutines); 'manual' = the user's own planning,
 * whether a single day picked directly on Train or the single-week planner
 * opened from the calendar's "Planificar" action; 'trainer' = accepted from
 * a trainer proposal. 'self' is legacy data from before the routine/manual
 * split existed and is treated as belonging to neither going forward.
 */
export type PlannedSource = 'routine' | 'manual' | 'trainer' | 'self';

export const FEELING_EMOJI: Record<FeelingLevel, string> = {
  1: '🔥',  // Excel·lent — menys fatigant
  2: '💪',
  3: '😐',
  4: '😓',
  5: '💀',  // Molt dur — més fatigant
};

export const FEELING_LABEL: Record<FeelingLevel, string> = {
  1: 'Excel·lent',
  2: 'Bé',
  3: 'Normal',
  4: 'Dur',
  5: 'Molt dur',
};

export interface WorkoutSet {
  weight: number;
  reps:   number;
  // feeling moved to WorkoutEntry level
  /** Extra stages performed immediately after this one, no rest, at
   *  progressively lower weight — e.g. 70kg×8 → 50kg×6 → 30kg×4. */
  drops?: { weight: number; reps: number }[];
  /** Only present for unilateral exercises — per-side weight for this set.
   *  `weight` mirrors the heavier side so aggregate stats (PRs, charts)
   *  keep working without special-casing. */
  weightLeft?:  number;
  weightRight?: number;
  /** Marks this as a warm-up set — excluded from PRs, volume and the
   *  "last session" weight suggestion, which should only reflect working sets. */
  warmup?: boolean;
  /** Reps In Reserve — how many more reps could have been done (0 = failure). */
  rir?: number;
}

export interface WorkoutEntry {
  exerciseId:   string;
  exerciseName: string;
  sets:         WorkoutSet[];
  feeling?:     FeelingLevel;
  notes?:       string;
  /** Entries sharing this id are performed back-to-back with no rest and
   *  are rendered as one connected block, always kept contiguous. */
  supersetGroupId?: string;
}

/** Context that turns a logged weight into the real load moved, for bodyweight
 *  and assisted exercises. Omitted (or without a bodyweight) → logged weight is
 *  used as-is, so plain weighted exercises and unknown bodyweight behave as before. */
export interface SetLoadContext {
  /** How the exercise is loaded: 'weighted' (default), 'bodyweight' or 'assisted'. */
  loadType?: 'weighted' | 'bodyweight' | 'assisted';
  /** The user's bodyweight in kg. Falsy → bodyweight/assisted fall back to the
   *  logged weight, so nothing changes until a bodyweight is set. */
  bodyweightKg?: number | null;
}

/** Real load (kg) moved for one rep given how the exercise is loaded:
 *  'bodyweight' adds the user's bodyweight to the logged (extra) weight,
 *  'assisted' subtracts the logged assistance from it, else the logged weight. */
export function effectiveRepWeight(logged: number, ctx?: SetLoadContext): number {
  const bw = ctx?.bodyweightKg ?? 0;
  if (bw > 0 && ctx?.loadType === 'bodyweight') return Math.max(0, bw + logged);
  if (bw > 0 && ctx?.loadType === 'assisted')   return Math.max(0, bw - logged);
  return logged;
}

/** Heaviest weight lifted in this set, including per-side and drop stages. */
export function setMaxWeight(set: WorkoutSet, ctx?: SetLoadContext): number {
  const w = (x: number) => effectiveRepWeight(x, ctx);
  const base = Math.max(w(set.weight), w(set.weightLeft ?? 0), w(set.weightRight ?? 0));
  return (set.drops ?? []).reduce((m, d) => Math.max(m, w(d.weight)), base);
}

/** Total volume (load × reps) of this set, including any drop stages.
 *  Unilateral sets count both sides' weight for that same rep count. */
export function setVolume(set: WorkoutSet, ctx?: SetLoadContext): number {
  const w = (x: number) => effectiveRepWeight(x, ctx);
  const base = set.weightLeft != null && set.weightRight != null
    ? (w(set.weightLeft) + w(set.weightRight)) * set.reps
    : w(set.weight) * set.reps;
  return base + (set.drops ?? []).reduce((sum, d) => sum + w(d.weight) * d.reps, 0);
}

export interface Workout {
  id: string;
  date: string; // YYYY-MM-DD
  entries: WorkoutEntry[];
  /** Primary category selected when the workout was started */
  category?: string;
  /**
   * All distinct exercise categories present in this workout.
   * Length > 1 means the workout is "hybrid" (mixed types).
   * Maintained automatically by WorkoutService when exercises are added.
   */
  categories?: string[];
  notes?: string;
  feeling?: FeelingLevel;
  /** Set when this workout was created by accepting a trainer proposal */
  sourceProposalId?: string | null;
  createdAt: Date;
  /** 'done' (default) or 'planned' (future/scheduled) */
  status?: WorkoutStatus;
  plannedSource?: PlannedSource;
}
