import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SyncService } from './sync.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { Workout } from '../models/workout.model';

const UID = 'user-1';
const RETRY_MS = 60_000;

interface WriteResult { error: { message: string } | null; }

function makeWorkout(id = 'w1'): Workout {
  return { id, date: '2026-01-15', entries: [], categories: [], createdAt: new Date() };
}

describe('SyncService', () => {
  let service: SyncService;
  let upsertSpy: jasmine.Spy;
  let writeResult: WriteResult;
  let online: boolean;

  beforeEach(() => {
    localStorage.clear();
    writeResult = { error: null };
    online      = true;

    spyOnProperty(Navigator.prototype, 'onLine', 'get').and.callFake(() => online);

    upsertSpy = jasmine.createSpy('upsert').and.callFake(() => Promise.resolve(writeResult));
    const fromSpy = jasmine.createSpy('from').and.returnValue({ upsert: upsertSpy });

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid: signal(UID) } },
        { provide: SupabaseService, useValue: { client: { from: fromSpy } } },
      ],
    });

    service = TestBed.inject(SyncService);
    TestBed.flushEffects();
  });

  afterEach(() => localStorage.clear());

  /** Queues one insert and lets the 3s debounce fire its first attempt. */
  function queueAndFlush(id = 'w1'): void {
    service.markDirty(id, makeWorkout(id), true);
    tick(3000);
  }

  // ── Periodic retry ────────────────────────────────────────────────────────

  describe('periodic retry', () => {
    it('retries on its own while the queue still has workouts', fakeAsync(() => {
      writeResult = { error: { message: 'invalid input value for enum' } };
      queueAndFlush();

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      expect(service.status()).toBe('error');
      expect(service.pendingCount()).toBe(1);

      writeResult = { error: null };
      tick(RETRY_MS);

      expect(upsertSpy).toHaveBeenCalledTimes(2);
      expect(service.pendingCount()).toBe(0);
      expect(service.status()).toBe('synced');

      discardPeriodicTasks();
    }));

    it('keeps retrying every minute for as long as the write fails', fakeAsync(() => {
      writeResult = { error: { message: 'nope' } };
      queueAndFlush();

      tick(RETRY_MS);
      tick(RETRY_MS);

      expect(upsertSpy).toHaveBeenCalledTimes(3);
      expect(service.pendingCount()).toBe(1);

      discardPeriodicTasks();
    }));

    it('stops the ticker once the queue drains', fakeAsync(() => {
      queueAndFlush();
      expect(service.pendingCount()).toBe(0);

      const callsAfterSync = upsertSpy.calls.count();
      tick(RETRY_MS * 3);

      expect(upsertSpy).toHaveBeenCalledTimes(callsAfterSync);
      discardPeriodicTasks();
    }));

    it('does not hit the network while offline', fakeAsync(() => {
      writeResult = { error: { message: 'nope' } };
      queueAndFlush();
      expect(upsertSpy).toHaveBeenCalledTimes(1);

      online = false;
      tick(RETRY_MS * 2);

      expect(upsertSpy).toHaveBeenCalledTimes(1);
      discardPeriodicTasks();
    }));
  });

  // ── Manual retry ──────────────────────────────────────────────────────────

  describe('retryNow()', () => {
    it('ignores the per-workout backoff and resolves true once drained', fakeAsync(() => {
      writeResult = { error: { message: 'nope' } };
      queueAndFlush();
      expect(upsertSpy).toHaveBeenCalledTimes(1);

      // The failure just armed a 5s backoff window — the manual retry must
      // not wait it out.
      writeResult = { error: null };
      let result: boolean | undefined;
      service.retryNow().then(r => (result = r));
      tick();

      expect(upsertSpy).toHaveBeenCalledTimes(2);
      expect(result).toBeTrue();
      expect(service.pendingCount()).toBe(0);

      discardPeriodicTasks();
    }));

    it('resolves false and keeps the queue when the write still fails', fakeAsync(() => {
      writeResult = { error: { message: 'still nope' } };
      queueAndFlush();

      let result: boolean | undefined;
      service.retryNow().then(r => (result = r));
      tick();

      expect(result).toBeFalse();
      expect(service.pendingCount()).toBe(1);
      expect(service.status()).toBe('error');

      discardPeriodicTasks();
    }));

    it('reports the lack of connection instead of trying', fakeAsync(() => {
      writeResult = { error: { message: 'nope' } };
      queueAndFlush();
      const calls = upsertSpy.calls.count();

      online = false;
      let result: boolean | undefined;
      service.retryNow().then(r => (result = r));
      tick();

      expect(result).toBeFalse();
      expect(upsertSpy).toHaveBeenCalledTimes(calls);
      expect(service.lastError()).toBe('Sense connexió');

      discardPeriodicTasks();
    }));
  });

  // ── Error reporting ───────────────────────────────────────────────────────

  describe('lastError', () => {
    it('surfaces the server message verbatim', fakeAsync(() => {
      writeResult = { error: { message: 'invalid input value for enum exercise_category_t' } };
      queueAndFlush();

      expect(service.lastError()).toBe('invalid input value for enum exercise_category_t');

      discardPeriodicTasks();
    }));

    it('clears once everything is stored', fakeAsync(() => {
      writeResult = { error: { message: 'nope' } };
      queueAndFlush();
      expect(service.lastError()).not.toBeNull();

      writeResult = { error: null };
      tick(RETRY_MS);

      expect(service.lastError()).toBeNull();
      discardPeriodicTasks();
    }));
  });
});
