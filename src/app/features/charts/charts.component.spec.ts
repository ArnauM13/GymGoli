import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { ChartsComponent } from './charts.component';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { Exercise } from '../../core/models/exercise.model';
import { Workout } from '../../core/models/workout.model';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { TodayService } from '../../core/services/today.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

function makeExercise(id: string, category: 'push' | 'pull' | 'legs' = 'push'): Exercise {
  return { id, name: `Exercise ${id}`, category, createdAt: new Date() };
}

function makeWorkout(date: string, exerciseId: string, overrides: {
  sets?: { weight: number; reps: number }[];
} = {}): Workout {
  return {
    id: date,
    date,
    createdAt: new Date(),
    entries: [{
      exerciseId,
      exerciseName: 'Test',
      sets: overrides.sets ?? [],
    }],
  };
}

/** Un dilluns, perquè «aquesta setmana» sigui un rang conegut al test. */
const MONDAY = '2024-03-04';

interface GoalConfig {
  goalMode?: 'combined' | 'separate';
  weeklyActivityGoal?: number | null;
  weeklyGymGoal?: number | null;
  weeklySportGoal?: number | null;
}

describe('ChartsComponent', () => {
  let component: ChartsComponent;
  let mockGetWorkoutsForExercise: jasmine.Spy;
  let mockExercisesWithData: ReturnType<typeof signal<Set<string>>>;
  let mockLoadAllWorkouts: jasmine.Spy;
  let mockDoneWorkouts: jasmine.Spy;
  let mockSessions: jasmine.Spy;

  function setup(
    exercises: Exercise[] = [],
    withData: Set<string> = new Set(),
    workoutsByExercise: Record<string, Workout[]> = {},
    opts: { goal?: GoalConfig; done?: Workout[]; sessions?: { date: string }[] } = {},
  ): void {
    TestBed.resetTestingModule();
    mockGetWorkoutsForExercise = jasmine.createSpy().and.callFake((id: string) => workoutsByExercise[id] ?? []);
    mockExercisesWithData      = signal(withData);
    mockLoadAllWorkouts        = jasmine.createSpy();

    mockDoneWorkouts = jasmine.createSpy().and.returnValue(opts.done ?? []);
    mockSessions     = jasmine.createSpy().and.returnValue(opts.sessions ?? []);

    const mockWorkoutService = {
      isLoading:              signal(false),
      doneWorkouts:           mockDoneWorkouts,
      exercisesWithData:      mockExercisesWithData,
      getWorkoutsForExercise: mockGetWorkoutsForExercise,
      loadAllWorkouts:        mockLoadAllWorkouts,
    };

    const mockExerciseService = {
      exercises:    signal<Exercise[]>(exercises),
      isLoaded:     signal(true),
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSportService = {
      sports:       signal<any[]>([]),
      sessions:     mockSessions,
      isLoaded:     signal(true),
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    const goal = opts.goal ?? {};
    const mockSettingsService = {
      weightUnit:         signal<'kg' | 'lb'>('kg'),
      darkMode:           signal(false),
      goalMode:           signal(goal.goalMode ?? 'combined'),
      // `null` és un valor vàlid («sense objectiu»), així que només s'omple
      // el que no s'ha dit.
      weeklyActivityGoal: signal(goal.weeklyActivityGoal === undefined ? 3 : goal.weeklyActivityGoal),
      weeklyGymGoal:      signal(goal.weeklyGymGoal      === undefined ? 3 : goal.weeklyGymGoal),
      weeklySportGoal:    signal(goal.weeklySportGoal    === undefined ? 2 : goal.weeklySportGoal),
    };

    TestBed.configureTestingModule({
      imports:   [ChartsComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutService,      useValue: mockWorkoutService },
        { provide: ExerciseService,     useValue: mockExerciseService },
        { provide: SportService,        useValue: mockSportService },
        { provide: UserSettingsService, useValue: mockSettingsService },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: TodayService,        useValue: { today: signal(MONDAY) } },
      ],
    });

    const fixture = TestBed.createComponent(ChartsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => setup());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads the full workout history up-front instead of a manual "load more" step', () => {
    expect(mockLoadAllWorkouts).toHaveBeenCalled();
  });

  it('defaults expandedExerciseId to null', () => {
    expect(component.expandedExerciseId()).toBeNull();
  });

  // ── exerciseGroups() ────────────────────────────────────────────────────

  describe('exerciseGroups()', () => {
    it('returns empty when no exercises have data', () => {
      expect(component.exerciseGroups()).toEqual([]);
    });

    it('includes every exercise that has logged data, grouped by category', () => {
      setup(
        [makeExercise('a', 'push'), makeExercise('b', 'legs'), makeExercise('c', 'push')],
        new Set(['a', 'b']),
      );

      const groups = component.exerciseGroups();
      expect(groups.map(g => g.cat)).toEqual(['push', 'legs']);
      expect(groups.find(g => g.cat === 'push')!.records.map(r => r.exercise.id)).toEqual(['a']);
      expect(groups.find(g => g.cat === 'legs')!.records.map(r => r.exercise.id)).toEqual(['b']);
    });

    it('shows a max-weight record when positive-weight sets exist', () => {
      setup([makeExercise('a')], new Set(['a']), {
        a: [
          makeWorkout('2024-03-01', 'a', { sets: [{ weight: 60, reps: 10 }] }),
          makeWorkout('2024-03-08', 'a', { sets: [{ weight: 80, reps: 5 }] }),
        ],
      });

      const record = component.exerciseGroups()[0].records[0];
      expect(record.display).toBe(80);
    });

    it('lists a bodyweight exercise (no positive weight logged) with a null record', () => {
      setup([makeExercise('a')], new Set(['a']), {
        a: [makeWorkout('2024-03-01', 'a', { sets: [{ weight: 0, reps: 10 }] })],
      });

      const record = component.exerciseGroups()[0].records[0];
      expect(record.display).toBeNull();
    });
  });

  // ── weekBars() ───────────────────────────────────────────────────────────

  describe('weekBars()', () => {
    function onDate(date: string): Workout {
      return { id: date, date, createdAt: new Date(), entries: [] };
    }

    it('counts only the current week, in local dates', () => {
      // Diumenge passat i dilluns que ve queden fora; la setmana va de
      // 2024-03-04 a 2024-03-10.
      setup([], new Set(), {}, {
        done: [onDate('2024-03-03'), onDate('2024-03-04'), onDate('2024-03-10'), onDate('2024-03-11')],
      });

      expect(component.thisWeekCount()).toBe(2);
    });

    it('shows one combined row plus the two breakdowns when the goal is combined', () => {
      setup([], new Set(), {}, {
        goal: { goalMode: 'combined', weeklyActivityGoal: 4 },
        done: [onDate('2024-03-05'), onDate('2024-03-06')],
        sessions: [{ date: '2024-03-07' }],
      });

      const bars = component.weekBars();
      expect(bars.map(b => b.label)).toEqual(['Activitats', 'Gimnàs', 'Esport']);
      expect(bars[0].count).toBe(3);
      expect(bars[0].pct).toBe(75);
      expect(bars[0].done).toBeFalse();
      // Les files de detall no porten barra: no tenen objectiu propi.
      expect(bars[1].target).toBeNull();
      expect(bars[2].count).toBe(1);
    });

    it('shows a row per goal when gym and sport are tracked separately', () => {
      setup([], new Set(), {}, {
        goal: { goalMode: 'separate', weeklyGymGoal: 2, weeklySportGoal: 2 },
        done: [onDate('2024-03-05'), onDate('2024-03-06')],
        sessions: [{ date: '2024-03-07' }],
      });

      const bars = component.weekBars();
      expect(bars.map(b => b.label)).toEqual(['Gimnàs', 'Esport']);
      expect(bars[0].done).toBeTrue();
      expect(bars[1].done).toBeFalse();
    });

    it('keeps the count and drops the bar when there is no goal set', () => {
      setup([], new Set(), {}, {
        goal: { goalMode: 'combined', weeklyActivityGoal: null },
        done: [onDate('2024-03-05')],
      });

      const combined = component.weekBars()[0];
      expect(combined.count).toBe(1);
      expect(combined.target).toBeNull();
      expect(combined.done).toBeFalse();
    });
  });

  // ── toggleExercise() ─────────────────────────────────────────────────────

  describe('toggleExercise()', () => {
    it('expands the given exercise', () => {
      component.toggleExercise('ex-abc');
      expect(component.expandedExerciseId()).toBe('ex-abc');
    });

    it('collapses it again on a second call with the same id', () => {
      component.toggleExercise('ex-abc');
      component.toggleExercise('ex-abc');
      expect(component.expandedExerciseId()).toBeNull();
    });

    it('switches to the newly clicked exercise, closing the previous one', () => {
      component.toggleExercise('ex-abc');
      component.toggleExercise('ex-def');
      expect(component.expandedExerciseId()).toBe('ex-def');
    });
  });
});
