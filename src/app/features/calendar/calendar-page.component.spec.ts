import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { provideRouter } from '@angular/router';

import { CalendarPageComponent } from './calendar-page.component';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { AuthService } from '../../core/services/auth.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { Workout } from '../../core/models/workout.model';
import { Sport, SportSession } from '../../core/models/sport.model';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

const TODAY = new Date().toISOString().split('T')[0];

function daysAgo(n: number): string {
  const d = new Date(TODAY + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

function makeSport(overrides: Partial<Sport> = {}): Sport {
  return {
    id: 's1', name: 'Córrer', icon: 'directions_run', color: '#43A047',
    subtypes: [], metricDefs: [], createdAt: new Date(), ...overrides,
  };
}

function makeSession(overrides: Partial<SportSession> = {}): SportSession {
  return { id: 'ss1', date: TODAY, sportId: 's1', createdAt: new Date(), ...overrides };
}

describe('CalendarPageComponent', () => {
  let component: CalendarPageComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<CalendarPageComponent>>;
  let doneByDate: Record<string, Workout[]>;
  let plannedByDate: Record<string, Workout[]>;
  let sportsByDate: Record<string, { sport: Sport; session: SportSession }[]>;
  let workoutsSignal: ReturnType<typeof signal<Workout[]>>;

  beforeEach(async () => {
    doneByDate    = {};
    plannedByDate = {};
    sportsByDate  = {};
    workoutsSignal = signal<Workout[]>([]);

    const mockWorkoutService = {
      isLoading:            signal(false),
      workouts:             workoutsSignal,
      getWorkoutForDate:    jasmine.createSpy().and.returnValue(null),
      getWorkoutsForDate:   jasmine.createSpy().and.returnValue([]),
      getDoneWorkoutsForDate: jasmine.createSpy().and.callFake((d: string) => doneByDate[d] ?? []),
      getPlannedForDate:    jasmine.createSpy().and.callFake((d: string) => plannedByDate[d] ?? []),
      todayDateString:      jasmine.createSpy().and.returnValue(TODAY),
      ensureMonthLoaded:    jasmine.createSpy().and.resolveTo(undefined),
      ensureRange:          jasmine.createSpy().and.resolveTo(undefined),
      searchHistory:        jasmine.createSpy().and.resolveTo(undefined),
      isSearching:          signal(false),
      createPlannedWorkout: jasmine.createSpy().and.resolveTo('w1'),
      deleteWorkout:        jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockExerciseService = {
      exercises:    signal<any[]>([]),
      isLoaded:     signal(true),
      getById:      jasmine.createSpy().and.returnValue(null),
      loadTypeOf:   () => undefined,
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSportService = {
      sports:                         signal<Sport[]>([]),
      sessions:                       signal<SportSession[]>([]),
      isLoaded:                       signal(true),
      getSportSessionsForDate:        jasmine.createSpy().and.callFake((d: string) => sportsByDate[d] ?? []),
      getPlannedSportSessionsForDate: jasmine.createSpy().and.returnValue([]),
      ensureMonthLoaded:              jasmine.createSpy().and.resolveTo(undefined),
      ensureRange:                    jasmine.createSpy().and.resolveTo(undefined),
      // Amb una cerca activa el feed no va dia a dia: es munta des de les
      // coincidències, que és com arriben del servidor.
      allSportSessionPairs:           () => Object.values(sportsByDate).flat(),
      logSession:                     jasmine.createSpy().and.resolveTo(undefined),
      deleteSession:                  jasmine.createSpy().and.resolveTo(undefined),
      ensureLoaded:                   jasmine.createSpy().and.resolveTo(undefined),
    };

    await TestBed.configureTestingModule({
      imports:   [CalendarPageComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutService,      useValue: mockWorkoutService },
        { provide: ExerciseService,     useValue: mockExerciseService },
        { provide: SportService,        useValue: mockSportService },
        { provide: AuthService,         useValue: { uid: signal('user-1') } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: FeedbackService,     useValue: { success: jasmine.createSpy(), error: jasmine.createSpy() } },
      ],
    })
      .overrideComponent(CalendarPageComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(CalendarPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── Visual helpers ───────────────────────────────────────────────────────

  describe('getCatColor()', () => {
    it('returns the push color', () => {
      expect(component.getCatColor('push')).toBe('#e57373');
    });

    it('returns #bbb for an unknown category', () => {
      expect(component.getCatColor('nope')).toBe('#bbb');
    });
  });

  describe('getCatLabel()', () => {
    it('returns the Catalan label for push', () => {
      expect(component.getCatLabel('push')).toBe('Empenta');
    });

    it('returns the key itself for an unknown category', () => {
      expect(component.getCatLabel('nope')).toBe('nope');
    });
  });

  // ── selectDate() / labels ────────────────────────────────────────────────

  describe('selectDate()', () => {
    it('sets selectedDate', () => {
      component.selectDate('2025-01-15');
      expect(component.selectedDate()).toBe('2025-01-15');
    });

    it('deselects when the same date is selected again', () => {
      component.selectDate('2025-01-15');
      component.selectDate('2025-01-15');
      expect(component.selectedDate()).toBeNull();
    });

    it('loads the month of a day picked outside the loaded window', () => {
      const ensure = TestBed.inject(WorkoutService).ensureMonthLoaded as jasmine.Spy;
      ensure.calls.reset();
      component.selectDate('2024-03-15');
      fixture.detectChanges();
      expect(ensure).toHaveBeenCalledWith(2024, 2);
    });
  });

  describe('selectedDateLabel()', () => {
    it('labels today as "Avui"', () => {
      component.selectDate(TODAY);
      expect(component.selectedDateLabel()).toBe('Avui');
    });

    it('labels the immediately previous day as "Ahir"', () => {
      component.selectDate(daysAgo(1));
      expect(component.selectedDateLabel()).toBe('Ahir');
    });

    it('does not mislabel two days ago as "Ahir"', () => {
      component.selectDate(daysAgo(2));
      expect(component.selectedDateLabel()).not.toBe('Ahir');
    });
  });

  // ── hasActiveFilter() ────────────────────────────────────────────────────

  describe('hasActiveFilter()', () => {
    it('is false when no filter is set', () => {
      expect(component.hasActiveFilter()).toBeFalse();
    });

    it('is true when a category filter is set', () => {
      component.filterCat.set('push');
      expect(component.hasActiveFilter()).toBeTrue();
    });

    it('is true when a date is selected', () => {
      component.selectDate(TODAY);
      expect(component.hasActiveFilter()).toBeTrue();
    });

    it("és cert amb un esport filtrat", () => {
      component.filterSport.set('s1');
      expect(component.hasActiveFilter()).toBeTrue();
    });

    it("és cert amb un abast posat", () => {
      component.setRange(30);
      expect(component.hasActiveFilter()).toBeTrue();
    });

    it('is false after all filters are cleared', () => {
      component.filterCat.set('push');
      component.filterCat.set(null);
      expect(component.hasActiveFilter()).toBeFalse();
    });
  });

  // ── feedDays() ───────────────────────────────────────────────────────────

  describe('feedDays()', () => {
    it('groups workouts and sports of the loaded window by day', () => {
      doneByDate[TODAY]      = [makeWorkout({ id: 'w-today' })];
      sportsByDate[daysAgo(1)] = [{ sport: makeSport(), session: makeSession({ date: daysAgo(1) }) }];
      workoutsSignal.set([makeWorkout({ id: 'w-today' })]);

      const days = component.feedDays();
      expect(days.map(d => d.date)).toEqual([TODAY, daysAgo(1)]);
      expect(days[0].workouts.length).toBe(1);
      expect(days[1].sports.length).toBe(1);
    });

    it('shows only the picked day once one is selected', () => {
      doneByDate[TODAY]        = [makeWorkout({ id: 'w-today' })];
      doneByDate[daysAgo(2)]   = [makeWorkout({ id: 'w-old', date: daysAgo(2) })];
      workoutsSignal.set([makeWorkout({ id: 'w-today' })]);

      component.selectDate(daysAgo(2));
      expect(component.feedDays().map(d => d.date)).toEqual([daysAgo(2)]);
    });

    it('keeps the oldest day first when the sort is flipped', () => {
      doneByDate[TODAY]      = [makeWorkout({ id: 'w-today' })];
      doneByDate[daysAgo(1)] = [makeWorkout({ id: 'w-yest', date: daysAgo(1) })];
      workoutsSignal.set([makeWorkout({ id: 'w-today' })]);

      component.sortDesc.set(false);
      expect(component.feedDays().map(d => d.date)).toEqual([daysAgo(1), TODAY]);
    });

    it('filters workouts by the active training type', () => {
      doneByDate[TODAY] = [
        makeWorkout({ id: 'w-push', categories: ['push'] }),
        makeWorkout({ id: 'w-pull', categories: ['pull'] }),
      ];
      workoutsSignal.set(doneByDate[TODAY]);

      component.filterCat.set('push');
      const days = component.feedDays();
      expect(days.length).toBe(1);
      expect(days[0].workouts.map(w => w.id)).toEqual(['w-push']);
    });

    it('hides sports while a training-type filter is active', () => {
      sportsByDate[TODAY] = [{ sport: makeSport(), session: makeSession() }];
      component.filterCat.set('push');
      expect(component.feedDays().length).toBe(0);
    });

    it('matches the search against exercise names', () => {
      doneByDate[TODAY] = [
        makeWorkout({ id: 'w-bench', entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [] }] }),
        makeWorkout({ id: 'w-squat', entries: [{ exerciseId: 'e2', exerciseName: 'Sentadella', sets: [] }] }),
      ];
      workoutsSignal.set(doneByDate[TODAY]);

      component.searchQuery.set('banca');
      expect(component.feedDays()[0].workouts.map(w => w.id)).toEqual(['w-bench']);
    });

    it('matches the search against the sport name too', () => {
      sportsByDate[TODAY] = [{ sport: makeSport(), session: makeSession() }];
      component.searchQuery.set('córrer');
      expect(component.feedDays()[0].sports.length).toBe(1);
    });
  });

  // ── Filtre per esport ────────────────────────────────────────────────────

  describe('filterSport', () => {
    it("deixa passar només les sessions d'aquell esport", () => {
      const run  = makeSport({ id: 's-run',  name: 'Córrer' });
      const padel = makeSport({ id: 's-padel', name: 'Pàdel', icon: 'sports_tennis', color: '#1E88E5' });
      sportsByDate[TODAY] = [
        { sport: run,   session: makeSession({ id: 'ss-run',   sportId: 's-run' }) },
        { sport: padel, session: makeSession({ id: 'ss-padel', sportId: 's-padel' }) },
      ];

      component.filterSport.set('s-padel');
      const days = component.feedDays();
      expect(days.length).toBe(1);
      expect(days[0].sports.map(i => i.session.id)).toEqual(['ss-padel']);
    });

    it('amaga els entrenaments: un esport no és cap tipus de gimnàs', () => {
      doneByDate[TODAY]   = [makeWorkout({ id: 'w-today' })];
      workoutsSignal.set(doneByDate[TODAY]);
      sportsByDate[TODAY] = [{ sport: makeSport(), session: makeSession() }];

      component.filterSport.set('s1');
      const days = component.feedDays();
      expect(days.length).toBe(1);
      expect(days[0].workouts).toEqual([]);
      expect(days[0].sports.length).toBe(1);
    });

    // Els esports arriben amb els trams, no amb una cerca al servidor: rascant
    // avall se'n poden trobar de més antics.
    it("no tanca la paginació: hi ha mesos per anar a buscar", () => {
      component.filterSport.set('s1');
      expect(component.hasMore()).toBeTrue();
    });

    // Sense cap coincidència als mesos carregats la llista es quedava sense
    // sentinella i sense botó: la paginació era viva i no s'hi arribava.
    it('sense coincidències encara deixa carregar el mes anterior', () => {
      component.filterSport.set('s-cap');
      // La primera càrrega ja ha passat: si no, el que es pinta és l'esquelet.
      component.isInitialLoading.set(false);
      fixture.detectChanges();

      expect(component.feedDays()).toEqual([]);
      expect(component.hasActiveFilter()).toBeTrue();
      expect(component.hasMore()).toBeTrue();
      const more: HTMLButtonElement | null =
        fixture.nativeElement.querySelector('.load-more-btn');
      expect(more).not.toBeNull();
    });

    it("i el botó estira la paginació un mes més", async () => {
      const wEnsure = TestBed.inject(WorkoutService).ensureMonthLoaded as jasmine.Spy;
      component.filterSport.set('s-cap');
      fixture.detectChanges();
      wEnsure.calls.reset();

      await component.loadMoreMonths();

      const today  = new Date(TODAY + 'T12:00:00');
      const target = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      expect(wEnsure).toHaveBeenCalledWith(target.getFullYear(), target.getMonth());
    });
  });

  // ── El període: abasts i dia, un de sol ──────────────────────────────────

  describe('període', () => {
    it("arrenca a «Tot» quan a l'adreça no hi ha cap abast", () => {
      expect(component.rangeDays()).toBeNull();
      expect(component.hasPeriodFilter()).toBeFalse();
      expect(component.periodLabel()).toBe('Tot');
    });

    it('el xip diu sempre el filtre que hi ha posat', () => {
      component.setRange(7);
      expect(component.periodLabel()).toBe('7 dies');
      component.setRange(90);
      expect(component.periodLabel()).toBe('3 mesos');
      component.selectDate(TODAY);
      expect(component.periodLabel()).toBe('Avui');
      component.clearPeriod();
      expect(component.periodLabel()).toBe('Tot');
    });

    // El xip no pot dir «30 dies» mentre la llista ensenya un dia concret.
    it('triar un dia treu l\'abast', () => {
      component.setRange(30);
      component.selectDate(daysAgo(3));
      expect(component.rangeDays()).toBeNull();
      expect(component.selectedDate()).toBe(daysAgo(3));
    });

    it("i triar un abast treu el dia", () => {
      component.selectDate(daysAgo(3));
      component.setRange(30);
      expect(component.selectedDate()).toBeNull();
      expect(component.rangeDays()).toBe(30);
    });

    it('clearPeriod() els treu tots dos', () => {
      component.selectDate(daysAgo(3));
      component.clearPeriod();
      expect(component.selectedDate()).toBeNull();
      expect(component.rangeDays()).toBeNull();
      expect(component.hasPeriodFilter()).toBeFalse();
    });

    it("talla el que queda més enrere de l'abast", () => {
      const within = daysAgo(29);
      const older  = daysAgo(45);
      doneByDate[within] = [makeWorkout({ id: 'w-within', date: within })];
      doneByDate[older]  = [makeWorkout({ id: 'w-older',  date: older })];
      workoutsSignal.set([...doneByDate[within], ...doneByDate[older]]);

      component.setRange(30);
      const dates = component.feedDays().map(d => d.date);
      expect(dates).toContain(within);
      expect(dates).not.toContain(older);
    });

    it('un abast més curt talla més amunt', () => {
      const within = daysAgo(3);
      const older  = daysAgo(20);
      doneByDate[within] = [makeWorkout({ id: 'w-within', date: within })];
      doneByDate[older]  = [makeWorkout({ id: 'w-older',  date: older })];
      workoutsSignal.set([...doneByDate[within], ...doneByDate[older]]);

      component.setRange(7);
      const dates = component.feedDays().map(d => d.date);
      expect(dates).toEqual([within]);
    });

    it("talla també amb una cerca posada: el tram mana", () => {
      const older = daysAgo(45);
      doneByDate[older] = [makeWorkout({
        id: 'w-older', date: older,
        entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [] }],
      })];
      workoutsSignal.set(doneByDate[older]);

      component.setRange(30);
      component.searchQuery.set('banca');
      expect(component.feedDays()).toEqual([]);
    });

    it("no ofereix carregar-ne més: el tram té final", () => {
      component.setRange(30);
      expect(component.hasMore()).toBeFalse();
    });

    it('tanca la llista dient de quin tram parla', () => {
      component.setRange(30);
      expect(component.loadedRangeLabel()).toBe('Últims 30 dies');
    });

    // Tres mesos són un tram, no tres consultes: demanar-ho mes a mes eren
    // quatre viatges per contestar la mateixa pregunta.
    it("demana l'abast sencer d'una tirada, no mes a mes", () => {
      const wRange = TestBed.inject(WorkoutService).ensureRange as jasmine.Spy;
      const sRange = TestBed.inject(SportService).ensureRange as jasmine.Spy;
      const wMonth = TestBed.inject(WorkoutService).ensureMonthLoaded as jasmine.Spy;
      wRange.calls.reset(); sRange.calls.reset(); wMonth.calls.reset();

      component.setRange(90);
      fixture.detectChanges();

      const start = new Date(TODAY + 'T12:00:00');
      start.setDate(start.getDate() - 89);
      const from = [
        start.getFullYear(),
        String(start.getMonth() + 1).padStart(2, '0'),
        String(start.getDate()).padStart(2, '0'),
      ].join('-');

      expect(wRange).toHaveBeenCalledOnceWith(from, TODAY);
      expect(sRange).toHaveBeenCalledOnceWith(from, TODAY);
      expect(wMonth).not.toHaveBeenCalled();
    });
  });

  // ── Loading ──────────────────────────────────────────────────────────────

  describe('loadMoreMonths()', () => {
    // El comptador de «fi de l'historial» mira el que arriba, no el que es
    // pinta: amb un filtre d'esport posat, dotze mesos sense aquell esport
    // tancaven la paginació de la pàgina sencera —i quedava tancada també
    // quan el filtre es treia.
    it("un filtre que no troba res no dona l'historial per esgotat", async () => {
      component.filterSport.set('s-cap');
      // Cada mes que es demana porta activitat, encara que no sigui la
      // d'aquell esport.
      let n = 0;
      (TestBed.inject(WorkoutService).ensureMonthLoaded as jasmine.Spy)
        .and.callFake(async () => { workoutsSignal.set([
          ...workoutsSignal(), makeWorkout({ id: `w${n++}`, date: daysAgo(60 + n * 30) }),
        ]); });

      for (let i = 0; i < 13; i++) await component.loadMoreMonths();

      expect(component.hasMore()).withContext('la paginació segueix viva').toBeTrue();
      component.filterSport.set(null);
      expect(component.hasMore()).toBeTrue();
    });

    it('loads one more month of workouts and sports', async () => {
      const wEnsure = TestBed.inject(WorkoutService).ensureMonthLoaded as jasmine.Spy;
      const sEnsure = TestBed.inject(SportService).ensureMonthLoaded as jasmine.Spy;
      wEnsure.calls.reset(); sEnsure.calls.reset();

      await component.loadMoreMonths();

      const today  = new Date(TODAY + 'T12:00:00');
      const target = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      expect(wEnsure).toHaveBeenCalledWith(target.getFullYear(), target.getMonth());
      expect(sEnsure).toHaveBeenCalledWith(target.getFullYear(), target.getMonth());
    });
  });

  describe('searching', () => {
    // Abans, buscar baixava tot l'historial amb totes les sèries i filtrava
    // aquí. Ara la pregunta la contesta el servidor i el que viatja són només
    // les coincidències.
    it('pregunta al servidor, en comptes de baixar-se l\'historial', () => {
      const search = TestBed.inject(WorkoutService).searchHistory as jasmine.Spy;
      component.searchQuery.set('banca');
      fixture.detectChanges();
      expect(search).toHaveBeenCalledWith(jasmine.objectContaining({ search: 'banca' }));
    });

    it('un filtre de tipus també va al servidor', () => {
      const search = TestBed.inject(WorkoutService).searchHistory as jasmine.Spy;
      component.filterCat.set('push' as never);
      fixture.detectChanges();
      expect(search).toHaveBeenCalledWith(jasmine.objectContaining({ category: 'push' }));
    });

    // La resposta filtrada ja porta totes les coincidències de tot
    // l'historial: no hi ha cap «mes anterior» que anar a buscar.
    it('amb un filtre posat no ofereix carregar-ne més', () => {
      component.searchQuery.set('banca');
      fixture.detectChanges();
      expect(component.hasMore()).toBeFalse();
    });
  });

  // ── Calendar toggle ──────────────────────────────────────────────────────

  describe('calendarOpen signal', () => {
    it('defaults to collapsed (calendar is an optional date filter)', () => {
      expect(component.calendarOpen()).toBeFalse();
    });

    it('can be expanded', () => {
      component.calendarOpen.set(true);
      expect(component.calendarOpen()).toBeTrue();
    });
  });
});
