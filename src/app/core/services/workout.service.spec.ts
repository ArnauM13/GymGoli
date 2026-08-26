import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WorkoutService, matchesHistoryFilters } from './workout.service';
import { Workout } from '../models/workout.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ExerciseService } from './exercise.service';
import { SyncService } from './sync.service';

interface QueryChain {
  select: jasmine.Spy; eq: jasmine.Spy; neq: jasmine.Spy; order: jasmine.Spy;
  contains: jasmine.Spy; ilike: jasmine.Spy; filter: jasmine.Spy; range: jasmine.Spy;
  gte: jasmine.Spy; lte: jasmine.Spy; delete: jasmine.Spy;
  then: (resolve: (v: { data?: unknown; count?: number; error?: unknown }) => void) => void;
}

/** A chainable query-builder stub: every filter method returns the same
 *  object (so calls can be inspected afterwards) and it resolves like a
 *  real supabase-js query when awaited. */
function makeQueryChain(result: { data?: unknown; count?: number; error?: unknown }): QueryChain {
  const chain = {} as QueryChain;
  for (const method of ['select', 'eq', 'neq', 'order', 'contains', 'ilike', 'filter', 'range', 'gte', 'lte', 'delete'] as const) {
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
  let syncMock: {
    queueUpsert: jasmine.Spy; queueDelete: jasmine.Spy; setSnapshotResolver: jasmine.Spy;
    pendingIds: () => string[]; pendingDeleteIds: () => string[];
    pendingCount: ReturnType<typeof signal<number>>; getSnapshot: () => null;
  };
  /** Ids the sync queue is holding a tombstone for. */
  let pendingDeletes: string[];

  function setup(): void {
    pendingDeletes = [];
    uid = signal<string | null>('user-1');
    workoutsChain = makeQueryChain({ data: [], count: 0, error: null });

    syncMock = {
      queueUpsert:         jasmine.createSpy('queueUpsert'),
      queueDelete:         jasmine.createSpy('queueDelete'),
      setSnapshotResolver: jasmine.createSpy('setSnapshotResolver'),
      pendingIds:          () => [] as string[],
      pendingDeleteIds:    () => pendingDeletes,
      pendingCount:        signal(0),
      getSnapshot:         () => null,
    };

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
        { provide: SyncService,     useValue: syncMock },
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

    it('orders by stable secondary keys so no rows are dropped across pages', async () => {
      await service.loadWorkoutPage({ page: 0, pageSize: 20 });

      // `date` is not unique, so paginating over it alone lets ties shuffle
      // between page queries and silently drop workouts. created_at + id give
      // a deterministic total order across every page.
      expect(workoutsChain.order).toHaveBeenCalledWith('date', { ascending: false });
      expect(workoutsChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(workoutsChain.order).toHaveBeenCalledWith('id', { ascending: false });
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

  describe('getLastSessionEntry()', () => {
    it('returns the sets, note and derived counts of the most recent session', async () => {
      const older = await service.createWorkoutForDate('2024-03-01');
      await service.addExerciseToWorkout(older, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(older, 'a', [{ weight: 30, reps: 10 }]);

      const recent = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(recent, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(recent, 'a', [
        { weight: 40, reps: 10, warmup: true },
        { weight: 60, reps: 8 },
        { weight: 60, reps: 6 },
      ]);
      await service.updateEntryNotes(recent, 'a', 'Bona sensació');

      const last = service.getLastSessionEntry('a')!;
      expect(last.date).toBe('2024-03-06');
      expect(last.sets.length).toBe(3);
      expect(last.workingSets).toBe(2);
      expect(last.warmupSets).toBe(1);
      expect(last.totalReps).toBe(14);
      expect(last.maxWeight).toBe(60);
      expect(last.notes).toBe('Bona sensació');
    });

    it('skips the excluded workout so today\'s own sets are never its own "last session"', async () => {
      const older = await service.createWorkoutForDate('2024-03-01');
      await service.addExerciseToWorkout(older, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(older, 'a', [{ weight: 30, reps: 10 }]);

      const today = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(today, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(today, 'a', [{ weight: 80, reps: 5 }]);

      expect(service.getLastSessionEntry('a', today)?.date).toBe('2024-03-01');
    });

    it('returns null when the exercise has never been logged', () => {
      expect(service.getLastSessionEntry('never-done')).toBeNull();
    });
  });

  describe('replaceEntrySets()', () => {
    it('swaps the entry\'s sets instead of appending them', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addSetsToEntry(id, 'a', [{ weight: 20, reps: 12 }, { weight: 20, reps: 10 }]);

      await service.replaceEntrySets(id, 'a', [{ weight: 60, reps: 8 }]);

      const entry = service.getWorkoutForDate('2024-03-06')!.entries.find(e => e.exerciseId === 'a')!;
      expect(entry.sets).toEqual([{ weight: 60, reps: 8 }]);
    });

    it('leaves the other entries untouched', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
      await service.addExerciseToWorkout(id, { exerciseId: 'b', exerciseName: 'B', sets: [] });
      await service.addSetsToEntry(id, 'a', [{ weight: 20, reps: 12 }]);
      await service.addSetsToEntry(id, 'b', [{ weight: 50, reps: 5 }]);

      await service.replaceEntrySets(id, 'a', [{ weight: 60, reps: 8 }]);

      const entries = service.getWorkoutForDate('2024-03-06')!.entries;
      expect(entries.find(e => e.exerciseId === 'b')!.sets).toEqual([{ weight: 50, reps: 5 }]);
    });
  });

  describe('deleteExerciseData()', () => {
    // Seed 3 sessions on different dates, each logging exercise 'a' alongside a
    // second exercise 'b' — so removing 'a' never empties a workout and we stay
    // on the update path (no supabase delete needed in these stubs).
    async function seedThreeSessions(): Promise<void> {
      for (const date of ['2024-01-10', '2024-03-10', '2024-06-10']) {
        const id = await service.createWorkoutForDate(date);
        await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });
        await service.addExerciseToWorkout(id, { exerciseId: 'b', exerciseName: 'B', sets: [] });
        await service.addSetsToEntry(id, 'a', [{ weight: 40, reps: 8 }]);
      }
    }

    it('removes the exercise from every session when no range is given', async () => {
      await seedThreeSessions();

      const res = await service.deleteExerciseData('a');

      expect(res.sessions).toBe(3);
      expect(service.getWorkoutsForExercise('a').length).toBe(0);
      // The co-logged exercise stays untouched in all 3 sessions.
      expect(service.getWorkoutsForExercise('b').length).toBe(3);
    });

    it('only removes sessions inside the given date range', async () => {
      await seedThreeSessions();

      const res = await service.deleteExerciseData('a', { from: '2024-03-01' });

      expect(res.sessions).toBe(2); // March + June, January kept
      const remaining = service.getWorkoutsForExercise('a').map(w => w.date);
      expect(remaining).toEqual(['2024-01-10']);
    });

    it('respects both range bounds', async () => {
      await seedThreeSessions();

      const res = await service.deleteExerciseData('a', { from: '2024-02-01', to: '2024-04-01' });

      expect(res.sessions).toBe(1); // only March
      const remaining = service.getWorkoutsForExercise('a').map(w => w.date).sort();
      expect(remaining).toEqual(['2024-01-10', '2024-06-10']);
    });

    it('deletes a session that is left with no exercises', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [] });

      const res = await service.deleteExerciseData('a');

      expect(res.sessions).toBe(1);
      expect(res.removedWorkouts).toBe(1);
      expect(service.getWorkoutForDate('2024-03-06')).toBeNull();
    });
  });

  describe('deleteWorkout()', () => {
    it('goes through the sync queue instead of writing to Supabase directly', async () => {
      await service.deleteWorkout('w1');

      expect(syncMock.queueDelete).toHaveBeenCalledWith('w1');
      expect(workoutsChain.delete).not.toHaveBeenCalled();
    });

    // Deleting while offline used to lose the deletion: the local copy went
    // away and the server kept the row, which came back at the next load.
    it('does not throw when the server is unreachable', async () => {
      await expectAsync(service.deleteWorkout('w1')).toBeResolved();
    });
  });

  describe('workouts already deleted locally', () => {
    it('are kept out of a fetched page until the tombstone reaches the server', async () => {
      pendingDeletes = ['w2'];
      workoutsChain.then = (resolve) => resolve({
        data: [
          { id: 'w1', date: '2024-03-06', entries: [], created_at: '2024-03-06T10:00:00Z' },
          { id: 'w2', date: '2024-03-05', entries: [], created_at: '2024-03-05T10:00:00Z' },
        ],
        count: 2,
        error: null,
      });

      const page = await service.loadWorkoutPage({ page: 0, pageSize: 20 });

      expect(page.workouts.map(w => w.id)).toEqual(['w1']);
      // The count must drop with them, or the list keeps asking for a page it
      // can never fill.
      expect(page.total).toBe(1);
    });
  });

});

// ── matchesHistoryFilters() ─────────────────────────────────────────────────
//
// The client-side twin of loadWorkoutPage()'s server filters, used to merge
// not-yet-synced workouts into the paginated Historial list.

describe('matchesHistoryFilters()', () => {
  function make(overrides: Partial<Workout> = {}): Workout {
    return { id: 'w1', date: '2024-03-06', entries: [], createdAt: new Date(), ...overrides };
  }

  it('accepts a done workout when no filter is active', () => {
    expect(matchesHistoryFilters(make(), {})).toBeTrue();
  });

  it('rejects a planned workout, like the server .neq() does', () => {
    expect(matchesHistoryFilters(make({ status: 'planned' }), {})).toBeFalse();
  });

  it('matches on date', () => {
    expect(matchesHistoryFilters(make(), { date: '2024-03-06' })).toBeTrue();
    expect(matchesHistoryFilters(make(), { date: '2024-03-07' })).toBeFalse();
  });

  it('matches on category, including a user-created training type', () => {
    const custom = 'c0ffee00-0000-4000-8000-000000000000';
    expect(matchesHistoryFilters(make({ categories: [custom] }), { category: custom })).toBeTrue();
    expect(matchesHistoryFilters(make({ categories: ['push'] }), { category: custom })).toBeFalse();
  });

  it('falls back to the legacy single `category` field', () => {
    expect(matchesHistoryFilters(make({ category: 'legs' }), { category: 'legs' })).toBeTrue();
  });

  it('matches exercise names case-insensitively', () => {
    const w = make({ entries: [{ exerciseId: 'a', exerciseName: 'Press banca', sets: [] }] });
    expect(matchesHistoryFilters(w, { search: 'PRESS' })).toBeTrue();
    expect(matchesHistoryFilters(w, { search: 'dominades' })).toBeFalse();
  });
});
