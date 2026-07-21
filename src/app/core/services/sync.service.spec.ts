import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SyncService } from './sync.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { Workout } from '../models/workout.model';

interface MutationChain {
  upsert: jasmine.Spy; update: jasmine.Spy; delete: jasmine.Spy; eq: jasmine.Spy;
  then: (resolve: (v: { error?: unknown }) => void) => void;
}

/** Chainable mutation stub: every method returns the same object and it
 *  resolves like a real supabase-js query when awaited. */
function makeMutationChain(result: { error?: unknown }): MutationChain {
  const chain = {} as MutationChain;
  for (const method of ['upsert', 'update', 'delete', 'eq'] as const) {
    chain[method] = jasmine.createSpy(method).and.callFake(() => chain);
  }
  chain.then = (resolve) => resolve(result);
  return chain;
}

function makeWorkout(id: string, date = '2026-07-20'): Workout {
  return { id, date, entries: [], categories: [], createdAt: new Date(), status: 'done' };
}

describe('SyncService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let chain: MutationChain;
  let fromSpy: jasmine.Spy;
  let service: SyncService;

  function setup(startUid: string | null = 'user-1'): void {
    uid = signal<string | null>(startUid);
    chain = makeMutationChain({ error: null });
    fromSpy = jasmine.createSpy('from').and.callFake(() => chain);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: { client: { from: fromSpy } } },
      ],
    });
    service = TestBed.inject(SyncService);
    TestBed.flushEffects();
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    // Debounced flush timers from markDirty()/markDeleted() may fire after
    // the test — signing the service out makes those late flushes no-ops.
    uid?.set(null);
  });

  describe('markDirty()', () => {
    it('stores the snapshot and tracks the pending id', () => {
      setup();
      service.markDirty('w1', makeWorkout('w1'), true);

      expect(service.pendingCount()).toBe(1);
      expect(service.status()).toBe('pending');
      expect(service.pendingIds()).toEqual(['w1']);
      expect(service.isInsert('w1')).toBeTrue();
      expect(service.getSnapshot('w1')?.id).toBe('w1');
    });

    it('does nothing when signed out', () => {
      setup(null);
      service.markDirty('w1', makeWorkout('w1'));
      expect(service.pendingCount()).toBe(0);
      expect(service.pendingIds()).toEqual([]);
    });
  });

  describe('flush()', () => {
    it('upserts inserts, updates edits, and marks them clean on success', async () => {
      setup();
      service.markDirty('w-new', makeWorkout('w-new'), true);
      service.markDirty('w-old', makeWorkout('w-old'));

      await service.flush();

      expect(chain.upsert).toHaveBeenCalledTimes(1); // the insert
      expect(chain.update).toHaveBeenCalledTimes(1); // the edit
      expect(service.pendingCount()).toBe(0);
      expect(service.status()).toBe('synced');
      expect(service.getSnapshot('w-new')).toBeNull();
    });

    it('keeps the id pending with backoff when the server rejects it', async () => {
      setup();
      chain = makeMutationChain({ error: new Error('boom') });
      fromSpy.and.callFake(() => chain);
      service.markDirty('w1', makeWorkout('w1'), true);

      await service.flush();
      expect(service.status()).toBe('error');
      expect(service.pendingIds()).toEqual(['w1']);

      // Within the backoff window a new flush must not retry yet
      chain.upsert.calls.reset();
      await service.flush();
      expect(chain.upsert).not.toHaveBeenCalled();
    });

    it('drops ids whose snapshot is gone instead of failing forever', async () => {
      setup();
      service.markDirty('w1', makeWorkout('w1'));
      localStorage.removeItem(`gymgoli_sync_snap_user-1_w1`);

      await service.flush();
      expect(service.pendingCount()).toBe(0);
      expect(service.status()).toBe('synced');
    });
  });

  describe('queued deletes', () => {
    it('markDeleted() supersedes a pending edit and queues the delete', () => {
      setup();
      service.markDirty('w1', makeWorkout('w1'));
      service.markDeleted('w1');

      expect(service.pendingIds()).toEqual([]);          // edit dropped
      expect(service.pendingDeleteIds()).toEqual(['w1']); // delete queued
      expect(service.pendingCount()).toBe(1);
      expect(service.status()).toBe('pending');
    });

    it('flush() sends the delete and clears the queue on success', async () => {
      setup();
      service.markDeleted('w1');

      await service.flush();

      expect(chain.delete).toHaveBeenCalled();
      expect(chain.eq).toHaveBeenCalledWith('id', 'w1');
      expect(service.pendingDeleteIds()).toEqual([]);
      expect(service.status()).toBe('synced');
    });

    it('keeps the delete queued with backoff when the server rejects it', async () => {
      setup();
      chain = makeMutationChain({ error: new Error('boom') });
      fromSpy.and.callFake(() => chain);
      service.markDeleted('w1');

      await service.flush();
      expect(service.pendingDeleteIds()).toEqual(['w1']);
      expect(service.status()).toBe('error');
    });
  });

  describe('hydration on login', () => {
    it('restores the pending count from localStorage', () => {
      localStorage.setItem('gymgoli_sync_dirty_user-1', JSON.stringify(['w1']));
      localStorage.setItem('gymgoli_sync_deletes_user-1', JSON.stringify(['w2']));

      setup();
      expect(service.pendingCount()).toBe(2);
      expect(service.status()).toBe('pending');
    });

    it('keeps queues per user and resets on logout', () => {
      setup();
      service.markDirty('w1', makeWorkout('w1'));
      expect(service.pendingCount()).toBe(1);

      uid.set(null);
      TestBed.flushEffects();
      expect(service.pendingCount()).toBe(0);
      expect(service.status()).toBe('synced');

      uid.set('user-2');
      TestBed.flushEffects();
      expect(service.pendingIds()).toEqual([]); // user-1's queue not visible
    });
  });

  describe('cancelDirty()', () => {
    it('forgets an insert that never reached the server', () => {
      setup();
      service.markDirty('w1', makeWorkout('w1'), true);
      service.cancelDirty('w1');

      expect(service.pendingCount()).toBe(0);
      expect(service.isInsert('w1')).toBeFalse();
      expect(service.getSnapshot('w1')).toBeNull();
      expect(service.status()).toBe('synced');
    });
  });
});
