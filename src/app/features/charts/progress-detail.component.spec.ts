import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { ProgressDetailComponent } from './progress-detail.component';
import { ExerciseRecord, WorkoutStatsService } from '../../core/services/workout-stats.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { Exercise } from '../../core/models/exercise.model';
import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { TodayService } from '../../core/services/today.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

function makeExercise(id: string, category: 'push' | 'pull' | 'legs' = 'push'): Exercise {
  return { id, name: `Exercise ${id}`, category, createdAt: new Date() };
}

function makeWorkout(date: string, exerciseId: string, overrides: {
  sets?: { weight: number; reps: number }[];
} = {}): Workout {
  return {
    id: date,
    date,
    createdAt: new Date(),
    entries: [{
      exerciseId,
      exerciseName: 'Test',
      sets: overrides.sets ?? [],
    }],
  };
}

function makeSport(id: string, name: string, over: Partial<Sport> = {}): Sport {
  return {
    id, name, icon: 'directions_run', color: '#43A047',
    subtypes: [], metricDefs: [], createdAt: new Date(), ...over,
  };
}

function makeSession(id: string, sportId: string, date: string, over: Partial<SportSession> = {}): SportSession {
  return { id, sportId, date, createdAt: new Date(), ...over };
}

/** Un dilluns, perquè «aquesta setmana» sigui un rang conegut al test. */
const MONDAY = '2024-03-04';

