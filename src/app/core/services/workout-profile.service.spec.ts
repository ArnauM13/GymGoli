import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WorkoutProfileService } from './workout-profile.service';
import { ActivityCadence, ActivityCadenceService, cadenceKey } from './activity-cadence.service';
import { AuthService } from './auth.service';
import { WorkoutService } from './workout.service';
import { SportService } from './sport.service';
import { TrainingTypeService } from './training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../models/training-type.model';
import { UserSettingsService } from './user-settings.service';
import { Workout } from '../models/workout.model';
import { Sport, SportSession } from '../models/sport.model';
import { ExerciseCategory } from '../models/exercise.model';
import { FitnessGoal } from '../models/user-settings.model';

function makeWorkout(date: string, category: ExerciseCategory): Workout {
  return { id: date + category, date, category, categories: [category], entries: [], createdAt: new Date() };
}

function makeSession(date: string, sportId: string): SportSession {
  return { id: date + sportId, date, sportId, createdAt: new Date() };
}

function makeSport(id: string, name = id): Sport {
  return { id, name, icon: 'sports', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() };
}

describe('WorkoutProfileService', () => {
  let doneWorkouts: ReturnType<typeof signal<Workout[]>>;
  let sessions: ReturnType<typeof signal<SportSession[]>>;
  let sports: ReturnType<typeof signal<Sport[]>>;
  let fitnessGoal: ReturnType<typeof signal<FitnessGoal | null>>;
  let cadence: ReturnType<typeof signal<Map<string, ActivityCadence>>>;
  let service: WorkoutProfileService;

  /** El resum de tota la vida que torna el servidor (migració 038). */
  function cadenceOf(rows: ActivityCadence[]): Map<string, ActivityCadence> {
    return new Map(rows.map(r => [cadenceKey(r.kind, r.key), r]));
  }

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2024-03-15T12:00:00')); // a Friday

    doneWorkouts = signal<Workout[]>([]);
    sessions     = signal<SportSession[]>([]);
    sports       = signal<Sport[]>([]);
    fitnessGoal  = signal<FitnessGoal | null>(null);
    cadence      = signal(new Map<string, ActivityCadence>());

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,         useValue: { uid: signal<string | null>('u1') } },
        { provide: WorkoutService,      useValue: { doneWorkouts, workouts: signal<Workout[]>([]), loadHistorySummaries: jasmine.createSpy('loadHistorySummaries').and.resolveTo(undefined) } },
        { provide: SportService,        useValue: { sessions, sports, loadAllSessions: jasmine.createSpy('loadAllSessions').and.resolveTo(undefined) } },
        { provide: UserSettingsService, useValue: { fitnessGoal } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: ActivityCadenceService, useValue: { byKey: cadence, ensureLoaded: () => Promise.resolve() } },
      ],
    });
    service = TestBed.inject(WorkoutProfileService);
  });

  afterEach(() => jasmine.clock().uninstall());

  describe('gym category profiles', () => {
    it('defaults daysSinceLast to 99 when a category has never been trained', () => {
      const profile = service.profile();
      expect(profile.gym['push'].daysSinceLast).toBe(99);
      expect(profile.gym['pull'].daysSinceLast).toBe(99);
      expect(profile.gym['legs'].daysSinceLast).toBe(99);
    });

    it('computes daysSinceLast from the most recent matching workout', () => {
      doneWorkouts.set([makeWorkout('2024-03-10', 'push')]); // 5 days before mocked "today"
      expect(service.profile().gym['push'].daysSinceLast).toBe(5);
    });

    it('falls back to the goal default gap with a single data point', () => {
      doneWorkouts.set([makeWorkout('2024-03-10', 'push')]);
      // no goal set -> defaults to 'strength' -> gap 4
      expect(service.profile().gym['push'].typicalGapDays).toBe(4);
    });

    it('derives typicalGapDays from the average of recent consecutive gaps', () => {
      doneWorkouts.set([
        makeWorkout('2024-03-13', 'push'),
        makeWorkout('2024-03-10', 'push'), // gap 3
        makeWorkout('2024-03-07', 'push'), // gap 3
      ]);
      expect(service.profile().gym['push'].typicalGapDays).toBe(3);
    });

    it('ignores gaps longer than 14 days as likely breaks, not the real cycle', () => {
      doneWorkouts.set([
        makeWorkout('2024-03-13', 'push'),
        makeWorkout('2024-03-10', 'push'), // gap 3 (kept)
        makeWorkout('2024-01-01', 'push'), // gap ~69 (ignored)
      ]);
      expect(service.profile().gym['push'].typicalGapDays).toBe(3);
    });

    it('clamps typicalGapDays up to minRecovery when the real gap is smaller', () => {
      // 'strength' -> minRecovery 2. Two sessions a single day apart would
      // otherwise compute an average gap of 1, below the safety floor.
      doneWorkouts.set([
        makeWorkout('2024-03-14', 'push'),
        makeWorkout('2024-03-13', 'push'), // gap 1
      ]);
      expect(service.profile().gym['push'].typicalGapDays).toBe(2);
    });

    it('computes overdueScore as daysSinceLast / typicalGapDays', () => {
      doneWorkouts.set([
        makeWorkout('2024-03-11', 'push'), // 4 days ago
        makeWorkout('2024-03-07', 'push'), // gap 4
      ]);
      const p = service.profile().gym['push'];
      expect(p.overdueScore).toBeCloseTo(p.daysSinceLast / p.typicalGapDays, 5);
    });

    it('only counts workouts matching the given category', () => {
      doneWorkouts.set([makeWorkout('2024-03-14', 'pull')]);
      expect(service.profile().gym['push'].daysSinceLast).toBe(99);
      expect(service.profile().gym['pull'].daysSinceLast).toBe(1);
    });
  });

  describe('goal-based defaults', () => {
    it('uses the strength defaults when no goal is set', () => {
      doneWorkouts.set([makeWorkout('2024-03-14', 'push')]);
      expect(service.profile().minRecovery).toBe(2);
      expect(service.profile().gym['push'].typicalGapDays).toBe(4);
    });

    it('uses the sport goal defaults when the goal is "sport"', () => {
      fitnessGoal.set('sport');
      doneWorkouts.set([makeWorkout('2024-03-14', 'push')]);
      expect(service.profile().minRecovery).toBe(1);
      expect(service.profile().gym['push'].typicalGapDays).toBe(5);
    });
  });

  // El mateix càlcul que el gimnàs, sobre les mateixes dades: abans l'esport
  // només tenia «l'últim que vas fer», que no diu si et toca.
  describe('sport profiles', () => {
    it('computes daysSinceLast, typicalGapDays and overdueScore per sport', () => {
      sports.set([makeSport('padel')]);
      sessions.set([
        makeSession('2024-03-11', 'padel'),  // 4 days before mocked "today"
        makeSession('2024-03-07', 'padel'),  // gap 4
        makeSession('2024-03-03', 'padel'),  // gap 4
      ]);
      const p = service.profile().sport['padel'];
      expect(p.daysSinceLast).toBe(4);
      expect(p.typicalGapDays).toBe(4);
      expect(p.overdueScore).toBeCloseTo(1, 5);
      expect(p.everDone).toBeTrue();
    });

    it('a sport with no history at all is not "everDone"', () => {
      sports.set([makeSport('padel')]);
      const p = service.profile().sport['padel'];
      expect(p.everDone).toBeFalse();
      expect(p.daysSinceLast).toBe(99);
    });

    it('un planificat no és una sessió feta', () => {
      sports.set([makeSport('padel')]);
      sessions.set([{ ...makeSession('2024-03-14', 'padel'), status: 'planned' }]);
      expect(service.profile().sport['padel'].everDone).toBeFalse();
    });
  });

  // La finestra recent són tres mesos. El que va quedar fora el diu el
  // servidor, en una fila per activitat: sense això, el pàdel de fa mig any i
  // un esport que no s'ha tocat mai es llegeixen igual.
  describe('el que fa temps que no fas', () => {
    it('l\'última vegada surt del resum del servidor quan no és a la finestra', () => {
      sports.set([makeSport('padel')]);
      cadence.set(cadenceOf([
        { kind: 'sport', key: 'padel', sessions: 40, firstDate: '2022-01-01', lastDate: '2023-09-15' },
      ]));
      const p = service.profile().sport['padel'];
      expect(p.everDone).toBeTrue();
      expect(p.daysSinceLast).toBe(182);   // 2023-09-15 → 2024-03-15
      expect(p.sessions).toBe(40);
    });

    it('el mateix per a un tipus d\'entrenament: una classe que has deixat', () => {
      cadence.set(cadenceOf([
        { kind: 'gym', key: 'push', sessions: 22, firstDate: '2023-01-02', lastDate: '2023-12-15' },
      ]));
      const p = service.profile().gym['push'];
      expect(p.everDone).toBeTrue();
      expect(p.daysSinceLast).toBe(91);
    });

    it('la finestra recent mana sobre el resum: és la que té les dates de debò', () => {
      doneWorkouts.set([makeWorkout('2024-03-13', 'push')]);
      cadence.set(cadenceOf([
        { kind: 'gym', key: 'push', sessions: 22, firstDate: '2023-01-02', lastDate: '2023-12-15' },
      ]));
      expect(service.profile().gym['push'].daysSinceLast).toBe(2);
    });

    it('sense sessions recents, la cadència surt del resum, retallada a 14 dies', () => {
      sports.set([makeSport('padel')]);
      cadence.set(cadenceOf([
        // 4 sessions en dos anys: una cada ~240 dies. Retallat, 14.
        { kind: 'sport', key: 'padel', sessions: 4, firstDate: '2022-01-01', lastDate: '2023-12-01' },
      ]));
      expect(service.profile().sport['padel'].typicalGapDays).toBe(14);
    });

    it('sense resum del servidor (migració no executada) tot continua igual', () => {
      doneWorkouts.set([makeWorkout('2024-03-10', 'push')]);
      expect(service.profile().gym['push'].daysSinceLast).toBe(5);
      expect(service.profile().gym['pull'].everDone).toBeFalse();
    });
  });
});
