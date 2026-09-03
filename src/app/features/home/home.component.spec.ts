import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { OfflineService } from '../../core/services/offline.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { Workout } from '../../core/models/workout.model';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../../core/models/user-settings.model';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../../core/models/weekly-plan.model';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<HomeComponent>>;
  let navigateSpy: jasmine.Spy;
  let settingsSignal: ReturnType<typeof signal<UserSettings>>;
  let updateSettings: jasmine.Spy;
  let confirmSpy: jasmine.Spy;
  let doneWorkoutsSignal: ReturnType<typeof signal<Workout[]>>;
  let sessionsSignal: ReturnType<typeof signal<unknown[]>>;
  let dismissedHintsSignal: ReturnType<typeof signal<string[]>>;

  beforeEach(async () => {
    doneWorkoutsSignal   = signal<Workout[]>([]);
    sessionsSignal       = signal<unknown[]>([]);
    dismissedHintsSignal = signal<string[]>([]);

    const mockWorkoutService = {
      isLoading:              signal(false),
      workouts:               doneWorkoutsSignal,
      doneWorkouts:           doneWorkoutsSignal,
      getDoneWorkoutsForDate: jasmine.createSpy().and.returnValue([]),
      getPlannedForDate:      jasmine.createSpy().and.returnValue([]),
      ensureMonthLoaded:      jasmine.createSpy(),
    };

    const mockSportService = {
      sportsLoaded:                  signal(true),
      sessions:                      sessionsSignal,
      sports:                        signal<unknown[]>([]),
      getSportSessionsForDate:       jasmine.createSpy().and.returnValue([]),
      getPlannedSportSessionsForDate: jasmine.createSpy().and.returnValue([]),
      ensureMonthLoaded:              jasmine.createSpy(),
      ensureLoaded:                   jasmine.createSpy(),
    };

    settingsSignal = signal<UserSettings>(DEFAULT_USER_SETTINGS);
    updateSettings = jasmine.createSpy('update').and.callFake((patch: Partial<UserSettings>) => {
      settingsSignal.set({ ...settingsSignal(), ...patch });
      return Promise.resolve();
    });
    const weeklyPlanComputed = () => settingsSignal().weeklyPlan ?? EMPTY_WEEKLY_PLAN;
    const mockSettingsService = {
      settings:       settingsSignal,
      weeklyPlan:     weeklyPlanComputed,
      dismissedHints: dismissedHintsSignal,
      update:         updateSettings,
    };

    confirmSpy = jasmine.createSpy('confirm').and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutService,      useValue: mockWorkoutService },
        { provide: SportService,        useValue: mockSportService },
        { provide: OfflineService,      useValue: { isOffline: signal(false) } },
        { provide: UserSettingsService, useValue: mockSettingsService },
        { provide: ConfirmDialogService, useValue: { confirm: confirmSpy } },
      ],
    })
      .overrideComponent(HomeComponent, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    navigateSpy = spyOn(
      (component as unknown as { router: { navigate: (...args: unknown[]) => Promise<boolean> } }).router,
      'navigate',
    ).and.resolveTo(true);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── effectiveDate() / previewFeedEntry() ────────────────────────────────

  describe('effectiveDate() / previewFeedEntry()', () => {
    it('falls back to today when nothing is selected', () => {
      expect(component.effectiveDate()).toBe(TODAY);
    });

    it('uses the selected date once one is picked', () => {
      component.selectDate('2024-03-10');
      expect(component.effectiveDate()).toBe('2024-03-10');
    });

    it('is null when nothing is planned or done that day', () => {
      expect(component.previewFeedEntry()).toBeNull();
    });

    it('includes a done workout for the selected date', () => {
      const getDoneWorkoutsForDate = TestBed.inject(WorkoutService).getDoneWorkoutsForDate as jasmine.Spy;
      getDoneWorkoutsForDate.and.callFake((date: string) =>
        date === '2020-05-01' ? [makeWorkout({ date: '2020-05-01' })] : []);
      // Selecting a date that was never previously read forces a genuine
      // recompute — previewFeedEntry() only re-derives when effectiveDate()
      // actually produces a new value, not merely when selectedDate is
      // written to (e.g. toggling it back to the same resolved date is a
      // no-op from a downstream-computed's point of view).
      component.selectDate('2020-05-01');

      const entry = component.previewFeedEntry();
      expect(entry?.date).toBe('2020-05-01');
      expect(entry?.workouts.length).toBe(1);
    });

    it('reflects workouts that finish loading after render, without a date click', () => {
      // Reproduces the reported bug: on cold start the feed/"Avui" card must
      // fill in the moment the month's workouts arrive — in lock-step with the
      // calendar — not stay empty until the user taps a day. The preview must
      // therefore react to the raw workouts() signal, not only to a change in
      // the selected date.
      const ws = TestBed.inject(WorkoutService);
      (ws.getDoneWorkoutsForDate as jasmine.Spy).and.callFake((date: string) =>
        doneWorkoutsSignal().filter(w => w.date === date));

      expect(component.previewFeedEntry()).withContext('empty before load').toBeNull();

      // Data arrives asynchronously — NO date selected.
      doneWorkoutsSignal.set([makeWorkout({ id: 'late', date: TODAY })]);

      const entry = component.previewFeedEntry();
      expect(entry).withContext('preview should reflect the loaded workout').not.toBeNull();
      expect(entry?.workouts.some(w => w.id === 'late')).toBeTrue();
    });

    it('includes planned workouts for the selected date so they can be managed', () => {
      const getPlannedForDate = TestBed.inject(WorkoutService).getPlannedForDate as jasmine.Spy;
      getPlannedForDate.and.callFake((date: string) =>
        date === '2020-01-01' ? [makeWorkout({ id: 'plan1', date: '2020-01-01', status: 'planned' })] : []);
      component.selectDate('2020-01-01');

      const entry = component.previewFeedEntry();
      expect(entry?.date).toBe('2020-01-01');
      expect(entry?.workouts.some(w => w.id === 'plan1')).toBeTrue();
    });
  });

  // ── selectDate() ─────────────────────────────────────────────────────────

  describe('selectDate()', () => {
    it('selects a date', () => {
      component.selectDate('2024-03-10');
      expect(component.selectedDate()).toBe('2024-03-10');
    });

    it('toggles off when selecting the same date again', () => {
      component.selectDate('2024-03-10');
      component.selectDate('2024-03-10');
      expect(component.selectedDate()).toBeNull();
    });
  });

  // ── historyFeedDays() ────────────────────────────────────────────────────

  describe('historyFeedDays()', () => {
    it('includes today so the feed is never empty when the only activity is today', () => {
      const getDoneWorkoutsForDate = TestBed.inject(WorkoutService).getDoneWorkoutsForDate as jasmine.Spy;
      getDoneWorkoutsForDate.and.callFake((date: string) => date === TODAY ? [makeWorkout({ id: 'today1' })] : []);
      doneWorkoutsSignal.set([makeWorkout({ id: 'today1' })]);

      expect(component.historyFeedDays().some(d => d.date === TODAY)).toBeTrue();
    });

    it('only reaches back 30 days — the rest lives on the Historial page', () => {
      const within = (() => { const d = new Date(TODAY + 'T12:00:00'); d.setDate(d.getDate() - 29); return d.toISOString().split('T')[0]; })();
      const older  = (() => { const d = new Date(TODAY + 'T12:00:00'); d.setDate(d.getDate() - 45); return d.toISOString().split('T')[0]; })();
      const getDoneWorkoutsForDate = TestBed.inject(WorkoutService).getDoneWorkoutsForDate as jasmine.Spy;
      getDoneWorkoutsForDate.and.callFake((date: string) =>
        date === within || date === older ? [makeWorkout({ id: date })] : []);
      doneWorkoutsSignal.set([makeWorkout({ id: within })]);

      const dates = component.historyFeedDays().map(d => d.date);
      expect(dates).toContain(within);
      expect(dates).not.toContain(older);
    });
  });

  // ── navigation ───────────────────────────────────────────────────────────

  describe('navigation', () => {
    it('goToTrain() navigates to /train', () => {
      component.goToTrain();
      expect(navigateSpy).toHaveBeenCalledWith(['/train']);
    });

    it('goToWorkout() navigates to /train with the workout id as a query param', () => {
      component.goToWorkout('abc');
      expect(navigateSpy).toHaveBeenCalledWith(['/train'], { queryParams: { workout: 'abc' } });
    });

    it('goToPlanner() navigates to /train/planner', () => {
      component.goToPlanner();
      expect(navigateSpy).toHaveBeenCalledWith(['/train/planner']);
    });
  });

  // ── showRoutineHint() ────────────────────────────────────────────────────

  describe('showRoutineHint()', () => {
    it('is true when there is no routine and the hint has not been dismissed', () => {
      expect(component.showRoutineHint()).toBeTrue();
    });

    it('is false once a recurring routine is set', () => {
      settingsSignal.set({ ...settingsSignal(), weeklyPlan: { ...EMPTY_WEEKLY_PLAN, recurring: true } as WeeklyPlan });
      expect(component.showRoutineHint()).toBeFalse();
    });

    it('is false once any day has planned items', () => {
      const days = EMPTY_WEEKLY_PLAN.days.map((d, i) => (i === 0 ? [{ type: 'gym', category: 'push' }] : d));
      settingsSignal.set({ ...settingsSignal(), weeklyPlan: { recurring: false, days } as WeeklyPlan });
      expect(component.showRoutineHint()).toBeFalse();
    });

    it('is false once dismissed and confirmed', async () => {
      await component.dismissRoutineHint();
      expect(confirmSpy).toHaveBeenCalled();
      expect(updateSettings).toHaveBeenCalledWith({ routineHintDismissed: true });
      expect(component.showRoutineHint()).toBeFalse();
    });

    it('stays visible if the confirm dialog is cancelled', async () => {
      confirmSpy.and.resolveTo(false);
      await component.dismissRoutineHint();
      expect(updateSettings).not.toHaveBeenCalled();
      expect(component.showRoutineHint()).toBeTrue();
    });
  });

  // ── showSeparateGoalsNudge() ─────────────────────────────────────────────

  describe('showSeparateGoalsNudge()', () => {
    function withBothActivities(): void {
      doneWorkoutsSignal.set([makeWorkout()]);
      sessionsSignal.set([{ id: 's1', date: TODAY }]);
    }

    it('shows when the user does both gym and sport with a combined weekly goal', () => {
      settingsSignal.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 3 });
      withBothActivities();
      expect(component.showSeparateGoalsNudge()).toBeTrue();
    });

    it('is false without any weekly goal set', () => {
      settingsSignal.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: null });
      withBothActivities();
      expect(component.showSeparateGoalsNudge()).toBeFalse();
    });

    it('is false when already in separate-goal mode', () => {
      settingsSignal.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'separate', weeklyActivityGoal: 3 });
      withBothActivities();
      expect(component.showSeparateGoalsNudge()).toBeFalse();
    });

    it('is false when the user only does one activity type', () => {
      settingsSignal.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 3 });
      doneWorkoutsSignal.set([makeWorkout()]); // gym only, no sport
      expect(component.showSeparateGoalsNudge()).toBeFalse();
    });

    it('is false once the nudge has been dismissed', () => {
      settingsSignal.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 3 });
      withBothActivities();
      dismissedHintsSignal.set(['nudge-separate-goals']);
      expect(component.showSeparateGoalsNudge()).toBeFalse();
    });
  });

  // ── canPlanViewedWeek() (moved here with the weekly goal + planning) ──────

  describe('canPlanViewedWeek()', () => {
    it('is true for the current week (it still has today or future days)', () => {
      expect(component.canPlanViewedWeek()).toBeTrue();
    });

    it('is false once the viewed week has fully passed', () => {
      component.currentWeekMonday.set('2020-01-06');
      expect(component.canPlanViewedWeek()).toBeFalse();
    });

    it('is true for a future week', () => {
      component.currentWeekMonday.set('2099-01-04');
      expect(component.canPlanViewedWeek()).toBeTrue();
    });
  });
});
