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
  /** Fa que la consulta per trams contesti error, com la xarxa caiguda. */
  let rpcShouldFail: boolean;
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

    // Es comporta com un constructor de consultes de debò: els filtres tornen
    // la mateixa cadena, esperar-la la resol sencera, i `.range()` en serveix
    // un tram — que és com les consultes d'abast obert recorren l'historial.
    //
    // Les cadenes es creen a cada consulta, així que els filtres es van
    // apuntant en llistes compartides: és l'única manera de mirar després què
    // s'ha demanat de debò.
    const selectCalls: string[] = [];
    const filterCalls: Array<[string, string, unknown]> = [];
    /** Errors per joc de columnes: així un test pot fer que el servidor digui
     *  que una columna no hi és sense tocar la resta de consultes. */
    const selectErrors: Record<string, unknown> = {};
    const selectChain = (data: () => Record<string, unknown>[], cols?: string): any => {
      if (cols !== undefined) selectCalls.push(cols);
      const fail = cols !== undefined ? selectErrors[cols] : undefined;
      const answer = () => fail ? { data: null, error: fail } : { data: data(), error: null };
      const chain: any = {};
      for (const method of ['select', 'neq', 'lte', 'lt', 'order', 'limit', 'contains']) {
        chain[method] = jasmine.createSpy(method).and.returnValue(chain);
      }
      for (const method of ['eq', 'gte', 'gt']) {
        chain[method] = jasmine.createSpy(method).and.callFake((col: string, value: unknown) => {
          filterCalls.push([method, col, value]);
          return chain;
        });
      }
      chain.range = jasmine.createSpy('range').and.callFake((from: number, to: number) => {
        const res = answer();
        return Promise.resolve(res.error ? res : { data: res.data!.slice(from, to + 1), error: null });
      });
      chain.then = (resolve: (v: unknown) => void) => resolve(answer());
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
        return { select: (cols?: string) => selectChain(() => sportsData, cols), ...writers };
      }
      if (table === 'sport_sessions') {
        return { select: (cols?: string) => selectChain(() => sessionsData, cols), ...writers };
      }
      return { select: (cols?: string) => selectChain(() => [], cols), ...writers };
    });

    // `activity_feed`: la consulta per trams, que ara és per on arriben les
    // sessions d'un mes. Contesta amb les mateixes `sessionsData` que la
    // taula, en la forma que torna l'endpoint, així els tests continuen
    // preparant les dades en un sol lloc.
    const rpcSpy = jasmine.createSpy('rpc').and.callFake(
      (fn: string, args: { p_from: string; p_to: string }) => {
        if (fn !== 'activity_feed') return Promise.resolve({ data: [], error: null });
        if (rpcShouldFail) return Promise.resolve({ data: null, error: new Error('network error') });
        const rows = sessionsData
          .filter(r => (r['date'] as string) >= args.p_from && (r['date'] as string) <= args.p_to)
          .map(r => ({
            kind: 'sport',
            item_id:     r['id'],
            item_date:   r['date'],
            item_status: r['status'] ?? 'done',
            planned_source: r['planned_source'] ?? null,
            feeling:     r['feeling'] ?? null,
            notes:       r['notes'] ?? null,
            created_at:  r['created_at'] ?? `${r['date'] as string}T08:00:00.000Z`,
            updated_at:  r['updated_at'] ?? null,
            category: null, categories: null, exercise_names: null,
            exercise_count: null, set_count: null, warmup_count: null, volume: null,
            sport_id:   r['sport_id'],
            subtype_id: r['subtype_id'] ?? null,
            duration:   r['duration'] ?? null,
            metrics:    r['metrics'] ?? null,
          }));
        return Promise.resolve({ data: rows, error: null });
      });

    return {
      client: { from: fromSpy, rpc: rpcSpy }, fromSpy, insertSpy, upsertSpy, updateSpy, deleteSpy,
      rpcSpy, selectCalls, filterCalls, selectErrors,
    };
  }

  function setup(): void {
    localStorage.clear();
    uid = signal<string | null>(null);
    sportsData = [sportRow()];
    sessionsData = [];
    insertShouldFail = false;
    rpcShouldFail = false;
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
    // Una resposta de tram cobreix el tram sencer, o sigui que diu qui hi ha
    // de ser: és l'única cosa que veu un esborrat fet des d'un altre lloc,
    // perquè una fila esborrada no surt a cap consulta de canvis.
    it('torna a demanar el tram carregat i treu el que ja no hi és', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();

      sessionsData = [sessionRow('s1', '2024-03-06')];
      void service.ensureMonthLoaded(2024, 2);
      tick();
      TestBed.flushEffects();
      expect(service.sessions().some(s => s.id === 's1')).toBeTrue();

      sessionsData = []; // esborrada des d'un altre dispositiu
      void service.ensureMonthLoaded(2024, 2, true);
      tick();
      TestBed.flushEffects();

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
      const calls = supabaseMock.rpcSpy.calls.count();

      void service.ensureMonthLoaded(2024, 2);
      void service.ensureMonthLoaded(2024, 2);
      tick();

      expect(supabaseMock.rpcSpy.calls.count()).toBe(calls + 1);
    }));

    // Un mes d'esports ja no és cap consulta pròpia: va amb la mateixa
    // resposta que els entrenaments. Abans eren dues peticions per mes
    // visible, una per taula.
    it('un mes no fa cap consulta a la taula de sessions', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      supabaseMock.selectCalls.length = 0;

      void service.ensureMonthLoaded(2024, 2);
      tick();

      expect(supabaseMock.selectCalls.some(c => c.includes('sport_id'))).toBeFalse();
    }));

    // Els rècords del detall demanen l'historial d'un esport. Desplegar-ne
    // dues targetes alhora no pot ser dues consultes.
    it('dues peticions alhora del mateix esport són una sola consulta', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      const calls = supabaseMock.fromSpy.calls.count();

      void service.loadSessionsForSport('sport-1');
      void service.loadSessionsForSport('sport-1');
      tick();

      expect(supabaseMock.fromSpy.calls.count()).toBe(calls + 1);
    }));

    // ── Consulta de canvis ───────────────────────────────────────────────
    // `WorkoutProfileService` demana tot l'historial en entrar, i des
    // d'aleshores cada tornada a l'app el tornava a baixar sencer.
    it('el primer refresc només mira per on va el rellotge del servidor', fakeAsync(() => {
      sessionsData = [sessionRow('s1', '2024-03-06', { updated_at: '2024-03-06T10:00:00.000Z' })];
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      void service.ensureMonthLoaded(2024, 2);
      tick();

      supabaseMock.selectCalls.length = 0;
      void service.refreshLoaded(true);
      tick();

      // Encara no hi ha delta que demanar: qui porta les dades aquest primer
      // cop és la comprovació sencera, i baixar-ho tot dos cops seguits no
      // diria res de nou.
      expect(supabaseMock.selectCalls).toContain('updated_at');
      discardPeriodicTasks();
    }));

    it('a partir d\'aleshores demana només el que ha canviat', fakeAsync(() => {
      sessionsData = [sessionRow('s1', '2024-03-06', { updated_at: '2024-03-06T10:00:00.000Z' })];
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      void service.ensureMonthLoaded(2024, 2);
      tick();
      void service.refreshLoaded(true); // sembra el marcador i fa la sencera
      tick();

      supabaseMock.filterCalls.length = 0;
      supabaseMock.selectCalls.length = 0;
      void service.refreshLoaded(true);
      tick();

      // El marcador surt de les files, no del rellotge d'aquest dispositiu.
      expect(supabaseMock.filterCalls
        .filter(([, col]) => col === 'updated_at')
        .map(([op, , value]) => [op, value]))
        .toContain(['gte', '2024-03-06T10:00:00.000Z']);
      // I la comprovació sencera s'espaia: no en surt cap altra consulta.
      expect(supabaseMock.selectCalls.filter(c => c.includes('sport_id')).length).toBe(1);
      discardPeriodicTasks();
    }));

    it('sense la columna updated_at continua com abans', fakeAsync(() => {
      // La migració 030 encara no s'ha executat: el servidor contesta 42703 i
      // el client se n'ha de desdir sol, no quedar-se sense refrescar.
      sessionsData = [sessionRow('s1', '2024-03-06')];
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      void service.ensureMonthLoaded(2024, 2);
      tick();

      supabaseMock.selectErrors['updated_at'] =
        { code: '42703', message: 'column "updated_at" does not exist' };

      supabaseMock.selectCalls.length = 0;
      void service.refreshLoaded(true);
      tick();

      // Sense consulta de canvis, qui porta les dades és el tram — que no
      // depèn de cap columna que la migració pugui no haver creat.
      void service.ensureMonthLoaded(2024, 2, true);
      tick();
      TestBed.flushEffects();
      expect(service.sessions().length).toBe(1);

      // I no hi torna: un cop sap que la columna no hi és, ja no la demana.
      supabaseMock.selectCalls.length = 0;
      void service.refreshLoaded(true);
      tick();
      expect(supabaseMock.selectCalls).not.toContain('updated_at');
      discardPeriodicTasks();
    }));

    // Tombar-ho i tornar-ho a aixecar feia que els rècords del detall d'una
    // sessió es tornessin a pintar a mitges cada cop que l'app agafava el
    // focus: part de les pampallugues que es veien mentre carregava.
    it('refrescar no tomba mai «ja tinc l\'historial d\'aquest esport»', fakeAsync(() => {
      uid.set('user-1');
      TestBed.flushEffects();
      tick();
      void service.loadSessionsForSport('sport-1');
      tick();
      expect(service.sportHistoryLoaded('sport-1')).toBeTrue();

      const seen: boolean[] = [];
      const stop = setInterval(() => seen.push(service.sportHistoryLoaded('sport-1')), 1);
      void service.refreshLoaded(true);
      tick(10);
      clearInterval(stop);

      expect(seen.every(v => v)).toBeTrue();
      expect(service.sportHistoryLoaded('sport-1')).toBeTrue();
      discardPeriodicTasks();
    }));
  });
});
