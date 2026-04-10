export type FeelingLevel = 1 | 2 | 3 | 4 | 5;

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
}

export interface WorkoutEntry {
  exerciseId:   string;
  exerciseName: string;
  sets:         WorkoutSet[];
  feeling?:     FeelingLevel; // general feeling for this exercise session
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
  createdAt: Date;
}
