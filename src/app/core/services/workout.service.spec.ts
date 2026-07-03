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
        { provide: ExerciseService, useValue: {} },
        { provide: SyncService,     useValue: {} },
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
});
