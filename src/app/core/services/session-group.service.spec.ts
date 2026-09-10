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

  beforeEach(() => {
    setWorkoutGroup = jasmine.createSpy().and.resolveTo(undefined);
    setSportGroup   = jasmine.createSpy().and.resolveTo(undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: WorkoutService, useValue: { setSessionGroup: setWorkoutGroup } },
        { provide: SportService,   useValue: { setSessionGroup: setSportGroup } },
      ],
    });
    service = TestBed.inject(SessionGroupService);
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
