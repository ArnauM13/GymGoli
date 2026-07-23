import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WorkoutProfileService } from './workout-profile.service';
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
  let service: WorkoutProfileService;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2024-03-15T12:00:00')); // a Friday

    doneWorkouts = signal<Workout[]>([]);
    sessions     = signal<SportSession[]>([]);
    sports       = signal<Sport[]>([]);
    fitnessGoal  = signal<FitnessGoal | null>(null);

    TestBed.configureTestingModule({
      providers: [
        { provide: WorkoutService,      useValue: { doneWorkouts, workouts: signal<Workout[]>([]), loadAllWorkouts: jasmine.createSpy('loadAllWorkouts').and.resolveTo(undefined) } },
        { provide: SportService,        useValue: { sessions, sports, loadAllSessions: jasmine.createSpy('loadAllSessions').and.resolveTo(undefined) } },
        { provide: UserSettingsService, useValue: { fitnessGoal } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
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

  describe('favoriteSport', () => {
    it('is null when there are no sports at all', () => {
      expect(service.profile().favoriteSport).toBeNull();
    });

    it('picks the sport with the most sessions in the last 30 days', () => {
      sports.set([makeSport('running'), makeSport('padel')]);
      sessions.set([
        makeSession('2024-03-10', 'running'),
        makeSession('2024-03-05', 'running'),
        makeSession('2024-03-01', 'padel'),
      ]);
      expect(service.profile().favoriteSport?.id).toBe('running');
    });

    it('ignores sessions older than 30 days', () => {
      sports.set([makeSport('running'), makeSport('padel')]);
      sessions.set([
        makeSession('2024-01-01', 'running'), // > 30 days ago, ignored
        makeSession('2024-03-10', 'padel'),
      ]);
      expect(service.profile().favoriteSport?.id).toBe('padel');
    });

    it('falls back to the first configured sport when nothing was logged recently', () => {
      sports.set([makeSport('running'), makeSport('padel')]);
      expect(service.profile().favoriteSport?.id).toBe('running');
    });
  });

  describe('recentSport', () => {
    it('is null when there are no sessions', () => {
      expect(service.profile().recentSport).toBeNull();
    });

    it('is the sport of the most recent session, regardless of the 30-day window', () => {
      sports.set([makeSport('running'), makeSport('padel')]);
      sessions.set([
        makeSession('2024-01-01', 'running'),
        makeSession('2024-02-01', 'padel'),
      ]);
      expect(service.profile().recentSport?.id).toBe('padel');
    });
  });
});
