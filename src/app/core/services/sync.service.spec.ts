import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SyncService } from './sync.service';
import { WorkoutStoreService } from './workout-store.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { Workout, WorkoutSet } from '../models/workout.model';

/** Què contesta l'`update` pendent: `[]` = cap fila trobada. */
let updateResult: { data: unknown[]; error: unknown };
/** Quant triga el servidor a contestar. La finestra que obre aquesta espera és
 *  on abans es perdien les sèries registrades mentre la petició viatjava. */
let latencyMs: number;
let deleteCalls: string[];

function buildMock() {
  const answer = <T>(value: T) => new Promise<T>(resolve => setTimeout(() => resolve(value), latencyMs));

  const upsertSpy = jasmine.createSpy('upsert').and.callFake(() => answer({ error: null }));

  const updateSpy = jasmine.createSpy('update').and.callFake(() => {
    const chain: Record<string, unknown> = {};
    chain['eq']     = () => chain;
    chain['select'] = () => answer(updateResult);
    return chain;
  });

  const deleteSpy = jasmine.createSpy('delete').and.callFake(() => {
    const chain: Record<string, unknown> = {
      then: (resolve: (v: { error: unknown }) => void) => resolve({ error: null }),
    };
    chain['eq'] = (_col: string, val: string) => { if (val.startsWith('w')) deleteCalls.push(val); return chain; };
    return chain;
  });

  const fromSpy = jasmine.createSpy('from').and.callFake(() => ({
    upsert: upsertSpy, update: updateSpy, delete: deleteSpy,
  }));

  return { client: { from: fromSpy }, fromSpy, upsertSpy, updateSpy, deleteSpy };
}

function makeWorkout(id: string, date: string, sets: WorkoutSet[] = []): Workout {
  return {
    id, date,
    entries: [{ exerciseId: 'ex1', exerciseName: 'Press banca', sets }],
    categories: [], createdAt: new Date(`${date}T08:00:00.000Z`), status: 'done',
  };
}

describe('SyncService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let service: SyncService;
  let store: WorkoutStoreService;

  beforeEach(() => {
    localStorage.clear();
    updateResult = { data: [{ id: 'w1' }], error: null };
    latencyMs    = 0;
    deleteCalls  = [];
    uid = signal<string | null>('user-1');

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: buildMock() },
      ],
    });
    store   = TestBed.inject(WorkoutStoreService);
    service = TestBed.inject(SyncService);
    TestBed.flushEffects();
    store.hydrate('user-1');
  });

  afterEach(() => localStorage.clear());

  it('envia una edició pendent i la dóna per sincronitzada', fakeAsync(() => {
    store.put(makeWorkout('w1', '2024-03-06'));
    service.notifyPending();
    tick(2000); // el debounce d'edicions

    expect(service.pendingCount()).toBe(0);
    expect(service.status()).toBe('synced');
    expect(service.vanished()).toBeNull();
    discardPeriodicTasks();
  }));

  // Aquesta és la pèrdua de dades que feia arribar entrenaments buits a la
  // base de dades: la resposta d'una petició antiga donava per pujada una
  // sessió que, mentrestant, havia crescut.
  it('no perd una sèrie registrada mentre la petició viatjava', fakeAsync(() => {
    latencyMs = 500;

    store.put(makeWorkout('w1', '2024-03-06'));           // revisió 1, sense sèries
    service.notifyPending();
    tick(1600);                                            // arrenca la pujada

    store.put(makeWorkout('w1', '2024-03-06', [{ weight: 80, reps: 8 }])); // revisió 2
    service.notifyPending();
    tick(5000);                                            // deixa acabar les dues tandes

    expect(service.pendingCount()).toBe(0);
    // I el que ha quedat guardat és la versió bona, no la buida que va sortir
    // primer.
    expect(store.get('w1')!.entries[0].sets.length).toBe(1);
    expect(store.record('w1')!.syncedRev).toBe(2);
    discardPeriodicTasks();
  }));

  it('avisa quan l\'edició no troba la fila: s\'havia esborrat des d\'un altre dispositiu', fakeAsync(() => {
    updateResult = { data: [], error: null };

    const w = makeWorkout('w1', '2024-03-06');
    store.put(w);
    store.ackUpsert('w1', 1);      // ja existia al servidor
    store.put(w);                  // i ara s'edita
    service.notifyPending();
    tick(2000);

    expect(service.vanished()?.id).toBe('w1');
    expect(service.vanished()?.date).toBe('2024-03-06');
    expect(service.pendingCount()).toBe(0);
    discardPeriodicTasks();
  }));

  it('no avisa de res quan és una alta (encara no existeix enlloc)', fakeAsync(() => {
    updateResult = { data: [], error: null };

    store.put(makeWorkout('w2', '2024-03-06'));
    service.notifyPending(true);
    tick(2000);

    expect(service.vanished()).toBeNull();
    expect(service.pendingCount()).toBe(0);
    discardPeriodicTasks();
  }));

  it('sense connexió es queda pendent, i puja sol quan torna', fakeAsync(() => {
    spyOnProperty(navigator, 'onLine', 'get').and.returnValue(false);

    store.put(makeWorkout('w1', '2024-03-06', [{ weight: 60, reps: 10 }]));
    service.notifyPending();
    tick(2000);

    expect(service.pendingCount()).toBe(1);   // res perdut: espera torn
    expect(store.get('w1')!.entries[0].sets.length).toBe(1);
    discardPeriodicTasks();
  }));

  it('un esborrat sense connexió arriba al servidor quan torna', fakeAsync(() => {
    store.put(makeWorkout('w1', '2024-03-06'));
    store.ackUpsert('w1', 1);                  // el servidor ja la té

    store.remove('w1');
    service.notifyPending();
    tick(2000);

    expect(deleteCalls).toContain('w1');
    expect(service.pendingCount()).toBe(0);
    discardPeriodicTasks();
  }));
});
