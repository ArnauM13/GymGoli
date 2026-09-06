import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { FitnessMetricsService } from './fitness-metrics.service';
import { FitnessInsight, INSIGHT_LEVEL, InsightType } from '../models/insight.model';
import { ExerciseService } from './exercise.service';
import { SportService } from './sport.service';
import { TodayService } from './today.service';
import { TrainingTypeService } from './training-type.service';
import { UserSettingsService } from './user-settings.service';
import { WorkoutService } from './workout.service';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../models/user-settings.model';
import { DEFAULT_TRAINING_TYPES } from '../models/training-type.model';
import { FeelingLevel, Workout, WorkoutEntry } from '../models/workout.model';
import { Sport, SportSession } from '../models/sport.model';

// Dimecres fix perquè tota assercions relativa a la data sigui determinista.
const MOCK_DATE = '2025-04-23';
const THURSDAY  = '2025-04-24';
const TUESDAY   = '2025-04-22';

/** Els dotze tipus, per comprovar que cap es queda sense explicació. */
const ALL_TYPES: InsightType[] = [
  'ratxa_en_joc', 'objectiu_a_l_alca', 'objectiu_desajustat', 'compliment_objectiu',
  'sense_activitat', 'carrega_alta', 'progres', 'volum_gym',
  'tendencia_volum', 'esforc_creixent', 'patro_setmanal', 'equilibri_gym',
];

/** Data amb N dies de diferència respecte a `MOCK_DATE` (negatiu = passat). */
function d(offset: number): string {
  const base = new Date(MOCK_DATE + 'T12:00:00');
  base.setDate(base.getDate() + offset);
  return base.toISOString().split('T')[0];
}

/** Dilluns de la setmana que queda N setmanes enrere (0 = la setmana en curs). */
function monday(weeksBack: number): string {
  const base = new Date(MOCK_DATE + 'T12:00:00');
  base.setDate(base.getDate() - base.getDay() + 1 - weeksBack * 7);
  return base.toISOString().split('T')[0];
}

/** `count` dies consecutius a partir del dilluns de la setmana indicada. */
function weekDates(weeksBack: number, count: number): string[] {
  const start = new Date(monday(weeksBack) + 'T12:00:00');
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    return day.toISOString().split('T')[0];
  });
}

/** `perWeek` activitats per setmana, per a les setmanes `from`..`to` (enrere). */
function spread(from: number, to: number, perWeek: number): string[] {
  const out: string[] = [];
  for (let w = from; w <= to; w++) out.push(...weekDates(w, perWeek));
  return out;
}

function makeWorkout(date: string, extra: Partial<Workout> = {}): Workout {
  return { id: date + Math.random(), date, entries: [], createdAt: new Date(), ...extra };
}

function makeWorkoutWithCats(date: string, cats: string[]): Workout {
  return makeWorkout(date, { categories: cats });
}

function entry(name: string, weight: number, reps = 8): WorkoutEntry {
  return { exerciseId: name, exerciseName: name, sets: [{ weight, reps }] };
}

function makeSport(id = 's1', name = 'Futbol', color = '#43A047'): Sport {
  return { id, name, icon: 'sports_soccer', color, subtypes: [], metricDefs: [], createdAt: new Date() };
}

function makeSession(date: string, sportId = 's1', extra: Partial<SportSession> = {}): SportSession {
  return { id: date + sportId + Math.random(), date, sportId, createdAt: new Date(), ...extra };
}

