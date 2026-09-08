import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { ActivityFeedService, mergeRanges } from './activity-feed.service';
import { AuthService } from './auth.service';
import { OfflineService } from './offline.service';
import { SupabaseService } from './supabase.service';
import { UserSettingsService } from './user-settings.service';
import { WorkoutStoreService } from './workout-store.service';

function feedRow(id: string, date: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'workout', item_id: id, item_date: date, item_status: 'done',
    planned_source: null, feeling: null, notes: null,
    created_at: `${date}T08:00:00.000Z`, updated_at: null,
    category: null, categories: [], exercise_names: null,
    exercise_count: 0, set_count: 0, warmup_count: 0, volume: 0,
    sport_id: null, subtype_id: null, duration: null, metrics: null,
    ...extra,
  };
}

describe('mergeRanges()', () => {
  it('fusiona els trams que se solapen', () => {
    expect(mergeRanges([
      { from: '2024-01-01', to: '2024-01-20' },
      { from: '2024-01-10', to: '2024-02-05' },
    ])).toEqual([{ from: '2024-01-01', to: '2024-02-05' }]);
  });

  // Demanar gener i després febrer deixaria un forat inexistent entre el 31 i
  // l'1, i tornaria a preguntar per un tram que ja tenim sencer.
  it('fusiona també els trams que només es toquen', () => {
    expect(mergeRanges([
      { from: '2024-01-01', to: '2024-01-31' },
      { from: '2024-02-01', to: '2024-02-29' },
    ])).toEqual([{ from: '2024-01-01', to: '2024-02-29' }]);
  });

  it('deixa separats els que tenen un forat de debò', () => {
    expect(mergeRanges([
      { from: '2024-01-01', to: '2024-01-31' },
      { from: '2024-03-01', to: '2024-03-31' },
    ]).length).toBe(2);
  });

  it('un tram que en conté un altre se l\'empassa', () => {
    expect(mergeRanges([
      { from: '2024-01-01', to: '2024-12-31' },
      { from: '2024-05-01', to: '2024-05-31' },
    ])).toEqual([{ from: '2024-01-01', to: '2024-12-31' }]);
  });
});

