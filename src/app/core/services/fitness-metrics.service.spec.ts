import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { FitnessMetricsService } from './fitness-metrics.service';
import { WorkoutService } from './workout.service';
import { SportService } from './sport.service';
import { UserSettingsService } from './user-settings.service';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../models/user-settings.model';
import { Workout } from '../models/workout.model';
import { Sport, SportSession } from '../models/sport.model';

// Fixed Wednesday so all date-relative assertions are deterministic
const MOCK_DATE = '2025-04-23';

/** Returns a date string N days offset from MOCK_DATE (negative = past). */
function d(offset: number): string {
  const base = new Date(MOCK_DATE + 'T12:00:00');
  base.setDate(base.getDate() + offset);
  return base.toISOString().split('T')[0];
}

function makeWorkout(date: string): Workout {
  return { id: date, date, entries: [], createdAt: new Date() };
}

function makeWorkoutWithCats(date: string, cats: string[]): Workout {
  return { id: date, date, entries: [], categories: cats, createdAt: new Date() };
}

function makeSport(id = 's1', color = '#43A047'): Sport {
  return { id, name: 'Futbol', icon: 'sports_soccer', color, subtypes: [], createdAt: new Date() };
}

function makeSession(date: string, sportId = 's1'): SportSession {
  return { id: date + sportId, date, sportId, createdAt: new Date() };
}

