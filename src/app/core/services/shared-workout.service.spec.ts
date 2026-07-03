import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SharedWorkoutService } from './shared-workout.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ExerciseService } from './exercise.service';
import { WorkoutService } from './workout.service';
import { Exercise } from '../models/exercise.model';
import { WorkoutEntry } from '../models/workout.model';

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return { id: 'ex1', name: 'Press banca', category: 'push', createdAt: new Date(), ...overrides };
}

function sharedRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'share-1', name: 'Push A', category: 'push',
    entries: [{ exerciseName: 'Press banca', sets: 3, reps: 8, weight: 60 }],
    created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SharedWorkoutService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let insertResult: { data: Record<string, unknown> | null; error: unknown };
  let selectResult: { data: Record<string, unknown> | null; error: unknown };
  let myExercises: Exercise[];
  let createPlannedWorkout: jasmine.Spy;
  let insertSpy: jasmine.Spy;
  let service: SharedWorkoutService;

  function buildSupabaseMock() {
    insertSpy = jasmine.createSpy('insert').and.callFake(() => ({
      select: () => ({
        single: () => Promise.resolve(insertResult),
      }),
    }));
    const selectSpy = jasmine.createSpy('select').and.callFake(() => ({
      eq: () => ({
        single: () => Promise.resolve(selectResult),
      }),
    }));
    const fromSpy = jasmine.createSpy('from').and.returnValue({ insert: insertSpy, select: selectSpy });
    return { client: { from: fromSpy }, fromSpy, insertSpy, selectSpy };
  }

  function setup(): void {
    uid = signal<string | null>('user-1');
    insertResult = { data: sharedRow(), error: null };
    selectResult = { data: sharedRow(), error: null };
    myExercises = [exercise()];
    createPlannedWorkout = jasmine.createSpy('createPlannedWorkout').and.resolveTo('workout-new');

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: buildSupabaseMock() },
        { provide: ExerciseService, useValue: { exercises: () => myExercises, ensureLoaded: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: WorkoutService,  useValue: { createPlannedWorkout } },
      ],
    });
    service = TestBed.inject(SharedWorkoutService);
  }

  beforeEach(() => setup());

  describe('share()', () => {
    it('inserts a snapshot of the entries with no owner reference and returns the new id', async () => {
      const entries: WorkoutEntry[] = [
        { exerciseId: 'ex1', exerciseName: 'Press banca', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 6 }] },
      ];
      const id = await service.share('Push A', 'push', entries);

      expect(id).toBe('share-1');
      const payload = insertSpy.calls.mostRecent().args[0];
      expect(payload.owner_id).toBeUndefined();
      expect(payload.name).toBe('Push A');
    });

    it('throws when there is no authenticated user', async () => {
      uid.set(null);
      await expectAsync(service.share('Push A', 'push', [])).toBeRejected();
    });
  });

  describe('fetchById()', () => {
    it('returns the mapped shared workout with no owner field', async () => {
      const shared = await service.fetchById('share-1');
      expect(shared?.name).toBe('Push A');
      expect(shared?.category).toBe('push');
      expect(shared?.entries[0].exerciseName).toBe('Press banca');
      expect((shared as unknown as Record<string, unknown>)?.['ownerId']).toBeUndefined();
    });

    it('returns null when the row does not exist', async () => {
      selectResult = { data: null, error: { message: 'not found' } };
      const shared = await service.fetchById('missing');
      expect(shared).toBeNull();
    });
  });

  describe('importAsWorkout()', () => {
    it('matches entries by exercise name and creates a planned workout for today', async () => {
      const shared = await service.fetchById('share-1');
      const { workoutId, skipped } = await service.importAsWorkout(shared!);

      expect(createPlannedWorkout).toHaveBeenCalledWith(jasmine.any(String), 'push', [
        { exerciseId: 'ex1', exerciseName: 'Press banca', sets: [] },
      ]);
      expect(workoutId).toBe('workout-new');
      expect(skipped).toEqual([]);
    });

    it('skips exercises the recipient does not have', async () => {
      myExercises = [];
      selectResult = { data: sharedRow({ entries: [{ exerciseName: 'Exercici desconegut' }] }), error: null };
      const shared = await service.fetchById('share-1');
      const { skipped } = await service.importAsWorkout(shared!);

      expect(skipped).toEqual(['Exercici desconegut']);
      expect(createPlannedWorkout).toHaveBeenCalledWith(jasmine.any(String), 'push', []);
    });

    it('matches exercise names case-insensitively', async () => {
      myExercises = [exercise({ name: 'PRESS BANCA' })];
      const shared = await service.fetchById('share-1');
      const { skipped } = await service.importAsWorkout(shared!);

      expect(skipped).toEqual([]);
      expect(createPlannedWorkout).toHaveBeenCalledWith(jasmine.any(String), 'push', [
        jasmine.objectContaining({ exerciseName: 'PRESS BANCA' }),
      ]);
    });

    it('passes no category for a mixed shared workout', async () => {
      selectResult = { data: sharedRow({ category: 'mixed' }), error: null };
      const shared = await service.fetchById('share-1');
      await service.importAsWorkout(shared!);

      expect(createPlannedWorkout).toHaveBeenCalledWith(jasmine.any(String), undefined, jasmine.any(Array));
    });
  });
});