describe('ActivityFeedService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let rpc: jasmine.Spy;
  let rows: Record<string, unknown>[];
  let service: ActivityFeedService;

  beforeEach(() => {
    uid  = signal<string | null>('user-1');
    rows = [];
    rpc  = jasmine.createSpy('rpc').and.callFake(() => Promise.resolve({ data: rows, error: null }));

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,         useValue: { uid } },
        { provide: SupabaseService,     useValue: { client: { rpc } } },
        { provide: OfflineService,      useValue: { isOffline: () => false } },
        { provide: UserSettingsService, useValue: { bodyweightKg: () => 75 } },
        { provide: WorkoutStoreService, useValue: { mark: () => 0 } },
      ],
    });
    service = TestBed.inject(ActivityFeedService);
    TestBed.flushEffects();
  });

  it('demana el tram amb el pes corporal, que és el que necessita el volum', async () => {
    await service.ensureRange('2024-01-01', '2024-03-31');

    expect(rpc).toHaveBeenCalledWith('activity_feed', {
      p_from: '2024-01-01', p_to: '2024-03-31', p_bodyweight: 75,
      p_search: null, p_category: null,
    });
  });

  it('no torna a demanar un tram que ja hi cap a dins', async () => {
    await service.ensureRange('2024-01-01', '2024-03-31');
    rpc.calls.reset();

    await service.ensureRange('2024-02-01', '2024-02-29');

    expect(rpc).not.toHaveBeenCalled();
  });

  // A l'arrencada, Inici, el calendari i el perfil demanen trams solapats el
  // mateix milisegon: sense això eren tres descàrregues de la mateixa cosa.
  it('tres peticions alhora són una sola consulta', async () => {
    await Promise.all([
      service.ensureRange('2024-01-01', '2024-03-31'),
      service.ensureRange('2024-01-01', '2024-03-31'),
      service.ensureRange('2024-02-01', '2024-02-29'),
    ]);

    expect(rpc.calls.count()).toBe(1);
  });

  it('un tram que ha fallat no consta com a rebut', async () => {
    rpc.and.callFake(() => Promise.resolve({ data: null, error: new Error('network') }));

    await service.ensureRange('2024-01-01', '2024-03-31');

    expect(service.covers('2024-01-01', '2024-03-31')).toBeFalse();
  });

  it('el que el tram ja no porta deixa de sortir', async () => {
    rows = [feedRow('w1', '2024-01-05'), feedRow('w2', '2024-01-06')];
    await service.ensureRange('2024-01-01', '2024-01-31');
    expect(service.workoutSummaries().length).toBe(2);

    rows = [feedRow('w1', '2024-01-05')];   // w2 esborrada des d'un altre lloc
    await service.ensureRange('2024-01-01', '2024-01-31', true);

    expect(service.workoutSummaries().map(w => w.id)).toEqual(['w1']);
  });

  it('un tram nou no s\'endú el que hi havia fora d\'ell', async () => {
    rows = [feedRow('vell', '2023-06-05')];
    await service.ensureRange('2023-06-01', '2023-06-30');

    rows = [feedRow('nou', '2024-01-05')];
    await service.ensureRange('2024-01-01', '2024-01-31');

    expect(service.workoutSummaries().map(w => w.id).sort()).toEqual(['nou', 'vell']);
  });

  // Qui ha anat enrere al calendari pot tenir dos anys de cobertura, i tornar-la
  // a demanar a cada canvi de pestanya seria una resposta grossa per
  // assabentar-se, gairebé sempre, que no ha canviat res.
  it('el refresc cobreix tot el primer cop i després només el tram calent', async () => {
    await service.ensureRange('2022-01-01', '2024-03-31');
    rpc.calls.reset();

    await service.refreshLoaded('2024-01-01', '2024-03-31');
    expect(rpc.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      p_from: '2022-01-01', p_to: '2024-03-31',
    }));

    await service.refreshLoaded('2024-01-01', '2024-03-31');
    expect(rpc.calls.mostRecent().args[1]).toEqual(jasmine.objectContaining({
      p_from: '2024-01-01', p_to: '2024-03-31',
    }));
  });

  // Sigui com sigui, és **una** consulta: abans era una per cada mes que
  // haguessis arribat a mirar, i dues comptant els esports.
  it('refrescar és una sola consulta, hi hagi els mesos que hi hagi', async () => {
    for (let m = 1; m <= 9; m++) {
      const mm = String(m).padStart(2, '0');
      await service.ensureRange(`2024-${mm}-01`, `2024-${mm}-28`);
    }
    rpc.calls.reset();

    await service.refreshLoaded('2024-09-01', '2024-09-28');

    expect(rpc.calls.count()).toBe(1);
  });

  it('canviar d\'usuari ho invalida tot', async () => {
    rows = [feedRow('w1', '2024-01-05')];
    await service.ensureRange('2024-01-01', '2024-01-31');
    expect(service.workoutSummaries().length).toBe(1);

    uid.set('user-2');
    TestBed.flushEffects();

    expect(service.workoutSummaries().length).toBe(0);
    expect(service.covers('2024-01-01', '2024-01-31')).toBeFalse();
  });

  // ── Cerca ────────────────────────────────────────────────────────────────
  //
  // Buscar «dominades» baixava tot l'historial amb totes les sèries i el
  // filtrava al client. Ara la pregunta la contesta el servidor.
  describe('searchRange()', () => {
    it('passa la cerca i el tipus al servidor', async () => {
      await service.searchRange('2000-01-01', '2024-12-31', { search: 'dominades', category: 'pull' });

      expect(rpc).toHaveBeenCalledWith('activity_feed', jasmine.objectContaining({
        p_search: 'dominades', p_category: 'pull',
      }));
    });

    it('sense cap filtre no pregunta res: això és per buscar, no per carregar', async () => {
      await service.searchRange('2000-01-01', '2024-12-31', {});

      expect(rpc).not.toHaveBeenCalled();
    });

    it('no repeteix la mateixa cerca', async () => {
      await service.searchRange('2000-01-01', '2024-12-31', { search: 'press' });
      rpc.calls.reset();

      await service.searchRange('2000-01-01', '2024-12-31', { search: 'press' });

      expect(rpc).not.toHaveBeenCalled();
    });

    // Una resposta filtrada diu qui coincideix, no qui hi ha d'haver: donar-la
    // per completa esborraria del dispositiu tot el que no encaixés amb la
    // cerca.
    it('no cobreix el tram ni treu res del que ja hi havia', async () => {
      rows = [feedRow('gener', '2024-01-05')];
      await service.ensureRange('2024-01-01', '2024-01-31');

      rows = [feedRow('vell', '2019-04-02')];
      await service.searchRange('2000-01-01', '2024-12-31', { search: 'press' });

      expect(service.workoutSummaries().map(w => w.id).sort()).toEqual(['gener', 'vell']);
      expect(service.covers('2000-01-01', '2024-12-31')).toBeFalse();
    });
  });
});
