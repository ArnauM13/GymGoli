import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
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
    const upsertSpy = jasmine.createSpy('upsert');
    const updateSpy = jasmine.createSpy('update');
    const deleteSpy = jasmine.createSpy('delete');
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

    const writeResult = () => ({
      then: (resolve: (v: { error: unknown }) => void) =>
        resolve(insertShouldFail ? { error: new Error('network error') } : { error: null }),
    });
    insertSpy.and.callFake(writeResult);
    upsertSpy.and.callFake(writeResult);

    // update()/delete() acaben amb `.eq(...).eq(...)`: la cadena resol al final.
    const eqChain = (): any => {
      const chain: any = writeResult();
      chain.eq = jasmine.createSpy('eq').and.callFake(() => eqChain());
      return chain;
    };
    updateSpy.and.callFake(() => eqChain());
    deleteSpy.and.callFake(() => eqChain());

    const writers = { insert: insertSpy, upsert: upsertSpy, update: updateSpy, delete: deleteSpy };
    fromSpy.and.callFake((table: string) => {
      if (table === 'sports') {
        return { select: () => selectChain(() => sportsData), ...writers };
      }
      if (table === 'sport_sessions') {
        return { select: () => selectChain(() => sessionsData), ...writers };
      }
      return { select: () => selectChain(() => []), ...writers };
    });

    return { client: { from: fromSpy }, fromSpy, insertSpy, upsertSpy, updateSpy, deleteSpy };
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
      expect(pending[0].op).toBe('insert');
      expect(pending[0].row.sport_id).toBe('running');
      expect(pending[0].row.date).toBe('2024-03-08');
      discardPeriodicTasks();
    }));

    it('tags the session with plannedSource so routine and manual plans can be retracted independently', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-06', 'running', {}, 'planned', 'routine');
      tick();

      const session = service.plannedSessions().find(s => s.sportId === 'running');
      expect(session?.plannedSource).toBe('routine');
      expect(supabaseMock.upsertSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ planned_source: 'routine' }), jasmine.anything());
    }));

    it('sends a null plannedSource when none is given', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-06', 'running', {}, 'done');
      tick();

      expect(supabaseMock.upsertSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ planned_source: null }), jasmine.anything());
    }));
  });

  describe('updateSession()', () => {
    it('registra un pla passat quan se li dona l\'estat "done"', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-06', 'running', {}, 'planned', 'routine');
      tick();
      const id = service.plannedSessions().find(s => s.sportId === 'running')!.id;

      void service.updateSession(id, '2024-03-06', { duration: 60 }, 'done');
      tick();

      expect(service.plannedSessions().some(s => s.id === id)).toBeFalse();
      expect(service.sessions().find(s => s.id === id)?.duration).toBe(60);
      expect(supabaseMock.updateSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ status: 'done' }));
    }));

    it('no toca l\'estat quan no se li passa', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-06', 'running', {}, 'planned', 'routine');
      tick();
      const id = service.plannedSessions().find(s => s.sportId === 'running')!.id;

      void service.updateSession(id, '2024-03-06', { duration: 45 });
      tick();

      expect(service.plannedSessions().find(s => s.id === id)?.duration).toBe(45);
      expect(supabaseMock.updateSpy).toHaveBeenCalledWith(
        jasmine.objectContaining({ duration: 45 }));
      expect(supabaseMock.updateSpy.calls.mostRecent().args[0] as Record<string, unknown>)
        .not.toEqual(jasmine.objectContaining({ status: jasmine.anything() }));
    }));
  });

  describe('ensureMonthLoaded()', () => {
    it('conserva una sessió registrada mentre el mes s\'estava carregant', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      // El mes de febrer encara no s'ha carregat mai: la consulta surt…
      void service.ensureMonthLoaded(2024, 1);
      // …i l'usuari registra un esport d'aquell mes abans que torni.
      void service.logSession('2024-02-14', 'running', { duration: 60 }, 'done');
      tick();

      expect(service.sessions().some(s => s.date === '2024-02-14')).toBeTrue();
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
      discardPeriodicTasks();
    }));

    it('queues an edit made without a connection instead of losing it', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-08', 'running', {}, 'done');
      tick();
      const id = service.sessions().find(s => s.sportId === 'running')!.id;

      insertShouldFail = true;
      void service.updateSession(id, '2024-03-08', { duration: 45 });
      tick();

      // El canvi ja es veu al dispositiu…
      expect(service.sessions().find(s => s.id === id)?.duration).toBe(45);
      // …i espera a la cua per pujar quan es pugui.
      const pending = JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!);
      expect(pending.length).toBe(1);
      expect(pending[0].op).toBe('update');
      expect(pending[0].row.duration).toBe(45);

      insertShouldFail = false;
      window.dispatchEvent(new Event('online'));
      tick();
      expect(JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!).length).toBe(0);
    }));

    it('folds an edit into an alta that has not gone out yet', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertShouldFail = true;

      void service.logSession('2024-03-08', 'running', {}, 'done');
      tick();
      const id = service.sessions().find(s => s.sportId === 'running')!.id;

      void service.updateSession(id, '2024-03-08', { duration: 30 });
      tick();

      const pending = JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!);
      expect(pending.length).toBe(1);
      expect(pending[0].op).toBe('insert');
      expect(pending[0].row.duration).toBe(30);
      discardPeriodicTasks();
    }));

    it('drops both when a session queued for upload is deleted before going out', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertShouldFail = true;

      void service.logSession('2024-03-08', 'running', {}, 'done');
      tick();
      const id = service.sessions().find(s => s.sportId === 'running')!.id;

      void service.deleteSession(id, '2024-03-08');
      tick();

      expect(JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!).length).toBe(0);
    }));
  });
});
