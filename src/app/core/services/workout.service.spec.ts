import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WorkoutService, matchesHistoryFilters } from './workout.service';
import { Workout } from '../models/workout.model';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { ExerciseService } from './exercise.service';
import { SyncService } from './sync.service';
import { WORKOUT_SUMMARY_COLUMNS, WorkoutStoreService } from './workout-store.service';

interface QueryResult { data?: unknown; count?: number; error?: unknown }

interface QueryChain {
  select: jasmine.Spy; eq: jasmine.Spy; neq: jasmine.Spy; order: jasmine.Spy;
  contains: jasmine.Spy; ilike: jasmine.Spy; filter: jasmine.Spy; range: jasmine.Spy;
  gte: jasmine.Spy; lte: jasmine.Spy; lt: jasmine.Spy; delete: jasmine.Spy;
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
  for (const method of ['eq', 'neq', 'order', 'contains', 'ilike', 'filter', 'range', 'gte', 'lte', 'lt', 'delete'] as const) {
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
  let vanished: ReturnType<typeof signal<{ id: string; date: string; at: number } | null>>;
  /** The realtime callback the service registered, so a test can play the part
   *  of the other device. */
  let onRemoteChange: (payload: Record<string, unknown>) => void;

  function setup(): void {
    uid = signal<string | null>('user-1');
    pendingIds = signal<string[]>([]);
    vanished = signal<{ id: string; date: string; at: number } | null>(null);
    workoutsChain = makeQueryChain({ data: [], count: 0, error: null });

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
        { provide: SupabaseService, useValue: { client: { from: fromSpy, channel: () => channelStub } } },
        { provide: ExerciseService, useValue: { getById: () => undefined } },
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

  beforeEach(() => { localStorage.clear(); setup(); });
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
    it('no torna a demanar un mes ja carregat, però sí quan es força', async () => {
      await service.ensureMonthLoaded(2024, 2);
      const calls = workoutsChain.gte.calls.count();

      await service.ensureMonthLoaded(2024, 2);
      expect(workoutsChain.gte.calls.count()).toBe(calls);

      await service.ensureMonthLoaded(2024, 2, true);
      expect(workoutsChain.gte.calls.count()).toBe(calls + 1);
    });

    it('refreshLoaded() torna a demanar els mesos carregats', async () => {
      await service.ensureMonthLoaded(2024, 2);
      const calls = workoutsChain.gte.calls.count();

      await service.refreshLoaded(true);

      expect(workoutsChain.gte.calls.count()).toBeGreaterThan(calls);
    });

    it('refreshLoaded() es conté si s\'acaba de refrescar', async () => {
      await service.ensureMonthLoaded(2024, 2);
      await service.refreshLoaded(true);
      const calls = workoutsChain.gte.calls.count();

      await service.refreshLoaded(); // tornar a l'app dispara focus i visibilitychange alhora

      expect(workoutsChain.gte.calls.count()).toBe(calls);
    });

    it('treu una sessió que el servidor ja no retorna (esborrada des d\'un altre dispositiu)', async () => {
      workoutsChain.result = { data: [row('w1', '2024-03-06')], count: 1, error: null };
      await service.ensureMonthLoaded(2024, 2);
      expect(service.getWorkoutsForDate('2024-03-06').length).toBe(1);

      workoutsChain.result = { data: [], count: 0, error: null };
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
      workoutsChain.result = { data: [row('w1', '2024-03-06')], count: 1, error: null };
      await service.ensureMonthLoaded(2024, 2);

      workoutsChain.result = { data: null, count: 0, error: new Error('network') };
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
  // ── Local primer ─────────────────────────────────────────────────────────
  // El que l'usuari fa s'ha de guardar al dispositiu abans i independentment
  // de qualsevol resposta del servidor, i sobreviure a tancar l'app.
  // ── Carregat en dos temps ───────────────────────────────────────────────
  //
  // L'arrencada demanava `select('*')` de tota la vida de l'usuari per acabar
  // fent servir la data i el tipus. Ara l'historial vell arriba en mode
  // targeta i les sèries es demanen quan s'obre la sessió.
  describe('carregat en dos temps', () => {
    it('l\'historial vell es demana sense les sèries', async () => {
      await service.loadHistorySummaries();

      expect(workoutsChain.select).toHaveBeenCalledWith(WORKOUT_SUMMARY_COLUMNS);
      expect(workoutsChain.lt).toHaveBeenCalledWith('date', jasmine.any(String));
    });

    it('un resum es veu a la llista però no entra al magatzem', async () => {
      workoutsChain.resultBySelect = {
        [WORKOUT_SUMMARY_COLUMNS]: { data: [row('vella', '2019-05-04')], count: 1, error: null },
      };
      await service.loadHistorySummaries();

      const found = service.workouts().find(w => w.id === 'vella');
      expect(found).toBeTruthy();
      expect(found!.entriesLoaded).toBeFalse();
      // El magatzem és la còpia bona i tot el que hi entra es puja: una sessió
      // sense sèries que hi entrés la buidaria al servidor.
      expect(TestBed.inject(WorkoutStoreService).has('vella')).toBeFalse();
    });

    it('no torna a demanar-lo un cop el té', async () => {
      await service.loadHistorySummaries();
      const calls = workoutsChain.select.calls.count();

      await service.loadHistorySummaries();

      expect(workoutsChain.select.calls.count()).toBe(calls);
    });

    it('ensureWorkoutEntries() baixa la sessió sencera i la deixa editable', async () => {
      workoutsChain.resultBySelect = {
        [WORKOUT_SUMMARY_COLUMNS]: { data: [row('vella', '2019-05-04')], count: 1, error: null },
      };
      await service.loadHistorySummaries();

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

    it('quan arriba tot l\'historial, els resums deixen de pintar res', async () => {
      workoutsChain.resultBySelect = {
        [WORKOUT_SUMMARY_COLUMNS]: { data: [row('vella', '2019-05-04')], count: 1, error: null },
      };
      await service.loadHistorySummaries();
      expect(service.workouts().some(w => w.entriesLoaded === false)).toBeTrue();

      await service.loadAllWorkouts();

      expect(service.workouts().some(w => w.entriesLoaded === false)).toBeFalse();
    });
  });

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
