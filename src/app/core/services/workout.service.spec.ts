import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WorkoutService, matchesHistoryFilters } from './workout.service';
import { Workout } from '../models/workout.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ExerciseService } from './exercise.service';
import { SyncService } from './sync.service';
import { WorkoutStoreService } from './workout-store.service';
import { ActivityFeedService } from './activity-feed.service';
import { ProjectedGym, RoutineProjectionService, routineGymId } from './routine-projection.service';
import { addDays } from '../../shared/utils/calendar-utils';

interface QueryResult { data?: unknown; count?: number; error?: unknown }

interface QueryChain {
  select: jasmine.Spy; eq: jasmine.Spy; neq: jasmine.Spy; order: jasmine.Spy;
  contains: jasmine.Spy; ilike: jasmine.Spy; filter: jasmine.Spy; range: jasmine.Spy;
  gte: jasmine.Spy; lte: jasmine.Spy; lt: jasmine.Spy; gt: jasmine.Spy;
  limit: jasmine.Spy; delete: jasmine.Spy;
  maybeSingle: jasmine.Spy;
  /** Mutable so a test can change what the next query answers. */
  result: QueryResult;
  /** La resposta d'una consulta d'una sola fila (`.maybeSingle()`). */
  singleResult?: QueryResult;
  /** Respostes per joc de columnes demanat, per distingir la consulta en mode
   *  targeta de la que porta les sèries. */
  resultBySelect?: Record<string, QueryResult>;
  then: (resolve: (v: QueryResult) => void) => void;
}

/**
 * A chainable query-builder stub: the filter methods are shared spies (so
 * calls can be inspected afterwards) and it resolves like a real supabase-js
 * query when awaited.
 *
 * `.select()` returns a view of its own so two queries in flight at the same
 * time — the app now asks for the recent window and the older summaries
 * together — each resolve with the answer for the columns they asked for.
 */
function makeQueryChain(result: QueryResult): QueryChain {
  const chain = {} as QueryChain;
  for (const method of ['eq', 'neq', 'order', 'contains', 'ilike', 'filter', 'range', 'gte', 'lte', 'lt', 'gt', 'limit', 'delete'] as const) {
    chain[method] = jasmine.createSpy(method).and.callFake(function (this: QueryChain) { return this; });
  }
  chain.select = jasmine.createSpy('select').and.callFake(function (this: QueryChain, cols: string) {
    const view = Object.create(this) as QueryChain;
    view.then = (resolve) => resolve(chain.resultBySelect?.[cols] ?? chain.result);
    return view;
  });
  // `.maybeSingle()` tanca la consulta d'una sola sessió: retorna la resposta,
  // no la cadena. `singleResult` deixa que un test contesti una fila solta
  // sense tocar el que contesten les consultes de llista.
  chain.maybeSingle = jasmine.createSpy('maybeSingle').and.callFake(() =>
    Promise.resolve(chain.singleResult ?? chain.result));
  chain.result = result;
  chain.then = (resolve) => resolve(chain.result);
  return chain;
}

/** A Supabase `workouts` row as the service reads it (snake_case). */
function row(id: string, date: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, date, entries: [], categories: [], status: 'done',
    created_at: `${date}T08:00:00.000Z`,
    ...extra,
  };
}

