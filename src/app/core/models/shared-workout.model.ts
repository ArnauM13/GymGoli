import { ExerciseCategory } from './exercise.model';

/**
 * A shared workout's exercises are matched by name on import (not id) —
 * exercise ids are per-user, so the sender's ids never resolve for the
 * recipient.
 */
export interface SharedWorkoutEntry {
  exerciseName: string;
  sets?:   number;
  reps?:   number;
  weight?: number;
}

export interface SharedWorkout {
  id: string;
  ownerId: string;
  name: string;
  category: ExerciseCategory | 'mixed';
  entries: SharedWorkoutEntry[];
  createdAt: string;
}
