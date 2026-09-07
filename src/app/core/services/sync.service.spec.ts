import { TestBed, discardPeriodicTasks, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SyncService } from './sync.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { Workout } from '../models/workout.model';

/** What the pending `update` answers: `[]` = cap fila trobada. */
let updateResult: { data: unknown[]; error: unknown };

function buildMock() {
  const upsertSpy = jasmine.createSpy('upsert').and.callFake(() => ({
    then: (resolve: (v: { error: unknown }) => void) => resolve({ error: null }),
  }));

  // update(row).eq(...).eq(...).select('id')
  const updateChain = (): Record<string, unknown> => {
    const chain: Record<string, unknown> = {
      then: (resolve: (v: typeof updateResult) => void) => resolve(updateResult),
    };
    chain['eq']     = jasmine.createSpy('eq').and.callFake(() => chain);
    chain['select'] = jasmine.createSpy('select').and.callFake(() => chain);
    return chain;
  };
  const updateSpy = jasmine.createSpy('update').and.callFake(() => updateChain());

  const fromSpy = jasmine.createSpy('from').and.callFake(() => ({
    upsert: upsertSpy, update: updateSpy,
  }));

  return { client: { from: fromSpy }, fromSpy, upsertSpy, updateSpy };
}

function makeWorkout(id: string, date: string): Workout {
  return { id, date, entries: [], categories: [], createdAt: new Date(`${date}T08:00:00.000Z`), status: 'done' };
}

describe('SyncService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let service: SyncService;

  beforeEach(() => {
    localStorage.clear();
    updateResult = { data: [{ id: 'w1' }], error: null };
    uid = signal<string | null>('user-1');

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: buildMock() },
      ],
    });
    service = TestBed.inject(SyncService);
    TestBed.flushEffects();
  });

  afterEach(() => localStorage.clear());

  it('envia una edició pendent i la dóna per sincronitzada', fakeAsync(() => {
    service.markDirty('w1', makeWorkout('w1', '2024-03-06'));
    tick(2000); // el debounce d'edicions

    expect(service.pendingCount()).toBe(0);
    expect(service.status()).toBe('synced');
    expect(service.vanished()).toBeNull();
    discardPeriodicTasks();
  }));

  it('avisa quan l\'edició no troba la fila: s\'havia esborrat des d\'un altre dispositiu', fakeAsync(() => {
    updateResult = { data: [], error: null };

    service.markDirty('w1', makeWorkout('w1', '2024-03-06'));
    tick(2000);

    // Sense això l'entrenament es quedava aquí com un fantasma: el servidor ja
    // no el té i ningú tornava a mirar-ho.
    expect(service.vanished()?.id).toBe('w1');
    expect(service.vanished()?.date).toBe('2024-03-06');
    expect(service.pendingCount()).toBe(0);
    discardPeriodicTasks();
  }));

  it('no avisa de res quan és una alta (encara no existeix enlloc)', fakeAsync(() => {
    updateResult = { data: [], error: null };

    service.markDirty('w2', makeWorkout('w2', '2024-03-06'), true);
    tick(2000);

    expect(service.vanished()).toBeNull();
    expect(service.pendingCount()).toBe(0);
    discardPeriodicTasks();
  }));
});