describe('WorkoutService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let fromSpy: jasmine.Spy;
  let workoutsChain: ReturnType<typeof makeQueryChain>;
  let service: WorkoutService;
  let pendingIds: ReturnType<typeof signal<string[]>>;
  /** `activity_feed`: la consulta per trams. `feedRows` és el que contesta. */
  let rpcSpy: jasmine.Spy;
  let feedRows: Record<string, unknown>[];
  /** El que la rutina proposa per a cada dia, per data. Buit = cap rutina. */
  let routinePlan: Map<string, ProjectedGym[]>;
  let dismissRoutine: jasmine.Spy;
  let vanished: ReturnType<typeof signal<{ id: string; date: string; at: number } | null>>;
  /** The realtime callback the service registered, so a test can play the part
   *  of the other device. */
  let onRemoteChange: (payload: Record<string, unknown>) => void;

  function setup(): void {
    uid = signal<string | null>('user-1');
    pendingIds = signal<string[]>([]);
    vanished = signal<{ id: string; date: string; at: number } | null>(null);
    workoutsChain = makeQueryChain({ data: [], count: 0, error: null });
    feedRows = [];
    rpcSpy = jasmine.createSpy('rpc').and.callFake(() =>
      Promise.resolve({ data: feedRows, error: null }));
    routinePlan    = new Map();
    dismissRoutine = jasmine.createSpy('dismiss').and.resolveTo(undefined);

    fromSpy = jasmine.createSpy('from').and.callFake((table: string) =>
      table === 'workouts' ? workoutsChain : makeQueryChain({ data: [], count: 0, error: null }));

    const channelStub = {
      on: jasmine.createSpy('on').and.callFake((_event: string, _filter: unknown, cb: (p: Record<string, unknown>) => void) => {
        onRemoteChange = cb;
        return channelStub;
      }),
      subscribe: jasmine.createSpy('subscribe'),
      unsubscribe: jasmine.createSpy('unsubscribe'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: {
          client: { from: fromSpy, channel: () => channelStub, rpc: rpcSpy },
        } },
        { provide: ExerciseService, useValue: { getById: () => undefined } },
        { provide: RoutineProjectionService, useValue: {
          hasRoutine:   () => routinePlan.size > 0,
          projectedFor: (date: string) => ({ gym: routinePlan.get(date) ?? [], sport: [] }),
          dismiss:      dismissRoutine,
          materialized: dismissRoutine,
        } },
        { provide: SyncService,     useValue: {
          notifyPending: jasmine.createSpy('notifyPending'),
          pendingIds:    () => pendingIds(),
          pendingCount:  signal(0),
          vanished,
          flush:         jasmine.createSpy('flush'),
        } },
      ],
    });
    service = TestBed.inject(WorkoutService);
    TestBed.flushEffects();
  }

  beforeEach(async () => {
    localStorage.clear();
    setup();
    // En arrencar ja surten la consulta de canvis i el tram recent. Si un test
    // comença amb elles encara en vol, la guarda de «consulta en marxa» li fa
    // tornar la resposta d'abans i el test mesura una altra cosa.
    await new Promise(resolve => setTimeout(resolve, 0));
  });
  afterEach(() => localStorage.clear());

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

  // ── Sincronització entre dispositius ──────────────────────────────────────
  //
  // El mòbil i l'ordinador han d'ensenyar el mateix. El que ho trencava era
  // llegir, no escriure: un mes carregat no es tornava a demanar mai, el
  // realtime només refrescava «avui» i el que hi havia a la cau i el servidor
  // ja no retornava es quedava enganxat.
  describe('sincronització entre dispositius', () => {
    /** Quantes consultes de tram (`activity_feed`) s'han fet. */
    function feedCallCount(): number {
      return rpcSpy.calls.allArgs().filter(args => args[0] === 'activity_feed').length;
    }

    it('no torna a demanar un mes ja carregat, però sí quan es força', async () => {
      await service.ensureMonthLoaded(2024, 2);
      const calls = feedCallCount();

      await service.ensureMonthLoaded(2024, 2);
      expect(feedCallCount()).toBe(calls);

      await service.ensureMonthLoaded(2024, 2, true);
      expect(feedCallCount()).toBe(calls + 1);
    });

    it('refreshLoaded() torna a demanar el que ja tenim carregat', async () => {
      await service.ensureMonthLoaded(2024, 2);
      const calls = feedCallCount();

      await service.refreshLoaded(true);

      expect(feedCallCount()).toBeGreaterThan(calls);
    });

    it('refreshLoaded() es conté si s\'acaba de refrescar', async () => {
      await service.ensureMonthLoaded(2024, 2);
      await service.refreshLoaded(true);
      const calls = feedCallCount();

      await service.refreshLoaded(); // tornar a l'app dispara focus i visibilitychange alhora

      expect(feedCallCount()).toBe(calls);
    });

    // El refresc era una petició **per cada mes** que haguessis arribat a
    // mirar, i dues si comptem els esports: scrollar el calendari mig any
    // enrere deixava l'app fent-ne una dotzena a cada canvi de pestanya.
    it('refrescar no creix amb els mesos que has mirat', async () => {
      for (let m = 0; m < 6; m++) await service.ensureMonthLoaded(2024, m);
      const before = feedCallCount();

      await service.refreshLoaded(true);

      expect(feedCallCount()).toBe(before + 1);
    });

    it('treu una sessió que el servidor ja no retorna (esborrada des d\'un altre dispositiu)', async () => {
      feedRows = [{
        kind: 'workout', item_id: 'w1', item_date: '2024-03-06', item_status: 'done',
        planned_source: null, feeling: null, notes: null,
        created_at: '2024-03-06T08:00:00.000Z', updated_at: null,
        category: null, categories: [], exercise_names: null,
        exercise_count: 0, set_count: 0, warmup_count: 0, volume: 0,
        sport_id: null, subtype_id: null, duration: null, metrics: null,
      }];
      await service.ensureMonthLoaded(2024, 2);
      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(1);

      feedRows = [];
      await service.ensureMonthLoaded(2024, 2, true);

      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(0);
    });

    it('conserva el que encara no s\'ha pogut enviar', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      pendingIds.set([id]);

      workoutsChain.result = { data: [], count: 0, error: null };
      await service.ensureMonthLoaded(2024, 2, true);

      expect(service.getWorkoutsForDate('2024-03-06').map(w => w.id)).toEqual([id]);
    });

    it('conserva el que s\'ha registrat mentre la consulta viatjava', async () => {
      const loading = service.ensureMonthLoaded(2024, 2);
      const id = await service.createWorkoutForDate('2024-03-06');
      await loading;

      expect(service.getWorkoutsForDate('2024-03-06').map(w => w.id)).toEqual([id]);
    });

    it('es queda amb el que té si la consulta falla', async () => {
      feedRows = [{
        kind: 'workout', item_id: 'w1', item_date: '2024-03-06', item_status: 'done',
        planned_source: null, feeling: null, notes: null,
        created_at: '2024-03-06T08:00:00.000Z', updated_at: null,
        category: null, categories: [], exercise_names: null,
        exercise_count: 0, set_count: 0, warmup_count: 0, volume: 0,
        sport_id: null, subtype_id: null, duration: null, metrics: null,
      }];
      await service.ensureMonthLoaded(2024, 2);

      rpcSpy.and.callFake(() => Promise.resolve({ data: null, error: new Error('network') }));
      await service.ensureMonthLoaded(2024, 2, true);

      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(1);
    });

    it('aplica un canvi remot a qualsevol data, no només a avui', () => {
      onRemoteChange({ eventType: 'UPDATE', new: row('w9', '2024-03-06', { notes: 'des del mòbil' }), old: {} });

      expect(service.getWorkoutsForDate('2024-03-06')[0].notes).toBe('des del mòbil');
    });

    it('mou una sessió de mes si la data ha canviat des d\'un altre dispositiu', () => {
      onRemoteChange({ eventType: 'UPDATE', new: row('w9', '2024-03-06'), old: {} });
      onRemoteChange({ eventType: 'UPDATE', new: row('w9', '2024-04-02'), old: {} });

      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(0);
      expect(service.getWorkoutsForDate('2024-04-02').map(w => w.id)).toEqual(['w9']);
    });

    it('esborra el que s\'ha esborrat des d\'un altre dispositiu', () => {
      onRemoteChange({ eventType: 'INSERT', new: row('w9', '2024-03-06'), old: {} });
      onRemoteChange({ eventType: 'DELETE', new: {}, old: { id: 'w9' } });

      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(0);
    });

    it('no trepitja amb la versió del servidor el que encara no s\'ha enviat', async () => {
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 60, reps: 8 }] });
      pendingIds.set([id]);

      onRemoteChange({ eventType: 'UPDATE', new: row(id, '2024-03-06'), old: {} });

      expect(service.getWorkoutForDate('2024-03-06')!.entries.length).toBe(1);
    });

    it('la versió del servidor mana sobre una còpia vella de la cau', async () => {
      const entriesWith = (weight: number) => [{ exerciseId: 'e1', exerciseName: 'E', sets: [{ weight, reps: 5 }] }];
      workoutsChain.result = { data: [row('w1', '2024-03-06', { entries: entriesWith(50) })], count: 1, error: null };
      await service.ensureMonthLoaded(2024, 2);

      workoutsChain.result = { data: [row('w1', '2024-03-06', { entries: entriesWith(60) })], count: 1, error: null };
      await service.loadWorkoutsForExercise('e1');

      expect(service.getWorkoutForDate('2024-03-06')!.entries[0].sets[0].weight).toBe(60);
    });

    it('loadAllWorkouts() també refresca el que ja era a la cau', async () => {
      workoutsChain.result = { data: [row('w1', '2024-03-06', { notes: 'vell' })], count: 1, error: null };
      await service.ensureMonthLoaded(2024, 2);

      workoutsChain.result = { data: [row('w1', '2024-03-06', { notes: 'nou' })], count: 1, error: null };
      await service.loadAllWorkouts();

      expect(service.getWorkoutForDate('2024-03-06')!.notes).toBe('nou');
    });
  });

  describe('escala: consultes d\'abast obert', () => {
    it('demana les sessions d\'un exercici per contenció de jsonb, no convertint el blob a text', async () => {
      await service.loadWorkoutsForExercise('ex-1');

      // `entries::text ilike …` obliga el servidor a llegir i convertir cada
      // entrenament de l'usuari, i cap índex hi pot ajudar. La contenció va
      // per l'índex GIN de la migració 029.
      expect(workoutsChain.contains).toHaveBeenCalledWith('entries', '[{"exerciseId":"ex-1"}]');
      expect(workoutsChain.filter).not.toHaveBeenCalled();
    });

    it('recorre l\'historial sencer per trams i amb un ordre total', async () => {
      await service.loadAllWorkouts();

      expect(workoutsChain.range).toHaveBeenCalled();
      // Amb l'ordre només per data, dues sessions del mateix dia poden caure
      // entre dos trams i no sortir a cap.
      expect(workoutsChain.order).toHaveBeenCalledWith('date', { ascending: false });
      expect(workoutsChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(workoutsChain.order).toHaveBeenCalledWith('id', { ascending: false });
    });

    it('no dedueix cap esborrat d\'una resposta que ha fallat a mig recórrer', async () => {
      workoutsChain.result = { data: [row('w1', '2024-03-06')], count: 1, error: null };
      await service.refreshLoaded(true);   // la consulta de canvis la porta sencera
      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(1);

      workoutsChain.result = { data: null, count: 0, error: new Error('network') };
      await service.loadAllWorkouts();

      // La sessió continua al dispositiu: una resposta incompleta no és prova
      // que s'hagi esborrat des d'un altre lloc.
      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(1);
    });

    it('no s\'endú columnes que ningú llegeix', async () => {
      await service.refreshLoaded(true);

      const columns = workoutsChain.select.calls.mostRecent().args[0] as string;
      expect(columns).not.toContain('*');
      // La columna generada repeteix, en text, els noms que ja venen dins
      // d'`entries`: existeix per cercar-hi al servidor, no per baixar-la.
      expect(columns).not.toContain('exercise_names');
      expect(columns).toContain('entries');
      expect(columns).toContain('updated_at');
    });
  });

  describe('consulta de canvis (pull incremental)', () => {
    it('avança el marcador amb l\'hora de les files, no amb la d\'aquest dispositiu', async () => {
      // El mòbil té el rellotge endarrerit: escriu amb una hora que aquest
      // dispositiu ja ha passat. Amb el marcador posat a «ara segons jo»,
      // aquelles files quedaven per sota per sempre i no arribaven mai.
      workoutsChain.result = {
        data: [row('w1', '2024-03-06', { updated_at: '2024-03-06T10:00:00.000Z' })],
        count: 1, error: null,
      };

      await service.refreshLoaded(true);
      await service.refreshLoaded(true);

      const cursors = workoutsChain.gte.calls.allArgs()
        .filter(([col]) => col === 'updated_at')
        .map(([, value]) => value);
      expect(cursors).toContain('2024-03-06T10:00:00.000Z');
    });

    it('demana des del marcador inclòs, per no perdre empats a la frontera', async () => {
      workoutsChain.result = {
        data: [row('w1', '2024-03-06', { updated_at: '2024-03-06T10:00:00.000Z' })],
        count: 1, error: null,
      };

      await service.refreshLoaded(true);
      await service.refreshLoaded(true);

      // `gt` es deixaria les files que comparteixen l'hora del marcador;
      // tornar-ne a aplicar una que ja teníem no costa res.
      expect(workoutsChain.gt).not.toHaveBeenCalled();
    });
  });

  describe('índex per exercici', () => {
    async function seedSession(date: string, exerciseId: string, weight: number): Promise<string> {
      const id = await service.createWorkoutForDate(date);
      await service.addExerciseToWorkout(id, { exerciseId, exerciseName: exerciseId, sets: [] });
      await service.addSetsToEntry(id, exerciseId, [{ reps: 5, weight }]);
      return id;
    }

    it('l\'última sessió és la més recent de l\'exercici, excloent la d\'ara', async () => {
      await seedSession('2024-03-01', 'ex-1', 60);
      await seedSession('2024-03-08', 'ex-1', 70);
      const today = await seedSession('2024-03-15', 'ex-1', 80);

      const last = service.getLastSessionEntry('ex-1', today);
      expect(last?.date).toBe('2024-03-08');
      expect(last?.maxWeight).toBe(70);
    });

    it('no barreja exercicis diferents', async () => {
      await seedSession('2024-03-01', 'ex-1', 60);
      await seedSession('2024-03-08', 'ex-2', 90);

      expect(service.getLastSessionEntry('ex-1')?.maxWeight).toBe(60);
      expect(service.getAllTimeMaxWeight('ex-1')).toBe(60);
      expect(service.getAllTimeMaxWeight('ex-2')).toBe(90);
    });

    it('les sessions d\'un exercici surten de la més antiga a la més recent', async () => {
      await seedSession('2024-03-08', 'ex-1', 70);
      await seedSession('2024-03-01', 'ex-1', 60);
      await seedSession('2024-03-15', 'ex-1', 80);

      expect(service.getWorkoutsForExercise('ex-1').map(w => w.date))
        .toEqual(['2024-03-01', '2024-03-08', '2024-03-15']);
    });

    it('deixa fora els entrenaments planificats', async () => {
      await seedSession('2024-03-01', 'ex-1', 60);
      await service.createPlannedWorkout('2024-03-20', undefined, [
        { exerciseId: 'ex-1', exerciseName: 'ex-1', sets: [] },
      ]);

      expect(service.getWorkoutsForExercise('ex-1').length).toBe(1);
      expect(service.getLastSessionEntry('ex-1')?.date).toBe('2024-03-01');
    });
  });

  // ── Carregat per trams ──────────────────────────────────────────────────
  //
  // L'arrencada demanava un mes per consulta —i per duplicat, perquè els
  // esports viuen a una altra taula— amb totes les sèries de cada sessió, per
  // acabar ensenyant la data, el tipus i tres xifres. Ara hi ha una sola
  // pregunta per tram, sense cap sèrie, i les sèries es demanen en obrir la
  // sessió.
  describe('carregat per trams', () => {
    /** Una fila d'`activity_feed` tal com la torna el servidor. */
    function feedRow(id: string, date: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        kind: 'workout', item_id: id, item_date: date, item_status: 'done',
        planned_source: null, feeling: null, notes: null,
        created_at: `${date}T08:00:00.000Z`, updated_at: null,
        category: null, categories: [], exercise_names: null,
        exercise_count: 0, set_count: 0, warmup_count: 0, volume: 0,
        sport_id: null, subtype_id: null, duration: null, metrics: null,
        ...extra,
      };
    }

    function feedCalls(): unknown[][] {
      return rpcSpy.calls.allArgs().filter(args => args[0] === 'activity_feed');
    }

    it('un tram es demana amb l\'endpoint de rang, no taula a taula', async () => {
      rpcSpy.calls.reset();
      await service.ensureRange('2024-01-01', '2024-03-31');

      const call = feedCalls().at(-1)!;
      expect(call[0]).toBe('activity_feed');
      expect(call[1]).toEqual(jasmine.objectContaining({
        p_from: '2024-01-01', p_to: '2024-03-31',
      }));
    });

    it('el que torna no porta cap sèrie: es veu a la llista però no entra al magatzem', async () => {
      feedRows = [feedRow('vella', '2019-05-04', { set_count: 21, exercise_count: 6, volume: 4200 })];
      await service.ensureRange('2019-05-01', '2019-05-31');

      const found = service.workouts().find(w => w.id === 'vella');
      expect(found).toBeTruthy();
      expect(found!.entriesLoaded).toBeFalse();
      // Les xifres de la targeta hi són sense haver baixat cap sèrie: és tot
      // el sentit del canvi.
      expect(found!.setCount).toBe(21);
      expect(found!.exerciseCount).toBe(6);
      expect(found!.volume).toBe(4200);
      // El magatzem és la còpia bona i tot el que hi entra es puja: una sessió
      // sense sèries que hi entrés la buidaria al servidor.
      expect(TestBed.inject(WorkoutStoreService).has('vella')).toBeFalse();
    });

    it('no torna a demanar un tram que ja té', async () => {
      await service.ensureRange('2024-01-01', '2024-03-31');
      const calls = feedCalls().length;

      await service.ensureRange('2024-02-01', '2024-02-29');

      expect(feedCalls().length).toBe(calls);
    });

    it('dues pantalles que demanen el mateix tram alhora són una sola consulta', async () => {
      rpcSpy.calls.reset();
      await Promise.all([
        service.ensureRange('2024-01-01', '2024-03-31'),
        service.ensureRange('2024-01-01', '2024-03-31'),
      ]);

      expect(feedCalls().length).toBe(1);
    });

    it('demanar un mes d\'esports no és cap petició si el tram ja hi és', async () => {
      await service.ensureRange('2024-01-01', '2024-03-31');
      const calls = feedCalls().length;

      await service.ensureMonthLoaded(2024, 1); // febrer

      expect(feedCalls().length).toBe(calls);
    });

    it('ensureWorkoutEntries() baixa la sessió sencera i la deixa editable', async () => {
      feedRows = [feedRow('vella', '2019-05-04')];
      await service.ensureRange('2019-05-01', '2019-05-31');

      workoutsChain.singleResult = {
        data: row('vella', '2019-05-04', {
          entries: [{ exerciseId: 'ex1', exerciseName: 'Press banca', sets: [{ weight: 80, reps: 8 }] }],
        }),
        error: null,
      };
      await service.ensureWorkoutEntries('vella');

      const w = service.workouts().find(x => x.id === 'vella')!;
      expect(w.entriesLoaded).not.toBeFalse();
      expect(w.entries[0].sets.length).toBe(1);
      expect(TestBed.inject(WorkoutStoreService).has('vella')).toBeTrue();
    });

    it('no demana res d\'una sessió que ja tenim sencera', async () => {
      await service.createWorkoutForDate('2024-03-06');
      const id = service.getWorkoutForDate('2024-03-06')!.id;
      const calls = workoutsChain.maybeSingle.calls.count();

      await service.ensureWorkoutEntries(id);

      expect(workoutsChain.maybeSingle.calls.count()).toBe(calls);
    });

    // Cada senyal que canviava mentre la consulta viatjava en disparava una
    // altra, i l'app arrencava baixant l'historial tres o quatre vegades.
    it('dues peticions alhora de tot l\'historial són una sola consulta', async () => {
      const calls = workoutsChain.select.calls.count();

      await Promise.all([service.loadAllWorkouts(), service.loadAllWorkouts()]);

      expect(workoutsChain.select.calls.count()).toBe(calls + 1);
    });

    // Una resposta de tram cobreix el tram sencer, o sigui que diu qui hi ha
    // de ser: és l'única cosa que veu el que s'ha esborrat des d'un altre
    // dispositiu, perquè una fila esborrada no surt a cap consulta de canvis.
    it('el que ja no hi és al tram marxa del dispositiu', async () => {
      const store = TestBed.inject(WorkoutStoreService);
      const id = await service.createWorkoutForDate('2024-03-06');
      store.ackUpsert(id, store.record(id)!.rev);
      expect(store.has(id)).toBeTrue();

      feedRows = [];
      await service.ensureRange('2024-03-01', '2024-03-31', true);
      TestBed.flushEffects();

      expect(store.has(id)).toBeFalse();
    });

    it('el que encara espera pujar no el treu ningú', async () => {
      const store = TestBed.inject(WorkoutStoreService);
      const id = await service.createWorkoutForDate('2024-03-06');

      feedRows = [];
      await service.ensureRange('2024-03-01', '2024-03-31', true);
      TestBed.flushEffects();

      expect(store.has(id)).toBeTrue();
    });
  });

  // ── Local primer ─────────────────────────────────────────────────────────
  // El que l'usuari fa s'ha de guardar al dispositiu abans i independentment
  // de qualsevol resposta del servidor, i sobreviure a tancar l'app.
  describe('primer al dispositiu, després al servidor', () => {
    it('un entrenament registrat sense connexió queda guardat i esperant pujar', async () => {
      const store = TestBed.inject(WorkoutStoreService);
      const id = await service.createWorkoutForDate('2024-03-06', 'push');
      await service.addExerciseToWorkout(id, { exerciseId: 'ex1', exerciseName: 'Press banca', sets: [] });
      await service.addSetsToEntry(id, 'ex1', [{ weight: 80, reps: 8 }]);

      expect(store.get(id)!.entries[0].sets.length).toBe(1);
      expect(store.isPending(id)).toBeTrue();

      // I hi continua sent després de tancar i tornar a obrir l'app.
      store.reset();
      store.hydrate('user-1');
      expect(store.get(id)!.entries[0].sets.length).toBe(1);
    });

    it('una resposta del servidor no esborra les sèries que encara no han pujat', async () => {
      const store = TestBed.inject(WorkoutStoreService);
      const id = await service.createWorkoutForDate('2024-03-06');
      await service.addExerciseToWorkout(id, { exerciseId: 'ex1', exerciseName: 'Press banca', sets: [] });
      await service.addSetsToEntry(id, 'ex1', [{ weight: 80, reps: 8 }]);

      // El servidor encara té la versió buida del moment de l'alta, i el
      // realtime ens la torna: acceptar-la seria perdre l'entrenament.
      onRemoteChange({
        eventType: 'UPDATE',
        new: { id, date: '2024-03-06', entries: [], user_id: 'user-1', created_at: '2024-03-06T08:00:00Z' },
      });

      expect(store.get(id)!.entries[0].sets.length).toBe(1);
    });

    it('esborrar sense connexió no falla i deixa constància per al servidor', async () => {
      const store = TestBed.inject(WorkoutStoreService);
      const id = await service.createWorkoutForDate('2024-03-06');
      store.ackUpsert(id, store.record(id)!.rev);   // el servidor ja la té

      await service.deleteWorkout(id);

      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(0);
      expect(store.tombstones().map(t => t.id)).toEqual([id]);
    });
  });


  // ── La rutina, projectada ────────────────────────────────────────────────
  //
  // Establir una rutina escrivia 91 entrenaments planificats —tretze setmanes
  // per set dies— i els reescrivia a cada canvi, per dir una cosa que ja
  // consta a `user_settings.weeklyPlan`. Ara es calcula, i el que s'escriu és
  // el que l'usuari acaba fent.
  describe('la rutina es projecta, no s\'escriu', () => {
    /** Una data futura: la projecció només mira endavant, i una rutina que no
     *  vas complir el mes passat no és un planificat pendent. */
    function future(days = 2): string {
      return addDays(service.todayDateString(), days);
    }

    /** El que la rutina proposa per a un dia. */
    function routineOn(date: string, category: string): void {
      routinePlan.set(date, [{
        id: routineGymId(date, category), date, category,
        entries: [{ exerciseId: 'ex1', exerciseName: 'Press banca', sets: [] }],
      }]);
    }

    it('el que proposa la rutina surt com a planificat sense ser cap fila', () => {
      const date = future();
      routineOn(date, 'push');

      const planned = service.getPlannedForDate(date);
      expect(planned.length).toBe(1);
      expect(planned[0].category).toBe('push');
      expect(planned[0].plannedSource).toBe('routine');
      expect(TestBed.inject(WorkoutStoreService).has(planned[0].id)).toBeFalse();
    });

    it('un dia que ja té aquell tipus no es proposa dues vegades', async () => {
      const date = future();
      await service.createWorkoutForDate(date, 'push');
      routineOn(date, 'push');

      expect(service.getPlannedForDate(date).length).toBe(0);
    });

    it('un altre tipus el mateix dia sí que es proposa', async () => {
      const date = future();
      await service.createWorkoutForDate(date, 'pull');
      routineOn(date, 'push');

      expect(service.getPlannedForDate(date).map(w => w.category)).toEqual(['push']);
    });

    // Una rutina que no vas complir el mes passat no és un planificat pendent:
    // és un dia que no vas entrenar.
    it('no es proposa res cap enrere', () => {
      const past = addDays(service.todayDateString(), -3);
      routineOn(past, 'push');

      expect(service.getPlannedForDate(past).length).toBe(0);
    });

    // És tot el sentit del canvi: a la base de dades hi va el que has fet.
    it('començar-lo el converteix en un entrenament de debò', async () => {
      const date = future();
      routineOn(date, 'push');
      const projected = service.getPlannedForDate(date)[0];

      const id = await service.startPlannedWorkout(projected.id);

      expect(id).not.toBe(projected.id);
      const store = TestBed.inject(WorkoutStoreService);
      expect(store.has(id)).toBeTrue();
      expect(store.get(id)!.date).toBe(date);
      expect(store.get(id)!.entries.map(e => e.exerciseId)).toEqual(['ex1']);
      // I el dia queda retirat de la proposta, per no sortir dues vegades.
      expect(dismissRoutine).toHaveBeenCalledWith(projected.id);
    });

    it('esborrar-lo és treure el dia de la rutina, no esborrar cap fila', async () => {
      const date = future();
      routineOn(date, 'push');
      const projected = service.getPlannedForDate(date)[0];

      await service.deleteWorkout(projected.id);

      expect(dismissRoutine).toHaveBeenCalledWith(projected.id);
      expect(workoutsChain.delete).not.toHaveBeenCalled();
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
