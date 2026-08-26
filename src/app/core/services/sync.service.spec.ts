import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SyncService } from './sync.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Workout } from '../models/workout.model';

const UID      = 'user-1';
const TICK_MS  = 60_000;
const DEBOUNCE = 3_000;

interface Rejection { message: string; code?: string; status?: number; }

function makeWorkout(id = 'w1', overrides: Partial<Workout> = {}): Workout {
  return {
    id, date: '2026-01-15', entries: [], categories: [],
    createdAt: new Date('2026-01-15T10:00:00Z'), ...overrides,
  };
}

describe('SyncService', () => {
  let service: SyncService;
  let uid: ReturnType<typeof signal<string | null>>;
  let online: boolean;

  /** Null = the write succeeds. */
  let upsertRejection: Rejection | null;
  let deleteRejection: Rejection | null;
  /** Rows the server claims to hold, for the reconciliation query. */
  let serverRows: { id: string; updated_at: string | null }[];

  let upsertSpy: jasmine.Spy;
  let deleteSpy: jasmine.Spy;
  let selectSpy: jasmine.Spy;

  function makeClient() {
    // upsert(...).select(...).maybeSingle()
    upsertSpy = jasmine.createSpy('upsert').and.callFake(() => ({
      select: () => ({
        maybeSingle: () => Promise.resolve(
          upsertRejection ? { data: null, error: upsertRejection } : { data: { id: 'w1' }, error: null }
        ),
      }),
    }));

    // delete().eq().eq()
    deleteSpy = jasmine.createSpy('delete').and.callFake(() => {
      const chain = {
        eq: jasmine.createSpy('eq').and.callFake(() => chain),
        then: (resolve: (v: unknown) => void) =>
          resolve(deleteRejection ? { error: deleteRejection } : { error: null }),
      };
      return chain;
    });

    // select('id, updated_at').eq().in()
    selectSpy = jasmine.createSpy('select').and.callFake(() => {
      const chain = {
        eq: jasmine.createSpy('eq').and.callFake(() => chain),
        in: jasmine.createSpy('in').and.callFake(() => Promise.resolve({ data: serverRows, error: null })),
      };
      return chain;
    });

    return { client: { from: () => ({ upsert: upsertSpy, delete: deleteSpy, select: selectSpy }) } };
  }

  beforeEach(() => {
    localStorage.clear();
    online          = true;
    upsertRejection = null;
    deleteRejection = null;
    serverRows      = [];
    uid             = signal<string | null>(UID);

    spyOnProperty(Navigator.prototype, 'onLine', 'get').and.callFake(() => online);

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: makeClient() },
      ],
    });

    service = TestBed.inject(SyncService);
    TestBed.flushEffects();
  });

  afterEach(() => localStorage.clear());

  /** Queues a write and lets the debounce fire its first attempt. */
  function queueAndFlush(id = 'w1', overrides: Partial<Workout> = {}): void {
    service.queueUpsert(id, makeWorkout(id, overrides));
    tick(DEBOUNCE);
  }

  // ── Idempotent writes ─────────────────────────────────────────────────────

  describe('writes', () => {
    it('always upserts, so a row the server never received still lands', fakeAsync(() => {
      queueAndFlush();

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.calls.mostRecent().args[1]).toEqual({ onConflict: 'id' });
      expect(service.pendingIds()).toEqual([]);
      expect(service.status()).toBe('synced');
      discardPeriodicTasks();
    }));

    it('keeps the workout queued when the server confirms nothing', fakeAsync(() => {
      upsertSpy.and.returnValue({ select: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) });
      queueAndFlush();

      expect(service.pendingIds()).toEqual(['w1']);
      expect(service.status()).toBe('error');
      discardPeriodicTasks();
    }));

    it('holds only the latest snapshot per workout', fakeAsync(() => {
      service.queueUpsert('w1', makeWorkout('w1', { notes: 'primera' }));
      service.queueUpsert('w1', makeWorkout('w1', { notes: 'segona' }));

      expect(service.pendingIds()).toEqual(['w1']);
      expect(service.getSnapshot('w1')?.notes).toBe('segona');

      tick(DEBOUNCE);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      discardPeriodicTasks();
    }));

    it('queues the snapshot before the id, so a queued id always has a payload', () => {
      service.queueUpsert('w1', makeWorkout());
      expect(service.getSnapshot('w1')).not.toBeNull();
    });
  });

  // ── Deletes ───────────────────────────────────────────────────────────────

  describe('queueDelete()', () => {
    it('survives being offline and goes out when the connection returns', fakeAsync(() => {
      online = false;
      service.queueDelete('w1');
      tick(DEBOUNCE);

      expect(deleteSpy).not.toHaveBeenCalled();
      expect(service.pendingDeleteIds()).toEqual(['w1']);

      online = true;
      void service.flush();
      tick();

      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(service.pendingDeleteIds()).toEqual([]);
      discardPeriodicTasks();
    }));

    it('cancels the queued write for the same workout', fakeAsync(() => {
      service.queueUpsert('w1', makeWorkout());
      service.queueDelete('w1');

      expect(service.pendingIds()).toEqual([]);
      expect(service.getSnapshot('w1')).toBeNull();

      tick(DEBOUNCE);
      expect(upsertSpy).not.toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      discardPeriodicTasks();
    }));

    it('retries a delete the server refused', fakeAsync(() => {
      deleteRejection = { message: 'network down' };
      service.queueDelete('w1');
      tick(DEBOUNCE);
      expect(service.pendingDeleteIds()).toEqual(['w1']);

      deleteRejection = null;
      tick(TICK_MS);

      expect(service.pendingDeleteIds()).toEqual([]);
      discardPeriodicTasks();
    }));
  });

  // ── Retry policy ──────────────────────────────────────────────────────────

  describe('retries', () => {
    it('works the queue on its own every minute while something is pending', fakeAsync(() => {
      upsertRejection = { message: 'connexió perduda' };
      queueAndFlush();
      expect(upsertSpy).toHaveBeenCalledTimes(1);

      upsertRejection = null;
      tick(TICK_MS);

      expect(upsertSpy).toHaveBeenCalledTimes(2);
      expect(service.pendingCount()).toBe(0);
      discardPeriodicTasks();
    }));

    it('stops ticking once the queue drains', fakeAsync(() => {
      queueAndFlush();
      const calls = upsertSpy.calls.count();

      tick(TICK_MS * 3);

      expect(upsertSpy).toHaveBeenCalledTimes(calls);
      discardPeriodicTasks();
    }));

    // The exact instants are jittered on purpose, so this asserts the property
    // that matters: a write that keeps failing costs progressively less, and
    // is still being attempted.
    it('backs off transient failures instead of retrying every tick', fakeAsync(() => {
      upsertRejection = { message: 'timeout' };
      queueAndFlush();

      for (let minute = 0; minute < 10; minute++) tick(TICK_MS);

      const attempts = upsertSpy.calls.count();
      expect(attempts).toBeLessThan(8);      // 11 without any backoff
      expect(attempts).toBeGreaterThan(2);   // and it hasn't given up either
      discardPeriodicTasks();
    }));

    it('parks a rejection the server will keep making', fakeAsync(() => {
      upsertRejection = { message: 'invalid input value for enum', code: '22P02' };
      queueAndFlush();
      expect(upsertSpy).toHaveBeenCalledTimes(1);

      // Half an hour of ticks must not hammer a write only the server can fix.
      tick(TICK_MS * 10);
      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(service.pendingIds()).toEqual(['w1']);
      discardPeriodicTasks();
    }));

    it('gives everything a free attempt when the app reopens, so a fixed server heals the queue', fakeAsync(() => {
      upsertRejection = { message: 'invalid input value for enum', code: '22P02' };
      queueAndFlush();
      expect(upsertSpy).toHaveBeenCalledTimes(1);

      // Same device, next session: the migration has run in between.
      upsertRejection = null;
      uid.set(null);
      TestBed.flushEffects();
      uid.set(UID);
      TestBed.flushEffects();
      tick();

      expect(upsertSpy).toHaveBeenCalledTimes(2);
      expect(service.pendingCount()).toBe(0);
      discardPeriodicTasks();
    }));

    it('never drops a workout on failure', fakeAsync(() => {
      upsertRejection = { message: 'permission denied', code: '42501' };
      queueAndFlush();

      expect(service.pendingIds()).toEqual(['w1']);
      expect(service.getSnapshot('w1')).not.toBeNull();
      discardPeriodicTasks();
    }));
  });

  // ── Reconciliation ────────────────────────────────────────────────────────

  describe('reconciliation on start', () => {
    it('clears a queued write the server already has', fakeAsync(() => {
      service.queueUpsert('w1', makeWorkout('w1', { updatedAt: new Date('2026-01-15T11:00:00Z') }));
      serverRows = [{ id: 'w1', updated_at: '2026-01-15T11:00:00Z' }];

      uid.set(null);
      TestBed.flushEffects();
      uid.set(UID);
      TestBed.flushEffects();
      tick(DEBOUNCE);

      expect(service.pendingIds()).toEqual([]);
      expect(upsertSpy).not.toHaveBeenCalled();
      discardPeriodicTasks();
    }));

    it('does not let a stale snapshot roll back a newer edit from elsewhere', fakeAsync(() => {
      service.queueUpsert('w1', makeWorkout('w1', { updatedAt: new Date('2026-01-15T11:00:00Z') }));
      serverRows = [{ id: 'w1', updated_at: '2026-01-16T09:00:00Z' }];

      uid.set(null);
      TestBed.flushEffects();
      uid.set(UID);
      TestBed.flushEffects();
      tick(DEBOUNCE);

      expect(upsertSpy).not.toHaveBeenCalled();
      discardPeriodicTasks();
    }));

    // Without this the queue's own signals feed back into the start-up effect
    // and every logged set costs a reconciliation round trip.
    it('runs on start, not on every write', fakeAsync(() => {
      queueAndFlush('w1');
      service.queueUpsert('w2', makeWorkout('w2'));
      tick(DEBOUNCE);

      expect(selectSpy).not.toHaveBeenCalled();
      discardPeriodicTasks();
    }));

    it('still sends a snapshot newer than the stored row', fakeAsync(() => {
      service.queueUpsert('w1', makeWorkout('w1', { updatedAt: new Date('2026-01-16T09:00:00Z') }));
      serverRows = [{ id: 'w1', updated_at: '2026-01-15T11:00:00Z' }];

      uid.set(null);
      TestBed.flushEffects();
      uid.set(UID);
      TestBed.flushEffects();
      tick(DEBOUNCE);

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      discardPeriodicTasks();
    }));
  });

  // ── Durability ────────────────────────────────────────────────────────────

  describe('durability', () => {
    it('rebuilds a snapshot localStorage lost instead of dropping the workout', fakeAsync(() => {
      service.setSnapshotResolver(id => (id === 'w1' ? makeWorkout('w1', { notes: 'recuperat' }) : undefined));
      service.queueUpsert('w1', makeWorkout());
      localStorage.removeItem(`gymgoli_sync_snap_${UID}_w1`);

      tick(DEBOUNCE);

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.calls.mostRecent().args[0].notes).toBe('recuperat');
      discardPeriodicTasks();
    }));

    it('keeps the write in memory when localStorage refuses the snapshot', fakeAsync(() => {
      const realSetItem = Storage.prototype.setItem;
      spyOn(Storage.prototype, 'setItem').and.callFake(function (this: Storage, key: string, value: string) {
        if (key.includes('_snap_')) throw new DOMException('QuotaExceededError');
        realSetItem.call(this, key, value);
      });

      service.queueUpsert('w1', makeWorkout('w1', { notes: 'a la memòria' }));
      expect(service.getSnapshot('w1')?.notes).toBe('a la memòria');

      tick(DEBOUNCE);

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(upsertSpy.calls.mostRecent().args[0].notes).toBe('a la memòria');
      discardPeriodicTasks();
    }));

    it('survives a reload with the queue intact', fakeAsync(() => {
      upsertRejection = { message: 'offline' };
      queueAndFlush();
      expect(service.pendingIds()).toEqual(['w1']);

      // A brand-new service instance reading the same localStorage.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: AuthService,     useValue: { uid: signal(UID) } },
          { provide: SupabaseService, useValue: makeClient() },
        ],
      });
      upsertRejection = null;
      const revived = TestBed.inject(SyncService);
      TestBed.flushEffects();
      tick();

      expect(revived.pendingIds()).toEqual([]);
      expect(upsertSpy).toHaveBeenCalled();
      discardPeriodicTasks();
    }));
  });

  // ── Concurrency ───────────────────────────────────────────────────────────

  describe('concurrency', () => {
    it('does not strand a workout queued while a flush is running', fakeAsync(() => {
      let release: (v: unknown) => void = () => {};
      upsertSpy.and.returnValue({
        select: () => ({ maybeSingle: () => new Promise(res => (release = res)) }),
      });

      queueAndFlush('w1');
      service.queueUpsert('w2', makeWorkout('w2'));

      upsertSpy.and.callFake(() => ({
        select: () => ({ maybeSingle: () => Promise.resolve({ data: { id: 'w2' }, error: null }) }),
      }));
      release({ data: { id: 'w1' }, error: null });
      tick(DEBOUNCE);

      expect(service.pendingIds()).toEqual([]);
      discardPeriodicTasks();
    }));

    it('never runs two drains at once', fakeAsync(() => {
      let release: (v: unknown) => void = () => {};
      upsertSpy.and.returnValue({
        select: () => ({ maybeSingle: () => new Promise(res => (release = res)) }),
      });

      queueAndFlush();
      void service.flush();
      void service.flush();
      tick();

      expect(upsertSpy).toHaveBeenCalledTimes(1);

      release({ data: { id: 'w1' }, error: null });
      tick();
      discardPeriodicTasks();
    }));
  });
});
