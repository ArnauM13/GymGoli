import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { TrainComponent } from './train.component';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { AuthService } from '../../core/services/auth.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { OfflineService } from '../../core/services/offline.service';
import { TrainerService } from '../../core/services/trainer.service';
import { TemplateService } from '../../core/services/template.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { WorkoutProfileService } from '../../core/services/workout-profile.service';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { Workout, WorkoutEntry } from '../../core/models/workout.model';
import { CATEGORY_COLORS } from '../../core/models/exercise.model';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../../core/models/weekly-plan.model';
import { UserSettings, DEFAULT_USER_SETTINGS } from '../../core/models/user-settings.model';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

const EMPTY_CATEGORY_PROFILE = { daysSinceLast: 99, typicalGapDays: 4, overdueScore: 0 };

describe('TrainComponent', () => {
  let component: TrainComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<TrainComponent>>;
  let forceOffline: ReturnType<typeof signal<boolean>>;
  let navigateSpy: jasmine.Spy;
  let weeklyPlanSignal: ReturnType<typeof signal<WeeklyPlan>>;
  let settingsSignal: ReturnType<typeof signal<UserSettings>>;
  let updateSettings: jasmine.Spy;

  beforeEach(async () => {
    forceOffline = signal(false);
    weeklyPlanSignal = signal<WeeklyPlan>(EMPTY_WEEKLY_PLAN);
    settingsSignal    = signal<UserSettings>(DEFAULT_USER_SETTINGS);
    updateSettings    = jasmine.createSpy('update').and.callFake((patch: Partial<UserSettings>) => {
      settingsSignal.set({ ...settingsSignal(), ...patch });
      return Promise.resolve();
    });
    const mockWorkoutService = {
      workouts:                   signal<Workout[]>([]),
      isLoading:                  signal(false),
      getWorkoutsForDate:         jasmine.createSpy().and.returnValue([]),
      getDoneWorkoutsForDate:     jasmine.createSpy().and.returnValue([]),
      getPlannedForDate:          jasmine.createSpy().and.returnValue([]),
      getLastWorkoutByCategory:   jasmine.createSpy().and.returnValue(null),
      ensureMonthLoaded:          jasmine.createSpy(),
      createWorkoutForDate:       jasmine.createSpy().and.resolveTo('new-id'),
      createWorkoutFromTemplate:  jasmine.createSpy().and.resolveTo('new-id'),
      addExerciseToWorkout:       jasmine.createSpy().and.resolveTo(undefined),
      deleteWorkout:              jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSportService = {
      sports:                  signal<any[]>([]),
      sessions:                signal<any[]>([]),
      isLoaded:                signal(true),
      sportsLoaded:            signal(true),
      hasSportOnDate:          jasmine.createSpy().and.returnValue(false),
      getSessionForDate:       jasmine.createSpy().and.returnValue(null),
      getSportSessionsForDate:        jasmine.createSpy().and.returnValue([]),
      getPlannedSportSessionsForDate: jasmine.createSpy().and.returnValue([]),
      ensureMonthLoaded:       jasmine.createSpy(),
      ensureLoaded:            jasmine.createSpy().and.resolveTo(undefined),
      toggleSport:             jasmine.createSpy().and.resolveTo(undefined),
      setSessionSubtype:       jasmine.createSpy().and.resolveTo(undefined),
    };

    await TestBed.configureTestingModule({
      imports:   [TrainComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutService,      useValue: mockWorkoutService },
        { provide: SportService,        useValue: mockSportService },
        { provide: ExerciseService,     useValue: { exercises: signal([]), isLoaded: signal(true), ensureLoaded: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: AuthService,         useValue: { uid: signal('user-1') } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        {
          provide: UserSettingsService,
          useValue: {
            weightUnit: signal<'kg' | 'lb'>('kg'), fitnessGoal: signal(null), loaded: signal(true),
            weeklyPlan: weeklyPlanSignal, settings: settingsSignal, update: updateSettings,
            supersetsEnabled: signal(false), dropsetsEnabled: signal(false), dismissedHints: signal<string[]>([]),
            bodyweightKg: signal(null),
          },
        },
        { provide: OfflineService,      useValue: { isOffline: signal(false), forceOffline, toggleForceOffline: jasmine.createSpy() } },
        { provide: TrainerService,      useValue: { myTrainer: signal(null), hasTrainer: jasmine.createSpy().and.returnValue(false), getProposalForDate: jasmine.createSpy().and.returnValue(null) } },
        { provide: TemplateService,     useValue: { forCategory: jasmine.createSpy().and.returnValue([]), create: jasmine.createSpy().and.resolveTo(undefined), recordUse: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: SharedWorkoutService, useValue: { share: jasmine.createSpy().and.resolveTo('share-id') } },
        { provide: WorkoutProfileService, useValue: { profile: signal({ gym: { push: EMPTY_CATEGORY_PROFILE, pull: EMPTY_CATEGORY_PROFILE, legs: EMPTY_CATEGORY_PROFILE }, favoriteSport: null, recentSport: null, minRecovery: 2 }) } },
        { provide: MatDialog,              useValue: { open: jasmine.createSpy() } },
        { provide: FeedbackService,        useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
        { provide: ConfirmDialogService,   useValue: { confirm: jasmine.createSpy('confirm').and.resolveTo(false) } },
        { provide: NavigationHistoryService, useValue: { goBack: jasmine.createSpy('goBack') } },
      ],
    })
      .overrideComponent(TrainComponent, {
        set: { imports: [LowerCasePipe], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TrainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    navigateSpy = spyOn(component.router, 'navigate').and.resolveTo(true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── workoutLabel() ───────────────────────────────────────────────────────

  describe('workoutLabel()', () => {
    it('returns "Entrenament" when no category', () => {
      expect(component.workoutLabel(makeWorkout())).toBe('Entrenament');
    });

    it('returns the Catalan label for a single category', () => {
      expect(component.workoutLabel(makeWorkout({ categories: ['push'] }))).toBe('Empenta');
    });

    it('joins labels with " + " for multiple categories', () => {
      expect(component.workoutLabel(makeWorkout({ categories: ['push', 'pull'] }))).toBe('Empenta + Tracció');
    });

    it('falls back to category field when categories is empty', () => {
      expect(component.workoutLabel(makeWorkout({ category: 'legs', categories: [] }))).toBe('Cames');
    });
  });

  // ── workoutCardColor() ───────────────────────────────────────────────────

  describe('workoutCardColor()', () => {
    it('returns the default teal when no categories', () => {
      expect(component.workoutCardColor(makeWorkout())).toBe('#006874');
    });

    it('returns the category color for a single category', () => {
      expect(component.workoutCardColor(makeWorkout({ categories: ['push'] }))).toBe('#e57373');
    });

    it('returns a linear-gradient for multiple categories', () => {
      const result = component.workoutCardColor(makeWorkout({ categories: ['push', 'legs'] }));
      expect(result).toContain('linear-gradient');
      expect(result).toContain('#e57373');
      expect(result).toContain('#81c784');
    });
  });

  // ── maxWeight() ──────────────────────────────────────────────────────────

  describe('maxWeight()', () => {
    it('returns 0 for an entry with no sets', () => {
      const entry: WorkoutEntry = { exerciseId: 'x', exerciseName: 'X', sets: [] };
      expect(component.maxWeight(entry)).toBe(0);
    });

    it('returns the highest weight across all sets', () => {
      const entry: WorkoutEntry = {
        exerciseId: 'x', exerciseName: 'X',
        sets: [{ weight: 60, reps: 10 }, { weight: 80, reps: 5 }, { weight: 75, reps: 6 }],
      };
      expect(component.maxWeight(entry)).toBe(80);
    });
  });

  // ── openWorkout() / closeWorkout() ───────────────────────────────────────

  describe('openWorkout() / closeWorkout()', () => {
    it('sets activeWorkoutId', () => {
      component.openWorkout('abc');
      expect(component.activeWorkoutId()).toBe('abc');
    });

    it('clears activeWorkoutId on closeWorkout', () => {
      component.openWorkout('abc');
      component.closeWorkout();
      expect(component.activeWorkoutId()).toBeNull();
    });

    it('navigates home on closeWorkout (workouts are only opened from home)', () => {
      component.openWorkout('abc');
      component.closeWorkout();
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
    });
  });

  // ── deleteActiveWorkout() ────────────────────────────────────────────────

  describe('deleteActiveWorkout()', () => {
    it('deletes the workout and navigates home', async () => {
      const w = makeWorkout({ id: 'abc' });
      const workoutService = TestBed.inject(WorkoutService) as unknown as { workouts: ReturnType<typeof signal<Workout[]>>; deleteWorkout: jasmine.Spy };
      workoutService.workouts.set([w]);
      (TestBed.inject(ConfirmDialogService).confirm as jasmine.Spy).and.resolveTo(true);

      component.openWorkout('abc');
      await component.deleteActiveWorkout();

      expect(workoutService.deleteWorkout).toHaveBeenCalledWith('abc');
      expect(component.activeWorkoutId()).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith(['/home']);
    });
  });

  // ── saveTemplateFromNudge() ──────────────────────────────────────────────

  describe('saveTemplateFromNudge()', () => {
    it('dismisses the nudge and opens the save-as-template sheet', () => {
      component.saveTemplateFromNudge(makeWorkout({ id: 'w1', categories: ['push'] }));
      expect(component.saveTemplateOpen()).toBeTrue();
      expect(updateSettings).toHaveBeenCalledWith({ dismissedHints: ['nudge-save-template'] });
    });
  });

  // ── selectType() / openSessionLogger() toggle behaviour ─────────────────

  describe('selectType()', () => {
    it('opens the picker for the tapped category', () => {
      component.selectType('push');
      expect(component.pickerCat()).toBe('push');
    });

    it('closes the picker when tapping the already-active category again', () => {
      component.selectType('push');
      component.selectType('push');
      expect(component.pickerCat()).toBeNull();
    });

    it('switches to the newly-tapped category without closing', () => {
      component.selectType('push');
      component.selectType('pull');
      expect(component.pickerCat()).toBe('pull');
    });
  });

  describe('openSessionLogger()', () => {
    const sport = { id: 's1', name: 'Running', icon: 'directions_run', color: '#000', subtypes: [], metricDefs: [] } as any;

    it('opens the logger for the tapped sport', () => {
      component.openSessionLogger(sport);
      expect(component.loggerSport()).toEqual(sport);
    });

    it('closes the logger when tapping the already-active sport again', () => {
      component.openSessionLogger(sport);
      component.openSessionLogger(sport);
      expect(component.loggerSport()).toBeNull();
    });
  });

  // ── reorderMode ──────────────────────────────────────────────────────────

  describe('reorderMode', () => {
    it('is off by default', () => {
      expect(component.reorderMode()).toBeFalse();
    });
  });

  // ── groupingMode ─────────────────────────────────────────────────────────

  describe('groupingMode', () => {
    it('is off by default', () => {
      expect(component.groupingMode()).toBeFalse();
    });
  });

  // ── isToday() ────────────────────────────────────────────────────────────

  describe('isToday()', () => {
    it('is true when selectedDate is today', () => {
      component.selectedDate.set(TODAY);
      expect(component.isToday()).toBeTrue();
    });

    it('is false for a past date', () => {
      component.selectedDate.set('2020-01-01');
      expect(component.isToday()).toBeFalse();
    });
  });

  // ── topbarDateLabel() ────────────────────────────────────────────────────

  describe('topbarDateLabel()', () => {
    it('returns "Avui" when workout date is today and selectedDate is today', () => {
      component.selectedDate.set(TODAY);
      expect(component.topbarDateLabel(makeWorkout({ date: TODAY }))).toBe('Avui');
    });

    it('returns a formatted date string for a past workout', () => {
      component.selectedDate.set('2024-03-10');
      const result = component.topbarDateLabel(makeWorkout({ date: '2024-03-10' }));
      expect(result).not.toBe('Avui');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ── shareWorkout() ───────────────────────────────────────────────────────

  describe('shareWorkout()', () => {
    let originalShare: unknown;
    let originalClipboard: unknown;
    let sharedWorkoutService: { share: jasmine.Spy };

    beforeEach(() => {
      sharedWorkoutService = TestBed.inject(SharedWorkoutService) as unknown as { share: jasmine.Spy };
      originalShare = (navigator as unknown as Record<string, unknown>)['share'];
      originalClipboard = (navigator as unknown as Record<string, unknown>)['clipboard'];
    });

    afterEach(() => {
      Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    });

    it('shares the workout and copies the link when the Web Share API is unavailable', async () => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      const writeText = jasmine.createSpy('writeText').and.resolveTo(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

      const w = makeWorkout({ categories: ['push'], entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [] }] });
      await component.shareWorkout(w);

      expect(sharedWorkoutService.share).toHaveBeenCalledWith('Empenta', 'push', w.entries);
      expect(writeText).toHaveBeenCalled();
    });

    it('uses the Web Share API when available instead of copying to the clipboard', async () => {
      const share = jasmine.createSpy('share').and.resolveTo(undefined);
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      const writeText = jasmine.createSpy('writeText').and.resolveTo(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

      const w = makeWorkout({ categories: ['push', 'pull'], entries: [] });
      await component.shareWorkout(w);

      expect(share).toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
      expect(sharedWorkoutService.share).toHaveBeenCalledWith(jasmine.any(String), 'mixed', w.entries);
    });
  });
});
