import { ExerciseCategory } from './exercise.model';

/**
 * A shared workout's exercises are matched by name on import (not id) —
 * exercise ids are per-user, so the sender's ids never resolve for the
 * recipient. Every set the sender logged (weight + reps, in kg) is kept
 * as-is so importing reproduces the workout exactly, not just a summary.
 */
export interface SharedWorkoutEntry {
  exerciseName: string;
  sets: {
    weight: number; reps: number;
    drops?: { weight: number; reps: number }[];
    weightLeft?: number; weightRight?: number;
  }[];
}

export interface SharedWorkout {
  id: string;
  name: string;
  category: ExerciseCategory | 'mixed';
  entries: SharedWorkoutEntry[];
  createdAt: string;
}
