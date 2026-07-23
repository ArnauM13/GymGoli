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

describe('ChartsComponent', () => {
  let component: ChartsComponent;
  let mockGetWorkoutsForExercise: jasmine.Spy;
  let mockExercisesWithData: ReturnType<typeof signal<Set<string>>>;
  let mockLoadAllWorkouts: jasmine.Spy;

  function setup(
    exercises: Exercise[] = [],
    withData: Set<string> = new Set(),
    workoutsByExercise: Record<string, Workout[]> = {},
  ): void {
    TestBed.resetTestingModule();
    mockGetWorkoutsForExercise = jasmine.createSpy().and.callFake((id: string) => workoutsByExercise[id] ?? []);
    mockExercisesWithData      = signal(withData);
    mockLoadAllWorkouts        = jasmine.createSpy();

    const mockWorkoutService = {
      isLoading:              signal(false),
      doneWorkouts:           jasmine.createSpy().and.returnValue([]),
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
      sessions:     jasmine.createSpy().and.returnValue([]),
      isLoaded:     signal(true),
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSettingsService = {
      weightUnit:         signal<'kg' | 'lb'>('kg'),
      darkMode:           signal(false),
      goalMode:           signal('gym'),
      weeklyActivityGoal: signal(3),
      weeklyGymGoal:      signal(3),
      weeklySportGoal:    signal(2),
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
