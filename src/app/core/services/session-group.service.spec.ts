import { TestBed } from '@angular/core/testing';

import { SessionGroupService } from './session-group.service';
import { SportService } from './sport.service';
import { WorkoutService } from './workout.service';
import { Sport, SportSession } from '../models/sport.model';
import { Workout } from '../models/workout.model';
import { ActivityItem } from '../../shared/utils/session-group.utils';

const SPORT = {
  id: 'sp1', name: 'Córrer', icon: 'directions_run', color: '#000',
  subtypes: [], metricDefs: [], createdAt: new Date(),
} as Sport;

function workout(id: string, sessionGroupId?: string, date = '2025-04-21'): ActivityItem {
  const w: Workout = { id, date, entries: [], createdAt: new Date(), sessionGroupId };
  return { kind: 'workout', workout: w };
}

function sport(id: string, sessionGroupId?: string, date = '2025-04-21'): ActivityItem {
  const session: SportSession = { id, date, sportId: 'sp1', createdAt: new Date(), sessionGroupId };
  return { kind: 'sport', sport: SPORT, session };
}

describe('SessionGroupService', () => {
  let service: SessionGroupService;
  let setWorkoutGroup: jasmine.Spy;
  let setSportGroup: jasmine.Spy;

  /** El que el dia té apuntat, repartit tal com ho serveixen els dos
   *  magatzems: fet i planificat, per separat. */
  let plannedWorkouts: Workout[];
  let doneWorkouts: Workout[];
  let plannedSports: { sport: Sport; session: SportSession }[];
  let doneSports: { sport: Sport; session: SportSession }[];

  beforeEach(() => {
    setWorkoutGroup = jasmine.createSpy().and.resolveTo(undefined);
    setSportGroup   = jasmine.createSpy().and.resolveTo(undefined);
    plannedWorkouts = []; doneWorkouts = []; plannedSports = []; doneSports = [];

    TestBed.configureTestingModule({
      providers: [
        { provide: WorkoutService, useValue: {
          setSessionGroup: setWorkoutGroup,
          getPlannedForDate: () => plannedWorkouts,
          getDoneWorkoutsForDate: () => doneWorkouts,
        } },
        { provide: SportService,   useValue: {
          setSessionGroup: setSportGroup,
          getPlannedSportSessionsForDate: () => plannedSports,
          getSportSessionsForDate: () => doneSports,
        } },
      ],
    });
    service = TestBed.inject(SessionGroupService);
  });

  // Amb què es pot unir una activitat es contesta aquí i enlloc més: la
  // targeta, l'activitat oberta i Entrenament han de rebre la mateixa llista.
  describe('groupsForDay()', () => {
    it('hi entra tot el que el dia té apuntat, fet i planificat', () => {
      doneWorkouts  = [{ id: 'w1', date: '2025-04-21', entries: [], createdAt: new Date() }];
      plannedSports = [{
        sport: SPORT,
        session: { id: 's1', date: '2025-04-21', sportId: 'sp1', status: 'planned', createdAt: new Date() },
      }];

      // Els plans van al davant: encara no han passat i no tenen hora amb què
      // ordenar-se entre el que ja s'ha fet.
      expect(service.groupsForDay('2025-04-21').map(g => g.key)).toEqual(['s1', 'w1']);
    });

    it('el que la rutina només projecta queda fora: no és cap fila', () => {
      plannedWorkouts = [{ id: 'routine:2025-04-21:gym:push', date: '2025-04-21', entries: [], createdAt: new Date(), status: 'planned' }];
      plannedSports   = [{ sport: SPORT, session: { id: 'routine:2025-04-21:sport:sp1', date: '2025-04-21', sportId: 'sp1', status: 'planned', createdAt: new Date() } }];

      expect(service.groupsForDay('2025-04-21')).toEqual([]);
    });

    it('i una sessió projectada no es pot unir a res', () => {
      const projected = workout('routine:2025-04-21:gym:push');

      expect(service.canMerge({ key: 'x', grouped: false, items: [projected] })).toBeFalse();
      expect(service.canMerge({ key: 'x', grouped: false, items: [workout('w1')] })).toBeTrue();
    });
  });

  describe('merge()', () => {
    it('dues activitats soltes passen a ser una sola sessió', async () => {
      const id = await service.merge([workout('w1')], [sport('s1')]);

      expect(setWorkoutGroup).toHaveBeenCalledWith('w1', id);
      expect(setSportGroup).toHaveBeenCalledWith('s1', '2025-04-21', id);
    });

    it('es queda el grup que ja existia: només s\'escriu el que hi entra', async () => {
      const id = await service.merge([workout('w1', 'g1'), sport('s1', 'g1')], [sport('s2')]);

      expect(id).toBe('g1');
      expect(setWorkoutGroup).not.toHaveBeenCalled();
      expect(setSportGroup).toHaveBeenCalledOnceWith('s2', '2025-04-21', 'g1');
    });

    it('ajuntant dos grups, tot passa al primer', async () => {
      const id = await service.merge(
        [workout('w1', 'g1')],
        [workout('w2', 'g2'), sport('s1', 'g2')],
      );

      expect(id).toBe('g1');
      expect(setWorkoutGroup).toHaveBeenCalledOnceWith('w2', 'g1');
      expect(setSportGroup).toHaveBeenCalledOnceWith('s1', '2025-04-21', 'g1');
    });

    it('no ajunta res de dos dies diferents', async () => {
      await expectAsync(
        service.merge([workout('w1')], [sport('s1', undefined, '2025-04-22')]),
      ).toBeRejected();

      expect(setWorkoutGroup).not.toHaveBeenCalled();
      expect(setSportGroup).not.toHaveBeenCalled();
    });

    it('cal una activitat a cada banda', async () => {
      await expectAsync(service.merge([workout('w1')], [])).toBeRejected();
      expect(setWorkoutGroup).not.toHaveBeenCalled();
    });
  });

  describe('detach()', () => {
    it('treu l\'activitat del grup', async () => {
      await service.detach(sport('s1', 'g1'));
      expect(setSportGroup).toHaveBeenCalledWith('s1', '2025-04-21', null);
    });
  });

  describe('split()', () => {
    it('desfà la sessió sencera: cada activitat torna a anar sola', async () => {
      await service.split([workout('w1', 'g1'), sport('s1', 'g1')]);

      expect(setWorkoutGroup).toHaveBeenCalledWith('w1', undefined);
      expect(setSportGroup).toHaveBeenCalledWith('s1', '2025-04-21', null);
    });

    it('el que ja anava sol no s\'escriu', async () => {
      await service.split([workout('w1'), sport('s1', 'g1')]);

      expect(setWorkoutGroup).not.toHaveBeenCalled();
      expect(setSportGroup).toHaveBeenCalledWith('s1', '2025-04-21', null);
    });
  });
});
