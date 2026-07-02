import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SharedWorkoutService } from './shared-workout.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ExerciseService } from './exercise.service';
import { TemplateService } from './template.service';
import { Exercise } from '../models/exercise.model';
import { WorkoutEntry } from '../models/workout.model';
import { WorkoutTemplate } from '../models/template.model';

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return { id: 'ex1', name: 'Press banca', category: 'push', createdAt: new Date(), ...overrides };
}

function sharedRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'share-1', owner_id: 'user-1', name: 'Push A', category: 'push',
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
  let templateCreate: jasmine.Spy;
  let service: SharedWorkoutService;

  function buildSupabaseMock() {
    const insertSpy = jasmine.createSpy('insert').and.callFake(() => ({
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
    templateCreate = jasmine.createSpy('create').and.callFake(
      (name: string, category: string, entries: unknown[]) =>
        Promise.resolve({ id: 'tpl-new', name, category, entries, createdAt: '2024-01-01' } as WorkoutTemplate));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: buildSupabaseMock() },
        { provide: ExerciseService, useValue: { exercises: () => myExercises, ensureLoaded: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: TemplateService, useValue: { create: templateCreate } },
      ],
    });
    service = TestBed.inject(SharedWorkoutService);
  }

  beforeEach(() => setup());

  describe('share()', () => {
    it('inserts a snapshot of the entries and returns the new id', async () => {
      const entries: WorkoutEntry[] = [
        { exerciseId: 'ex1', exerciseName: 'Press banca', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 6 }] },
      ];
      const id = await service.share('Push A', 'push', entries);
      expect(id).toBe('share-1');
    });

    it('throws when there is no authenticated user', async () => {
      uid.set(null);
      await expectAsync(service.share('Push A', 'push', [])).toBeRejected();
    });
  });

  describe('fetchById()', () => {
    it('returns the mapped shared workout', async () => {
      const shared = await service.fetchById('share-1');
      expect(shared?.name).toBe('Push A');
      expect(shared?.category).toBe('push');
      expect(shared?.entries[0].exerciseName).toBe('Press banca');
    });

    it('returns null when the row does not exist', async () => {
      selectResult = { data: null, error: { message: 'not found' } };
      const shared = await service.fetchById('missing');
      expect(shared).toBeNull();
    });
  });

  describe('importAsTemplate()', () => {
    it('matches entries by exercise name and creates a template', async () => {
      const shared = await service.fetchById('share-1');
      const { template, skipped } = await service.importAsTemplate(shared!);

      expect(templateCreate).toHaveBeenCalledWith('Push A', 'push', [
        { exerciseId: 'ex1', exerciseName: 'Press banca', sets: 3, reps: 8, weight: 60 },
      ]);
      expect(template.id).toBe('tpl-new');
      expect(skipped).toEqual([]);
    });

    it('skips exercises the recipient does not have', async () => {
      myExercises = [];
      selectResult = { data: sharedRow({ entries: [{ exerciseName: 'Exercici desconegut' }] }), error: null };
      const shared = await service.fetchById('share-1');
      const { skipped } = await service.importAsTemplate(shared!);

      expect(skipped).toEqual(['Exercici desconegut']);
      expect(templateCreate).toHaveBeenCalledWith('Push A', 'push', []);
    });

    it('matches exercise names case-insensitively', async () => {
      myExercises = [exercise({ name: 'PRESS BANCA' })];
      const shared = await service.fetchById('share-1');
      const { skipped } = await service.importAsTemplate(shared!);

      expect(skipped).toEqual([]);
      expect(templateCreate).toHaveBeenCalledWith('Push A', 'push', [
        jasmine.objectContaining({ exerciseName: 'PRESS BANCA' }),
      ]);
    });
  });
});
