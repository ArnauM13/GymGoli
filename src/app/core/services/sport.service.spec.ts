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

function sessionRow(id: string, date: string, overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id, date, sport_id: 'sport-1', status: 'done',
    created_at: `${date}T08:00:00.000Z`,
    ...overrides,
  };
}

describe('SportService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let sportsData: Record<string, unknown>[];
  let sessionsData: Record<string, unknown>[];
  let insertShouldFail: boolean;
  /** Quant triga el servidor a contestar una escriptura. La finestra que obre
   *  aquesta espera és on es poden perdre canvis fets mentrestant. */
  let writeDelayMs: number;
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

    const writeResult = (): any => {
      const value = () => insertShouldFail ? { error: new Error('network error') } : { error: null };
      if (writeDelayMs > 0) return new Promise(resolve => setTimeout(() => resolve(value()), writeDelayMs));
      return { then: (resolve: (v: { error: unknown }) => void) => resolve(value()) };
    };
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
    writeDelayMs = 0;
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

    // La mateixa pèrdua que hi havia als entrenaments: la tanda d'enviaments
    // reescrivia la cua amb el que havia fallat, i s'emportava per davant el
    // que s'hi havia encuat mentre les peticions viatjaven.
    it('no perd una edició encuada mentre la tanda d\'enviaments estava en marxa', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      void service.logSession('2024-03-08', 'running', { duration: 30 }, 'done');
      tick();
      const id = service.sessions().find(s => s.sportId === 'running')!.id;

      // Una edició que no ha pogut sortir espera a la cua.
      insertShouldFail = true;
      void service.updateSession(id, '2024-03-08', { duration: 45 });
      tick();
      expect(JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!).length).toBe(1);

      // Arrenca la tanda, i el servidor triga a contestar.
      insertShouldFail = false;
      writeDelayMs = 500;
      void (service as unknown as { _flushPending(): Promise<void> })._flushPending();

      // Enmig de l'espera, una edició nova que tampoc pot sortir.
      tick(200);
      insertShouldFail = true;
      writeDelayMs = 0;
      void service.updateSession(id, '2024-03-08', { duration: 60 });
      tick(600);   // la tanda acaba i reescriu la cua

      // L'edició nova no pot haver desaparegut sense arribar al servidor.
      const pending = JSON.parse(localStorage.getItem(LS_PENDING_KEY('user-1'))!);
      expect(pending.length).toBe(1);
      expect(pending[0].row.duration).toBe(60);
      expect(service.sessions().find(s => s.id === id)?.duration).toBe(60);
      discardPeriodicTasks();
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

  // ── Sincronització entre dispositius ──────────────────────────────────────
  //
  // Un mes només es demanava un cop per sessió, i el que hi havia a la cau i
  // el servidor ja no retornava es quedava enganxat: dos dispositius podien
  // ensenyar coses diferents tot el dia.
  describe('sincronització entre dispositius', () => {
    it('torna a demanar els mesos carregats i treu el que ja no hi és', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      sessionsData = [sessionRow('s1', '2024-03-06')];
      void service.ensureMonthLoaded(2024, 2);
      tick();
      expect(service.sessions().some(s => s.id === 's1')).toBeTrue();

      sessionsData = []; // esborrada des d'un altre dispositiu
      void service.refreshLoaded(true);
      tick();

      expect(service.sessions().some(s => s.id === 's1')).toBeFalse();
    }));

    it('conserva una sessió que encara espera torn per pujar', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      insertShouldFail = true;

      void service.logSession('2024-03-08', 'sport-1', {}, 'done');
      tick();

      sessionsData = [];
      void service.ensureMonthLoaded(2024, 2, true);
      tick();

      expect(service.sessions().some(s => s.date === '2024-03-08')).toBeTrue();
      discardPeriodicTasks();
    }));

    it('no fa reaparèixer el que s\'ha esborrat aquí i encara no ha sortit', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      sessionsData = [sessionRow('s1', '2024-03-06')];
      void service.ensureMonthLoaded(2024, 2);
      tick();

      insertShouldFail = true; // l'esborrat es queda a la cua
      void service.deleteSession('s1', '2024-03-06');
      tick();

      void service.ensureMonthLoaded(2024, 2, true); // el servidor encara la retorna
      tick();

      expect(service.sessions().some(s => s.id === 's1')).toBeFalse();
      discardPeriodicTasks();
    }));

    it('no demana el mateix mes dos cops alhora', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      const calls = supabaseMock.fromSpy.calls.count();

      void service.ensureMonthLoaded(2024, 2);
      void service.ensureMonthLoaded(2024, 2);
      tick();

      expect(supabaseMock.fromSpy.calls.count()).toBe(calls + 1);
    }));

    // Cada senyal que canviava mentre la consulta viatjava en disparava una
    // altra, i l'app arrencava baixant l'historial diverses vegades alhora.
    it('dues peticions alhora de tot l\'historial són una sola consulta', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      const calls = supabaseMock.fromSpy.calls.count();

      void service.loadAllSessions();
      void service.loadAllSessions();
      tick();

      expect(supabaseMock.fromSpy.calls.count()).toBe(calls + 1);
    }));

    // Tombar-ho i tornar-ho a aixecar feia que els rècords del detall d'una
    // sessió es tornessin a pintar a mitges cada cop que l'app agafava el
    // focus: part de les pampallugues que es veien mentre carregava.
    it('refrescar no tomba mai «ja tinc tot l\'historial»', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      void service.loadAllSessions();
      tick();
      expect(service.allSessionsLoaded()).toBeTrue();

      const seen: boolean[] = [];
      const stop = setInterval(() => seen.push(service.allSessionsLoaded()), 1);
      void service.refreshLoaded(true);
      tick(10);
      clearInterval(stop);

      expect(seen.every(v => v)).toBeTrue();
      expect(service.allSessionsLoaded()).toBeTrue();
      discardPeriodicTasks();
    }));
  });
});
