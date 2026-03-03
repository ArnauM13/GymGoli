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
import { v4 as uuidv4 } from 'uuid';

import {
  DEFAULT_EXERCISES,
  Exercise,
  ExerciseCategory,
} from '../models/exercise.model';

@Injectable({ providedIn: 'root' })
export class ExerciseService {
  private firestore = inject(Firestore);
  private col = collection(this.firestore, 'exercises');

  private exercises$ = (
    collectionData(query(this.col, orderBy('name')), { idField: 'id' }) as Observable<
      (Exercise & { createdAt: Timestamp })[]
    >
  ).pipe(
    map(docs =>
      docs.map(d => ({
        ...d,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : new Date(),
      }))
    )
  );

  readonly exercises = toSignal(this.exercises$, { initialValue: [] as Exercise[] });

  readonly byCategory = (category: ExerciseCategory) =>
    computed(() => this.exercises().filter(e => e.category === category));

  getById(id: string): Exercise | undefined {
    return this.exercises().find(e => e.id === id);
  }

  async create(data: Omit<Exercise, 'id' | 'createdAt'>): Promise<void> {
    await addDoc(this.col, { ...data, createdAt: Timestamp.now() });
  }

  async update(id: string, data: Partial<Omit<Exercise, 'id' | 'createdAt'>>): Promise<void> {
    await updateDoc(doc(this.firestore, 'exercises', id), data);
  }

  async delete(id: string): Promise<void> {
    await deleteDoc(doc(this.firestore, 'exercises', id));
  }

  async seedIfEmpty(): Promise<void> {
    if (this.exercises().length === 0) {
      for (const exercise of DEFAULT_EXERCISES) {
        await this.create(exercise);
      }
    }
  }
}