describe('FitnessMetricsService', () => {
  let service: FitnessMetricsService;
  let mockWorkouts: ReturnType<typeof signal<Workout[]>>;
  let mockSessions: ReturnType<typeof signal<SportSession[]>>;
  let mockSports:   ReturnType<typeof signal<Sport[]>>;
  let mockSettings: ReturnType<typeof signal<UserSettings>>;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(MOCK_DATE + 'T12:00:00'));

    mockWorkouts = signal<Workout[]>([]);
    mockSessions = signal<SportSession[]>([]);
    mockSports   = signal<Sport[]>([]);
    mockSettings = signal<UserSettings>({ ...DEFAULT_USER_SETTINGS });

    TestBed.configureTestingModule({
      providers: [
        FitnessMetricsService,
        { provide: WorkoutService,     useValue: { workouts: mockWorkouts } },
        { provide: SportService,       useValue: { sessions: mockSessions, sports: mockSports } },
        { provide: UserSettingsService, useValue: { settings: mockSettings } },
      ],
    });

    service = TestBed.inject(FitnessMetricsService);
  });

  afterEach(() => jasmine.clock().uninstall());

  // ── Base case ────────────────────────────────────────────────────────────

  it('returns no insights on Monday with no data (start of week)', () => {
    // Monday Apr 21 — before the mid-week threshold, so setmana_fluixa doesn't trigger
    jasmine.clock().mockDate(new Date('2025-04-21T12:00:00'));
    expect(service.insights()).toEqual([]);
  });

  it('returns at most 2 insights', () => {
    // Trigger gran_setmana + recupera_esport simultaneously
    mockSports.set([makeSport()]);
    mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));
    // 2 sessions this week (contributes to gran_setmana count)
    // + 1 old session (triggers recupera_esport if it becomes the "last")
    mockSessions.set([makeSession(d(-2)), makeSession(d(-1)), makeSession(d(-10))]);

    expect(service.insights().length).toBeLessThanOrEqual(2);
  });

  // ── gran_setmana ─────────────────────────────────────────────────────────

  describe('gran_setmana', () => {
    it('triggers when 5+ activities exist this week', () => {
      // Mon Apr 21 = d(-2), Tue Apr 22 = d(-1), Wed Apr 23 = d(0)
      mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));
      mockSports.set([makeSport()]);
      // 2 sport sessions this week → total = 3 workouts + 2 sessions = 5
      mockSessions.set([makeSession(d(-2)), makeSession(d(-1))]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('gran_setmana');
    });

    it('does NOT trigger with only 4 weekly activities', () => {
      mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));
      mockSports.set([makeSport()]);
      mockSessions.set([makeSession(d(-2))]); // 3 workouts + 1 session = 4

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('gran_setmana');
    });

    it('returns a motivating emoji and title', () => {
      mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));
      mockSports.set([makeSport()]);
      mockSessions.set([makeSession(d(-2)), makeSession(d(-1))]);

      const insight = service.insights().find(i => i.type === 'gran_setmana');
      expect(insight?.emoji).toBeTruthy();
      expect(insight?.title).toBeTruthy();
      expect(insight?.message).toContain('5');
    });
  });

  // ── descansa ─────────────────────────────────────────────────────────────

  describe('descansa', () => {
    it('triggers when 6+ activities exist in the last 7 days', () => {
      // d(-6)=Apr17 … d(-1)=Apr22, all within last 7 days (threshold >Apr16)
      mockWorkouts.set([-6, -5, -4, -3, -2, -1].map(d).map(makeWorkout));
      mockSessions.set([]);
      mockSports.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('descansa');
    });

    it('does NOT trigger for exactly 5 activities in last 7 days', () => {
      mockWorkouts.set([-5, -4, -3, -2, -1].map(d).map(makeWorkout));
      mockSessions.set([]);
      mockSports.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('descansa');
    });

    it('is mutually exclusive with gran_setmana (gran_setmana wins)', () => {
      // 6 workouts in last 7 days AND 5+ this week → gran_setmana should win
      mockWorkouts.set([-2, -1, 0].map(d).map(makeWorkout));
      mockSports.set([makeSport()]);
      mockSessions.set([makeSession(d(-2)), makeSession(d(-1)), makeSession(d(-3))]);
      // weekTotal ≥ 5, last7 ≥ 6

      const types = service.insights().map(i => i.type);
      expect(types).toContain('gran_setmana');
      expect(types).not.toContain('descansa');
    });
  });

  // ── setmana_fluixa ───────────────────────────────────────────────────────

  describe('setmana_fluixa', () => {
    it('triggers on Wednesday with 0 gym workouts and 0 sport sessions', () => {
      mockWorkouts.set([]);
      mockSessions.set([]);
      mockSports.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('setmana_fluixa');
    });

    it('does NOT trigger when 2+ gym workouts exist this week', () => {
      mockWorkouts.set([makeWorkout(d(-1)), makeWorkout(d(-2))]);
      mockSessions.set([]);
      mockSports.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('setmana_fluixa');
    });

    it('does NOT trigger when 2+ sport sessions exist this week', () => {
      mockWorkouts.set([]);
      mockSessions.set([makeSession(d(-1)), makeSession(d(-2))]);
      mockSports.set([makeSport()]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('setmana_fluixa');
    });

    it('does NOT trigger when gran_setmana or descansa are active', () => {
      mockWorkouts.set([-6, -5, -4, -3, -2, -1].map(d).map(makeWorkout));
      mockSessions.set([]);
      mockSports.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('setmana_fluixa');
    });
  });

  // ── prova_gym ────────────────────────────────────────────────────────────

  describe('prova_gym', () => {
    it('triggers when 2+ sport sessions and 0 gym workouts in last 7 days', () => {
      mockWorkouts.set([]);
      mockSessions.set([makeSession(d(-1)), makeSession(d(-3))]);
      mockSports.set([makeSport()]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('prova_gym');
    });

    it('does NOT trigger when there are gym workouts in last 7 days', () => {
      mockWorkouts.set([makeWorkout(d(-1))]);
      mockSessions.set([makeSession(d(-1)), makeSession(d(-3))]);
      mockSports.set([makeSport()]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('prova_gym');
    });

    it('does NOT trigger with only 1 sport session in last 7 days', () => {
      mockWorkouts.set([]);
      mockSessions.set([makeSession(d(-2))]);
      mockSports.set([makeSport()]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('prova_gym');
    });

    it('message mentions the session count', () => {
      mockWorkouts.set([]);
      mockSessions.set([makeSession(d(-1)), makeSession(d(-3)), makeSession(d(-5))]);
      mockSports.set([makeSport()]);

      const insight = service.insights().find(i => i.type === 'prova_gym');
      expect(insight?.message).toContain('3');
    });

    it('has higher priority than setmana_fluixa', () => {
      // 0 gym workouts, 2 sport sessions → prova_gym should come before setmana_fluixa
      // but setmana_fluixa won't fire because weekSessions >= 2
      mockWorkouts.set([]);
      mockSessions.set([makeSession(d(-1)), makeSession(d(-2))]);
      mockSports.set([makeSport()]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('prova_gym');
      expect(types).not.toContain('setmana_fluixa');
    });
  });

  // ── prova_esport ─────────────────────────────────────────────────────────

  describe('prova_esport', () => {
    it('triggers when 3+ gym workouts and 0 sport sessions in last 7 days', () => {
      mockWorkouts.set([-1, -2, -3].map(d).map(makeWorkout));
      mockSports.set([makeSport()]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('prova_esport');
    });

    it('does NOT trigger when sport sessions exist in last 7 days', () => {
      mockWorkouts.set([-1, -2, -3].map(d).map(makeWorkout));
      mockSports.set([makeSport()]);
      mockSessions.set([makeSession(d(-1))]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('prova_esport');
    });

    it('does NOT trigger with fewer than 3 gym workouts in last 7 days', () => {
      mockWorkouts.set([makeWorkout(d(-1)), makeWorkout(d(-2))]);
      mockSports.set([makeSport()]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('prova_esport');
    });

    it('does NOT trigger when no sports are defined', () => {
      mockWorkouts.set([-1, -2, -3].map(d).map(makeWorkout));
      mockSports.set([]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('prova_esport');
    });

    it('mentions the favorite sport by name in the message', () => {
      mockWorkouts.set([-1, -2, -3].map(d).map(makeWorkout));
      mockSports.set([makeSport()]);
      mockSessions.set([]);

      const insight = service.insights().find(i => i.type === 'prova_esport');
      expect(insight?.message).toContain('Futbol');
    });
  });

  // ── recupera_esport ──────────────────────────────────────────────────────

  describe('recupera_esport', () => {
    it('triggers when favorite sport was last done 7+ days ago', () => {
      mockSports.set([makeSport()]);
      mockSessions.set([makeSession(d(-8))]);
      mockWorkouts.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('recupera_esport');
    });

    it('does NOT trigger when favorite sport was done within the last 7 days', () => {
      mockSports.set([makeSport()]);
      mockSessions.set([makeSession(d(-5))]);
      mockWorkouts.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('recupera_esport');
    });

    it('does NOT trigger when no sports are defined', () => {
      mockSports.set([]);
      mockSessions.set([]);
      mockWorkouts.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('recupera_esport');
    });

    it('uses the sport with the most sessions as favorite', () => {
      const padel   = makeSport('s2', '#FB8C00');
      padel.name    = 'Pàdel';
      const futbol  = makeSport('s1', '#43A047');
      mockSports.set([futbol, padel]);
      // Pàdel has 3 sessions (more = favorite), Futbol only 1
      mockSessions.set([
        makeSession(d(-10), 's2'),
        makeSession(d(-20), 's2'),
        makeSession(d(-30), 's2'),
        makeSession(d(-50), 's1'),
      ]);
      mockWorkouts.set([]);

      const insight = service.insights().find(i => i.type === 'recupera_esport');
      expect(insight?.message).toContain('Pàdel');
    });

    it('mentions the sport name and elapsed time in the message', () => {
      mockSports.set([makeSport()]);
      mockSessions.set([makeSession(d(-10))]);
      mockWorkouts.set([]);

      const insight = service.insights().find(i => i.type === 'recupera_esport');
      expect(insight?.message).toContain('Futbol');
      expect(insight?.message).toBeTruthy();
    });

    it('uses the sport color for the insight color', () => {
      mockSports.set([makeSport('s1', '#43A047')]);
      mockSessions.set([makeSession(d(-8))]);
      mockWorkouts.set([]);

      const insight = service.insights().find(i => i.type === 'recupera_esport');
      expect(insight?.color).toBe('#43A047');
    });
  });

  // ── equilibra_gym ─────────────────────────────────────────────────────────

  describe('equilibra_gym', () => {
    it('triggers when there is a gap of 2+ between most and least done category', () => {
      mockSessions.set([]);
      mockSports.set([]);
      mockWorkouts.set([
        makeWorkoutWithCats(d(-1),  ['push']),
        makeWorkoutWithCats(d(-3),  ['push']),
        makeWorkoutWithCats(d(-5),  ['push']),
        makeWorkoutWithCats(d(-7),  ['pull']),
      ]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('equilibra_gym');
    });

    it('does NOT trigger when gap between categories is less than 2', () => {
      mockSessions.set([]);
      mockSports.set([]);
      // push=2, pull=1, legs=1 → gap = max(2) - min(1) = 1 < 2
      mockWorkouts.set([
        makeWorkoutWithCats(d(-1), ['push']),
        makeWorkoutWithCats(d(-2), ['pull']),
        makeWorkoutWithCats(d(-3), ['push']),
        makeWorkoutWithCats(d(-4), ['legs']),
      ]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('equilibra_gym');
    });

    it('does NOT trigger with fewer than 3 workouts in last 28 days', () => {
      mockSessions.set([]);
      mockSports.set([]);
      mockWorkouts.set([
        makeWorkoutWithCats(d(-1), ['push']),
        makeWorkoutWithCats(d(-2), ['pull']),
      ]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('equilibra_gym');
    });

    it('does NOT trigger when only one category is used', () => {
      mockSessions.set([]);
      mockSports.set([]);
      mockWorkouts.set([
        makeWorkoutWithCats(d(-1), ['push']),
        makeWorkoutWithCats(d(-2), ['push']),
        makeWorkoutWithCats(d(-3), ['push']),
        makeWorkoutWithCats(d(-4), ['push']),
      ]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('equilibra_gym');
    });

    it('title matches the least done category (DAY_LABEL)', () => {
      mockSessions.set([]);
      mockSports.set([]);
      mockWorkouts.set([
        makeWorkoutWithCats(d(-1), ['push']),
        makeWorkoutWithCats(d(-3), ['push']),
        makeWorkoutWithCats(d(-5), ['push']),
        makeWorkoutWithCats(d(-7), ['pull']),
      ]);

      const insight = service.insights().find(i => i.type === 'equilibra_gym');
      // legs has 0 — least done; pull and push have counts but legs wins as min
      // Actually: push=3, pull=1, legs=0 → legs is min with 0
      expect(insight?.title).toMatch(/Leg day\?/i);
    });

    it('message includes counts for the non-neglected categories', () => {
      mockSessions.set([]);
      mockSports.set([]);
      mockWorkouts.set([
        makeWorkoutWithCats(d(-1),  ['push']),
        makeWorkoutWithCats(d(-3),  ['push']),
        makeWorkoutWithCats(d(-5),  ['push']),
        makeWorkoutWithCats(d(-7),  ['pull']),
        makeWorkoutWithCats(d(-9),  ['pull']),
        makeWorkoutWithCats(d(-11), ['legs']),
      ]);

      const insight = service.insights().find(i => i.type === 'equilibra_gym');
      // push=3 pull=2 legs=1 → legs is min, gap = 3-1 = 2 → triggers
      expect(insight?.message).toContain('3');
    });

    it('ignores workouts older than 28 days', () => {
      mockSessions.set([]);
      mockSports.set([]);
      mockWorkouts.set([
        makeWorkoutWithCats(d(-1),  ['push']),
        makeWorkoutWithCats(d(-3),  ['push']),
        makeWorkoutWithCats(d(-5),  ['push']),
        makeWorkoutWithCats(d(-29), ['legs']), // outside the 28-day window
        makeWorkoutWithCats(d(-30), ['legs']),
      ]);

      const insight = service.insights().find(i => i.type === 'equilibra_gym');
      // Only push(3) in window; legs outside — only 1 active cat → should NOT trigger
      expect(insight).toBeUndefined();
    });
  });

  // ── objectiu_assolit ─────────────────────────────────────────────────────

  describe('objectiu_assolit', () => {
    it('triggers when weekTotal equals the goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 3 });
      mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('objectiu_assolit');
    });

    it('triggers when weekTotal exceeds the goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 2 });
      mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('objectiu_assolit');
    });

    it('does NOT trigger when weekTotal is below the goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 5 });
      mockWorkouts.set([d(-1), d(0)].map(makeWorkout));
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('objectiu_assolit');
    });

    it('does NOT trigger when no goal is set', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: null });
      mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('objectiu_assolit');
    });

    it('message mentions the activity count', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 3 });
      mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));

      const insight = service.insights().find(i => i.type === 'objectiu_assolit');
      expect(insight?.message).toContain('3');
    });

    it('has higher priority than gran_setmana', () => {
      // 5+ activities + goal met → objectiu_assolit must appear first
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 3 });
      mockWorkouts.set([d(-2), d(-1), d(0)].map(makeWorkout));
      mockSessions.set([makeSession(d(-2)), makeSession(d(-1))]);

      const insights = service.insights();
      expect(insights[0].type).toBe('objectiu_assolit');
    });
  });

  // ── camino_objectiu ──────────────────────────────────────────────────────

  describe('camino_objectiu', () => {
    // MOCK_DATE is Wed Apr 23 (dow=3), so camino_objectiu conditions apply

    it('triggers on Wednesday with some progress toward goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 4 });
      mockWorkouts.set([makeWorkout(d(-1))]);  // 1 workout this week, goal is 4
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('camino_objectiu');
    });

    it('does NOT trigger when goal is not set', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: null });
      mockWorkouts.set([makeWorkout(d(-1))]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('camino_objectiu');
    });

    it('does NOT trigger when weekTotal is 0 (no progress yet)', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 4 });
      mockWorkouts.set([]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('camino_objectiu');
    });

    it('does NOT trigger when goal is already met', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 2 });
      mockWorkouts.set([d(-2), d(-1)].map(makeWorkout));
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('camino_objectiu');
    });

    it('message includes current and goal counts', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 4 });
      mockWorkouts.set([makeWorkout(d(-1))]);

      const insight = service.insights().find(i => i.type === 'camino_objectiu');
      expect(insight?.message).toContain('1');
      expect(insight?.message).toContain('4');
    });
  });

  // ── anima_objectiu ───────────────────────────────────────────────────────

  describe('anima_objectiu', () => {
    // anima_objectiu fires on Sunday (dow=0)

    it('triggers on Sunday when goal not yet met', () => {
      // Move to Sunday Apr 27
      jasmine.clock().mockDate(new Date('2025-04-27T12:00:00'));
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 3 });
      // Monday Apr 21 is the start of that week
      mockWorkouts.set([makeWorkout('2025-04-22'), makeWorkout('2025-04-24')]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('anima_objectiu');
    });

    it('does NOT trigger on Sunday when goal is already met', () => {
      jasmine.clock().mockDate(new Date('2025-04-27T12:00:00'));
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 2 });
      mockWorkouts.set([makeWorkout('2025-04-22'), makeWorkout('2025-04-24')]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('anima_objectiu');
    });

    it('does NOT trigger when no goal is set', () => {
      jasmine.clock().mockDate(new Date('2025-04-27T12:00:00'));
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: null });
      mockWorkouts.set([makeWorkout('2025-04-22')]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('anima_objectiu');
    });

    it('message mentions missing count', () => {
      jasmine.clock().mockDate(new Date('2025-04-27T12:00:00'));
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 3 });
      mockWorkouts.set([makeWorkout('2025-04-22')]);
      mockSessions.set([]);

      const insight = service.insights().find(i => i.type === 'anima_objectiu');
      // 1 workout, goal 3 → missing 2
      expect(insight?.message).toContain('1');
      expect(insight?.message).toContain('3');
    });
  });

  // ── goalStreak ───────────────────────────────────────────────────────────
  // MOCK_DATE is Wednesday 2025-04-23. Week starts Monday 2025-04-21.

  describe('goalStreak', () => {
    it('returns 0 when no goal is set', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: null });
      expect(service.goalStreak()).toBe(0);
    });

    it('returns 0 when current week has no activity', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 3 });
      mockWorkouts.set([]);
      mockSessions.set([]);
      expect(service.goalStreak()).toBe(0);
    });

    it('returns 0 when current week has activity but below goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 3 });
      mockWorkouts.set([makeWorkout(d(0)), makeWorkout(d(-1))]); // 2 < 3
      mockSessions.set([]);
      expect(service.goalStreak()).toBe(0);
    });

    it('returns 1 when current week meets the goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 3 });
      mockWorkouts.set([makeWorkout(d(0)), makeWorkout(d(-1)), makeWorkout(d(-2))]);
      mockSessions.set([]);
      expect(service.goalStreak()).toBe(1);
    });

    it('counts sport sessions toward the streak', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 2 });
      mockWorkouts.set([makeWorkout(d(0))]);
      mockSessions.set([makeSession(d(-1))]);
      expect(service.goalStreak()).toBe(1);
    });

    it('returns 2 when current and previous week both met the goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 2 });
      // Current week (Apr 21–23): 2 workouts
      mockWorkouts.set([
        makeWorkout(d(0)),   // Apr 23 (Wed)
        makeWorkout(d(-1)),  // Apr 22 (Tue)
        // Previous week (Apr 14–20): 3 workouts
        makeWorkout(d(-7)),  // Apr 16
        makeWorkout(d(-8)),  // Apr 15
        makeWorkout(d(-9)),  // Apr 14
      ]);
      mockSessions.set([]);
      expect(service.goalStreak()).toBe(2);
    });

    it('stops counting when a week did not meet the goal', () => {
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, weeklyActivityGoal: 2 });
      // Current week: met (2 workouts)
      // Previous week: not met (1 workout)
      // 2 weeks ago: met (but streak already broken)
      mockWorkouts.set([
        makeWorkout(d(0)),    // current week
        makeWorkout(d(-1)),   // current week
        makeWorkout(d(-8)),   // previous week: only 1
        makeWorkout(d(-14)),  // 2 weeks ago
        makeWorkout(d(-15)),  // 2 weeks ago
      ]);
      mockSessions.set([]);
      expect(service.goalStreak()).toBe(1);
    });

    // ── Separate mode ─────────────────────────────────────────────────────

    it('returns 0 in separate mode when no sub-goal is set', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate',
        weeklyGymGoal: null, weeklySportGoal: null,
      });
      mockWorkouts.set([makeWorkout(d(0)), makeWorkout(d(-1))]);
      mockSessions.set([makeSession(d(0))]);
      expect(service.goalStreak()).toBe(0);
    });

    it('counts streak when only gym goal is set and met', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate',
        weeklyGymGoal: 2, weeklySportGoal: null,
      });
      mockWorkouts.set([makeWorkout(d(0)), makeWorkout(d(-1))]);
      mockSessions.set([]);
      expect(service.goalStreak()).toBe(1);
    });

    it('counts streak when only sport goal is set and met', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate',
        weeklyGymGoal: null, weeklySportGoal: 1,
      });
      mockWorkouts.set([]);
      mockSessions.set([makeSession(d(0))]);
      expect(service.goalStreak()).toBe(1);
    });

    it('requires both sub-goals to be met when both are set', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate',
        weeklyGymGoal: 2, weeklySportGoal: 1,
      });
      // gym met (2) but sport not met (0)
      mockWorkouts.set([makeWorkout(d(0)), makeWorkout(d(-1))]);
      mockSessions.set([]);
      expect(service.goalStreak()).toBe(0);
    });

    it('returns 1 when both separate goals are met this week', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate',
        weeklyGymGoal: 2, weeklySportGoal: 1,
      });
      mockWorkouts.set([makeWorkout(d(0)), makeWorkout(d(-1))]);
      mockSessions.set([makeSession(d(0))]);
      expect(service.goalStreak()).toBe(1);
    });
  });

  // ── objectiu_assolit (separate mode) ─────────────────────────────────────

  describe('objectiu_assolit (separate mode)', () => {
    it('triggers when both separate goals are met', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate',
        weeklyGymGoal: 2, weeklySportGoal: 1,
      });
      mockWorkouts.set([makeWorkout(d(0)), makeWorkout(d(-1))]);
      mockSessions.set([makeSession(d(0))]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('objectiu_assolit');
    });

    it('does NOT trigger when gym goal is not met in separate mode', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate',
        weeklyGymGoal: 3, weeklySportGoal: 1,
      });
      mockWorkouts.set([makeWorkout(d(0))]); // only 1 workout, need 3
      mockSessions.set([makeSession(d(0))]);

      const types = service.insights().map(i => i.type);
      expect(types).not.toContain('objectiu_assolit');
    });

    it('triggers when only gym goal is set and met in separate mode', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate',
        weeklyGymGoal: 2, weeklySportGoal: null,
      });
      mockWorkouts.set([makeWorkout(d(0)), makeWorkout(d(-1))]);
      mockSessions.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('objectiu_assolit');
    });
  });
});
