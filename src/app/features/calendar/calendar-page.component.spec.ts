import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { CalendarPageComponent } from './calendar-page.component';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { AuthService } from '../../core/services/auth.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { FeelingLevel, Workout, WorkoutEntry } from '../../core/models/workout.model';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

describe('CalendarPageComponent', () => {
  let component: CalendarPageComponent;

  beforeEach(async () => {
    const mockWorkoutService = {
      isLoading:           signal(false),
      getWorkoutForDate:   jasmine.createSpy().and.returnValue(null),
      getWorkoutsForDate:  jasmine.createSpy().and.returnValue([]),
      todayDateString:     jasmine.createSpy().and.returnValue(TODAY),
      loadWorkoutPage:     jasmine.createSpy().and.resolveTo({ workouts: [], total: 0 }),
      createPlannedWorkout: jasmine.createSpy().and.resolveTo('w1'),
      deleteWorkout:       jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockExerciseService = {
      exercises:    signal<any[]>([]),
      isLoaded:     signal(true),
      getById:      jasmine.createSpy().and.returnValue(null),
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSportService = {
      sports:                        signal<any[]>([]),
      isLoaded:                      signal(true),
      getSportSessionsForDate:       jasmine.createSpy().and.returnValue([]),
      getPlannedSportSessionsForDate: jasmine.createSpy().and.returnValue([]),
      logSession:                    jasmine.createSpy().and.resolveTo(undefined),
      deleteSession:                 jasmine.createSpy().and.resolveTo(undefined),
      ensureLoaded:                  jasmine.createSpy().and.resolveTo(undefined),
    };

    await TestBed.configureTestingModule({
      imports:   [CalendarPageComponent],
      providers: [
        { provide: WorkoutService,      useValue: mockWorkoutService },
        { provide: ExerciseService,     useValue: mockExerciseService },
        { provide: SportService,        useValue: mockSportService },
        { provide: AuthService,         useValue: { uid: signal('user-1') } },
        { provide: UserSettingsService, useValue: { weightUnit: signal<'kg' | 'lb'>('kg'), difficultyScale: signal('emoji') } },
        { provide: FeedbackService,     useValue: { success: jasmine.createSpy(), error: jasmine.createSpy() } },
      ],
    })
      .overrideComponent(CalendarPageComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(CalendarPageComponent);
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

  // ── getEntrySubLabel() ──────────────────────────────────────────────────

  describe('getEntrySubLabel()', () => {
    it('returns empty string when exercise is not found', () => {
      const entry: WorkoutEntry = { exerciseId: 'unknown', exerciseName: 'X', sets: [] };
      expect(component.getEntrySubLabel(entry)).toBe('');
    });

    it('returns the subcategory label when exercise has a subcategory', () => {
      const mockExercise = { category: 'push', subcategory: 'chest' };
      const exSvc = TestBed.inject(ExerciseService) as any;
      exSvc.getById.and.returnValue(mockExercise);
      const entry: WorkoutEntry = { exerciseId: 'chest1', exerciseName: 'Press banca', sets: [] };
      expect(component.getEntrySubLabel(entry)).toBe('Pit');
    });

    it('returns empty string when exercise has no subcategory', () => {
      const mockExercise = { category: 'push' };
      const exSvc = TestBed.inject(ExerciseService) as any;
      exSvc.getById.and.returnValue(mockExercise);
      const entry: WorkoutEntry = { exerciseId: 'push1', exerciseName: 'Custom', sets: [] };
      expect(component.getEntrySubLabel(entry)).toBe('');
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

    it('expands the workout for the selected date', () => {
      const svc = TestBed.inject(WorkoutService) as any;
      svc.getWorkoutForDate.and.returnValue(makeWorkout({ id: 'w9', date: '2024-03-15' }));
      component.selectDate('2024-03-15');
      expect(component.expandedId()).toBe('w9');
    });

    it('clears the expanded workout when deselecting', () => {
      component.expandedId.set('w9');
      component.selectDate('2024-03-15');
      component.selectDate('2024-03-15');
      expect(component.expandedId()).toBeNull();
    });
  });

  // ── hasActiveFilter() ────────────────────────────────────────────────────

  describe('hasActiveFilter()', () => {
    it('is false when no filter is set', () => {
      expect(component.hasActiveFilter()).toBeFalse();
    });

    it('is true when a category filter is set', () => {
      component.filterCat.set('push');
      expect(component.hasActiveFilter()).toBeTrue();
    });

    it('is true when a date is selected', () => {
      component.selectedDate.set('2024-03-15');
      expect(component.hasActiveFilter()).toBeTrue();
    });

    it('is false after all filters are cleared', () => {
      component.filterCat.set('push');
      component.filterCat.set(null);
      expect(component.hasActiveFilter()).toBeFalse();
    });
  });

  // ── items() + pagination state ───────────────────────────────────────────

  describe('items()', () => {
    it('starts as an empty array', () => {
      expect(component.items()).toEqual([]);
    });
  });

  describe('hasMore()', () => {
    it('is false when items equals total (both zero)', () => {
      expect(component.hasMore()).toBeFalse();
    });
  });

  // ── calendarOpen signal ──────────────────────────────────────────────────

  describe('calendarOpen signal', () => {
    it('defaults to open', () => {
      expect(component.calendarOpen()).toBeTrue();
    });

    it('can be collapsed', () => {
      component.calendarOpen.set(false);
      expect(component.calendarOpen()).toBeFalse();
    });
  });
});
