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
import { Workout, WorkoutEntry } from '../../core/models/workout.model';
import { CATEGORY_COLORS } from '../../core/models/exercise.model';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../../core/models/weekly-plan.model';
import { UserSettings, DEFAULT_USER_SETTINGS } from '../../core/models/user-settings.model';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { mondayOf } from '../../shared/utils/calendar-utils';

const ROUTINE_HINT_KEY = 'gymgoli_routine_hint_shown_user-1';

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
    localStorage.removeItem(ROUTINE_HINT_KEY);
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
        {
          provide: UserSettingsService,
          useValue: {
            weightUnit: signal<'kg' | 'lb'>('kg'), fitnessGoal: signal(null), loaded: signal(true),
            weeklyPlan: weeklyPlanSignal, settings: settingsSignal, update: updateSettings,
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

  // ── "Set up a routine" hint ──────────────────────────────────────────────

  describe('showRoutineHint()', () => {
    it('is shown when there is no recurring routine and it has not been dismissed', () => {
      expect(component.showRoutineHint()).toBeTrue();
    });

    it('is hidden once a recurring routine is set', () => {
      weeklyPlanSignal.set({ recurring: true, days: [[], [], [], [], [], [], []] });
      expect(component.showRoutineHint()).toBeFalse();
    });

    it('is hidden once the user dismisses it for good', () => {
      component.dismissRoutineHint();
      expect(component.showRoutineHint()).toBeFalse();
    });

    it('does not come back the next time the app loads within ~7 days', () => {
      // A second instance re-reads the same (per-device) throttle key that
      // the first instance's construction just wrote to.
      const fixture2 = TestBed.createComponent(TrainComponent);
      fixture2.detectChanges();
      expect(fixture2.componentInstance.showRoutineHint()).toBeFalse();
    });
  });

  describe('dismissRoutineHint()', () => {
    it('persists the dismissal via UserSettingsService', () => {
      component.dismissRoutineHint();
      expect(updateSettings).toHaveBeenCalledWith({ routineHintDismissed: true });
    });
  });

  describe('goSetRoutine()', () => {
    it('navigates to the routine planner with no week param (settings/recurring mode)', () => {
      component.goSetRoutine();
      expect(navigateSpy).toHaveBeenCalledWith(['/train/planner']);
    });
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

  // ── goPlanWeek() ─────────────────────────────────────────────────────────

  describe('goPlanWeek()', () => {
    it('navigates to the planner with the currently-viewed week', () => {
      component.viewedWeekMonday.set('2024-04-01');
      component.goPlanWeek();

      expect(navigateSpy).toHaveBeenCalledWith(
        ['/train/planner'], { queryParams: { week: '2024-04-01' } });
    });
  });

  describe('viewedWeekIsFuture()', () => {
    it('is false for the week containing today', () => {
      component.viewedWeekMonday.set(mondayOf(TODAY));
      expect(component.viewedWeekIsFuture()).toBeFalse();
    });

    it('is true for a week after the current one', () => {
      const nextWeek = new Date(TODAY + 'T12:00:00');
      nextWeek.setDate(nextWeek.getDate() + 7);
      component.viewedWeekMonday.set(nextWeek.toISOString().split('T')[0]);
      expect(component.viewedWeekIsFuture()).toBeTrue();
    });
  });

  describe('viewedWeekHasPlan()', () => {
    let getPlannedForDate: jasmine.Spy;
    let getPlannedSportSessionsForDate: jasmine.Spy;

    beforeEach(() => {
      getPlannedForDate = TestBed.inject(WorkoutService).getPlannedForDate as jasmine.Spy;
      getPlannedSportSessionsForDate = TestBed.inject(SportService).getPlannedSportSessionsForDate as jasmine.Spy;
      component.viewedWeekMonday.set('2024-03-04');
    });

    it('is false when nothing is planned for any day of the viewed week', () => {
      expect(component.viewedWeekHasPlan()).toBeFalse();
    });

    it('is true when a planned workout exists on any day of the viewed week', () => {
      getPlannedForDate.and.callFake((date: string) => date === '2024-03-06' ? [{ id: 'w1' }] : []);
      expect(component.viewedWeekHasPlan()).toBeTrue();
    });

    it('is true when a planned sport session exists on any day of the viewed week', () => {
      getPlannedSportSessionsForDate.and.callFake((date: string) => date === '2024-03-08' ? [{ sport: {}, session: {} }] : []);
      expect(component.viewedWeekHasPlan()).toBeTrue();
    });
  });

  // ── planSourceBadge() ────────────────────────────────────────────────────

  describe('planSourceBadge()', () => {
    it('labels a trainer-sourced item', () => {
      expect(component.planSourceBadge('trainer')).toEqual({ label: 'Entrenador', cls: 'pc-badge--trainer' });
    });

    it('labels a routine-sourced item', () => {
      expect(component.planSourceBadge('routine')).toEqual({ label: 'Rutina', cls: 'pc-badge--routine' });
    });

    it('labels a manually-planned item', () => {
      expect(component.planSourceBadge('manual')).toEqual({ label: 'Planificació pròpia', cls: 'pc-badge--manual' });
    });

    it('treats legacy "self" the same as "manual"', () => {
      expect(component.planSourceBadge('self')).toEqual({ label: 'Planificació pròpia', cls: 'pc-badge--manual' });
    });

    it('returns null when there is no source', () => {
      expect(component.planSourceBadge(undefined)).toBeNull();
    });
  });

  // ── planPillColor() ──────────────────────────────────────────────────────

  describe('planPillColor()', () => {
    let getPlannedForDate: jasmine.Spy;

    beforeEach(() => {
      getPlannedForDate = TestBed.inject(WorkoutService).getPlannedForDate as jasmine.Spy;
      component.selectedDate.set('2024-03-10');
    });

    it('tints the pill with the pending plan\'s category color', () => {
      getPlannedForDate.and.returnValue([{ id: 'w1', category: 'push', categories: ['push'] } as unknown as Workout]);
      expect(component.planPillColor()).toBe(CATEGORY_COLORS['push']);
    });

    it('falls back to the brand color when nothing is planned yet', () => {
      getPlannedForDate.and.returnValue([]);
      expect(component.planPillColor()).not.toBe(CATEGORY_COLORS['push']);
      expect(component.planPillColor()).not.toBe(CATEGORY_COLORS['pull']);
      expect(component.planPillColor()).not.toBe(CATEGORY_COLORS['legs']);
    });
  });

  // ── bottomCard() ─────────────────────────────────────────────────────────

  describe('bottomCard() — pending plan for today', () => {
    it('tints the "Tens un pla per avui" card with the plan\'s category color', () => {
      const getPlannedForDate = TestBed.inject(WorkoutService).getPlannedForDate as jasmine.Spy;
      getPlannedForDate.and.returnValue([{ id: 'w1', category: 'legs', categories: ['legs'] } as unknown as Workout]);
      // bottomCard() is a computed already evaluated once during the initial
      // detectChanges() — force it to re-derive by touching its tracked
      // selectedDate dependency now that the spy returns a plan.
      component.selectedDate.set('2099-01-01');
      component.selectedDate.set(TODAY);

      const bc = component.bottomCard();
      expect(bc?.kind).toBe('plan');
      expect(bc?.color).toBe(CATEGORY_COLORS['legs']);
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
