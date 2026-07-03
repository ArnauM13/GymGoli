import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

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
import { WeeklyPlanService, WEEKS_SINGLE } from '../../core/services/weekly-plan.service';
import { Workout, WorkoutEntry } from '../../core/models/workout.model';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../../core/models/weekly-plan.model';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

const EMPTY_CATEGORY_PROFILE = { daysSinceLast: 99, typicalGapDays: 4, overdueScore: 0 };

describe('TrainComponent', () => {
  let component: TrainComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<TrainComponent>>;
  let forceOffline: ReturnType<typeof signal<boolean>>;
  let weeklyPlan: ReturnType<typeof signal<WeeklyPlan>>;
  let applyPlan: jasmine.Spy;
  let snackBarOpen: jasmine.Spy;

  beforeEach(async () => {
    forceOffline = signal(false);
    weeklyPlan   = signal(EMPTY_WEEKLY_PLAN);
    applyPlan    = jasmine.createSpy('apply').and.resolveTo(undefined);
    snackBarOpen = jasmine.createSpy('open');
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
        { provide: UserSettingsService, useValue: { weightUnit: signal<'kg' | 'lb'>('kg'), fitnessGoal: signal(null), loaded: signal(true), weeklyPlan } },
        { provide: WeeklyPlanService,   useValue: { ensureRecurringApplied: jasmine.createSpy().and.resolveTo(undefined), apply: applyPlan } },
        { provide: OfflineService,      useValue: { isOffline: signal(false), forceOffline, toggleForceOffline: jasmine.createSpy() } },
        { provide: TrainerService,      useValue: { myTrainer: signal(null), hasTrainer: jasmine.createSpy().and.returnValue(false), getProposalForDate: jasmine.createSpy().and.returnValue(null) } },
        { provide: TemplateService,     useValue: { forCategory: jasmine.createSpy().and.returnValue([]), create: jasmine.createSpy().and.resolveTo(undefined), recordUse: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: SharedWorkoutService, useValue: { share: jasmine.createSpy().and.resolveTo('share-id') } },
        { provide: WorkoutProfileService, useValue: { profile: signal({ gym: { push: EMPTY_CATEGORY_PROFILE, pull: EMPTY_CATEGORY_PROFILE, legs: EMPTY_CATEGORY_PROFILE }, favoriteSport: null, recentSport: null, minRecovery: 2 }) } },
        { provide: MatDialog,              useValue: { open: jasmine.createSpy() } },
        { provide: MatSnackBar,            useValue: { open: snackBarOpen } },
        { provide: ConfirmDialogService,   useValue: { confirm: jasmine.createSpy('confirm').and.resolveTo(false) } },
      ],
    })
      .overrideComponent(TrainComponent, {
        set: { imports: [LowerCasePipe], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TrainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
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

  // ── workoutSetsCount() ───────────────────────────────────────────────────

  describe('workoutSetsCount()', () => {
    it('returns 0 when there are no entries', () => {
      expect(component.workoutSetsCount(makeWorkout())).toBe(0);
    });

    it('sums sets across all entries', () => {
      const w = makeWorkout({
        entries: [
          { exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }] },
          { exerciseId: 'b', exerciseName: 'B', sets: [{ weight: 80, reps: 5 }] },
        ],
      });
      expect(component.workoutSetsCount(w)).toBe(3);
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

  // ── offline toggle chip label ───────────────────────────────────────────

  describe('offline toggle chip', () => {
    it('reads "Sense connexió" when offline mode is off', () => {
      const chip = (fixture.nativeElement as HTMLElement).querySelector('.qa-chip');
      expect(chip?.textContent?.trim()).toContain('Sense connexió');
    });

    it('reads "En línia" once forced offline mode is active', () => {
      forceOffline.set(true);
      fixture.detectChanges();
      const chip = (fixture.nativeElement as HTMLElement).querySelector('.qa-chip');
      expect(chip?.textContent?.trim()).toContain('En línia');
      expect(chip?.textContent?.trim()).not.toContain('Sense connexió');
    });
  });

  // ── planCurrentWeek() ────────────────────────────────────────────────────

  describe('planCurrentWeek()', () => {
    it('warns instead of applying when no routine is configured', async () => {
      await component.planCurrentWeek('2024-03-04');
      expect(applyPlan).not.toHaveBeenCalled();
      expect(snackBarOpen).toHaveBeenCalledWith(
        jasmine.stringMatching(/cap rutina/), '', jasmine.any(Object));
    });

    it('applies the saved plan to the given week for a single week', async () => {
      const plan: WeeklyPlan = { recurring: false, days: [[{ type: 'gym', category: 'push' }], [], [], [], [], [], []] };
      weeklyPlan.set(plan);

      await component.planCurrentWeek('2024-03-04');

      expect(applyPlan).toHaveBeenCalledWith(plan, WEEKS_SINGLE, '2024-03-04');
      expect(snackBarOpen).toHaveBeenCalledWith('Setmana planificada', '', jasmine.any(Object));
    });

    it('shows an error snackbar when applying fails', async () => {
      const plan: WeeklyPlan = { recurring: false, days: [[{ type: 'gym', category: 'push' }], [], [], [], [], [], []] };
      weeklyPlan.set(plan);
      applyPlan.and.rejectWith(new Error('network error'));

      await component.planCurrentWeek('2024-03-04');

      expect(snackBarOpen).toHaveBeenCalledWith('Error en planificar la setmana', '', jasmine.any(Object));
    });

    it('toggles planningWeek while the plan is being applied', async () => {
      let resolveApply!: () => void;
      applyPlan.and.returnValue(new Promise<void>(resolve => { resolveApply = resolve; }));
      const plan: WeeklyPlan = { recurring: false, days: [[{ type: 'gym', category: 'push' }], [], [], [], [], [], []] };
      weeklyPlan.set(plan);

      const promise = component.planCurrentWeek('2024-03-04');
      expect(component.planningWeek()).toBeTrue();
      resolveApply();
      await promise;
      expect(component.planningWeek()).toBeFalse();
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
