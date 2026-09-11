import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { WeeklySummaryComponent } from './weekly-summary.component';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../../../core/models/user-settings.model';

// Fixed Wednesday, so "this week" is Mon Apr 21 → Sun Apr 27.
const MOCK_DATE = '2025-04-23';

describe('WeeklySummaryComponent', () => {
  let fixture: ComponentFixture<WeeklySummaryComponent>;
  let component: WeeklySummaryComponent;
  let mockSettings: ReturnType<typeof signal<UserSettings>>;
  let mockLoaded:   ReturnType<typeof signal<boolean>>;
  /** Una activitat registrada: el dia, i el grup si comparteix sessió amb una
   *  altra («al gimnàs i, en acabar, vint minuts de cinta»). */
  type Logged = string | { date: string; group: string };
  const dayOf   = (x: Logged): string => typeof x === 'string' ? x : x.date;
  const groupOf = (x: Logged): string | undefined => typeof x === 'string' ? undefined : x.group;
  let gymDays:      Logged[];
  let sportDays:    Logged[];

  beforeEach(async () => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(MOCK_DATE + 'T12:00:00'));

    mockSettings = signal<UserSettings>({
      ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 3,
    });
    mockLoaded   = signal(true);
    gymDays      = [];
    sportDays    = [];

    await TestBed.configureTestingModule({
      imports: [WeeklySummaryComponent],
      providers: [
        {
          provide: UserSettingsService,
          useValue: {
            settings:    mockSettings,
            loaded:      mockLoaded,
            fitnessGoal: signal(null),
          },
        },
        {
          provide: WorkoutService,
          useValue: {
            getDoneWorkoutsForDate: (d: string) => gymDays.filter(x => dayOf(x) === d)
              .map((x, i) => ({ id: `w-${d}-${i}`, date: d, sessionGroupId: groupOf(x) })),
          },
        },
        {
          provide: SportService,
          useValue: {
            getSportSessionsForDate: (d: string) => sportDays.filter(x => dayOf(x) === d)
              .map((x, i) => ({
                sport:   { id: 'sp' },
                session: { id: `s-${d}-${i}`, date: d, sessionGroupId: groupOf(x) },
              })),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture   = TestBed.createComponent(WeeklySummaryComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => jasmine.clock().uninstall());

  describe('show()', () => {
    it('shows the strip once there is a goal and the settings are loaded', () => {
      expect(component.show()).toBeTrue();
    });

    it('stays hidden without a weekly goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: null });
      expect(component.show()).toBeFalse();
    });

    it('stays hidden while the settings are still loading', () => {
      mockLoaded.set(false);
      expect(component.show()).toBeFalse();
    });
  });

  describe('weekBars()', () => {
    it('counts the sessions of the week against a combined goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 4 });
      gymDays   = ['2025-04-21'];
      sportDays = ['2025-04-22'];

      const bars = component.weekBars();
      expect(bars.length).toBe(1);
      expect(bars[0].done).toBe(2);
      expect(bars[0].target).toBe(4);
      expect(bars[0].mascot).toBe('both');
    });

    it('comptabilitza dues sessions el mateix dia com a dues, no com un dia', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 4 });
      gymDays   = ['2025-04-21', '2025-04-21'];
      sportDays = ['2025-04-21'];

      expect(component.weekBars()[0].done).toBe(3);
    });

    it('compta com una sola sessió el que s\'ha fet d\'una tirada', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 4 });
      // Al gimnàs i, en acabar, vint minuts de cinta: dues activitats, una
      // anada. El futbol de l'endemà sí que és una sessió a part.
      gymDays   = [{ date: '2025-04-21', group: 'g1' }];
      sportDays = [{ date: '2025-04-21', group: 'g1' }, '2025-04-22'];

      expect(component.weekBars()[0].done).toBe(2);
    });

    it('els objectius per tipus continuen comptant activitats, no anades', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS,
        goalMode: 'separate', weeklyGymGoal: 2, weeklySportGoal: 1,
      });
      gymDays   = [{ date: '2025-04-21', group: 'g1' }];
      sportDays = [{ date: '2025-04-21', group: 'g1' }];

      const bars = component.weekBars();
      expect(bars[0].done).toBe(1);
      expect(bars[1].done).toBe(1);
    });

    it('never draws past the end of the bar', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 1 });
      gymDays = ['2025-04-21', '2025-04-22'];

      expect(component.weekBars()[0].pct).toBe(100);
    });

    it('draws one bar per goal when they are separate', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS,
        goalMode: 'separate', weeklyGymGoal: 2, weeklySportGoal: 1,
      });
      gymDays   = ['2025-04-21', '2025-04-22'];
      sportDays = ['2025-04-22'];

      const bars = component.weekBars();
      expect(bars.map(b => b.mascot)).toEqual(['marley', 'xoco']);
      expect(bars[0].done).toBe(2);
      expect(bars[1].done).toBe(1);
    });

    it('ignores days that have not happened yet', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 3 });
      gymDays = ['2025-04-27']; // diumenge, encara per venir

      expect(component.weekBars()[0].done).toBe(0);
    });

    it('draws nothing when the combined goal is not set', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: null });
      expect(component.weekBars()).toEqual([]);
    });
  });

  describe('l\'objectiu és de la setmana', () => {
    /** Objectiu d'ara: 4. Fins al 20 d'abril, era 2. */
    function raisedGoalThisWeek(): void {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS,
        goalMode: 'combined', weeklyActivityGoal: 4,
        goalHistory: [
          { effectiveFrom: '1970-01-05', goalMode: 'combined', weeklyActivityGoal: 2, weeklyGymGoal: null, weeklySportGoal: null },
          { effectiveFrom: '2025-04-21', goalMode: 'combined', weeklyActivityGoal: 4, weeklyGymGoal: null, weeklySportGoal: null },
        ],
      });
    }

    it('la setmana en curs porta l\'objectiu d\'ara', () => {
      raisedGoalThisWeek();
      gymDays = ['2025-04-21'];

      expect(component.weekBars()[0].target).toBe(4);
    });

    it('una setmana tancada conserva el que es demanava llavors', () => {
      raisedGoalThisWeek();
      fixture.componentRef.setInput('weekDate', '2025-04-16'); // setmana anterior
      gymDays = ['2025-04-15', '2025-04-16'];

      const bars = component.weekBars();
      expect(bars[0].target).toBe(2);
      expect(bars[0].done).toBe(2);
      expect(bars[0].pct).toBe(100);
    });

    it('una setmana d\'abans de tenir objectiu no ensenya barra', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS,
        goalMode: 'combined', weeklyActivityGoal: 3,
        goalHistory: [
          { effectiveFrom: '1970-01-05', goalMode: 'combined', weeklyActivityGoal: null, weeklyGymGoal: null, weeklySportGoal: null },
          { effectiveFrom: '2025-04-21', goalMode: 'combined', weeklyActivityGoal: 3, weeklyGymGoal: null, weeklySportGoal: null },
        ],
      });
      fixture.componentRef.setInput('weekDate', '2025-04-16');

      expect(component.show()).toBeFalse();
      expect(component.weekBars()).toEqual([]);
    });

    it('sense història, una setmana passada llegeix l\'objectiu d\'ara', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 3 });
      fixture.componentRef.setInput('weekDate', '2025-04-16');

      expect(component.weekBars()[0].target).toBe(3);
    });
  });

  describe('la ratxa', () => {
    it('no surt al resum de setmana: es felicita quan s\'aconsegueix, no es penja', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: 2 });
      gymDays = ['2025-04-21', '2025-04-22'];
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).not.toContain('seguides');
    });
  });

  describe('dogsOf()', () => {
    it('pairs both dogs for a combined goal', () => {
      expect(component.dogsOf('both').length).toBe(2);
    });

    it('returns a single dog otherwise', () => {
      expect(component.dogsOf('marley').length).toBe(1);
    });
  });
});
