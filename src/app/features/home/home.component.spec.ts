import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home.component';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { OfflineService } from '../../core/services/offline.service';
import { Workout } from '../../core/models/workout.model';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<HomeComponent>>;
  let navigateSpy: jasmine.Spy;

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

    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutService, useValue: mockWorkoutService },
        { provide: SportService,   useValue: mockSportService },
        { provide: OfflineService, useValue: { isOffline: signal(false) } },
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
  });
});