describe('FitnessMetricsService', () => {
  let service: FitnessMetricsService;
  let mockWorkouts: ReturnType<typeof signal<Workout[]>>;
  let mockSessions: ReturnType<typeof signal<SportSession[]>>;
  let mockSports:   ReturnType<typeof signal<Sport[]>>;
  let mockSettings: ReturnType<typeof signal<UserSettings>>;
  let mockToday:    ReturnType<typeof signal<string>>;

  const types = (): InsightType[] => service.insights().map(i => i.type);
  const find  = (t: InsightType) => service.insights().find(i => i.type === t);

  beforeEach(() => {
    mockWorkouts = signal<Workout[]>([]);
    mockSessions = signal<SportSession[]>([]);
    mockSports   = signal<Sport[]>([]);
    mockSettings = signal<UserSettings>({ ...DEFAULT_USER_SETTINGS });
    mockToday    = signal(MOCK_DATE);

    TestBed.configureTestingModule({
      providers: [
        FitnessMetricsService,
        { provide: WorkoutService,      useValue: { doneWorkouts: mockWorkouts } },
        { provide: SportService,        useValue: { sessions: mockSessions, sports: mockSports } },
        { provide: UserSettingsService, useValue: { settings: mockSettings, bodyweightKg: signal(null) } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: ExerciseService,     useValue: { loadTypeOf: () => undefined, bodyweightFactorOf: () => undefined } },
        { provide: TodayService,        useValue: { today: mockToday } },
      ],
    });

    service = TestBed.inject(FitnessMetricsService);
  });

  /** Objectiu combinat de `n` activitats per setmana. */
  function withGoal(n: number): void {
    mockSettings.set({ ...DEFAULT_USER_SETTINGS, goalMode: 'combined', weeklyActivityGoal: n });
  }

  // ── Base ─────────────────────────────────────────────────────────────────

  it('returns no insights with no data at all', () => {
    expect(service.insights()).toEqual([]);
  });

  it('returns no insights when there is a goal but no history', () => {
    withGoal(3);
    expect(service.insights()).toEqual([]);
  });

  it('never looks at what is planned for today — insights are trends only', () => {
    // El servei ja no injecta WorkoutProfileService ni demana res planificat:
    // si algun dia hi torna, aquest test peta per provider desconegut.
    withGoal(2);
    mockWorkouts.set(spread(1, 8, 2).map(dd => makeWorkout(dd)));
    expect(() => service.insights()).not.toThrow();
  });

  it('gives every insight a stat line, a level and a cooldown', () => {
    withGoal(2);
    mockWorkouts.set(spread(1, 12, 4).map(dd => makeWorkout(dd)));
    mockSports.set([makeSport()]);
    mockSessions.set(spread(1, 8, 1).map(dd => makeSession(dd)));

    const all = service.insights();
    expect(all.length).toBeGreaterThan(0);
    for (const i of all) {
      expect(i.stat).toBeTruthy();
      expect(i.level).toBeGreaterThanOrEqual(1);
      expect(i.cooldownDays).toBeGreaterThanOrEqual(0);
    }
  });

  it('sorts by level first and by signal strength within a level', () => {
    withGoal(2);
    mockWorkouts.set(spread(1, 12, 4).map(dd => makeWorkout(dd)));

    const all = service.insights();
    for (let i = 1; i < all.length; i++) {
      const prev = all[i - 1], cur = all[i];
      expect(prev.level).toBeLessThanOrEqual(cur.level);
      if (prev.level === cur.level) expect(prev.strength).toBeGreaterThanOrEqual(cur.strength);
    }
  });

  // ── Nivell 1 · Objectiu ──────────────────────────────────────────────────

  describe('ratxa_en_joc', () => {
    /** 3 setmanes tancades complint i la setmana en curs a mitges. */
    function streakAtRisk(): void {
      withGoal(3);
      mockWorkouts.set([
        ...spread(1, 3, 3).map(dd => makeWorkout(dd)),
        makeWorkout(monday(0)),
      ]);
    }

    it('triggers late in the week when a streak is about to break', () => {
      streakAtRisk();
      mockToday.set(THURSDAY);

      expect(types()).toContain('ratxa_en_joc');
      expect(find('ratxa_en_joc')!.title).toBe('3 setmanes seguides');
      expect(find('ratxa_en_joc')!.stat).toBe('Aquesta setmana, 1/3');
      expect(find('ratxa_en_joc')!.message).toContain('Amb 2 més');
    });

    it('stays quiet early in the week — there is still time', () => {
      streakAtRisk();
      mockToday.set(TUESDAY);

      expect(types()).not.toContain('ratxa_en_joc');
    });

    it('stays quiet when the week is already met', () => {
      withGoal(3);
      mockWorkouts.set([
        ...spread(1, 3, 3).map(dd => makeWorkout(dd)),
        ...weekDates(0, 3).map(dd => makeWorkout(dd)),
      ]);
      mockToday.set(THURSDAY);

      expect(types()).not.toContain('ratxa_en_joc');
    });

    it('needs at least two closed weeks of streak', () => {
      withGoal(3);
      mockWorkouts.set(weekDates(1, 3).map(dd => makeWorkout(dd)));
      mockToday.set(THURSDAY);

      expect(types()).not.toContain('ratxa_en_joc');
    });

    it('is the only insight allowed to look at the current week', () => {
      streakAtRisk();
      mockToday.set(THURSDAY);
      expect(find('ratxa_en_joc')!.cooldownDays).toBe(0);
    });
  });

  describe('objectiu_a_l_alca', () => {
    it('suggests raising the goal when there is a full activity of margin', () => {
      withGoal(2);
      mockWorkouts.set(spread(1, 5, 4).map(dd => makeWorkout(dd)));

      const ins = find('objectiu_a_l_alca');
      expect(ins).toBeTruthy();
      expect(ins!.stat).toContain('4,0 activitats per setmana');
      expect(ins!.message).toContain('4');
    });

    it('stays quiet when the user is only just meeting the goal', () => {
      withGoal(3);
      mockWorkouts.set(spread(1, 5, 3).map(dd => makeWorkout(dd)));

      expect(types()).not.toContain('objectiu_a_l_alca');
    });
  });

  describe('objectiu_desajustat', () => {
    it('proposes a smaller goal when 6 weeks say it is out of reach', () => {
      withGoal(5);
      mockWorkouts.set(spread(1, 6, 2).map(dd => makeWorkout(dd)));

      const ins = find('objectiu_desajustat');
      expect(ins).toBeTruthy();
      expect(ins!.stat).toContain('0 de les últimes 6 setmanes');
      expect(ins!.message).toContain('2 en comptes de 5');
    });

    it('stays quiet when the goal is met often enough', () => {
      withGoal(2);
      mockWorkouts.set(spread(1, 6, 2).map(dd => makeWorkout(dd)));

      expect(types()).not.toContain('objectiu_desajustat');
    });

    it('stays quiet when the suggested goal would not be any smaller', () => {
      withGoal(2);
      mockWorkouts.set(spread(1, 6, 1).map(dd => makeWorkout(dd)));
      // Mitjana 1 → suggeriment 1 < 2, però només 1 activitat/setmana amb
      // objectiu 2 sí que és desajustat: aquí comprovem el cas límit contrari.
      expect(find('objectiu_desajustat')!.message).toContain('1 en comptes de 2');
    });
  });

  describe('compliment_objectiu', () => {
    it('compares the last 6 closed weeks with the 6 before them', () => {
      withGoal(2);
      // 6 setmanes recents complint, 6 anteriors no.
      mockWorkouts.set([
        ...spread(1, 6, 2).map(dd => makeWorkout(dd)),
        ...spread(7, 12, 1).map(dd => makeWorkout(dd)),
      ]);

      const ins = find('compliment_objectiu');
      expect(ins).toBeTruthy();
      expect(ins!.title).toBe('Cada cop més regular');
      expect(ins!.stat).toBe('Les últimes 6 setmanes, 6 assolides');
      expect(ins!.message).toContain('Les 6 anteriors, 0');
      expect(ins!.cooldownDays).toBe(14);
    });

    it('stays quiet when every one of the 12 weeks was met', () => {
      withGoal(1);
      mockWorkouts.set(spread(1, 12, 2).map(dd => makeWorkout(dd)));

      expect(types()).not.toContain('compliment_objectiu');
    });
  });

  it('says nothing that compares a new user with a past they do not have', () => {
    // Dues setmanes d'app i moltes ganes: res del que compara contra "abans"
    // pot sortir, perquè aquest "abans" són setmanes en què encara no hi era.
    withGoal(3);
    mockWorkouts.set([
      ...weekDates(1, 6).map(dd => makeWorkoutWithCats(dd, ['push'])),
      ...[5, 4, 3, 2, 1].map(n => makeWorkout(d(-n))),
    ]);

    const shown = types();
    for (const t of ['sense_activitat', 'carrega_alta', 'tendencia_volum', 'patro_setmanal', 'equilibri_gym']) {
      expect(shown).not.toContain(t as InsightType);
    }
  });

  it('does not judge 6 or 12 weeks of history a new user does not have', () => {
    // Tres setmanes registrades: els buckets anteriors existeixen, però són
    // setmanes en què l'usuari encara no hi era.
    withGoal(5);
    mockWorkouts.set(spread(1, 3, 2).map(dd => makeWorkout(dd)));

    expect(types()).not.toContain('objectiu_desajustat');
    expect(types()).not.toContain('compliment_objectiu');
  });

  it('produces no goal insights at all without a weekly goal', () => {
    mockWorkouts.set(spread(1, 12, 4).map(dd => makeWorkout(dd)));

    expect(types()).not.toContain('ratxa_en_joc');
    expect(types()).not.toContain('objectiu_a_l_alca');
    expect(types()).not.toContain('objectiu_desajustat');
    expect(types()).not.toContain('compliment_objectiu');
  });

  // ── Nivell 2 · Ruptura ───────────────────────────────────────────────────

  describe('sense_activitat', () => {
    it('triggers after 10 quiet days when the user had a real habit', () => {
      // 8 setmanes a 3 per setmana, i res des de fa 12 dies.
      mockWorkouts.set(spread(2, 9, 3).map(dd => makeWorkout(dd)).filter(w => w.date <= d(-12)));

      const ins = find('sense_activitat');
      expect(ins).toBeTruthy();
      expect(ins!.stat).toContain('de l\'última activitat');
      expect(ins!.cooldownDays).toBe(0);
    });

    it('stays quiet for someone who never had a rhythm to miss', () => {
      mockWorkouts.set([makeWorkout(d(-20)), makeWorkout(d(-40))]);

      expect(types()).not.toContain('sense_activitat');
    });

    it('stays quiet while the gap is under 10 days', () => {
      mockWorkouts.set(spread(1, 8, 3).map(dd => makeWorkout(dd)));

      expect(types()).not.toContain('sense_activitat');
    });

    it('stays quiet for a brand-new user: nothing has been abandoned yet', () => {
      // Quinze dies d'app, molt intensos, i tres setmanes de silenci. Sense el
      // filtre d'història, dividir aquelles activitats entre 8 setmanes donava
      // un "ritme d'abans" de més de 2 per setmana i li dèiem que ens trobava
      // a faltar algú que tot just havia arribat.
      const dates = [-27, -26, -25, -24, -23, -22, -21, -20, -19];
      mockWorkouts.set(dates.map(n => makeWorkout(d(n))));
      mockSports.set([makeSport()]);
      mockSessions.set(dates.map(n => makeSession(d(n))));

      expect(types()).not.toContain('sense_activitat');
    });

    it('does not turn a few days in a row into a habit worth missing', () => {
      // Tres dies seguits fa mes i mig i prou: el ritme d'abans es mesura com a
      // mínim sobre quatre setmanes, no sobre els tres dies que va durar.
      mockWorkouts.set([-40, -39, -38].flatMap(n => [makeWorkout(d(n)), makeWorkout(d(n))]));

      expect(types()).not.toContain('sense_activitat');
    });
  });

  describe('carrega_alta', () => {
    it('triggers when the last 7 days are well above the 8-week average', () => {
      mockWorkouts.set([
        ...spread(2, 9, 2).map(dd => makeWorkout(dd)),
        ...[6, 5, 4, 3, 2, 1].map(n => makeWorkout(d(-n))),
      ]);

      const ins = find('carrega_alta');
      expect(ins).toBeTruthy();
      expect(ins!.stat).toBe('6 sessions en els últims 7 dies');
      expect(ins!.mascot).toBe('marley');
    });

    it('stays quiet when a busy week is the user\'s normal', () => {
      mockWorkouts.set(spread(0, 9, 5).map(dd => makeWorkout(dd)));

      expect(types()).not.toContain('carrega_alta');
    });

    it('stays quiet for a new user: the average is not made of empty weeks', () => {
      // Tres setmanes d'app entrenant molt. La "mitjana" sortia de dividir-ho
      // entre vuit setmanes, cinc de les quals ell no havia viscut, i qualsevol
      // setmana seva quedava per sobre.
      mockWorkouts.set([
        ...weekDates(2, 7).map(dd => makeWorkout(dd)),
        ...weekDates(1, 7).map(dd => makeWorkout(dd)),
        ...[6, 5, 4, 3, 2, 1].map(n => makeWorkout(d(-n))),
      ]);

      expect(types()).not.toContain('carrega_alta');
    });
  });

  // ── Nivell 3 · Progrés ───────────────────────────────────────────────────

  describe('progres', () => {
    it('reports a real load increase on a single exercise', () => {
      mockWorkouts.set([
        makeWorkout(d(-50), { entries: [entry('Press de banca', 60)] }),
        makeWorkout(d(-35), { entries: [entry('Press de banca', 65)] }),
        makeWorkout(d(-20), { entries: [entry('Press de banca', 70)] }),
        makeWorkout(d(-5),  { entries: [entry('Press de banca', 75)] }),
      ]);

      const ins = find('progres');
      expect(ins).toBeTruthy();
      expect(ins!.title).toBe('Puges al press de banca');
      expect(ins!.stat).toContain('De 60 a 75 kg');
      expect(ins!.mascot).toBe('marley');
    });

    it('ignores warm-up sets when reading the top weight', () => {
      mockWorkouts.set([
        makeWorkout(d(-50), { entries: [{ exerciseId: 'Sentadilla', exerciseName: 'Sentadilla', sets: [{ weight: 100, reps: 5, warmup: true }, { weight: 60, reps: 8 }] }] }),
        makeWorkout(d(-35), { entries: [entry('Sentadilla', 62)] }),
        makeWorkout(d(-20), { entries: [entry('Sentadilla', 63)] }),
        makeWorkout(d(-5),  { entries: [entry('Sentadilla', 64)] }),
      ]);

      expect(find('progres')!.stat).toContain('De 60 a 64 kg');
    });

    it('needs four sessions of the same exercise', () => {
      mockWorkouts.set([
        makeWorkout(d(-30), { entries: [entry('Press de banca', 60)] }),
        makeWorkout(d(-10), { entries: [entry('Press de banca', 80)] }),
      ]);

      expect(types()).not.toContain('progres');
    });

    it('reports longer sport sessions too', () => {
      mockSports.set([makeSport('s1', 'Córrer')]);
      mockSessions.set([
        makeSession(d(-50), 's1', { duration: 30 }),
        makeSession(d(-35), 's1', { duration: 32 }),
        makeSession(d(-20), 's1', { duration: 42 }),
        makeSession(d(-5),  's1', { duration: 44 }),
      ]);

      const ins = find('progres');
      expect(ins).toBeTruthy();
      expect(ins!.title).toBe('Aguantes més al córrer');
      expect(ins!.stat).toContain('De 31 a 43 min');
      expect(ins!.mascot).toBe('xoco');
    });

    it('shows only one progress insight, the biggest relative gain', () => {
      mockWorkouts.set([-50, -35, -20, -5].map(n => makeWorkout(d(n), { entries: [entry('Press de banca', 60 + (n + 50) / 3)] })));
      mockSports.set([makeSport('s1', 'Córrer')]);
      mockSessions.set([
        makeSession(d(-50), 's1', { duration: 30 }),
        makeSession(d(-35), 's1', { duration: 32 }),
        makeSession(d(-20), 's1', { duration: 60 }),
        makeSession(d(-5),  's1', { duration: 62 }),
      ]);

      expect(types().filter(t => t === 'progres').length).toBe(1);
      expect(find('progres')!.mascot).toBe('xoco');
    });
  });

  describe('volum_gym', () => {
    it('spots more tonnage moved with the same number of workouts', () => {
      const older  = weekDates(7, 3).concat(weekDates(6, 3));
      const recent = weekDates(3, 3).concat(weekDates(2, 3));
      mockWorkouts.set([
        ...older.map(dd => makeWorkout(dd, { entries: [entry('Press', 50)] })),
        ...recent.map(dd => makeWorkout(dd, { entries: [entry('Press', 70)] })),
      ]);

      const ins = find('volum_gym');
      expect(ins).toBeTruthy();
      expect(ins!.title).toBe('Estàs movent més pes');
      expect(ins!.message).toContain('mateixos entrenos');
    });

    it('stays quiet under six workouts in a window', () => {
      mockWorkouts.set([
        ...weekDates(6, 2).map(dd => makeWorkout(dd, { entries: [entry('Press', 50)] })),
        ...weekDates(2, 2).map(dd => makeWorkout(dd, { entries: [entry('Press', 90)] })),
      ]);

      expect(types()).not.toContain('volum_gym');
    });
  });

  // ── Nivell 4 · Tendència ─────────────────────────────────────────────────

  describe('tendencia_volum', () => {
    it('compares the last four weeks with the four before them', () => {
      // Finestres de 28 dies comptats des d'avui, no setmanes de calendari.
      // El de fa 80 dies queda fora de totes dues: només hi és perquè l'usuari
      // tingui prou passat per comparar dos mesos.
      mockWorkouts.set([
        makeWorkout(d(-80)),
        ...[30, 35, 40, 45].map(n => makeWorkout(d(-n))),
        ...Array.from({ length: 12 }, (_, i) => makeWorkout(d(-(i + 1)))),
      ]);

      const ins = find('tendencia_volum');
      expect(ins).toBeTruthy();
      expect(ins!.title).toBe('Puges de ritme');
      expect(ins!.stat).toBe('Aquest mes, 3,0 activitats per setmana');
      expect(ins!.message).toBe('El mes passat en feies 1,0.');
    });

    it('frames a quieter month without any pressure', () => {
      mockWorkouts.set([
        makeWorkout(d(-80)),
        ...Array.from({ length: 12 }, (_, i) => makeWorkout(d(-(i + 29)))),
        ...[1, 5, 9, 13].map(n => makeWorkout(d(-n))),
      ]);

      const ins = find('tendencia_volum');
      expect(ins!.title).toBe('Mes més tranquil');
      expect(ins!.message).toContain('Cap pressa');
    });

    it('stays quiet on a change under 25%', () => {
      mockWorkouts.set([
        makeWorkout(d(-80)),
        ...Array.from({ length: 12 }, (_, i) => makeWorkout(d(-(i + 29)))),
        ...Array.from({ length: 12 }, (_, i) => makeWorkout(d(-(i + 1)))),
      ]);

      expect(types()).not.toContain('tendencia_volum');
    });

    it('stays quiet for a first month: there is no month before it', () => {
      // Mateixa forma que el primer cas, però sense passat: tot l'històric de
      // l'usuari cap dins de la finestra "d'abans".
      mockWorkouts.set([
        ...[30, 35, 40].map(n => makeWorkout(d(-n))),
        ...Array.from({ length: 12 }, (_, i) => makeWorkout(d(-(i + 1)))),
      ]);

      expect(types()).not.toContain('tendencia_volum');
    });
  });

  describe('esforc_creixent', () => {
    it('spots a sport getting harder over the last four sessions', () => {
      mockSports.set([makeSport('s1', 'Pàdel')]);
      mockSessions.set([
        makeSession(d(-40), 's1', { feeling: 2 as FeelingLevel }),
        makeSession(d(-30), 's1', { feeling: 2 as FeelingLevel }),
        makeSession(d(-20), 's1', { feeling: 4 as FeelingLevel }),
        makeSession(d(-10), 's1', { feeling: 4 as FeelingLevel }),
      ]);

      const ins = find('esforc_creixent');
      expect(ins).toBeTruthy();
      expect(ins!.title).toBe('Anem amb calma al pàdel');
      expect(ins!.stat).toBe('Les últimes 4 sessions: de Bé a Dur');
      expect(ins!.mascot).toBe('xoco');
    });

    it('works on gym workouts too', () => {
      mockWorkouts.set([
        makeWorkout(d(-40), { feeling: 1 as FeelingLevel }),
        makeWorkout(d(-30), { feeling: 2 as FeelingLevel }),
        makeWorkout(d(-20), { feeling: 4 as FeelingLevel }),
        makeWorkout(d(-10), { feeling: 4 as FeelingLevel }),
      ]);

      const ins = find('esforc_creixent');
      expect(ins).toBeTruthy();
      expect(ins!.mascot).toBe('marley');
    });

    it('stays quiet when the effort is steady', () => {
      mockSports.set([makeSport()]);
      mockSessions.set([-40, -30, -20, -10].map(n => makeSession(d(n), 's1', { feeling: 3 as FeelingLevel })));

      expect(types()).not.toContain('esforc_creixent');
    });
  });

  // ── Nivell 5 · Patró ─────────────────────────────────────────────────────

  describe('patro_setmanal', () => {
    it('names the two days that carry most of the training', () => {
      // 12 setmanes entrenant dimarts i dijous.
      const dates: string[] = [];
      for (let w = 1; w <= 12; w++) {
        const week = weekDates(w, 7);
        dates.push(week[1], week[3]);
      }
      mockWorkouts.set(dates.map(dd => makeWorkout(dd)));

      const ins = find('patro_setmanal');
      expect(ins).toBeTruthy();
      expect(ins!.stat).toContain('dimarts');
      expect(ins!.stat).toContain('dijous');
      expect(ins!.message).toContain('caps de setmana');
      expect(ins!.cooldownDays).toBe(14);
    });

    it('stays quiet when training is spread across the week', () => {
      const dates: string[] = [];
      for (let w = 1; w <= 12; w++) dates.push(...weekDates(w, 5));
      mockWorkouts.set(dates.map(dd => makeWorkout(dd)));

      expect(types()).not.toContain('patro_setmanal');
    });

    it('stays quiet under 12 activities in 12 weeks', () => {
      mockWorkouts.set(spread(1, 4, 2).map(dd => makeWorkout(dd)));

      expect(types()).not.toContain('patro_setmanal');
    });

    it('needs 12 weeks of history before calling anything a pattern', () => {
      // Sis setmanes de dimarts i dijous claríssims: encara no és "el teu
      // patró de setmana", és com han anat aquestes sis setmanes.
      const dates: string[] = [];
      for (let w = 1; w <= 6; w++) {
        const week = weekDates(w, 7);
        dates.push(week[1], week[3]);
      }
      mockWorkouts.set(dates.map(dd => makeWorkout(dd)));

      expect(types()).not.toContain('patro_setmanal');
    });
  });

  describe('equilibri_gym', () => {
    it('points at the training type left behind over 8 weeks', () => {
      mockWorkouts.set([
        ...weekDates(6, 4).map(dd => makeWorkoutWithCats(dd, ['push'])),
        ...weekDates(4, 4).map(dd => makeWorkoutWithCats(dd, ['pull'])),
        ...weekDates(2, 1).map(dd => makeWorkoutWithCats(dd, ['legs'])),
      ]);

      const ins = find('equilibri_gym');
      expect(ins).toBeTruthy();
      expect(ins!.title).toBe('Leg day?');
      expect(ins!.stat).toBe('Cames: 1 entreno en 8 setmanes');
      expect(ins!.message).toContain('Empenta en porta 4');
      // El desglossament sencer ja no cap a la targeta: viu al detall.
      expect(ins!.detail.facts.find(f => f.label === 'Repartiment')!.value)
        .toContain('4 empenta');
    });

    it('stays quiet when the types are balanced', () => {
      mockWorkouts.set([
        ...weekDates(6, 3).map(dd => makeWorkoutWithCats(dd, ['push'])),
        ...weekDates(4, 3).map(dd => makeWorkoutWithCats(dd, ['pull'])),
        ...weekDates(2, 3).map(dd => makeWorkoutWithCats(dd, ['legs'])),
      ]);

      expect(types()).not.toContain('equilibri_gym');
    });

    it('stays quiet in the first weeks, when it is just the order of starting', () => {
      mockWorkouts.set([
        ...weekDates(2, 4).map(dd => makeWorkoutWithCats(dd, ['push'])),
        ...weekDates(1, 3).map(dd => makeWorkoutWithCats(dd, ['pull'])),
      ]);

      expect(types()).not.toContain('equilibri_gym');
    });
  });

  /**
   * Escenaris que, tots junts, disparen els dotze tipus d'insight. Cada un
   * ve del test del seu tipus: aquí no es comprova què surt, sinó que el que
   * surt es pugui explicar.
   */
  const SCENARIOS: { name: string; setup: () => void }[] = [
    {
      name: 'ratxa_en_joc',
      setup: () => {
        withGoal(3);
        mockWorkouts.set([...spread(1, 3, 3).map(dd => makeWorkout(dd)), makeWorkout(monday(0))]);
        mockToday.set(THURSDAY);
      },
    },
    {
      name: 'objectiu_a_l_alca',
      setup: () => { withGoal(2); mockWorkouts.set(spread(1, 5, 4).map(dd => makeWorkout(dd))); },
    },
    {
      name: 'objectiu_desajustat',
      setup: () => { withGoal(5); mockWorkouts.set(spread(1, 6, 2).map(dd => makeWorkout(dd))); },
    },
    {
      name: 'compliment_objectiu',
      setup: () => {
        withGoal(2);
        mockWorkouts.set([
          ...spread(1, 6, 2).map(dd => makeWorkout(dd)),
          ...spread(7, 12, 1).map(dd => makeWorkout(dd)),
        ]);
      },
    },
    {
      name: 'sense_activitat',
      setup: () => {
        mockWorkouts.set(spread(2, 9, 3).map(dd => makeWorkout(dd)).filter(w => w.date <= d(-12)));
      },
    },
    {
      name: 'carrega_alta',
      setup: () => {
        mockWorkouts.set([
          ...spread(2, 9, 2).map(dd => makeWorkout(dd)),
          ...[6, 5, 4, 3, 2, 1].map(n => makeWorkout(d(-n))),
        ]);
      },
    },
    {
      name: 'progres (gimnàs)',
      setup: () => {
        mockWorkouts.set([
          makeWorkout(d(-50), { entries: [entry('Press de banca', 60)] }),
          makeWorkout(d(-35), { entries: [entry('Press de banca', 65)] }),
          makeWorkout(d(-20), { entries: [entry('Press de banca', 70)] }),
          makeWorkout(d(-5),  { entries: [entry('Press de banca', 75)] }),
        ]);
      },
    },
    {
      name: 'progres (esport)',
      setup: () => {
        mockSports.set([makeSport('s1', 'Córrer')]);
        mockSessions.set([
          makeSession(d(-50), 's1', { duration: 30 }),
          makeSession(d(-35), 's1', { duration: 32 }),
          makeSession(d(-20), 's1', { duration: 42 }),
          makeSession(d(-5),  's1', { duration: 44 }),
        ]);
      },
    },
    {
      name: 'volum_gym',
      setup: () => {
        const older  = weekDates(7, 3).concat(weekDates(6, 3));
        const recent = weekDates(3, 3).concat(weekDates(2, 3));
        mockWorkouts.set([
          ...older.map(dd => makeWorkout(dd, { entries: [entry('Press', 50)] })),
          ...recent.map(dd => makeWorkout(dd, { entries: [entry('Press', 70)] })),
        ]);
      },
    },
    {
      name: 'tendencia_volum',
      setup: () => {
        mockWorkouts.set([
          makeWorkout(d(-80)),
          ...[30, 35, 40, 45].map(n => makeWorkout(d(-n))),
          ...Array.from({ length: 12 }, (_, i) => makeWorkout(d(-(i + 1)))),
        ]);
      },
    },
    {
      name: 'esforc_creixent',
      setup: () => {
        mockSports.set([makeSport('s1', 'Pàdel')]);
        mockSessions.set([
          makeSession(d(-40), 's1', { feeling: 2 as FeelingLevel }),
          makeSession(d(-30), 's1', { feeling: 2 as FeelingLevel }),
          makeSession(d(-20), 's1', { feeling: 4 as FeelingLevel }),
          makeSession(d(-10), 's1', { feeling: 4 as FeelingLevel }),
        ]);
      },
    },
    {
      name: 'patro_setmanal',
      setup: () => {
        const dates: string[] = [];
        for (let w = 1; w <= 12; w++) {
          const week = weekDates(w, 7);
          dates.push(week[1], week[3]);
        }
        mockWorkouts.set(dates.map(dd => makeWorkout(dd)));
      },
    },
    {
      name: 'equilibri_gym',
      setup: () => {
        mockWorkouts.set([
          ...weekDates(6, 4).map(dd => makeWorkoutWithCats(dd, ['push'])),
          ...weekDates(4, 4).map(dd => makeWorkoutWithCats(dd, ['pull'])),
          ...weekDates(2, 1).map(dd => makeWorkoutWithCats(dd, ['legs'])),
        ]);
      },
    },
  ];

  /** Tot el que els escenaris arriben a produir, sense repetits per tipus. */
  function everyInsight(): FitnessInsight[] {
    const out: FitnessInsight[] = [];
    for (const s of SCENARIOS) {
      mockWorkouts.set([]);
      mockSessions.set([]);
      mockSports.set([]);
      mockSettings.set({ ...DEFAULT_USER_SETTINGS });
      mockToday.set(MOCK_DATE);
      s.setup();
      out.push(...service.insights());
    }
    return out;
  }

  // ── La targeta ───────────────────────────────────────────────────────────

  describe('la targeta', () => {
    it('diu sempre de quan parla', () => {
      // Cap xifra flotant: «2,8 per setmana» sense dir de quan no és res.
      const PERIOD = /setmana|setmanes|dies|dia |mes|sessió|sessions|avui|ara/i;
      for (const i of everyInsight()) {
        expect(PERIOD.test(`${i.stat} ${i.message}`)).toBe(true, `${i.type}: ${i.stat} · ${i.message}`);
      }
    });

    it('es queda en un titular: una xifra i una frase curta', () => {
      // Tot el que no hi cap té lloc al detall, que per això s'obre.
      for (const i of everyInsight()) {
        expect(i.stat.length).toBeLessThanOrEqual(52, `${i.type}: ${i.stat}`);
        expect(i.message.length).toBeLessThanOrEqual(90, `${i.type}: ${i.message}`);
      }
    });
  });

  // ── El detall ────────────────────────────────────────────────────────────

  describe('el detall', () => {
    it('cobreix els dotze tipus entre tots els escenaris', () => {
      const seen = new Set(everyInsight().map(i => i.type));
      for (const t of ALL_TYPES) expect(seen.has(t)).toBe(true, `falta ${t}`);
    });

    it('dona a cada insight un gràfic, xifres i una explicació', () => {
      for (const i of everyInsight()) {
        expect(i.detail.headline.length).toBeGreaterThan(10);
        expect(i.detail.meaning.length).toBeGreaterThan(10);
        expect(i.detail.chart.caption).toBeTruthy();
        expect(i.detail.chart.bars.length).toBeGreaterThan(1);
        expect(i.detail.facts.length).toBeGreaterThanOrEqual(2);
        expect(i.detail.facts.length).toBeLessThanOrEqual(4);
        for (const f of i.detail.facts) {
          expect(f.label).toBeTruthy();
          expect(f.value).toBeTruthy();
        }
        // Un gràfic pla no explica res: alguna barra ha de tenir valor.
        expect(i.detail.chart.bars.some(b => b.value > 0)).toBe(true, i.type);
      }
    });

    it('no diu mai res en percentatges', () => {
      // «Has augmentat un 1000%» no vol dir res per a ningú: les xifres es
      // diuen senceres i comparades («3 per setmana, abans 1»).
      for (const i of everyInsight()) {
        const text = [
          i.title, i.stat, i.message,
          i.detail.headline, i.detail.meaning, i.detail.chart.caption,
          ...i.detail.facts.flatMap(f => [f.label, f.value]),
          ...i.detail.chart.bars.map(b => b.display ?? ''),
        ].join(' | ');
        expect(text).not.toContain('%');
      }
    });

    it('destaca al gràfic la barra de la qual parla', () => {
      for (const i of everyInsight()) {
        if (i.type === 'sense_activitat') continue; // aquí el que parla és el buit
        expect(i.detail.chart.bars.some(b => b.highlight)).toBe(true, i.type);
      }
    });

    it('posa la línia de l\'objectiu als insights d\'objectiu', () => {
      for (const i of everyInsight()) {
        if (i.level !== INSIGHT_LEVEL.objectiu) continue;
        expect(i.detail.chart.reference).toBeTruthy();
        expect(i.detail.chart.reference!.label).toContain('objectiu');
      }
    });

    it('diu de quan és cada gràfic, amb dates', () => {
      // Una barra sense període fa endevinar de quan parla, que és just el
      // que aquest full ha d'evitar.
      for (const i of everyInsight()) {
        expect(i.detail.chart.range).toContain('–');
        expect(i.detail.chart.range.length).toBeGreaterThan(10);
      }
    });

    it('data cada xifra que es compara amb una altra', () => {
      const comparing = ['tendencia_volum', 'volum_gym', 'compliment_objectiu', 'carrega_alta'];
      for (const i of everyInsight()) {
        if (!comparing.includes(i.type)) continue;
        const dated = i.detail.facts.filter(f => f.note);
        expect(dated.length).toBeGreaterThanOrEqual(2, i.type);
        for (const f of dated) expect(f.note).toContain('–');
      }
    });

    it('el «abans» de tendencia_volum té nom i dates', () => {
      // El cas que ho va motivar: «3,0 per setmana · abans 0,3» no deia mai
      // quan era aquell abans.
      mockWorkouts.set([
        makeWorkout(d(-80)),
        ...[30, 35, 40, 45].map(n => makeWorkout(d(-n))),
        ...Array.from({ length: 12 }, (_, i) => makeWorkout(d(-(i + 1)))),
      ]);

      const ins = find('tendencia_volum')!;
      expect(ins.stat).not.toContain('abans');
      expect(ins.stat).toContain('Aquest mes');
      expect(ins.message).toContain('El mes passat');

      const prev = ins.detail.facts.find(f => f.label === 'El mes passat')!;
      expect(prev.note).toContain('–');
    });

    it('el gràfic de tendencia_volum suma exactament el que diu el text', () => {
      mockWorkouts.set([
        makeWorkout(d(-80)),
        ...[30, 35, 40, 45].map(n => makeWorkout(d(-n))),
        ...Array.from({ length: 12 }, (_, i) => makeWorkout(d(-(i + 1)))),
      ]);

      const ins  = find('tendencia_volum')!;
      const bars = ins.detail.chart.bars;
      expect(bars.length).toBe(8);
      // Les quatre últimes finestres de 7 dies són "aquest mes": 12 activitats.
      expect(bars.slice(4).reduce((sum, b) => sum + b.value, 0)).toBe(12);
      expect(bars.slice(0, 4).reduce((sum, b) => sum + b.value, 0)).toBe(4);
      expect(bars.slice(0, 4).every(b => b.muted)).toBe(true);
      expect(bars[7].label).toBe('ara');
    });

    it('explica el progrés amb una barra per sessió', () => {
      mockWorkouts.set([
        makeWorkout(d(-50), { entries: [entry('Press de banca', 60)] }),
        makeWorkout(d(-35), { entries: [entry('Press de banca', 65)] }),
        makeWorkout(d(-20), { entries: [entry('Press de banca', 70)] }),
        makeWorkout(d(-5),  { entries: [entry('Press de banca', 75)] }),
      ]);

      const chart = find('progres')!.detail.chart;
      expect(chart.bars.map(b => b.value)).toEqual([60, 65, 70, 75]);
      expect(chart.bars[3].display).toBe('75 kg');
      expect(chart.bars[3].highlight).toBe(true);
    });
  });

  // ── goalStreak ───────────────────────────────────────────────────────────

  describe('goalStreak()', () => {
    it('is zero without a goal', () => {
      mockWorkouts.set(spread(0, 4, 5).map(dd => makeWorkout(dd)));
      expect(service.goalStreak()).toBe(0);
    });

    it('counts consecutive met weeks including the current one', () => {
      withGoal(2);
      mockWorkouts.set(spread(0, 3, 2).map(dd => makeWorkout(dd)));
      expect(service.goalStreak()).toBe(4);
    });

    it('stops at the first week that fell short', () => {
      withGoal(2);
      mockWorkouts.set([
        ...spread(0, 2, 2).map(dd => makeWorkout(dd)),
        ...weekDates(3, 1).map(dd => makeWorkout(dd)),
        ...spread(4, 6, 2).map(dd => makeWorkout(dd)),
      ]);
      expect(service.goalStreak()).toBe(3);
    });

    it('handles separate gym and sport goals', () => {
      mockSettings.set({
        ...DEFAULT_USER_SETTINGS, goalMode: 'separate', weeklyGymGoal: 2, weeklySportGoal: 1,
      });
      mockSports.set([makeSport()]);
      mockWorkouts.set(spread(0, 2, 2).map(dd => makeWorkout(dd)));
      mockSessions.set(spread(0, 2, 1).map(dd => makeSession(dd)));

      expect(service.goalStreak()).toBe(3);
    });
  });
});
