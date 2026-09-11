import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { ProgressComponent } from './progress.component';
import { WorkoutService } from '../../core/services/workout.service';
import { WorkoutStatsService } from '../../core/services/workout-stats.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { FitnessMetricsService } from '../../core/services/fitness-metrics.service';
import { SportService } from '../../core/services/sport.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { TodayService } from '../../core/services/today.service';
import { DEFAULT_USER_SETTINGS } from '../../core/models/user-settings.model';
import { GoalSnapshot } from '../../core/models/weekly-goal.model';
import { Workout } from '../../core/models/workout.model';
import { SportSession } from '../../core/models/sport.model';

/** Un dilluns, perquè «aquesta setmana» sigui un rang conegut al test. */
const MONDAY = '2024-03-04';

interface GoalConfig {
  goalMode?: 'combined' | 'separate';
  weeklyActivityGoal?: number | null;
  weeklyGymGoal?: number | null;
  weeklySportGoal?: number | null;
  /** Els objectius de setmanes passades, si la prova en necessita (l'objectiu
   *  és de cada setmana: vegeu `core/models/weekly-goal.model.ts`). */
  goalHistory?: GoalSnapshot[];
}

function gym(date: string, over: Partial<Workout> = {}): Workout {
  return { id: date + Math.random(), date, createdAt: new Date(), entries: [], ...over };
}

function sport(date: string, over: Partial<SportSession> = {}): SportSession {
  return { id: date + Math.random(), sportId: 's1', date, createdAt: new Date(), ...over };
}

