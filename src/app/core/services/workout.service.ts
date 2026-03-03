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

import { Workout, WorkoutEntry, WorkoutSet } from '../models/workout.model';

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

  getWorkoutsForExercise(exerciseId: string): Workout[] {
    return this.workouts()
      .filter(w => w.entries.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async createTodayWorkout(): Promise<string> {
    const ref = await addDoc(this.col, {
      date: this.todayDateString(),
      entries: [],
      createdAt: Timestamp.now(),
    });
    return ref.id;
  }

  async addExerciseToWorkout(workoutId: string, entry: WorkoutEntry): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = [...workout.entries, entry];
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  async addSetToEntry(workoutId: string, exerciseId: string, set: WorkoutSet): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId === exerciseId ? { ...e, sets: [...e.sets, set] } : e
    );
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  async removeSetFromEntry(workoutId: string, exerciseId: string, setIndex: number): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      const sets = e.sets.filter((_, i) => i !== setIndex);
      return { ...e, sets };
    });
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  async removeEntryFromWorkout(workoutId: string, exerciseId: string): Promise<void> {
    const workout = this.workouts().find(w => w.id === workoutId);
    if (!workout) return;
    const entries = workout.entries.filter(e => e.exerciseId !== exerciseId);
    await updateDoc(doc(this.firestore, 'workouts', workoutId), { entries });
  }

  async deleteWorkout(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'workouts', id));
  }
}
