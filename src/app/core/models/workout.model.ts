export type FeelingLevel = 1 | 2 | 3 | 4 | 5;

export const FEELING_EMOJI: Record<FeelingLevel, string> = {
  1: '💀',
  2: '😓',
  3: '😐',
  4: '💪',
  5: '🔥',
};

export const FEELING_LABEL: Record<FeelingLevel, string> = {
  1: 'Molt dur',
  2: 'Dur',
  3: 'Normal',
  4: 'Bé',
  5: 'Excel·lent',
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
  notes?: string;
  createdAt: Date;
}