describe('ProgressDetailComponent', () => {
  let component: ProgressDetailComponent;
  let mockEnsureStats: jasmine.Spy;
  let mockLoadForSport: jasmine.Spy;
  let loadedSports: Set<string>;

  function setup(
    exercises: Exercise[] = [],
    withData: Set<string> = new Set(),
    workoutsByExercise: Record<string, Workout[]> = {},
    opts: { sports?: Sport[]; sessions?: SportSession[] } = {},
  ): void {
    TestBed.resetTestingModule();
    mockEnsureStats = jasmine.createSpy().and.resolveTo(undefined);
    loadedSports    = new Set<string>();

    // El rècord de cada exercici el compta ara el servidor
    // (`exercise_records`, migració 033). El mock fa la mateixa feina amb els
    // entrenaments que el test declara, així els casos es continuen escrivint
    // en termes de sèries.
    const records = new Map<string, ExerciseRecord>();
    for (const id of withData) {
      const weights = (workoutsByExercise[id] ?? [])
        .flatMap(w => w.entries.filter(e => e.exerciseId === id)
          .flatMap(e => e.sets.filter(x => !x.warmup).map(x => x.weight)))
        .filter(x => x > 0);
      records.set(id, {
        exerciseId: id,
        sessions:   (workoutsByExercise[id] ?? []).length,
        maxWeight:  weights.length ? Math.max(...weights) : 0,
        lastDate:   null,
      });
    }

    const mockStatsService = {
      records:      signal(records),
      totals:       signal({ totalDone: 0, firstDate: null, lastDate: null }),
      loading:      signal(false),
      loaded:       signal(true),
      ensureLoaded: mockEnsureStats,
    };

    const mockExerciseService = {
      exercises:    signal<Exercise[]>(exercises),
      isLoaded:     signal(true),
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    mockLoadForSport = jasmine.createSpy().and.callFake((id: string) => {
      loadedSports.add(id);
      return Promise.resolve();
    });

    const mockSportService = {
      sports:              signal<Sport[]>(opts.sports ?? []),
      sessions:            signal<SportSession[]>(opts.sessions ?? []),
      isLoaded:            signal(true),
      ensureLoaded:        jasmine.createSpy().and.resolveTo(undefined),
      loadSessionsForSport: mockLoadForSport,
      sportHistoryLoaded:  (id: string) => loadedSports.has(id),
    };

    const mockSettingsService = {
      weightUnit: signal<'kg' | 'lb'>('kg'),
      darkMode:   signal(false),
    };

    TestBed.configureTestingModule({
      imports:   [ProgressDetailComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutStatsService, useValue: mockStatsService },
        { provide: ExerciseService,     useValue: mockExerciseService },
        { provide: SportService,        useValue: mockSportService },
        { provide: UserSettingsService, useValue: mockSettingsService },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: TodayService,        useValue: { today: signal(MONDAY) } },
      ],
    });

    const fixture = TestBed.createComponent(ProgressDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => setup());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Abans es baixava tota la vida de l'usuari amb totes les sèries per
  // acabar quedant-se, de cada exercici, amb un sol número.
  it('demana els rècords comptats al servidor, no l\'historial per comptar-los', () => {
    expect(mockEnsureStats).toHaveBeenCalled();
  });

  it('obre pels exercicis', () => {
    expect(component.scope()).toBe('exercises');
  });

  it('defaults expandedExerciseId to null', () => {
    expect(component.expandedExerciseId()).toBeNull();
  });

  // ── exerciseGroups() ────────────────────────────────────────────────────

  describe('exerciseGroups()', () => {
    it('returns empty when no exercises have data', () => {
      expect(component.exerciseGroups()).toEqual([]);
    });

    it('includes every exercise that has logged data, grouped by category', () => {
      setup(
        [makeExercise('a', 'push'), makeExercise('b', 'legs'), makeExercise('c', 'push')],
        new Set(['a', 'b']),
      );

      const groups = component.exerciseGroups();
      expect(groups.map(g => g.cat)).toEqual(['push', 'legs']);
      expect(groups.find(g => g.cat === 'push')!.records.map(r => r.exercise.id)).toEqual(['a']);
      expect(groups.find(g => g.cat === 'legs')!.records.map(r => r.exercise.id)).toEqual(['b']);
    });

    it('shows a max-weight record when positive-weight sets exist', () => {
      setup([makeExercise('a')], new Set(['a']), {
        a: [
          makeWorkout('2024-03-01', 'a', { sets: [{ weight: 60, reps: 10 }] }),
          makeWorkout('2024-03-08', 'a', { sets: [{ weight: 80, reps: 5 }] }),
        ],
      });

      const record = component.exerciseGroups()[0].records[0];
      expect(record.display).toBe(80);
    });

    it('lists a bodyweight exercise (no positive weight logged) with a null record', () => {
      setup([makeExercise('a')], new Set(['a']), {
        a: [makeWorkout('2024-03-01', 'a', { sets: [{ weight: 0, reps: 10 }] })],
      });

      const record = component.exerciseGroups()[0].records[0];
      expect(record.display).toBeNull();
    });
  });

  // ── toggleExercise() ─────────────────────────────────────────────────────

  describe('toggleExercise()', () => {
    it('expands the given exercise', () => {
      component.toggleExercise('ex-abc');
      expect(component.expandedExerciseId()).toBe('ex-abc');
    });

    it('collapses it again on a second call with the same id', () => {
      component.toggleExercise('ex-abc');
      component.toggleExercise('ex-abc');
      expect(component.expandedExerciseId()).toBeNull();
    });

    it('switches to the newly clicked exercise, closing the previous one', () => {
      component.toggleExercise('ex-abc');
      component.toggleExercise('ex-def');
      expect(component.expandedExerciseId()).toBe('ex-def');
    });
  });

  // ── Esports ──────────────────────────────────────────────────────────────

  describe('sportRows()', () => {
    it('només llista els esports que tenen alguna sessió', () => {
      setup([], new Set(), {}, {
        sports: [makeSport('s1', 'Córrer'), makeSport('s2', 'Pàdel')],
        sessions: [makeSession('a', 's1', '2024-03-01')],
      });

      expect(component.sportRows().map(r => r.sport.id)).toEqual(['s1']);
    });

    it('posa primer el que més fas', () => {
      setup([], new Set(), {}, {
        sports: [makeSport('s1', 'Córrer'), makeSport('s2', 'Pàdel')],
        sessions: [
          makeSession('a', 's1', '2024-03-01'),
          makeSession('b', 's2', '2024-03-02'),
          makeSession('c', 's2', '2024-03-03'),
        ],
      });

      expect(component.sportRows().map(r => r.sport.id)).toEqual(['s2', 's1']);
      expect(component.sportRows()[0].recent).toBe(2);
    });
  });

  describe('toggleSport()', () => {
    it('demana l\'historial d\'aquell esport, i només d\'aquell', () => {
      setup([], new Set(), {}, {
        sports: [makeSport('s1', 'Córrer')],
        sessions: [makeSession('a', 's1', '2024-03-01')],
      });

      component.toggleSport('s1');
      expect(component.expandedSportId()).toBe('s1');
      expect(mockLoadForSport).toHaveBeenCalledOnceWith('s1');
    });

    it('el torna a plegar sense tornar a demanar res', () => {
      setup([], new Set(), {}, {
        sports: [makeSport('s1', 'Córrer')],
        sessions: [makeSession('a', 's1', '2024-03-01')],
      });

      component.toggleSport('s1');
      component.toggleSport('s1');
      expect(component.expandedSportId()).toBeNull();
      expect(mockLoadForSport).toHaveBeenCalledTimes(1);
    });
  });

  describe('sportFacts()', () => {
    const sport = makeSport('s1', 'Córrer', {
      metricDefs: [{ key: 'distance_km', label: 'Distància', type: 'number', unit: 'km' }],
    });

    function facts() {
      return component.sportFacts(sport);
    }

    it('compta les sessions i diu des de quan', () => {
      setup([], new Set(), {}, {
        sports: [sport],
        sessions: [
          makeSession('a', 's1', '2024-01-10'),
          makeSession('b', 's1', '2024-03-01'),
        ],
      });

      const sessions = facts().find(f => f.label === 'Sessions')!;
      expect(sessions.value).toBe('2');
      expect(sessions.note).toContain('gen');
    });

    it('suma el temps i en treu la mitjana, saltant-se les sessions sense durada', () => {
      setup([], new Set(), {}, {
        sports: [sport],
        sessions: [
          makeSession('a', 's1', '2024-01-10', { duration: 30 }),
          makeSession('b', 's1', '2024-02-10', { duration: 90 }),
          makeSession('c', 's1', '2024-03-01'),
        ],
      });

      const byLabel = new Map(facts().map(f => [f.label, f]));
      expect(byLabel.get('Temps total')!.value).toBe('2 h');
      expect(byLabel.get('Durada mitjana')!.value).toBe('1 h');
      expect(byLabel.get('La més llarga')!.value).toBe('1 h 30 min');
    });

    it('corona la millor marca de les mètriques que en tenen', () => {
      setup([], new Set(), {}, {
        sports: [sport],
        sessions: [
          makeSession('a', 's1', '2024-01-10', { metrics: { distance_km: 5 } }),
          makeSession('b', 's1', '2024-02-10', { metrics: { distance_km: 12.5 } }),
        ],
      });

      const best = facts().find(f => f.label === 'Millor distància')!;
      expect(best.value).toBe('12,5 km');
      expect(best.note).toContain('feb');
    });

    it('no s\'inventa cap marca quan la mètrica no s\'ha omplert mai', () => {
      setup([], new Set(), {}, {
        sports: [sport],
        sessions: [makeSession('a', 's1', '2024-01-10')],
      });

      expect(facts().some(f => f.label.startsWith('Millor'))).toBeFalse();
    });
  });

  describe('sportMonths()', () => {
    it('torna una barra per mes, amb l\'últim al final', () => {
      setup([], new Set(), {}, {
        sports: [makeSport('s1', 'Córrer')],
        sessions: [
          makeSession('a', 's1', '2024-03-01'),
          makeSession('b', 's1', '2024-03-20'),
          makeSession('c', 's1', '2024-02-11'),
        ],
      });

      const bars = component.sportMonths('s1')!;
      expect(bars.length).toBe(6);
      expect(bars[bars.length - 1].label).toBe('mar');
      expect(bars[bars.length - 1].count).toBe(2);
      expect(bars[bars.length - 2].count).toBe(1);
      // La més alta omple la tira; la resta es mesuren contra ella.
      expect(bars[bars.length - 1].pct).toBe(100);
    });

    it('no dibuixa res quan l\'esport no té cap sessió', () => {
      setup([], new Set(), {}, { sports: [makeSport('s1', 'Córrer')], sessions: [] });
      expect(component.sportMonths('s1')).toBeNull();
    });
  });
});
