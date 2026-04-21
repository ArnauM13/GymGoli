import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ChartsComponent } from './charts.component';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { Exercise } from '../../core/models/exercise.model';
import { Workout } from '../../core/models/workout.model';

function makeWorkout(date: string, exerciseId: string, overrides: {
  sets?: { weight: number; reps: number }[];
  feeling?: number;
} = {}): Workout {
  return {
    id: date,
    date,
    createdAt: new Date(),
    entries: [{
      exerciseId,
      exerciseName: 'Test',
      sets: overrides.sets ?? [],
      feeling: overrides.feeling as any,
    }],
  };
}

describe('ChartsComponent', () => {
  let component: ChartsComponent;
  let mockGetWorkoutsForExercise: jasmine.Spy;

  beforeEach(async () => {
    mockGetWorkoutsForExercise = jasmine.createSpy().and.returnValue([]);

    const mockWorkoutService = {
      isLoading:              signal(false),
      exercisesWithData:      jasmine.createSpy().and.returnValue(new Set<string>()),
      getWorkoutsForExercise: mockGetWorkoutsForExercise,
      loadAllWorkouts:        jasmine.createSpy(),
    };

    const mockExerciseService = {
      exercises: signal<Exercise[]>([]),
    };

    await TestBed.configureTestingModule({
      imports:   [ChartsComponent],
      providers: [
        { provide: WorkoutService,  useValue: mockWorkoutService },
        { provide: ExerciseService, useValue: mockExerciseService },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(ChartsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Default state ────────────────────────────────────────────────────────

  it('defaults selectedExerciseId to empty string', () => {
    expect(component.selectedExerciseId).toBe('');
  });

  it('defaults selectedMetric to weight', () => {
    expect(component.selectedMetric()).toBe('weight');
  });

  it('exposes three metrics (weight, volume, feeling)', () => {
    const values = component.metrics.map(m => m.value);
    expect(values).toEqual(['weight', 'volume', 'feeling']);
  });

  // ── chartData() ──────────────────────────────────────────────────────────

  describe('chartData()', () => {
    it('returns empty array when no exercise is selected', () => {
      expect(component.chartData()).toEqual([]);
    });

    it('returns empty array when workouts have no sets', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [] }),
      ]);
      component.selectedExerciseId = 'ex1';
      expect(component.chartData()).toEqual([{ date: '2024-03-01', value: 0 }]);
    });

    it('extracts max weight for the weight metric', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 60, reps: 10 }, { weight: 80, reps: 5 }] }),
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 85, reps: 4 }] }),
      ]);
      component.selectedExerciseId = 'ex1';
      component.selectedMetric.set('weight');

      const data = component.chartData();
      expect(data.length).toBe(2);
      expect(data[0]).toEqual({ date: '2024-03-01', value: 80 });
      expect(data[1]).toEqual({ date: '2024-03-08', value: 85 });
    });

    it('computes total volume (weight × reps summed) for the volume metric', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }] }),
      ]);
      component.selectedExerciseId = 'ex1';
      component.selectedMetric.set('volume');

      const data = component.chartData();
      expect(data[0].value).toBe(60 * 10 + 60 * 8); // 1080
    });

    it('reads entry-level feeling for the feeling metric', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 60, reps: 10 }], feeling: 3 }),
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 60, reps: 10 }], feeling: 5 }),
      ]);
      component.selectedExerciseId = 'ex1';
      component.selectedMetric.set('feeling');

      const data = component.chartData();
      expect(data.map(d => d.value)).toEqual([3, 5]);
    });

    it('filters out zero-value points when metric is feeling', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 60, reps: 10 }] }),          // no feeling → 0
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 60, reps: 10 }], feeling: 4 }),
      ]);
      component.selectedExerciseId = 'ex1';
      component.selectedMetric.set('feeling');

      const data = component.chartData();
      expect(data.length).toBe(1);
      expect(data[0].value).toBe(4);
    });

    it('does NOT filter zero-value points for weight metric', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [] }),
      ]);
      component.selectedExerciseId = 'ex1';
      component.selectedMetric.set('weight');

      expect(component.chartData().length).toBe(1);
    });
  });

  // ── stats() ──────────────────────────────────────────────────────────────

  describe('stats()', () => {
    it('returns all zeros when there is no chart data', () => {
      expect(component.stats()).toEqual({ total: 0, max: 0, last: 0, trend: 0 });
    });

    it('counts sessions correctly', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 60, reps: 10 }] }),
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 70, reps: 8 }] }),
        makeWorkout('2024-03-15', 'ex1', { sets: [{ weight: 75, reps: 6 }] }),
      ]);
      component.selectedExerciseId = 'ex1';
      expect(component.stats().total).toBe(3);
    });

    it('returns the max value across all sessions', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 60, reps: 10 }] }),
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 90, reps: 3 }] }),
        makeWorkout('2024-03-15', 'ex1', { sets: [{ weight: 75, reps: 6 }] }),
      ]);
      component.selectedExerciseId = 'ex1';
      expect(component.stats().max).toBe(90);
    });

    it('returns the last session value', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 60, reps: 10 }] }),
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 75, reps: 6 }] }),
      ]);
      component.selectedExerciseId = 'ex1';
      expect(component.stats().last).toBe(75);
    });

    it('calculates positive trend as percentage from first to last', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 100, reps: 5 }] }),
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 110, reps: 5 }] }),
      ]);
      component.selectedExerciseId = 'ex1';
      expect(component.stats().trend).toBe(10); // +10%
    });

    it('calculates negative trend correctly', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [{ weight: 100, reps: 5 }] }),
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 80, reps: 5 }] }),
      ]);
      component.selectedExerciseId = 'ex1';
      expect(component.stats().trend).toBe(-20); // -20%
    });

    it('returns trend 0 when first value is zero', () => {
      mockGetWorkoutsForExercise.and.returnValue([
        makeWorkout('2024-03-01', 'ex1', { sets: [] }),
        makeWorkout('2024-03-08', 'ex1', { sets: [{ weight: 60, reps: 5 }] }),
      ]);
      component.selectedExerciseId = 'ex1';
      expect(component.stats().trend).toBe(0);
    });
  });

  // ── exercises() computed ─────────────────────────────────────────────────

  describe('exercises()', () => {
    it('returns empty when no exercises exist', () => {
      expect(component.exercises()).toEqual([]);
    });
  });

  // ── selectedExerciseId setter / getter ───────────────────────────────────

  describe('selectedExerciseId', () => {
    it('setter updates the getter value', () => {
      component.selectedExerciseId = 'abc';
      expect(component.selectedExerciseId).toBe('abc');
    });
  });

  // ── onExerciseChange() ───────────────────────────────────────────────────

  describe('onExerciseChange()', () => {
    it('does not throw when called with no active chart', () => {
      expect(() => component.onExerciseChange()).not.toThrow();
    });
  });
});
