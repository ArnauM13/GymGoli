import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { HistoryComponent } from './history.component';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { FeelingLevel, Workout, WorkoutEntry } from '../../core/models/workout.model';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

describe('HistoryComponent', () => {
  let component: HistoryComponent;
  let mockWorkouts: ReturnType<typeof signal<Workout[]>>;

  beforeEach(async () => {
    mockWorkouts = signal<Workout[]>([]);

    const mockWorkoutService = {
      workouts:         mockWorkouts,
      isLoading:        signal(false),
      getWorkoutForDate:  jasmine.createSpy().and.returnValue(null),
      todayDateString:    jasmine.createSpy().and.returnValue(TODAY),
      loadAllWorkouts:    jasmine.createSpy(),
    };

    const mockExerciseService = {
      exercises: signal<any[]>([]),
      getById:   jasmine.createSpy().and.returnValue(null),
    };

    const mockSportService = {
      sports:                   signal<any[]>([]),
      getSportSessionsForDate:  jasmine.createSpy().and.returnValue([]),
    };

    await TestBed.configureTestingModule({
      imports:   [HistoryComponent],
      providers: [
        { provide: WorkoutService,  useValue: mockWorkoutService },
        { provide: ExerciseService, useValue: mockExerciseService },
        { provide: SportService,    useValue: mockSportService },
      ],
    })
      .overrideComponent(HistoryComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(HistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── getFeelingEmoji() ────────────────────────────────────────────────────

  describe('getFeelingEmoji()', () => {
    it('returns 🔥 for level 1 (excellent)', () => {
      expect(component.getFeelingEmoji(1 as FeelingLevel)).toBe('🔥');
    });

    it('returns 💀 for level 5 (very hard)', () => {
      expect(component.getFeelingEmoji(5 as FeelingLevel)).toBe('💀');
    });
  });

  // ── getCatColor() / getCatLabel() ────────────────────────────────────────

  describe('getCatColor()', () => {
    it('returns the push color', () => {
      expect(component.getCatColor('push')).toBe('#e57373');
    });

    it('returns #bbb for an unknown category', () => {
      expect(component.getCatColor('unknown')).toBe('#bbb');
    });
  });

  describe('getCatLabel()', () => {
    it('returns the Catalan label for push', () => {
      expect(component.getCatLabel('push')).toBe('Empenta');
    });

    it('returns the key itself for an unknown category', () => {
      expect(component.getCatLabel('custom')).toBe('custom');
    });
  });

  // ── totalSets() ──────────────────────────────────────────────────────────

  describe('totalSets()', () => {
    it('returns 0 for a workout with no entries', () => {
      expect(component.totalSets(makeWorkout())).toBe(0);
    });

    it('sums all sets across entries', () => {
      const w = makeWorkout({
        entries: [
          { exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }] },
          { exerciseId: 'b', exerciseName: 'B', sets: [{ weight: 80, reps: 5 }] },
        ],
      });
      expect(component.totalSets(w)).toBe(3);
    });
  });

  // ── getMaxWeight() ───────────────────────────────────────────────────────

  describe('getMaxWeight()', () => {
    it('returns 0 for an entry with no sets', () => {
      const entry: WorkoutEntry = { exerciseId: 'x', exerciseName: 'X', sets: [] };
      expect(component.getMaxWeight(entry)).toBe(0);
    });

    it('returns the maximum weight', () => {
      const entry: WorkoutEntry = {
        exerciseId: 'x', exerciseName: 'X',
        sets: [{ weight: 40, reps: 12 }, { weight: 60, reps: 8 }, { weight: 55, reps: 6 }],
      };
      expect(component.getMaxWeight(entry)).toBe(60);
    });
  });

  // ── getDay() ─────────────────────────────────────────────────────────────

  describe('getDay()', () => {
    it('returns the day number as a string', () => {
      expect(component.getDay('2024-03-05')).toBe('5');
    });
  });

  // ── getWorkoutStripe() ───────────────────────────────────────────────────

  describe('getWorkoutStripe()', () => {
    it('returns grey for a workout with no categories', () => {
      expect(component.getWorkoutStripe(makeWorkout())).toBe('#e0e0e0');
    });

    it('returns the single category color', () => {
      expect(component.getWorkoutStripe(makeWorkout({ categories: ['push'] }))).toBe('#e57373');
    });

    it('returns a linear-gradient for multiple categories', () => {
      const result = component.getWorkoutStripe(makeWorkout({ categories: ['push', 'pull'] }));
      expect(result).toContain('linear-gradient');
      expect(result).toContain('#e57373');
      expect(result).toContain('#64b5f6');
    });
  });

  // ── toggleExpanded() ─────────────────────────────────────────────────────

  describe('toggleExpanded()', () => {
    it('sets expandedId to the given id', () => {
      component.toggleExpanded('w1');
      expect(component.expandedId()).toBe('w1');
    });

    it('collapses when the same id is toggled again', () => {
      component.toggleExpanded('w1');
      component.toggleExpanded('w1');
      expect(component.expandedId()).toBeNull();
    });

    it('switches to a different id', () => {
      component.toggleExpanded('w1');
      component.toggleExpanded('w2');
      expect(component.expandedId()).toBe('w2');
    });
  });

  // ── selectDate() ─────────────────────────────────────────────────────────

  describe('selectDate()', () => {
    it('sets selectedDate', () => {
      component.selectDate('2024-03-15');
      expect(component.selectedDate()).toBe('2024-03-15');
    });

    it('deselects when the same date is selected again', () => {
      component.selectDate('2024-03-15');
      component.selectDate('2024-03-15');
      expect(component.selectedDate()).toBeNull();
    });

    it('resets selectedExerciseId on each date change', () => {
      component.selectedExerciseId.set('ex1');
      component.selectDate('2024-03-15');
      expect(component.selectedExerciseId()).toBeNull();
    });
  });

  // ── filteredWorkouts() ───────────────────────────────────────────────────

  describe('filteredWorkouts()', () => {
    beforeEach(() => {
      // WorkoutService returns workouts sorted newest-first, matching real service behaviour
      mockWorkouts.set([
        makeWorkout({ id: '3', date: '2024-03-03', categories: ['push', 'pull'] }),
        makeWorkout({ id: '2', date: '2024-03-02', categories: ['pull'] }),
        makeWorkout({ id: '1', date: '2024-03-01', categories: ['push'] }),
      ]);
    });

    it('returns all workouts when no filter is active', () => {
      component.filterCat.set(null);
      expect(component.filteredWorkouts().length).toBe(3);
    });

    it('filters to only workouts containing the selected category', () => {
      component.filterCat.set('pull');
      const results = component.filteredWorkouts();
      expect(results.length).toBe(2);
      expect(results.every(w => (w.categories ?? []).includes('pull'))).toBeTrue();
    });

    it('reverses order when sortDesc is false', () => {
      component.sortDesc.set(false);
      const ids = component.filteredWorkouts().map(w => w.id);
      expect(ids).toEqual(['1', '2', '3']);
    });
  });

  // ── viewMode signal ──────────────────────────────────────────────────────

  describe('viewMode signal', () => {
    it('defaults to calendar mode', () => {
      expect(component.viewMode()).toBe('calendar');
    });

    it('can be switched to list mode', () => {
      component.viewMode.set('list');
      expect(component.viewMode()).toBe('list');
    });
  });
});
