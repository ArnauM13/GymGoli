import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WorkoutService } from './workout.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ExerciseService } from './exercise.service';
import { SyncService } from './sync.service';

interface QueryChain {
  select: jasmine.Spy; eq: jasmine.Spy; neq: jasmine.Spy; order: jasmine.Spy;
  contains: jasmine.Spy; ilike: jasmine.Spy; filter: jasmine.Spy; range: jasmine.Spy;
  gte: jasmine.Spy; lte: jasmine.Spy;
  then: (resolve: (v: { data?: unknown; count?: number; error?: unknown }) => void) => void;
}

/** A chainable query-builder stub: every filter method returns the same
 *  object (so calls can be inspected afterwards) and it resolves like a
 *  real supabase-js query when awaited. */
function makeQueryChain(result: { data?: unknown; count?: number; error?: unknown }): QueryChain {
  const chain = {} as QueryChain;
  for (const method of ['select', 'eq', 'neq', 'order', 'contains', 'ilike', 'filter', 'range', 'gte', 'lte'] as const) {
    chain[method] = jasmine.createSpy(method).and.callFake(() => chain);
  }
  chain.then = (resolve) => resolve(result);
  return chain;
}

describe('WorkoutService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let fromSpy: jasmine.Spy;
  let workoutsChain: ReturnType<typeof makeQueryChain>;
  let service: WorkoutService;

  function setup(): void {
    uid = signal<string | null>('user-1');
    workoutsChain = makeQueryChain({ data: [], count: 0, error: null });

    fromSpy = jasmine.createSpy('from').and.callFake((table: string) =>
      table === 'workouts' ? workoutsChain : makeQueryChain({ data: [], count: 0, error: null }));

    const channelStub = {
      on: jasmine.createSpy('on').and.callFake(function (this: unknown) { return channelStub; }),
      subscribe: jasmine.createSpy('subscribe'),
      unsubscribe: jasmine.createSpy('unsubscribe'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: { client: { from: fromSpy, channel: () => channelStub } } },
        { provide: ExerciseService, useValue: { getById: () => undefined } },
        { provide: SyncService,     useValue: {
          markDirty:   jasmine.createSpy('markDirty'),
          pendingIds:  signal<string[]>([]),
          getSnapshot: () => null,
          cancelDirty: jasmine.createSpy('cancelDirty'),
          isInsert:    () => false,
        } },
      ],
    });
    service = TestBed.inject(WorkoutService);
    TestBed.flushEffects();
  }

  beforeEach(() => setup());

  describe('loadWorkoutPage()', () => {
    it('filters by exercise name using a plain ilike on the generated exercise_names column', async () => {
      await service.loadWorkoutPage({ page: 0, pageSize: 20, search: 'press banca' });

      expect(workoutsChain.ilike).toHaveBeenCalledWith('exercise_names', '%press banca%');
      expect(workoutsChain.filter).not.toHaveBeenCalled();
    });

    it('escapes % and _ wildcards in the search term', async () => {
      await service.loadWorkoutPage({ page: 0, pageSize: 20, search: '100%_effort' });

      expect(workoutsChain.ilike).toHaveBeenCalledWith('exercise_names', '%100\\%\\_effort%');
    });

    it('does not filter by exercise name when no search term is given', async () => {
      await service.loadWorkoutPage({ page: 0, pageSize: 20 });

      expect(workoutsChain.ilike).not.toHaveBeenCalled();
    });

    it('filters by category using contains', async () => {
      await service.loadWorkoutPage({ page: 0, pageSize: 20, category: 'push' });

      expect(workoutsChain.contains).toHaveBeenCalledWith('categories', ['push']);
    });

    it('paginates using range based on page and pageSize', async () => {
      await service.loadWorkoutPage({ page: 2, pageSize: 10 });

      expect(workoutsChain.range).toHaveBeenCalledWith(20, 29);
    });

    it('returns the mapped workouts and total count', async () => {
      workoutsChain = makeQueryChain({
        data: [{ id: 'w1', date: '2024-03-06', entries: [], categories: [], created_at: '2024-03-06T00:00:00.000Z' }],
        count: 1,
        error: null,
      });
      fromSpy.and.callFake((table: string) => table === 'workouts' ? workoutsChain : makeQueryChain({ data: [], count: 0, error: null }));

      const result = await service.loadWorkoutPage({ page: 0, pageSize: 20 });

      expect(result.total).toBe(1);
      expect(result.workouts.length).toBe(1);
      expect(result.workouts[0].id).toBe('w1');
    });

    it('throws when the query errors', async () => {
      workoutsChain = makeQueryChain({ data: null, count: 0, error: new Error('network error') });
      fromSpy.and.callFake((table: string) => table === 'workouts' ? workoutsChain : makeQueryChain({ data: [], count: 0, error: null }));

      await expectAsync(service.loadWorkoutPage({ page: 0, pageSize: 20 })).toBeRejected();
    });
  });

  describe('hybrid (multi-category) workouts', () => {
    it('createWorkoutForDate() seeds the full categories set and sets category to the first key', async () => {
      const id = await service.createWorkoutForDate('2024-03-06', undefined, ['push', 'legs']);
      const w  = service.getWorkoutForDate('2024-03-06')!;
      expect(id).toBe(w.id);
      expect(w.categories).toEqual(['push', 'legs']);
      expect(w.category).toBe('push');
    });

    it('createWorkoutForDate() falls back to [category] when categories is omitted', async () => {
      await service.createWorkoutForDate('2024-03-06', 'pull');
      const w = service.getWorkoutForDate('2024-03-06')!;
      expect(w.categories).toEqual(['pull']);
      expect(w.category).toBe('pull');
    });

    it('createPlannedWorkout() seeds the full categories set and sets category to the first key', async () => {
      await service.createPlannedWorkout('2024-03-10', undefined, [], 'manual', ['pull', 'legs']);
      const w = service.getWorkoutForDate('2024-03-10')!;
      expect(w.categories).toEqual(['pull', 'legs']);
      expect(w.category).toBe('pull');
      expect(w.status).toBe('planned');
    });
  });

  describe('supersets', () => {
    async function seedWorkout(): Promise<string> {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addExerciseToWorkout(id, { exerciseId: 'b', exerciseName: 'B', sets: [] });
      await service.addExerciseToWorkout(id, { exerciseId: 'c', exerciseName: 'C', sets: [] });
      return id;
    }

    it('groupIntoSuperset() tags the given entries with a shared id and keeps them contiguous', async () => {
      const id = await seedWorkout();
      await service.groupIntoSuperset(id, ['a', 'c']);

      const w = service.getWorkoutForDate('2024-03-06')!;
      expect(w.entries.map(e => e.exerciseId)).toEqual(['a', 'c', 'b']);
      expect(w.entries[0].supersetGroupId).toBeTruthy();
      expect(w.entries[0].supersetGroupId).toBe(w.entries[1].supersetGroupId);
      expect(w.entries[2].supersetGroupId).toBeUndefined();
    });

    it('groupIntoSuperset() does nothing with fewer than 2 exercise ids', async () => {
      const id = await seedWorkout();
      await service.groupIntoSuperset(id, ['a']);

      const w = service.getWorkoutForDate('2024-03-06')!;
      expect(w.entries.every(e => !e.supersetGroupId)).toBeTrue();
    });

    it('removeFromSuperset() dissolves the group when fewer than 2 members would remain', async () => {
      const id = await seedWorkout();
      await service.groupIntoSuperset(id, ['a', 'b']);

      await service.removeFromSuperset(id, 'a');

      const w = service.getWorkoutForDate('2024-03-06')!;
      expect(w.entries.find(e => e.exerciseId === 'a')?.supersetGroupId).toBeUndefined();
      expect(w.entries.find(e => e.exerciseId === 'b')?.supersetGroupId).toBeUndefined();
    });

    it('removeFromSuperset() keeps the group intact when 2+ members remain', async () => {
      const id = await seedWorkout();
      await service.groupIntoSuperset(id, ['a', 'b', 'c']);

      await service.removeFromSuperset(id, 'a');

      const w = service.getWorkoutForDate('2024-03-06')!;
      expect(w.entries.find(e => e.exerciseId === 'a')?.supersetGroupId).toBeUndefined();
      const bGroup = w.entries.find(e => e.exerciseId === 'b')?.supersetGroupId;
      expect(bGroup).toBeTruthy();
      expect(w.entries.find(e => e.exerciseId === 'c')?.supersetGroupId).toBe(bGroup);
    });

    it('reorderEntries() re-closes the gap if a caller splits a group apart', async () => {
      const id = await seedWorkout();
      await service.groupIntoSuperset(id, ['a', 'c']);
      const grouped = service.getWorkoutForDate('2024-03-06')!.entries;

      // Simulate a drag that separates the grouped pair: [a, c, b] → [c, b, a]
      await service.reorderEntries(id, [grouped[1], grouped[2], grouped[0]]);

      const after = service.getWorkoutForDate('2024-03-06')!;
      const aIdx = after.entries.findIndex(e => e.exerciseId === 'a');
      const cIdx = after.entries.findIndex(e => e.exerciseId === 'c');
      expect(Math.abs(aIdx - cIdx)).toBe(1);
    });
  });

  describe('dropsets affect max-weight lookups', () => {
    it('getAllTimeMaxWeight() counts a drop stage heavier than the main stage', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(id, 'a', [{ weight: 40, reps: 8, drops: [{ weight: 60, reps: 4 }] }]);

      expect(service.getAllTimeMaxWeight('a')).toBe(60);
    });

    it('getLastSessionInfo() reports the drop-stage weight as maxWeight when it is higher', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(id, 'a', [{ weight: 40, reps: 8, drops: [{ weight: 60, reps: 4 }] }]);

      expect(service.getLastSessionInfo('a')?.maxWeight).toBe(60);
    });
  });

  describe('unilateral (per-side) weights affect max-weight lookups', () => {
    it('getAllTimeMaxWeight() counts the heavier side even when `weight` is lower', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(id, 'a', [{ weight: 20, reps: 10, weightLeft: 18, weightRight: 20 }]);

      expect(service.getAllTimeMaxWeight('a')).toBe(20);
    });

    it('getLastSessionInfo() reports the heavier side as maxWeight', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(id, 'a', [{ weight: 20, reps: 10, weightLeft: 18, weightRight: 22 }]);

      expect(service.getLastSessionInfo('a')?.maxWeight).toBe(22);
    });
  });

  describe('warm-up sets are excluded from max-weight lookups', () => {
    it('getAllTimeMaxWeight() ignores a heavier warm-up set', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(id, 'a', [
        { weight: 100, reps: 10, warmup: true },
        { weight: 60, reps: 8 },
      ]);

      expect(service.getAllTimeMaxWeight('a')).toBe(60);
    });

    it('getLastSessionInfo() ignores a heavier warm-up set', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(id, 'a', [
        { weight: 100, reps: 10, warmup: true },
        { weight: 60, reps: 8 },
      ]);

      expect(service.getLastSessionInfo('a')?.maxWeight).toBe(60);
    });

    it('getLastSessionInfo() falls back to warm-up sets when there are no working sets', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(id, 'a', [{ weight: 40, reps: 10, warmup: true }]);

      expect(service.getLastSessionInfo('a')?.maxWeight).toBe(40);
    });
  });
});
