import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SportService } from './sport.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

const LS_PENDING_KEY = (uid: string) => `gymgoli_sport_pending_${uid}`;

function sportRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'sport-1', name: 'Córrer', icon: 'directions_run', color: '#1E88E5',
    subtypes: [], metric_defs: [], created_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SportService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let sportsData: Record<string, unknown>[];
  let sessionsData: Record<string, unknown>[];
  let insertShouldFail: boolean;
  let service: SportService;
  let supabaseMock: ReturnType<typeof buildMock>;

  function buildMock() {
    const insertSpy = jasmine.createSpy('insert');
    const fromSpy   = jasmine.createSpy('from');

    const selectChain = (data: () => Record<string, unknown>[]): any => {
      const chain: any = {};
      chain.select = jasmine.createSpy('select').and.returnValue(chain);
      chain.eq     = jasmine.createSpy('eq').and.returnValue(chain);
      chain.gte    = jasmine.createSpy('gte').and.returnValue(chain);
      chain.lte    = jasmine.createSpy('lte').and.returnValue(chain);
      chain.order  = jasmine.createSpy('order').and.callFake(() =>
        Promise.resolve({ data: data(), error: null }));
      return chain;
    };

    insertSpy.and.callFake(() => ({
      then: (resolve: (v: { error: unknown }) => void) =>
        resolve(insertShouldFail ? { error: new Error('network error') } : { error: null }),
    }));

    fromSpy.and.callFake((table: string) => {
      if (table === 'sports') {
        return { select: () => selectChain(() => sportsData), insert: insertSpy };
      }
      if (table === 'sport_sessions') {
        return { select: () => selectChain(() => sessionsData), insert: insertSpy };
      }
      return { select: () => selectChain(() => []), insert: insertSpy };
    });

    return { client: { from: fromSpy }, fromSpy, insertSpy };
  }

  function setup(): void {
    localStorage.clear();
    uid = signal<string | null>(null);
    sportsData = [sportRow()];
    sessionsData = [];
    insertShouldFail = false;
    supabaseMock = buildMock();

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: supabaseMock },
      ],
    });
    service = TestBed.inject(SportService);
    TestBed.flushEffects();
  }

  beforeEach(() => setup());
  afterEach(() => localStorage.clear());

  describe('logSession()', () => {
    it('writes the session to local state immediately, before Supabase resolves', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-06', 'running', {}, 'planned');
      // Local write happens synchronously before the network call resolves.
      expect(service.plannedSessions().some(s => s.sportId === 'running')).toBeTrue();
      tick();
    }));

    it('persists the session and does not queue a retry when Supabase succeeds', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-06', 'running', {}, 'planned');
      tick();

      expect(service.plannedSessions().some(s => s.sportId === 'running')).toBeTrue();
      expect(localStorage.getItem(LS_PENDING_KEY('user-1'))).toBeNull();
    }));

    it('keeps the session locally and queues it for retry when Supabase fails (offline)', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertShouldFail = true;

      void service.logSession('2024-03-08', 'running', {}, 'planned');
      tick();

      // Still available locally despite the network failure.
      expect(service.plannedSessions().some(s => s.sportId === 'running')).toBeTrue();

      const pending = JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!);
      expect(pending.length).toBe(1);
      expect(pending[0].sport_id).toBe('running');
      expect(pending[0].date).toBe('2024-03-08');
    }));

    it('tags the session with plannedSource so routine and manual plans can be retracted independently', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-06', 'running', {}, 'planned', 'routine');
      tick();

      const session = service.plannedSessions().find(s => s.sportId === 'running');
      expect(session?.plannedSource).toBe('routine');
      expect(supabaseMock.insertSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ planned_source: 'routine' }));
    }));

    it('sends a null plannedSource when none is given', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-06', 'running', {}, 'done');
      tick();

      expect(supabaseMock.insertSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ planned_source: null }));
    }));
  });

  describe('offline sync queue', () => {
    it('retries and clears a pending session once back online', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertShouldFail = true;

      void service.logSession('2024-03-08', 'running', {}, 'planned');
      tick();
      expect(JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!).length).toBe(1);

      insertShouldFail = false;
      window.dispatchEvent(new Event('online'));
      tick();

      const pending = JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!);
      expect(pending.length).toBe(0);
    }));

    it('keeps a session queued if the retry also fails', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertShouldFail = true;

      void service.logSession('2024-03-08', 'running', {}, 'planned');
      tick();

      window.dispatchEvent(new Event('online'));
      tick();

      const pending = JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!);
      expect(pending.length).toBe(1);
    }));
  });
});
