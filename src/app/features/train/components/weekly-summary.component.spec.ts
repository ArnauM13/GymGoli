import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeeklySummaryComponent } from './weekly-summary.component';
import { FitnessMetricsService } from '../../../core/services/fitness-metrics.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { DEFAULT_USER_SETTINGS } from '../../../core/models/user-settings.model';

// Fixed Wednesday, so "this week" is Mon Apr 21 → Sun Apr 27.
const MOCK_DATE  = '2025-04-23';
const THIS_WEEK  = '2025-04-22'; // Tuesday of the same week
const LAST_WEEK  = '2025-04-16';

describe('WeeklySummaryComponent', () => {
  let fixture: ComponentFixture<WeeklySummaryComponent>;
  let component: WeeklySummaryComponent;
  let mockStreak: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(MOCK_DATE + 'T12:00:00'));

    mockStreak = signal(0);

    await TestBed.configureTestingModule({
      imports: [WeeklySummaryComponent],
      providers: [
        { provide: FitnessMetricsService, useValue: { goalStreak: mockStreak } },
        {
          provide: UserSettingsService,
          useValue: {
            settings:       signal(DEFAULT_USER_SETTINGS),
            hasWeeklyGoal:  signal(true),
            loaded:         signal(true),
            fitnessGoal:    signal(null),
          },
        },
        { provide: WorkoutService, useValue: { getDoneWorkoutsForDate: () => [] } },
        { provide: SportService,   useValue: { getSportSessionsForDate: () => [] } },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture   = TestBed.createComponent(WeeklySummaryComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => jasmine.clock().uninstall());

  describe('streak', () => {
    it('shows the streak on the current week', () => {
      mockStreak.set(4);
      expect(component.streak()).toBe(4);
    });

    it('shows it too when the viewed date is another day of the current week', () => {
      mockStreak.set(4);
      fixture.componentRef.setInput('weekDate', THIS_WEEK);
      expect(component.streak()).toBe(4);
    });

    it('hides it when looking at a past week — today\'s streak says nothing there', () => {
      mockStreak.set(4);
      fixture.componentRef.setInput('weekDate', LAST_WEEK);
      expect(component.streak()).toBeNull();
    });

    it('hides it with a single week, which is not a streak yet', () => {
      mockStreak.set(1);
      expect(component.streak()).toBeNull();
    });

    it('shows it from two weeks on', () => {
      mockStreak.set(2);
      expect(component.streak()).toBe(2);
    });

    it('hides it with no streak at all', () => {
      mockStreak.set(0);
      expect(component.streak()).toBeNull();
    });
  });
});
