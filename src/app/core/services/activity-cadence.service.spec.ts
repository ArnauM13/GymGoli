import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { ActivityCadenceService } from './activity-cadence.service';
import { AuthService } from './auth.service';
import { OfflineService } from './offline.service';
import { SupabaseService } from './supabase.service';

describe('ActivityCadenceService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let offline: ReturnType<typeof signal<boolean>>;
  let rpc: jasmine.Spy;
  let response: { data: unknown; error: unknown };
  let service: ActivityCadenceService;

  beforeEach(() => {
    uid     = signal<string | null>('user-1');
    offline = signal(false);
    response = {
      data: [
        { kind: 'gym',   activity_key: 'push',  sessions: 40, first_date: '2022-01-02', last_date: '2024-03-01' },
        { kind: 'sport', activity_key: 'sp-1',  sessions: 12, first_date: '2023-05-05', last_date: '2023-09-15' },
      ],
      error: null,
    };
    rpc = jasmine.createSpy('rpc').and.callFake(() => Promise.resolve(response));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,     useValue: { uid } },
        { provide: SupabaseService, useValue: { client: { rpc } } },
        { provide: OfflineService,  useValue: { isOffline: () => offline() } },
      ],
    });
    service = TestBed.inject(ActivityCadenceService);
    TestBed.flushEffects();
  });

  // Una fila per activitat: qui porta vuit anys entrenant en rep tantes com
  // qui en porta dos.
  it('demana el resum al servidor i el desa per activitat', async () => {
    await service.ensureLoaded();

    expect(rpc).toHaveBeenCalledWith('activity_cadence');
    expect(service.get('gym', 'push')).toEqual({
      kind: 'gym', key: 'push', sessions: 40, firstDate: '2022-01-02', lastDate: '2024-03-01',
    });
    expect(service.get('sport', 'sp-1')?.lastDate).toBe('2023-09-15');
  });

  it('no el torna a demanar un cop el té', async () => {
    await service.ensureLoaded();
    await service.ensureLoaded();

    expect(rpc.calls.count()).toBe(1);
  });

  it('dues peticions alhora són una sola consulta', async () => {
    await Promise.all([service.ensureLoaded(), service.ensureLoaded()]);

    expect(rpc.calls.count()).toBe(1);
  });

  // La migració 038 pot no estar executada encara: el suggeriment perd el «hi
  // tornem?» i continua funcionant amb la finestra recent.
  it('sense la migració, es queda buit i no peta', async () => {
    response = { data: null, error: { message: 'function activity_cadence does not exist' } };

    await service.ensureLoaded();

    expect(service.byKey().size).toBe(0);
    expect(service.loaded()).toBeFalse();
  });

  it('sense connexió no pregunta res', async () => {
    offline.set(true);

    await service.ensureLoaded();

    expect(rpc).not.toHaveBeenCalled();
  });

  it('canviar d\'usuari buida el que hi havia', async () => {
    await service.ensureLoaded();
    expect(service.byKey().size).toBe(2);

    uid.set('user-2');
    TestBed.flushEffects();

    expect(service.byKey().size).toBe(0);
  });

  // La resposta pot arribar quan l'usuari ja ha canviat: seria el resum d'un
  // altre compte.
  it('descarta una resposta que arriba després d\'un canvi d\'usuari', async () => {
    rpc.and.callFake(() => {
      uid.set('user-2');
      return Promise.resolve(response);
    });

    await service.ensureLoaded();

    expect(service.byKey().size).toBe(0);
  });
});
