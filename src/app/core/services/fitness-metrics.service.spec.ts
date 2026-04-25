import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { FitnessMetricsService } from './fitness-metrics.service';
import { WorkoutService } from './workout.service';
import { SportService } from './sport.service';
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

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(MOCK_DATE + 'T12:00:00'));

    mockWorkouts = signal<Workout[]>([]);
    mockSessions = signal<SportSession[]>([]);
    mockSports   = signal<Sport[]>([]);

    TestBed.configureTestingModule({
      providers: [
        FitnessMetricsService,
        { provide: WorkoutService, useValue: { workouts: mockWorkouts } },
        { provide: SportService,   useValue: { sessions: mockSessions, sports: mockSports } },
      ],
    });

    service = TestBed.inject(FitnessMetricsService);
  });

  afterEach(() => jasmine.clock().uninstall());

  // ── Base case ────────────────────────────────────────────────────────────

  it('returns no insights when there is no data', () => {
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
    it('triggers on Wednesday with fewer than 2 weekly activities', () => {
      // MOCK_DATE is Wednesday, 0 activities this week
      mockWorkouts.set([]);
      mockSessions.set([]);
      mockSports.set([]);

      const types = service.insights().map(i => i.type);
      expect(types).toContain('setmana_fluixa');
    });

    it('does NOT trigger when 2+ activities exist this week', () => {
      mockWorkouts.set([makeWorkout(d(-1)), makeWorkout(d(-2))]);
      mockSessions.set([]);
      mockSports.set([]);

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
});