describe('ProgressComponent', () => {
  let component: ProgressComponent;
  let mockEnsureRange: jasmine.Spy;

  function setup(opts: {
    goal?: GoalConfig;
    done?: Workout[];
    sessions?: SportSession[];
    today?: string;
    insights?: unknown[];
    totalDone?: number;
  } = {}): void {
    TestBed.resetTestingModule();
    mockEnsureRange = jasmine.createSpy().and.resolveTo(undefined);
    const today = opts.today ?? MONDAY;

    const mockWorkoutService = {
      isLoading:       signal(false),
      doneWorkouts:    signal<Workout[]>(opts.done ?? []),
      ensureRange:     mockEnsureRange,
      todayDateString: () => today,
    };

    const mockStatsService = {
      records:      signal(new Map()),
      totals:       signal({ totalDone: opts.totalDone ?? (opts.done ?? []).length, firstDate: null, lastDate: null }),
      loading:      signal(false),
      loaded:       signal(true),
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    const goal = opts.goal ?? {};
    const goalFields = {
      goalMode:           goal.goalMode ?? 'combined' as const,
      weeklyActivityGoal: goal.weeklyActivityGoal === undefined ? 3 : goal.weeklyActivityGoal,
      weeklyGymGoal:      goal.weeklyGymGoal      === undefined ? 3 : goal.weeklyGymGoal,
      weeklySportGoal:    goal.weeklySportGoal    === undefined ? 2 : goal.weeklySportGoal,
    };
    const mockSettingsService = {
      settings: signal({
        ...DEFAULT_USER_SETTINGS, ...goalFields, goalHistory: goal.goalHistory ?? [],
      }),
      weightUnit:         signal<'kg' | 'lb'>('kg'),
      darkMode:           signal(false),
      bodyweightKg:       signal(null),
      // `null` és un valor vàlid («sense objectiu»), així que només s'omple
      // el que no s'ha dit.
      goalMode:           signal(goalFields.goalMode),
      weeklyActivityGoal: signal(goalFields.weeklyActivityGoal),
      weeklyGymGoal:      signal(goalFields.weeklyGymGoal),
      weeklySportGoal:    signal(goalFields.weeklySportGoal),
    };

    TestBed.configureTestingModule({
      imports:   [ProgressComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutService,      useValue: mockWorkoutService },
        { provide: WorkoutStatsService, useValue: mockStatsService },
        { provide: ExerciseService,     useValue: {
          exercises: signal([]), ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
          loadTypeOf: () => undefined, bodyweightFactorOf: () => undefined,
        } },
        { provide: SportService,        useValue: {
          sports: signal([]), sessions: signal<SportSession[]>(opts.sessions ?? []),
          ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
        } },
        { provide: FitnessMetricsService, useValue: { insights: signal(opts.insights ?? []) } },
        { provide: UserSettingsService, useValue: mockSettingsService },
        { provide: TodayService,        useValue: { today: signal(today) } },
      ],
    });

    const fixture = TestBed.createComponent(ProgressComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => setup());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('demana un any de resums, que és el que necessiten la ratxa i el mes', () => {
    expect(mockEnsureRange).toHaveBeenCalled();
  });

  // ── El mes ───────────────────────────────────────────────────────────────

  describe('monthStats()', () => {
    it('compta el mes en curs, no els 30 últims dies', () => {
      setup({
        today: '2024-03-10',
        done: [gym('2024-02-28'), gym('2024-03-01'), gym('2024-03-09')],
      });

      const activities = component.monthStats().find(s => s.key === 'activities')!;
      expect(activities.value).toBe('2');
    });

    // Deu dies d'aquest mes contra els trenta del passat sempre diria que has
    // baixat, i no seria veritat.
    it('compara amb els mateixos dies del mes passat, no amb el mes sencer', () => {
      setup({
        today: '2024-03-10',
        done: [
          gym('2024-03-02'), gym('2024-03-05'),
          // El mes passat: dues dins del tram (1–10) i una fora.
          gym('2024-02-03'), gym('2024-02-08'), gym('2024-02-25'),
        ],
      });

      const activities = component.monthStats().find(s => s.key === 'activities')!;
      expect(activities.value).toBe('2');
      expect(activities.delta).toBeNull();
      expect(activities.dir).toBeNull();
    });

    it('diu cap on va quan les dues xifres no són iguals', () => {
      setup({
        today: '2024-03-10',
        done: [gym('2024-03-02'), gym('2024-03-05'), gym('2024-03-07'), gym('2024-02-03')],
      });

      const activities = component.monthStats().find(s => s.key === 'activities')!;
      expect(activities.delta).toBe('+2');
      expect(activities.dir).toBe('up');
    });

    it('suma els minuts d\'esport del mes', () => {
      setup({
        today: '2024-03-10',
        sessions: [sport('2024-03-02', { duration: 45 }), sport('2024-03-06', { duration: 30 })],
      });

      const minutes = component.monthStats().find(s => s.key === 'minutes')!;
      expect(minutes.value).toBe('75');
    });

    it('el gimnàs i l\'esport de la mateixa anada són una sola activitat', () => {
      setup({
        today: '2024-03-10',
        done: [gym('2024-03-02', { sessionGroupId: 'g1' })],
        sessions: [sport('2024-03-02', { sessionGroupId: 'g1' })],
      });

      expect(component.monthStats().find(s => s.key === 'activities')!.value).toBe('1');
      expect(component.monthGym()).toBe(1);
      expect(component.monthSport()).toBe(1);
    });
  });

  describe('monthWeeks()', () => {
    it('parteix el mes en setmanes i retalla la primera i l\'última al mes', () => {
      // Març de 2024 comença un divendres: la primera barra només té l'1, el 2
      // i el 3.
      setup({
        today: '2024-03-12',
        done: [gym('2024-02-29'), gym('2024-03-01'), gym('2024-03-06'), gym('2024-03-12')],
      });

      const weeks = component.monthWeeks();
      expect(weeks.map(w => w.label)).toEqual(['1', '4', '11']);
      expect(weeks[0].count).toBe(1);   // el 29 de febrer queda fora
      expect(weeks[1].count).toBe(1);
      expect(weeks[2].count).toBe(1);
      expect(weeks[2].current).toBeTrue();
    });
  });

  // ── La setmana ───────────────────────────────────────────────────────────

  describe('weekBars()', () => {
    it('counts only the current week, in local dates', () => {
      // Diumenge passat i dilluns que ve queden fora; la setmana va de
      // 2024-03-04 a 2024-03-10.
      setup({ done: [gym('2024-03-03'), gym('2024-03-04'), gym('2024-03-10'), gym('2024-03-11')] });

      expect(component.thisWeekCount()).toBe(2);
    });

    it('shows one combined row plus the two breakdowns when the goal is combined', () => {
      setup({
        goal: { goalMode: 'combined', weeklyActivityGoal: 4 },
        done: [gym('2024-03-05'), gym('2024-03-06')],
        sessions: [sport('2024-03-07')],
      });

      const bars = component.weekBars();
      expect(bars.map(b => b.label)).toEqual(['Activitats', 'Gimnàs', 'Esport']);
      expect(bars[0].count).toBe(3);
      expect(bars[0].pct).toBe(75);
      expect(bars[0].done).toBeFalse();
      // Les files de detall no porten barra: no tenen objectiu propi.
      expect(bars[1].target).toBeNull();
      expect(bars[2].count).toBe(1);
    });

    it('shows a row per goal when gym and sport are tracked separately', () => {
      setup({
        goal: { goalMode: 'separate', weeklyGymGoal: 2, weeklySportGoal: 2 },
        done: [gym('2024-03-05'), gym('2024-03-06')],
        sessions: [sport('2024-03-07')],
      });

      const bars = component.weekBars();
      expect(bars.map(b => b.label)).toEqual(['Gimnàs', 'Esport']);
      expect(bars[0].done).toBeTrue();
      expect(bars[1].done).toBeFalse();
    });

    it('keeps the count and drops the bar when there is no goal set', () => {
      setup({ goal: { goalMode: 'combined', weeklyActivityGoal: null }, done: [gym('2024-03-05')] });

      const combined = component.weekBars()[0];
      expect(combined.count).toBe(1);
      expect(combined.target).toBeNull();
      expect(combined.done).toBeFalse();
    });
  });

  describe('chartGoal()', () => {
    function snap(effectiveFrom: string, activity: number): GoalSnapshot {
      return {
        effectiveFrom, goalMode: 'combined',
        weeklyActivityGoal: activity, weeklyGymGoal: null, weeklySportGoal: null,
      };
    }

    it('dibuixa la ratlla quan totes les setmanes del mes demanaven el mateix', () => {
      setup({ today: '2024-03-12', goal: { weeklyActivityGoal: 3 } });
      expect(component.chartGoal()).toBe(3);
    });

    it('suma els dos objectius quan van per separat', () => {
      setup({
        today: '2024-03-12',
        goal: { goalMode: 'separate', weeklyActivityGoal: null, weeklyGymGoal: 3, weeklySportGoal: 2 },
      });
      expect(component.chartGoal()).toBe(5);
    });

    it('no en dibuixa cap si l\'objectiu va canviar enmig del mes', () => {
      // Fins al 10 de març en demanava 2; des de l'11, 4. Una sola ratlla
      // deixaria les primeres setmanes injustament curtes.
      setup({
        today: '2024-03-12',
        goal: {
          weeklyActivityGoal: 4,
          goalHistory: [snap('1970-01-05', 2), snap('2024-03-11', 4)],
        },
      });
      expect(component.chartGoal()).toBeNull();
    });

    it('sense objectiu no hi ha ratlla', () => {
      setup({ today: '2024-03-12', goal: { weeklyActivityGoal: null } });
      expect(component.chartGoal()).toBeNull();
    });
  });

  describe('weekStreak()', () => {
    it('compta les setmanes seguides amb activitat, esports inclosos', () => {
      setup({
        done: [gym('2024-03-05'), gym('2024-02-27')],
        sessions: [sport('2024-02-20')],
      });

      expect(component.weekStreak()).toBe(3);
    });

    it('es talla a la primera setmana buida', () => {
      setup({ done: [gym('2024-03-05'), gym('2024-02-20')] });
      expect(component.weekStreak()).toBe(1);
    });
  });

  // ── Les portes ───────────────────────────────────────────────────────────

  it('diu quants insights hi ha a punt', () => {
    setup({ insights: [{}, {}] });
    expect(component.insightCount()).toBe(2);
  });

  it('no ensenya el resum fins que hi ha alguna cosa a resumir', () => {
    setup({ totalDone: 0 });
    expect(component.hasData()).toBeFalse();

    setup({ totalDone: 4 });
    expect(component.hasData()).toBeTrue();
  });
});
