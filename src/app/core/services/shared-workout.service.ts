import { Injectable, inject } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ExerciseService } from './exercise.service';
import { WorkoutService } from './workout.service';
import { ExerciseCategory } from '../models/exercise.model';
import { WorkoutEntry } from '../models/workout.model';
import { SharedWorkout, SharedWorkoutEntry } from '../models/shared-workout.model';

function toSharedWorkout(row: Record<string, unknown>): SharedWorkout {
  return {
    id:        row['id'] as string,
    name:      row['name'] as string,
    category:  row['category'] as ExerciseCategory | 'mixed',
    entries:   (row['entries'] as SharedWorkoutEntry[] | null) ?? [],
    createdAt: row['created_at'] as string,
  };
}

@Injectable({ providedIn: 'root' })
export class SharedWorkoutService {
  private supabase        = inject(SupabaseService).client;
  private auth             = inject(AuthService);
  private exerciseService  = inject(ExerciseService);
  private workoutService   = inject(WorkoutService);

  /** Creates a shareable snapshot of a workout and returns its id (used to build the link).
   *  Carries no reference to the sender's account — just the name, exercises and every
   *  set they logged, so the recipient sees exactly what was done. */
  async share(name: string, category: ExerciseCategory | 'mixed', entries: WorkoutEntry[]): Promise<string> {
    if (!this.auth.uid()) throw new Error('Not authenticated');

    const sharedEntries: SharedWorkoutEntry[] = entries.map(e => ({
      exerciseName: e.exerciseName,
      sets: e.sets.map(s => ({ weight: s.weight, reps: s.reps })),
    }));

    const { data, error } = await this.supabase
      .from('shared_workouts')
      .insert({ name, category, entries: sharedEntries })
      .select()
      .single();
    if (error) throw error;
    return (data as Record<string, unknown>)['id'] as string;
  }

  async fetchById(id: string): Promise<SharedWorkout | null> {
    const { data, error } = await this.supabase
      .from('shared_workouts')
      .select('*')
      .eq('id', id)
      .single();
    if (error || !data) return null;
    return toSharedWorkout(data as Record<string, unknown>);
  }

  /** Matches the shared workout's exercises by name against the current
   *  user's own exercise library — exercise ids are per-user so the
   *  sender's ids can't be reused — and creates it as a completed
   *  workout for today in the recipient's own calendar, sets and all,
   *  as if they had done it themselves. Returns any exercise names that
   *  had no match. */
  async importAsWorkout(shared: SharedWorkout): Promise<{ workoutId: string; skipped: string[] }> {
    await this.exerciseService.ensureLoaded();
    const myExercises = this.exerciseService.exercises();
    const skipped: string[] = [];

    const entries: WorkoutEntry[] = [];
    for (const e of shared.entries) {
      const match = myExercises.find(x => x.name.toLowerCase() === e.exerciseName.toLowerCase());
      if (!match) { skipped.push(e.exerciseName); continue; }
      entries.push({
        exerciseId: match.id, exerciseName: match.name,
        sets: e.sets.map(s => ({ weight: s.weight, reps: s.reps })),
      });
    }

    const today     = new Date().toISOString().split('T')[0];
    const category  = shared.category === 'mixed' ? undefined : shared.category;
    const workoutId = await this.workoutService.createWorkoutForDate(today, category);
    for (const entry of entries) {
      await this.workoutService.addExerciseToWorkout(workoutId, entry);
    }
    return { workoutId, skipped };
  }
}
