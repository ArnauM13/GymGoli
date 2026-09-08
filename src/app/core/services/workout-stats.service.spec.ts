import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WorkoutStatsService } from './workout-stats.service';
import { AuthService } from './auth.service';
import { OfflineService } from './offline.service';
import { SupabaseService } from './supabase.service';
import { UserSettingsService } from './user-settings.service';

describe('WorkoutStatsService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let bodyweight: ReturnType<typeof signal<number | null>>;
  let rpc: jasmine.Spy;
  let records: Record<string, unknown>[];
  let service: WorkoutStatsService;

  function calls(fn: string): unknown[][] {
    return rpc.calls.allArgs().filter(args => args[0] === fn);
  }

  beforeEach(() => {
    uid        = signal<string | null>('user-1');
    bodyweight = signal<number | null>(75);
    records    = [
      { exercise_id: 'ex-1', sessions: 12, max_weight: 95, last_date: '2024-03-06' },
      { exercise_id: 'ex-2', sessions: 3,  max_weight: 0,  last_date: '2024-01-02' },
    ];
    rpc = jasmine.createSpy('rpc').and.callFake((fn: string) =>
      Promise.resolve(fn === 'exercise_records'
        ? { data: records, error: null }
        : { data: [{ total_done: 312, first_date: '2019-01-01', last_date: '2024-03-06' }], error: null }));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,         useValue: { uid } },
        { provide: SupabaseService,     useValue: { client: { rpc } } },
        { provide: OfflineService,      useValue: { isOffline: () => false } },
        { provide: UserSettingsService, useValue: { bodyweightKg: () => bodyweight() } },
      ],
    });
    service = TestBed.inject(WorkoutStatsService);
    TestBed.flushEffects();
  });

  // Dues consultes que tornen números. Abans, per treure'n el mateix, viatjava
  // tota la vida de l'usuari amb totes les sèries de tots els exercicis.
  it('demana els agregats al servidor, amb el pes corporal', async () => {
    await service.ensureLoaded();

    expect(calls('exercise_records')[0][1]).toEqual({ p_bodyweight: 75 });
    expect(calls('workout_totals').length).toBe(1);
    expect(service.recordFor('ex-1')).toEqual(
      { exerciseId: 'ex-1', sessions: 12, maxWeight: 95, lastDate: '2024-03-06' });
    expect(service.totals()?.totalDone).toBe(312);
  });

  it('no les torna a demanar un cop les té', async () => {
    await service.ensureLoaded();
    await service.ensureLoaded();

    expect(calls('exercise_records').length).toBe(1);
  });

  it('dues peticions alhora són una sola consulta', async () => {
    await Promise.all([service.ensureLoaded(), service.ensureLoaded()]);

    expect(calls('exercise_records').length).toBe(1);
  });

  // Unes dominades amb +5 kg són el teu cos més 5: canviar-se el pes al perfil
  // canvia el rècord, i ensenyar el d'abans seria mentir.
  it('les torna a demanar si l\'usuari es canvia el pes', async () => {
    await service.ensureLoaded();

    bodyweight.set(80);
    TestBed.flushEffects();
    await service.ensureLoaded();

    expect(calls('exercise_records').length).toBe(2);
    expect(calls('exercise_records')[1][1]).toEqual({ p_bodyweight: 80 });
  });

  it('una consulta que falla no es dóna per bona', async () => {
    rpc.and.callFake(() => Promise.resolve({ data: null, error: new Error('network') }));

    await service.ensureLoaded();

    expect(service.loaded()).toBeFalse();
    // I es torna a provar la propera vegada.
    rpc.calls.reset();
    await service.ensureLoaded();
    expect(calls('exercise_records').length).toBe(1);
  });

  it('canviar d\'usuari ho invalida tot', async () => {
    await service.ensureLoaded();
    expect(service.loaded()).toBeTrue();

    uid.set('user-2');
    TestBed.flushEffects();

    expect(service.loaded()).toBeFalse();
    expect(service.recordFor('ex-1')).toBeUndefined();
  });
});
