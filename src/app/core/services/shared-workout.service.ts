import { Injectable, inject } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ExerciseService } from './exercise.service';
import { TemplateService } from './template.service';
import { ExerciseCategory } from '../models/exercise.model';
import { WorkoutEntry } from '../models/workout.model';
import { SharedWorkout, SharedWorkoutEntry } from '../models/shared-workout.model';
import { TemplateEntry, WorkoutTemplate } from '../models/template.model';

function toSharedWorkout(row: Record<string, unknown>): SharedWorkout {
  return {
    id:        row['id'] as string,
    ownerId:   row['owner_id'] as string,
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
  private templateService  = inject(TemplateService);

  /** Creates a shareable snapshot of a workout and returns its id (used to build the link). */
  async share(name: string, category: ExerciseCategory | 'mixed', entries: WorkoutEntry[]): Promise<string> {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');

    const sharedEntries: SharedWorkoutEntry[] = entries.map(e => ({
      exerciseName: e.exerciseName,
      sets:   e.sets.length || undefined,
      reps:   e.sets[0]?.reps,
      weight: e.sets[0]?.weight,
    }));

    const { data, error } = await this.supabase
      .from('shared_workouts')
      .insert({ owner_id: uid, name, category, entries: sharedEntries })
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
   *  sender's ids can't be reused — and saves the result as a new
   *  personal template. Returns any exercise names that had no match. */
  async importAsTemplate(shared: SharedWorkout): Promise<{ template: WorkoutTemplate; skipped: string[] }> {
    await this.exerciseService.ensureLoaded();
    const myExercises = this.exerciseService.exercises();
    const skipped: string[] = [];

    const entries: TemplateEntry[] = [];
    for (const e of shared.entries) {
      const match = myExercises.find(x => x.name.toLowerCase() === e.exerciseName.toLowerCase());
      if (!match) { skipped.push(e.exerciseName); continue; }
      entries.push({ exerciseId: match.id, exerciseName: match.name, sets: e.sets, reps: e.reps, weight: e.weight });
    }

    const template = await this.templateService.create(shared.name, shared.category, entries);
    return { template, skipped };
  }
}
