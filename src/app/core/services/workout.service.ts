import { Injectable, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  orderBy,
  query,
  updateDoc,
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

import { FeelingLevel, Workout, WorkoutEntry, WorkoutSet } from '../models/workout.model';

@Injectable({ providedIn: 'root' })
export class WorkoutService {
  private firestore = inject(Firestore);
  private col = collection(this.firestore, 'workouts');

  private workouts$ = (
    collectionData(query(this.col, orderBy('date', 'desc')), { idField: 'id' }) as Observable<
      (Workout & { createdAt: Timestamp })[]
    >
  ).pipe(
    map(docs =>
      docs.map(d => ({
        ...d,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : new Date(),
      }))
    )
  );

  readonly workouts = toSignal(this.workouts$, { initialValue: [] as Workout[] });

  readonly todayWorkout = computed(() => {
    const today = this.todayDateString();
    return this.workouts().find(w => w.date === today) ?? null;
  });

  readonly pastWorkouts = computed(() => {
    const today = this.todayDateString();
    return this.workouts().filter(w => w.date !== today);
  });

  todayDateString(): string {
    return new Date().toISOString().split('T')[0];
  }

  getWorkoutForDate(date: string): Workout | null {
    return this.workouts().find(w => w.date === date) ?? null;
  }

  getWorkoutsForExercise(exerciseId: string): Workout[] {
    return this.workouts()
      .filter(w => w.entries.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async createWorkoutForDate(date: string): Promise<string> {
    const ref = await addDoc(this.col, {
      date,
      entries: [],
      createdAt: Timestamp.now(),
    });
    return ref.id;
  }

  async createTodayWorkout(): Promise<string> {
    return this.createWorkoutForDate(this.todayDateString());
  }

  async addExerciseToWorkout(workoutId: string, entry: WorkoutEntry): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = [...workout.entries, entry];
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  /** Add multiple sets in a single Firestore write */
  async addSetsToEntry(workoutId: string, exerciseId: string, sets: WorkoutSet[]): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId === exerciseId ? { ...e, sets: [...e.sets, ...sets] } : e
    );
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  /** Replace a single set at the given index with updated values */
  async updateSetInEntry(workoutId: string, exerciseId: string, setIndex: number, updated: WorkoutSet): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      const sets = [...e.sets];
      sets[setIndex] = updated;
      return { ...e, sets };
    });
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  async removeSetFromEntry(workoutId: string, exerciseId: string, setIndex: number): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      return { ...e, sets: e.sets.filter((_, i) => i !== setIndex) };
    });
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  async removeEntryFromWorkout(workoutId: string, exerciseId: string): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = workout.entries.filter(e => e.exerciseId !== exerciseId);
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  /** Set (or clear) the general feeling for an exercise entry */
  async updateEntryFeeling(workoutId: string, exerciseId: string, feeling: FeelingLevel | undefined): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      if (feeling === undefined) {
        // Remove the feeling field entirely
        const { feeling: _removed, ...rest } = e as WorkoutEntry & { feeling?: FeelingLevel };
        return rest as WorkoutEntry;
      }
      return { ...e, feeling };
    });
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  async deleteWorkout(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'workouts', id));
  }
}
