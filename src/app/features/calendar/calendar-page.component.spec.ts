import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { CalendarPageComponent } from './calendar-page.component';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { AuthService } from '../../core/services/auth.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { Workout } from '../../core/models/workout.model';
import { Sport, SportSession } from '../../core/models/sport.model';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

const TODAY = new Date().toISOString().split('T')[0];

function daysAgo(n: number): string {
  const d = new Date(TODAY + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

function makeSport(overrides: Partial<Sport> = {}): Sport {
  return {
    id: 's1', name: 'Córrer', icon: 'directions_run', color: '#43A047',
    subtypes: [], metricDefs: [], createdAt: new Date(), ...overrides,
  };
}

function makeSession(overrides: Partial<SportSession> = {}): SportSession {
  return { id: 'ss1', date: TODAY, sportId: 's1', createdAt: new Date(), ...overrides };
}

describe('CalendarPageComponent', () => {
  let component: CalendarPageComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<CalendarPageComponent>>;
  let doneByDate: Record<string, Workout[]>;
  let plannedByDate: Record<string, Workout[]>;
  let sportsByDate: Record<string, { sport: Sport; session: SportSession }[]>;
  let workoutsSignal: ReturnType<typeof signal<Workout[]>>;

  beforeEach(async () => {
    doneByDate    = {};
    plannedByDate = {};
    sportsByDate  = {};
    workoutsSignal = signal<Workout[]>([]);

    const mockWorkoutService = {
      isLoading:            signal(false),
      workouts:             workoutsSignal,
      unsyncedWorkouts:     signal<Workout[]>([]),
      getWorkoutForDate:    jasmine.createSpy().and.returnValue(null),
      getWorkoutsForDate:   jasmine.createSpy().and.returnValue([]),
      getDoneWorkoutsForDate: jasmine.createSpy().and.callFake((d: string) => doneByDate[d] ?? []),
      getPlannedForDate:    jasmine.createSpy().and.callFake((d: string) => plannedByDate[d] ?? []),
      todayDateString:      jasmine.createSpy().and.returnValue(TODAY),
      ensureMonthLoaded:    jasmine.createSpy().and.resolveTo(undefined),
      loadAllWorkouts:      jasmine.createSpy().and.resolveTo(undefined),
      createPlannedWorkout: jasmine.createSpy().and.resolveTo('w1'),
      deleteWorkout:        jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockExerciseService = {
      exercises:    signal<any[]>([]),
      isLoaded:     signal(true),
      getById:      jasmine.createSpy().and.returnValue(null),
      loadTypeOf:   () => undefined,
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSportService = {
      sports:                         signal<Sport[]>([]),
      sessions:                       signal<SportSession[]>([]),
      isLoaded:                       signal(true),
      getSportSessionsForDate:        jasmine.createSpy().and.callFake((d: string) => sportsByDate[d] ?? []),
      getPlannedSportSessionsForDate: jasmine.createSpy().and.returnValue([]),
      ensureMonthLoaded:              jasmine.createSpy().and.resolveTo(undefined),
      loadAllSessions:                jasmine.createSpy().and.resolveTo(undefined),
      logSession:                     jasmine.createSpy().and.resolveTo(undefined),
      deleteSession:                  jasmine.createSpy().and.resolveTo(undefined),
      ensureLoaded:                   jasmine.createSpy().and.resolveTo(undefined),
    };

    await TestBed.configureTestingModule({
      imports:   [CalendarPageComponent],
      providers: [
        { provide: WorkoutService,      useValue: mockWorkoutService },
        { provide: ExerciseService,     useValue: mockExerciseService },
        { provide: SportService,        useValue: mockSportService },
        { provide: AuthService,         useValue: { uid: signal('user-1') } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: FeedbackService,     useValue: { success: jasmine.createSpy(), error: jasmine.createSpy() } },
      ],
    })
      .overrideComponent(CalendarPageComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CalendarPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Visual helpers ───────────────────────────────────────────────────────

  describe('getCatColor()', () => {
    it('returns the push color', () => {
      expect(component.getCatColor('push')).toBe('#e57373');
    });

    it('returns #bbb for an unknown category', () => {
      expect(component.getCatColor('nope')).toBe('#bbb');
    });
  });

  describe('getCatLabel()', () => {
    it('returns the Catalan label for push', () => {
      expect(component.getCatLabel('push')).toBe('Empenta');
    });

    it('returns the key itself for an unknown category', () => {
      expect(component.getCatLabel('nope')).toBe('nope');
    });
  });

  // ── selectDate() / labels ────────────────────────────────────────────────

  describe('selectDate()', () => {
    it('sets selectedDate', () => {
      component.selectDate('2025-01-15');
      expect(component.selectedDate()).toBe('2025-01-15');
    });

    it('deselects when the same date is selected again', () => {
      component.selectDate('2025-01-15');
      component.selectDate('2025-01-15');
      expect(component.selectedDate()).toBeNull();
    });

    it('loads the month of a day picked outside the loaded window', () => {
      const ensure = TestBed.inject(WorkoutService).ensureMonthLoaded as jasmine.Spy;
      ensure.calls.reset();
      component.selectDate('2024-03-15');
      fixture.detectChanges();
      expect(ensure).toHaveBeenCalledWith(2024, 2);
    });
  });

  describe('selectedDateLabel()', () => {
    it('labels today as "Avui"', () => {
      component.selectDate(TODAY);
      expect(component.selectedDateLabel()).toBe('Avui');
    });

    it('labels the immediately previous day as "Ahir"', () => {
      component.selectDate(daysAgo(1));
      expect(component.selectedDateLabel()).toBe('Ahir');
    });

    it('does not mislabel two days ago as "Ahir"', () => {
      component.selectDate(daysAgo(2));
      expect(component.selectedDateLabel()).not.toBe('Ahir');
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
      component.selectDate(TODAY);
      expect(component.hasActiveFilter()).toBeTrue();
    });

    it('is false after all filters are cleared', () => {
      component.filterCat.set('push');
      component.filterCat.set(null);
      expect(component.hasActiveFilter()).toBeFalse();
    });
  });

  // ── feedDays() ───────────────────────────────────────────────────────────

  describe('feedDays()', () => {
    it('groups workouts and sports of the loaded window by day', () => {
      doneByDate[TODAY]      = [makeWorkout({ id: 'w-today' })];
      sportsByDate[daysAgo(1)] = [{ sport: makeSport(), session: makeSession({ date: daysAgo(1) }) }];
      workoutsSignal.set([makeWorkout({ id: 'w-today' })]);

      const days = component.feedDays();
      expect(days.map(d => d.date)).toEqual([TODAY, daysAgo(1)]);
      expect(days[0].workouts.length).toBe(1);
      expect(days[1].sports.length).toBe(1);
    });

    it('shows only the picked day once one is selected', () => {
      doneByDate[TODAY]        = [makeWorkout({ id: 'w-today' })];
      doneByDate[daysAgo(2)]   = [makeWorkout({ id: 'w-old', date: daysAgo(2) })];
      workoutsSignal.set([makeWorkout({ id: 'w-today' })]);

      component.selectDate(daysAgo(2));
      expect(component.feedDays().map(d => d.date)).toEqual([daysAgo(2)]);
    });

    it('keeps the oldest day first when the sort is flipped', () => {
      doneByDate[TODAY]      = [makeWorkout({ id: 'w-today' })];
      doneByDate[daysAgo(1)] = [makeWorkout({ id: 'w-yest', date: daysAgo(1) })];
      workoutsSignal.set([makeWorkout({ id: 'w-today' })]);

      component.sortDesc.set(false);
      expect(component.feedDays().map(d => d.date)).toEqual([daysAgo(1), TODAY]);
    });

    it('filters workouts by the active training type', () => {
      doneByDate[TODAY] = [
        makeWorkout({ id: 'w-push', categories: ['push'] }),
        makeWorkout({ id: 'w-pull', categories: ['pull'] }),
      ];
      workoutsSignal.set(doneByDate[TODAY]);

      component.filterCat.set('push');
      const days = component.feedDays();
      expect(days.length).toBe(1);
      expect(days[0].workouts.map(w => w.id)).toEqual(['w-push']);
    });

    it('hides sports while a training-type filter is active', () => {
      sportsByDate[TODAY] = [{ sport: makeSport(), session: makeSession() }];
      component.filterCat.set('push');
      expect(component.feedDays().length).toBe(0);
    });

    it('matches the search against exercise names', () => {
      doneByDate[TODAY] = [
        makeWorkout({ id: 'w-bench', entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [] }] }),
        makeWorkout({ id: 'w-squat', entries: [{ exerciseId: 'e2', exerciseName: 'Sentadella', sets: [] }] }),
      ];
      workoutsSignal.set(doneByDate[TODAY]);

      component.searchQuery.set('banca');
      expect(component.feedDays()[0].workouts.map(w => w.id)).toEqual(['w-bench']);
    });

    it('matches the search against the sport name too', () => {
      sportsByDate[TODAY] = [{ sport: makeSport(), session: makeSession() }];
      component.searchQuery.set('córrer');
      expect(component.feedDays()[0].sports.length).toBe(1);
    });
  });

  // ── Loading ──────────────────────────────────────────────────────────────

  describe('loadMoreMonths()', () => {
    it('loads one more month of workouts and sports', async () => {
      const wEnsure = TestBed.inject(WorkoutService).ensureMonthLoaded as jasmine.Spy;
      const sEnsure = TestBed.inject(SportService).ensureMonthLoaded as jasmine.Spy;
      wEnsure.calls.reset(); sEnsure.calls.reset();

      await component.loadMoreMonths();

      const today  = new Date(TODAY + 'T12:00:00');
      const target = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      expect(wEnsure).toHaveBeenCalledWith(target.getFullYear(), target.getMonth());
      expect(sEnsure).toHaveBeenCalledWith(target.getFullYear(), target.getMonth());
    });
  });

  describe('searching', () => {
    it('pulls the whole history in so the search is not limited to loaded months', () => {
      const loadAll = TestBed.inject(WorkoutService).loadAllWorkouts as jasmine.Spy;
      component.searchQuery.set('banca');
      fixture.detectChanges();
      expect(loadAll).toHaveBeenCalled();
    });
  });

  // ── Calendar toggle ──────────────────────────────────────────────────────

  describe('calendarOpen signal', () => {
    it('defaults to collapsed (calendar is an optional date filter)', () => {
      expect(component.calendarOpen()).toBeFalse();
    });

    it('can be expanded', () => {
      component.calendarOpen.set(true);
      expect(component.calendarOpen()).toBeTrue();
    });
  });
});
