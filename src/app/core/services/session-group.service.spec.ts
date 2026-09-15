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
  let setWorkoutStartedAt: jasmine.Spy;
  let setSportStartedAt: jasmine.Spy;

  /** El que el dia té apuntat, repartit tal com ho serveixen els dos
   *  magatzems: fet i planificat, per separat. */
  let plannedWorkouts: Workout[];
  let doneWorkouts: Workout[];
  let plannedSports: { sport: Sport; session: SportSession }[];
  let doneSports: { sport: Sport; session: SportSession }[];

  beforeEach(() => {
    setWorkoutGroup = jasmine.createSpy().and.resolveTo(undefined);
    setSportGroup   = jasmine.createSpy().and.resolveTo(undefined);
    setWorkoutStartedAt = jasmine.createSpy().and.resolveTo(undefined);
    setSportStartedAt   = jasmine.createSpy().and.resolveTo(undefined);
    plannedWorkouts = []; doneWorkouts = []; plannedSports = []; doneSports = [];

    TestBed.configureTestingModule({
      providers: [
        { provide: WorkoutService, useValue: {
          setSessionGroup: setWorkoutGroup,
          setStartedAt: setWorkoutStartedAt,
          getPlannedForDate: () => plannedWorkouts,
          getDoneWorkoutsForDate: () => doneWorkouts,
        } },
        { provide: SportService,   useValue: {
          setSessionGroup: setSportGroup,
          setStartedAt: setSportStartedAt,
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

  // ── L'ordre de dins d'una anada ──
  // El que es desa és l'hora, que és el que ordena el dia a tot arreu: no hi
  // ha cap segona llista d'ordres que s'hagi de mantenir d'acord amb aquesta.
  describe('reorder()', () => {
    /** Dues activitats del mateix dia, amb l'hora d'alta a una hora de
     *  distància. */
    function pair(): ActivityItem[] {
      const w = workout('w1');
      const s = sport('s1');
      (w as { workout: Workout }).workout.createdAt      = new Date('2025-04-21T10:00:00');
      (s as { session: SportSession }).session.createdAt = new Date('2025-04-21T11:00:00');
      return [w, s];
    }

    it("escriu l'hora de cadascuna en l'ordre demanat", async () => {
      const [w, sp] = pair();
      await service.reorder([sp, w]);

      const sportAt   = setSportStartedAt.calls.mostRecent().args[2] as Date;
      const workoutAt = setWorkoutStartedAt.calls.mostRecent().args[1] as Date;
      // La primera es queda l'hora de base —la més matinera de la sessió— i la
      // segona va just després.
      expect(sportAt.getTime()).toBe(new Date('2025-04-21T10:00:00').getTime());
      expect(workoutAt.getTime()).toBeGreaterThan(sportAt.getTime());
    });

    it('no torna a escriure el que ja és al seu lloc', async () => {
      const [w, sp] = pair();
      await service.reorder([sp, w]);
      setSportStartedAt.calls.reset();
      setWorkoutStartedAt.calls.reset();

      // La segona vegada, les hores ja hi són: no hi ha res a dir.
      const moved = [
        { kind: 'sport', sport: SPORT, session: { ...(sp as { session: SportSession }).session, startedAt: new Date('2025-04-21T10:00:00') } },
        { kind: 'workout', workout: { ...(w as { workout: Workout }).workout, startedAt: new Date('2025-04-21T10:01:00') } },
      ] as ActivityItem[];
      await service.reorder(moved);

      expect(setSportStartedAt).not.toHaveBeenCalled();
      expect(setWorkoutStartedAt).not.toHaveBeenCalled();
    });

    it("una sola activitat ja està ordenada", async () => {
      await service.reorder([workout('w1')]);
      expect(setWorkoutStartedAt).not.toHaveBeenCalled();
    });

    it('i una sessió no surt mai d\'un dia', async () => {
      await expectAsync(service.reorder([workout('w1'), workout('w2', undefined, '2025-04-22')]))
        .toBeRejected();
    });
  });
});
