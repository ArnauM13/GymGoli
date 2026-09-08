import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { RoutineProjectionService, isRoutineProjection, routineGymId } from './routine-projection.service';
import { TemplateService } from './template.service';
import { TodayService } from './today.service';
import { UserSettingsService } from './user-settings.service';
import { WeeklyPlan } from '../models/weekly-plan.model';
import { WorkoutTemplate } from '../models/template.model';

function emptyPlan(): WeeklyPlan {
  return { recurring: true, days: [[], [], [], [], [], [], []] };
}

describe('RoutineProjectionService', () => {
  let plan: ReturnType<typeof signal<WeeklyPlan | null>>;
  let dismissed: ReturnType<typeof signal<string[]>>;
  let templates: WorkoutTemplate[];
  let update: jasmine.Spy;
  let service: RoutineProjectionService;

  // Dimecres. `mondayOf()` → 2024-03-04, o sigui que dilluns i dimarts
  // d'aquella setmana ja han passat.
  const TODAY = '2024-03-06';

  beforeEach(() => {
    plan      = signal<WeeklyPlan | null>(null);
    dismissed = signal<string[]>([]);
    templates = [];
    update    = jasmine.createSpy('update').and.resolveTo(undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: UserSettingsService, useValue: {
          weeklyPlan:            () => plan(),
          dismissedRoutinePlans: () => dismissed(),
          update,
        } },
        { provide: TemplateService, useValue: { templates: () => templates } },
        { provide: TodayService,    useValue: { today: () => TODAY } },
      ],
    });
    service = TestBed.inject(RoutineProjectionService);
  });

  function planGymOn(dayIndex: number, category = 'push', templateId?: string): void {
    const p = emptyPlan();
    p.days[dayIndex] = [{ type: 'gym', category: category as 'push', templateId }];
    plan.set(p);
  }

  it('sense rutina no proposa res', () => {
    expect(service.hasRoutine()).toBeFalse();
    expect(service.projectedFor('2024-03-08').gym).toEqual([]);
  });

  it('un pla desat però no recurrent no és una rutina', () => {
    plan.set({ recurring: false, days: [[{ type: 'gym', category: 'push' }], [], [], [], [], [], []] });

    expect(service.hasRoutine()).toBeFalse();
    expect(service.projectedFor('2024-03-11').gym).toEqual([]);   // dilluns vinent
  });

  it('proposa el que toca aquell dia de la setmana', () => {
    planGymOn(4, 'legs');   // divendres

    const friday = service.projectedFor('2024-03-08').gym;
    expect(friday.length).toBe(1);
    expect(friday[0].category).toBe('legs');
    expect(service.projectedFor('2024-03-07').gym).toEqual([]);   // dijous
  });

  it('proposa també per a avui', () => {
    planGymOn(2, 'push');   // dimecres, que és avui

    expect(service.projectedFor(TODAY).gym.length).toBe(1);
  });

  // Una rutina que no vas complir el mes passat no és un planificat pendent:
  // és un dia que no vas entrenar. Omplir l'historial de fantasmes seria
  // pitjor que no dir-ne res.
  it('no proposa res cap enrere', () => {
    planGymOn(0, 'push');   // dilluns, que aquesta setmana ja ha passat

    expect(service.projectedFor('2024-03-04').gym).toEqual([]);
  });

  it('no proposa més enllà de l\'horitzó', () => {
    planGymOn(2, 'push');

    expect(service.projectedFor('2024-05-29').gym.length).toBe(1);   // dins de 13 setmanes
    expect(service.projectedFor('2024-09-04').gym).toEqual([]);      // molt més enllà
  });

  it('un dia tret per l\'usuari deixa de proposar-se', () => {
    planGymOn(4, 'push');
    const id = routineGymId('2024-03-08', 'push');
    expect(service.projectedFor('2024-03-08').gym.map(g => g.id)).toEqual([id]);

    dismissed.set([id]);

    expect(service.projectedFor('2024-03-08').gym).toEqual([]);
    // I només aquell dia: la regla no s'ha tocat.
    expect(service.projectedFor('2024-03-15').gym.length).toBe(1);
  });

  it('els ids d\'una projecció es reconeixen, i els d\'una fila de debò no', () => {
    expect(isRoutineProjection(routineGymId('2024-03-08', 'push'))).toBeTrue();
    expect(isRoutineProjection('9f1c0f6e-0000-4000-8000-000000000000')).toBeFalse();
  });

  it('materialitza els exercicis de la plantilla que el pla referencia', () => {
    templates = [{
      id: 'tpl-1', name: 'Push A', category: 'push', createdAt: '2024-01-01',
      entries: [
        { exerciseId: 'ex1', exerciseName: 'Press banca', sets: 3, reps: 8, weight: 60 },
        { exerciseId: 'ex2', exerciseName: 'Press militar' },
      ],
    } as unknown as WorkoutTemplate];
    planGymOn(4, 'push', 'tpl-1');

    expect(service.projectedFor('2024-03-08').gym[0].entries).toEqual([
      { exerciseId: 'ex1', exerciseName: 'Press banca', sets: [
        { weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 },
      ] },
      { exerciseId: 'ex2', exerciseName: 'Press militar', sets: [] },
    ]);
  });

  it('una llista feta a mà mana sobre la plantilla', () => {
    templates = [{
      id: 'tpl-1', name: 'Push A', category: 'push', createdAt: '2024-01-01',
      entries: [{ exerciseId: 'de-plantilla', exerciseName: 'De plantilla' }],
    } as unknown as WorkoutTemplate];
    const p = emptyPlan();
    p.days[4] = [{
      type: 'gym', category: 'push', templateId: 'tpl-1',
      entries: [{ exerciseId: 'a-ma', exerciseName: 'A mà' }],
    }];
    plan.set(p);

    expect(service.projectedFor('2024-03-08').gym[0].entries.map(e => e.exerciseId)).toEqual(['a-ma']);
  });

  // La llista viu dins `user_settings`: un dia tret fa mig any ja no filtra
  // res i només ocuparia lloc.
  it('en treure un dia, neteja els que ja han passat', async () => {
    dismissed.set([routineGymId('2023-01-02', 'push'), routineGymId('2024-04-01', 'push')]);

    await service.dismiss(routineGymId('2024-03-08', 'push'));

    expect(update).toHaveBeenCalledWith({ dismissedRoutinePlans: [
      routineGymId('2024-04-01', 'push'),
      routineGymId('2024-03-08', 'push'),
    ] });
  });
});
