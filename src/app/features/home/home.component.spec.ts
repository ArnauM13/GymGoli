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

  beforeEach(async () => {
    const mockWorkoutService = {
      isLoading:              signal(false),
      getDoneWorkoutsForDate: jasmine.createSpy().and.returnValue([]),
      getPlannedForDate:      jasmine.createSpy().and.returnValue([]),
      ensureMonthLoaded:      jasmine.createSpy(),
    };

    const mockSportService = {
      sportsLoaded:                  signal(true),
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
      settings:   settingsSignal,
      weeklyPlan: weeklyPlanComputed,
      update:     updateSettings,
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

    it('does not include planned workouts for a selected past date', () => {
      component.selectDate('2020-01-01');
      const getPlannedForDate = TestBed.inject(WorkoutService).getPlannedForDate as jasmine.Spy;
      getPlannedForDate.and.callFake(() => [makeWorkout({ id: 'plan1', status: 'planned' })]);
      expect(component.previewFeedEntry()).toBeNull();
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
    it('excludes whichever day is shown in the "Avui" preview', async () => {
      const getDoneWorkoutsForDate = TestBed.inject(WorkoutService).getDoneWorkoutsForDate as jasmine.Spy;
      getDoneWorkoutsForDate.and.callFake((date: string) => date === TODAY ? [makeWorkout({ id: 'today1' })] : []);
      await component.loadMoreFeedMonths();

      expect(component.historyFeedDays().every(d => d.date !== TODAY)).toBeTrue();
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
});
