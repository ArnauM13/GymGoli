import { NO_ERRORS_SCHEMA, computed } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';

import { TrainComponent } from './train.component';
import { ActivityCardComponent } from '../../shared/components/activity-card/activity-card.component';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { AuthService } from '../../core/services/auth.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { OfflineService } from '../../core/services/offline.service';
import { TrainerService } from '../../core/services/trainer.service';
import { TrainerProposal } from '../../core/models/trainer.model';
import { TemplateService } from '../../core/services/template.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { WorkoutProfileService } from '../../core/services/workout-profile.service';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { Workout, WorkoutEntry } from '../../core/models/workout.model';
import { CATEGORY_COLORS } from '../../core/models/exercise.model';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../../core/models/weekly-plan.model';
import { UserSettings, DEFAULT_USER_SETTINGS } from '../../core/models/user-settings.model';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: TODAY, entries: [], createdAt: new Date(), ...overrides };
}

const EMPTY_CATEGORY_PROFILE = { daysSinceLast: 99, typicalGapDays: 4, overdueScore: 0, everDone: false, sessions: 0 };

describe('TrainComponent', () => {
  let component: TrainComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<TrainComponent>>;
  let navigateSpy: jasmine.Spy;
  let goBackSpy: jasmine.Spy;
  let weeklyPlanSignal: ReturnType<typeof signal<WeeklyPlan>>;
  let settingsSignal: ReturnType<typeof signal<UserSettings>>;
  /** Com al servei de debò, un senyal: `activeProposal()` hi reacciona. */
  let hasTrainerSignal: ReturnType<typeof signal<boolean>>;
  let profileSignal: ReturnType<typeof signal<any>>;
  let updateSettings: jasmine.Spy;
  let sportService: { [k: string]: any };
  /** Un senyal que `ensureMonthLoaded()` llegeix per dins, com el de debò:
   *  el servei mira qui ets, si hi ha connexió i el teu pes corporal abans de
   *  demanar res. Movent-lo es reprodueix el refresc que abans et tancava
   *  l'entrenament acabat d'obrir. */
  let monthLoadProbe: ReturnType<typeof signal<number>>;

  beforeEach(async () => {
    weeklyPlanSignal = signal<WeeklyPlan>(EMPTY_WEEKLY_PLAN);
    settingsSignal    = signal<UserSettings>(DEFAULT_USER_SETTINGS);
    hasTrainerSignal  = signal(false);
    profileSignal     = signal({
      gym: { push: EMPTY_CATEGORY_PROFILE, pull: EMPTY_CATEGORY_PROFILE, legs: EMPTY_CATEGORY_PROFILE },
      sport: {} as Record<string, typeof EMPTY_CATEGORY_PROFILE>,
      minRecovery: 2,
    });
    monthLoadProbe    = signal(0);
    updateSettings    = jasmine.createSpy('update').and.callFake((patch: Partial<UserSettings>) => {
      settingsSignal.set({ ...settingsSignal(), ...patch });
      return Promise.resolve();
    });
    const mockWorkoutService = {
      workouts:                   signal<Workout[]>([]),
      isLoading:                  signal(false),
      getWorkoutsForDate:         jasmine.createSpy().and.returnValue([]),
      getDoneWorkoutsForDate:     jasmine.createSpy().and.returnValue([]),
      getPlannedForDate:          jasmine.createSpy().and.returnValue([]),
      getLastWorkoutByCategory:   jasmine.createSpy().and.returnValue(null),
      ensureMonthLoaded:          jasmine.createSpy().and.callFake(() => { monthLoadProbe(); }),
      ensureWorkoutEntries:       jasmine.createSpy().and.resolveTo(undefined),
      createWorkoutForDate:       jasmine.createSpy().and.resolveTo('new-id'),
      createWorkoutFromTemplate:  jasmine.createSpy().and.resolveTo('new-id'),
      createPlannedWorkout:       jasmine.createSpy().and.resolveTo('plan-id'),
      addExerciseToWorkout:       jasmine.createSpy().and.resolveTo(undefined),
      deleteWorkout:              jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSportService = {
      sports:                  signal<any[]>([]),
      sessions:                signal<any[]>([]),
      isLoaded:                signal(true),
      sportsLoaded:            signal(true),
      hasSportOnDate:          jasmine.createSpy().and.returnValue(false),
      getSessionForDate:       jasmine.createSpy().and.returnValue(null),
      getSportSessionsForDate:        jasmine.createSpy().and.returnValue([]),
      getPlannedSportSessionsForDate: jasmine.createSpy().and.returnValue([]),
      ensureMonthLoaded:       jasmine.createSpy().and.callFake(() => { monthLoadProbe(); }),
      ensureLoaded:            jasmine.createSpy().and.resolveTo(undefined),
      toggleSport:             jasmine.createSpy().and.resolveTo(undefined),
      setSessionSubtype:       jasmine.createSpy().and.resolveTo(undefined),
      logSession:              jasmine.createSpy().and.resolveTo('new-sess'),
      updateSession:           jasmine.createSpy().and.resolveTo(undefined),
      deleteSession:           jasmine.createSpy().and.resolveTo(undefined),
    };
    sportService = mockSportService;

    await TestBed.configureTestingModule({
      imports:   [TrainComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutService,      useValue: mockWorkoutService },
        { provide: SportService,        useValue: mockSportService },
        { provide: ExerciseService,     useValue: { exercises: signal([]), isLoaded: signal(true), ensureLoaded: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: AuthService,         useValue: { uid: signal('user-1') } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        {
          provide: UserSettingsService,
          useValue: {
            weightUnit: signal<'kg' | 'lb'>('kg'), fitnessGoal: signal(null), loaded: signal(true),
            weeklyPlan: weeklyPlanSignal, settings: settingsSignal, update: updateSettings,
            supersetsEnabled: signal(false), dropsetsEnabled: signal(false), dismissedHints: signal<string[]>([]),
            bodyweightKg: signal(null), difficultyScale: signal('emoji'),
            nextExerciseSuggestionEnabled: signal(false),
            dismissedProposalDates: computed(() => settingsSignal().dismissedProposalDates ?? []),
          },
        },
        { provide: OfflineService,      useValue: { isOffline: signal(false) } },
        { provide: TrainerService,      useValue: { myTrainer: signal(null), hasTrainer: hasTrainerSignal, getProposalForDate: jasmine.createSpy().and.returnValue(null) } },
        { provide: TemplateService,     useValue: { forCategory: jasmine.createSpy().and.returnValue([]), create: jasmine.createSpy().and.resolveTo(undefined), recordUse: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: SharedWorkoutService, useValue: { share: jasmine.createSpy().and.resolveTo('share-id') } },
        { provide: WorkoutProfileService, useValue: { profile: profileSignal } },
        { provide: MatDialog,              useValue: { open: jasmine.createSpy() } },
        { provide: FeedbackService,        useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
        { provide: ConfirmDialogService,   useValue: { confirm: jasmine.createSpy('confirm').and.resolveTo(false) } },
        { provide: NavigationHistoryService, useValue: { goBack: jasmine.createSpy('goBack') } },
      ],
    })
      .overrideComponent(TrainComponent, {
        // La targeta de dalt és la compartida i és el que aquests tests
        // miren, així que es queda de debò; la resta de fills, esquemàtics.
        set: { imports: [LowerCasePipe, ActivityCardComponent], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TrainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    navigateSpy = spyOn(component.router, 'navigate').and.resolveTo(true);
    const navHistory = TestBed.inject(NavigationHistoryService);
    goBackSpy = (jasmine.isSpy(navHistory.goBack)
      ? navHistory.goBack
      : spyOn(navHistory, 'goBack')) as jasmine.Spy;
    goBackSpy.calls.reset();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── workoutLabel() ───────────────────────────────────────────────────────

  describe('workoutLabel()', () => {
    it('returns "Entrenament" when no category', () => {
      expect(component.workoutLabel(makeWorkout())).toBe('Entrenament');
    });

    it('returns the Catalan label for a single category', () => {
      expect(component.workoutLabel(makeWorkout({ categories: ['push'] }))).toBe('Empenta');
    });

    it('joins labels with " + " for multiple categories', () => {
      expect(component.workoutLabel(makeWorkout({ categories: ['push', 'pull'] }))).toBe('Empenta + Tracció');
    });

    it('falls back to category field when categories is empty', () => {
      expect(component.workoutLabel(makeWorkout({ category: 'legs', categories: [] }))).toBe('Cames');
    });
  });

  // ── workoutCardColor() ───────────────────────────────────────────────────

  describe('workoutCardColor()', () => {
    it('returns the default teal when no categories', () => {
      expect(component.workoutCardColor(makeWorkout())).toBe('#006874');
    });

    it('returns the category color for a single category', () => {
      expect(component.workoutCardColor(makeWorkout({ categories: ['push'] }))).toBe('#e57373');
    });

    it('returns a linear-gradient for multiple categories', () => {
      const result = component.workoutCardColor(makeWorkout({ categories: ['push', 'legs'] }));
      expect(result).toContain('linear-gradient');
      expect(result).toContain('#e57373');
      expect(result).toContain('#81c784');
    });
  });

  // ── maxWeight() ──────────────────────────────────────────────────────────

  describe('maxWeight()', () => {
    it('returns 0 for an entry with no sets', () => {
      const entry: WorkoutEntry = { exerciseId: 'x', exerciseName: 'X', sets: [] };
      expect(component.maxWeight(entry)).toBe(0);
    });

    it('returns the highest weight across all sets', () => {
      const entry: WorkoutEntry = {
        exerciseId: 'x', exerciseName: 'X',
        sets: [{ weight: 60, reps: 10 }, { weight: 80, reps: 5 }, { weight: 75, reps: 6 }],
      };
      expect(component.maxWeight(entry)).toBe(80);
    });
  });

  // ── openWorkout() / closeWorkout() ───────────────────────────────────────

  describe('openWorkout() / closeWorkout()', () => {
    it('sets activeWorkoutId', () => {
      component.openWorkout('abc');
      expect(component.activeWorkoutId()).toBe('abc');
    });

    it('clears activeWorkoutId on closeWorkout', () => {
      component.openWorkout('abc');
      component.closeWorkout();
      expect(component.activeWorkoutId()).toBeNull();
    });

    it('returns to the origin on closeWorkout (home, or the calendar when registering a past day)', () => {
      component.openWorkout('abc');
      component.closeWorkout();
      expect(goBackSpy).toHaveBeenCalledWith('/home');
    });
  });

  // ── Capçalera de l'entrenament ───────────────────────────────────────────
  // La mateixa targeta que corona una sessió d'esport: qui, quan i com ha anat.

  describe('capçalera de l\'entrenament obert', () => {
    function openWith(w: Workout): HTMLElement {
      const workoutService = TestBed.inject(WorkoutService) as unknown as { workouts: ReturnType<typeof signal<Workout[]>> };
      workoutService.workouts.set([w]);
      component.openWorkout(w.id);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('diu què és i quantes sèries portes, amb la targeta del feed', () => {
      const el = openWith(makeWorkout({
        id: 'abc', date: TODAY, categories: ['push'],
        entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [{ weight: 60, reps: 10 }] }],
      }));

      const hero = el.querySelector('.aw-hero') as HTMLElement;
      expect(hero).toBeTruthy();
      expect(hero.querySelector('app-activity-icon')).toBeTruthy();
      expect(hero.querySelector('.act-card')).toBeTruthy();
      expect(hero.textContent).toContain('Empenta');
      expect(hero.textContent).toContain('1');
    });

    it('la data la diu la capçalera, no la targeta', () => {
      const el = openWith(makeWorkout({ id: 'abc', date: TODAY, categories: ['push'] }));

      expect(el.querySelector('.aw-date-sub')?.textContent).toContain('Avui');
      expect((el.querySelector('.aw-hero') as HTMLElement).textContent).not.toContain('Avui');
    });

    it('un pla es veu com a pla i encara no té xifres', () => {
      const el = openWith(makeWorkout({ id: 'abc', date: TODAY, status: 'planned', categories: ['push'] }));

      const hero = el.querySelector('.aw-hero') as HTMLElement;
      expect(hero.querySelector('.act-card')?.classList).toContain('act-card--planned');
      expect(hero.textContent).toContain('Planificat');
      expect(hero.textContent).not.toContain('exerc');
      // La sensació espera que l'entrenament s'hagi fet.
      expect(hero.querySelector('.aw-feeling-btn')).toBeNull();
    });
  });

  // Ho decideix el dia: el d'avui s'obre per entrenar-hi, i el que ja va
  // passar s'obre per mirar-se'l —la mateixa pantalla, en mode consulta.
  describe('llegir o editar en obrir un entrenament', () => {
    function open(w: Workout): HTMLElement {
      const workoutService = TestBed.inject(WorkoutService) as unknown as { workouts: ReturnType<typeof signal<Workout[]>> };
      workoutService.workouts.set([w]);
      component.openWorkout(w.id);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    /** Canviar de mode viu dins el menú de tres punts: obrir-lo és el pas
     *  previ a trobar-hi cap dels dos botons. */
    function openMenu(): HTMLElement {
      component.workoutMenuOpen.set(true);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    // Es llegeix a la pantalla de sempre: el mateix editor en consulta, i
    // editar-la és la primera opció del menú de tres punts.
    it("una sessió passada s'obre en consulta, amb editar com a primera opció del menú", () => {
      const el = open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));

      expect(component.editing()).toBeFalse();
      expect(el.querySelector('app-workout-editor')).toBeTruthy();

      openMenu();
      const items = el.querySelectorAll('.aw-menu-dropdown .aw-menu-item');
      expect(items[0].classList).toContain('edit-btn');
    });

    // El d'avui és el que estàs fent: demanar permís per apuntar-hi una sèrie
    // no té cap sentit.
    it("el d'avui s'obre per entrenar-hi", () => {
      open(makeWorkout({ id: 'today', date: TODAY, categories: ['push'] }));
      expect(component.editing()).toBeTrue();
    });

    it('un pla sempre s\'obre per escriure-hi', () => {
      open(makeWorkout({ id: 'plan', date: TODAY, status: 'planned', categories: ['push'] }));
      expect(component.editing()).toBeTrue();
    });

    it('i llavors es toca com el que estàs fent: tot editable', () => {
      open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      component.startEditing();
      fixture.detectChanges();

      expect(component.editing()).toBeTrue();
      expect(openMenu().querySelector('.edit-btn')).toBeNull();
    });

    // Si has entrat a editar des de la consulta, hi ha una consulta on tornar
    // i tornar-hi és un botó. No desa res —tot es desa sol—, només apaga
    // l'edició.
    it("editant des de la consulta, s'hi pot tornar", () => {
      const el = open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      component.startEditing();
      fixture.detectChanges();

      expect(component.canStopEditing()).toBeTrue();
      const items = openMenu().querySelectorAll<HTMLButtonElement>('.aw-menu-dropdown .aw-menu-item');
      expect(items[0].classList).toContain('read-btn');
      items[0].click();
      fixture.detectChanges();

      expect(component.editing()).toBeFalse();
      // I el menú es tanca sol: el que hi havia darrere ja és la consulta.
      expect(component.workoutMenuOpen()).toBeFalse();
      expect(openMenu().querySelector('.read-btn')).toBeNull();
      expect(el.querySelector('.edit-btn')).toBeTruthy();
    });

    // Mentre entrenes l'edició no ve de cap consulta: oferir-la seria un botó
    // de més justament quan tens les mans ocupades.
    it("entrenant no s'ofereix tornar a la consulta", () => {
      const el = open(makeWorkout({ id: 'today', date: TODAY, categories: ['push'] }));

      expect(component.canStopEditing()).toBeFalse();
      expect(openMenu().querySelector('.read-btn')).toBeNull();
    });

    it("un pla tampoc no ofereix tornar a la consulta", () => {
      open(makeWorkout({ id: 'plan', date: TODAY, status: 'planned', categories: ['push'] }));

      expect(component.canStopEditing()).toBeFalse();
      expect(openMenu().querySelector('.read-btn')).toBeNull();
    });

    // Ordenar i agrupar tenen la seva pròpia sortida: dos botons de sortir
    // alhora no diuen res.
    it("mentre s'ordena no s'ofereix tornar a la consulta", () => {
      open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      component.startEditing();
      component.startReordering();
      fixture.detectChanges();

      // Ordenar es menja la fila de botons flotants: no hi ha ni menú.
      expect(openMenu().querySelector('.read-btn')).toBeNull();
    });

    it('un acabat de crear ja ve obert per omplir-lo', () => {
      open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      component.openWorkout('old', { edit: true });
      fixture.detectChanges();

      expect(component.editing()).toBeTrue();
      // Ve obert per escriure-hi: no ve de cap consulta, i per tant no n'hi ha
      // cap on tornar.
      expect(component.canStopEditing()).toBeFalse();
      expect(openMenu().querySelector('.read-btn')).toBeNull();
    });

    it('tancar-lo oblida que se n\'havia demanat l\'edició', () => {
      open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      component.startEditing();
      component.closeWorkout();
      component.openWorkout('old');
      fixture.detectChanges();

      expect(component.editing()).toBeFalse();
    });

    // Ordenar ocupava un botó flotant permanent just on hi ha els exercicis.
    // Ara viu dins el menú, amb la resta del que es toca de tant en tant.
    it('ordenar viu dins el menú de tres punts', () => {
      const el = open(makeWorkout({
        id: 'live', date: TODAY, categories: ['push'],
        entries: [
          { exerciseId: 'e1', exerciseName: 'Press banca', sets: [] },
          { exerciseId: 'e2', exerciseName: 'Fons', sets: [] },
        ],
      }));

      expect(el.querySelectorAll('.aw-fab-row button').length).toBe(1);

      component.workoutMenuOpen.set(true);
      fixture.detectChanges();
      const menu = Array.from(el.querySelectorAll('.aw-menu-item')).map(b => b.textContent?.trim());
      expect(menu.join(' ')).toContain('Ordenar exercicis');
    });

    // Ordenar canvia l'entrenament: en consulta no s'ofereix, que allà no
    // s'hi toca res.
    it('en consulta no s\'ofereix ordenar', () => {
      const el = open(makeWorkout({
        id: 'old', date: '2024-03-05', categories: ['push'],
        entries: [
          { exerciseId: 'e1', exerciseName: 'Press banca', sets: [] },
          { exerciseId: 'e2', exerciseName: 'Fons', sets: [] },
        ],
      }));

      expect(component.editing()).toBeFalse();
      component.workoutMenuOpen.set(true);
      fixture.detectChanges();

      const menu = Array.from(el.querySelectorAll('.aw-menu-item')).map(b => b.textContent?.trim());
      expect(menu.join(' ')).not.toContain('Ordenar');
    });

    // Sortir de l'entrenament el deixa com el trobaràs la propera vegada.
    // (Sense pintar-lo: aquí l'editor és un element desconegut i `#editor` no
    // és el component de debò.)
    it('sortir-ne apaga el mode ordenar', () => {
      const workoutService = TestBed.inject(WorkoutService) as unknown as { workouts: ReturnType<typeof signal<Workout[]>> };
      workoutService.workouts.set([makeWorkout({ id: 'live', date: TODAY, categories: ['push'] })]);
      component.openWorkout('live');
      component.startReordering();
      expect(component.reorderMode()).toBeTrue();

      component.closeWorkout();
      expect(component.reorderMode()).toBeFalse();
      expect(component.groupingMode()).toBeFalse();
    });
  });

  // Planificar el dia d'avui: el botó d'Inici hi porta amb `?plan=1`, i el
  // que es crea és un pla encara que el dia sigui avui.
  describe('planificar el dia', () => {
    it("crea un pla quan s'hi ha vingut a planificar", async () => {
      const workoutService = TestBed.inject(WorkoutService) as unknown as { createPlannedWorkout: jasmine.Spy; createWorkoutForDate: jasmine.Spy };
      component.planRequested.set(true);
      component.selectedDate.set(TODAY);

      component.selectType('push');
      await component.pickerStartEmpty();

      expect(workoutService.createPlannedWorkout).toHaveBeenCalledWith(TODAY, 'push', []);
      expect(workoutService.createWorkoutForDate).not.toHaveBeenCalled();
    });

    it('i sense demanar-ho, el d\'avui es comença', async () => {
      const workoutService = TestBed.inject(WorkoutService) as unknown as { createPlannedWorkout: jasmine.Spy; createWorkoutForDate: jasmine.Spy };
      component.selectedDate.set(TODAY);

      component.selectType('push');
      await component.pickerStartEmpty();

      expect(workoutService.createWorkoutForDate).toHaveBeenCalledWith(TODAY, 'push');
      expect(workoutService.createPlannedWorkout).not.toHaveBeenCalled();
    });
  });

  // ── El pla del dia, en entrar ────────────────────────────────────────────

  describe('plannedDay()', () => {
    const sport = { id: 's1', name: 'Padel', icon: 'sports_tennis', color: '#000', subtypes: [], metricDefs: [] } as any;

    it('no diu res quan el dia no té res apuntat', () => {
      expect(component.plannedDay()).toBeNull();
    });

    it("ensenya el que tens planificat per al dia que es mira", () => {
      const plan = makeWorkout({ id: 'p1', date: '2999-01-02', status: 'planned', categories: ['push'] });
      (TestBed.inject(WorkoutService).getPlannedForDate as jasmine.Spy).and.returnValue([plan]);
      component.selectedDate.set('2999-01-02');

      const day = component.plannedDay();
      expect(day?.date).toBe('2999-01-02');
      expect(day?.workouts).toEqual([plan]);
    });

    it("també els esports apuntats", () => {
      const session = { id: 'sess1', date: '2999-01-03', sportId: 's1', status: 'planned' } as any;
      sportService['getPlannedSportSessionsForDate'].and.returnValue([{ sport, session }]);
      component.selectedDate.set('2999-01-03');

      expect(component.plannedDay()?.sports.length).toBe(1);
    });

    it("hi véns a començar-lo, o a veure què hi tens si el planifiques", () => {
      expect(component.plannedHint()).toBe('Comença el que tenies previst');
      component.planRequested.set(true);
      expect(component.plannedHint()).toBe('Això ja ho tens apuntat per a aquest dia');
    });

    it("un esport del pla s'obre a la seva pàgina", () => {
      component.openPlannedSport({ session: { id: 'sess1' } as any });
      expect(navigateSpy).toHaveBeenCalledWith(['/sport', 'sess1'], {});
    });
  });

  // ── deleteActiveWorkout() ────────────────────────────────────────────────

  describe('deleteActiveWorkout()', () => {
    it('deletes the workout and returns to the origin', async () => {
      const w = makeWorkout({ id: 'abc' });
      const workoutService = TestBed.inject(WorkoutService) as unknown as { workouts: ReturnType<typeof signal<Workout[]>>; deleteWorkout: jasmine.Spy };
      workoutService.workouts.set([w]);
      (TestBed.inject(ConfirmDialogService).confirm as jasmine.Spy).and.resolveTo(true);

      component.openWorkout('abc');
      await component.deleteActiveWorkout();

      expect(workoutService.deleteWorkout).toHaveBeenCalledWith('abc');
      expect(component.activeWorkoutId()).toBeNull();
      expect(goBackSpy).toHaveBeenCalledWith('/home');
    });
  });

  // ── saveTemplateFromNudge() ──────────────────────────────────────────────

  describe('saveTemplateFromNudge()', () => {
    it('dismisses the nudge and opens the save-as-template sheet', () => {
      component.saveTemplateFromNudge(makeWorkout({ id: 'w1', categories: ['push'] }));
      expect(component.saveTemplateOpen()).toBeTrue();
      expect(updateSettings).toHaveBeenCalledWith({ dismissedHints: ['nudge-save-template'] });
    });
  });

  // ── selectType() / openSessionLogger() toggle behaviour ─────────────────

  describe('selectType()', () => {
    it('opens the picker for the tapped category', () => {
      component.selectType('push');
      expect(component.pickerCat()).toBe('push');
    });

    it('closes the picker when tapping the already-active category again', () => {
      component.selectType('push');
      component.selectType('push');
      expect(component.pickerCat()).toBeNull();
    });

    it('switches to the newly-tapped category without closing', () => {
      component.selectType('push');
      component.selectType('pull');
      expect(component.pickerCat()).toBe('pull');
    });
  });

  // Registrar un esport funciona com començar un entrenament: es crea
  // l'activitat i s'obre la seva pàgina. El full flotant ja no hi és.
  describe('startSportSession()', () => {
    const sport = { id: 's1', name: 'Running', icon: 'directions_run', color: '#000', subtypes: [], metricDefs: [] } as any;

    it("registra l'esport del dia i obre la seva pàgina", async () => {
      component.selectedDate.set(TODAY);
      await component.startSportSession(sport);

      expect(sportService['logSession']).toHaveBeenCalledWith(
        TODAY, 's1', jasmine.objectContaining({ duration: 60 }), 'done', undefined);
      expect(navigateSpy).toHaveBeenCalledWith(['/sport', 'new-sess'], { queryParams: { nova: 1 } });
    });

    it('un dia que encara ha de venir es planifica, no es registra', async () => {
      component.selectedDate.set('2999-01-01');
      await component.startSportSession(sport);

      expect(sportService['logSession']).toHaveBeenCalledWith(
        '2999-01-01', 's1', jasmine.any(Object), 'planned', 'manual');
    });

    it("no en crea una altra si el dia ja en té: hi va", async () => {
      sportService['getSessionForDate'].and.returnValue({ id: 'sess1', date: TODAY, sportId: 's1' });
      await component.startSportSession(sport);

      expect(sportService['logSession']).not.toHaveBeenCalled();
      // Sense `?nova`: no hi vas a omplir-la, hi vas a mirar-la.
      expect(navigateSpy).toHaveBeenCalledWith(['/sport', 'sess1'], {});
    });
  });


  // ── reorderMode ──────────────────────────────────────────────────────────

  describe('reorderMode', () => {
    it('is off by default', () => {
      expect(component.reorderMode()).toBeFalse();
    });
  });

  // ── groupingMode ─────────────────────────────────────────────────────────

  describe('groupingMode', () => {
    it('is off by default', () => {
      expect(component.groupingMode()).toBeFalse();
    });
  });

  // ── isToday() ────────────────────────────────────────────────────────────

  describe('isToday()', () => {
    it('is true when selectedDate is today', () => {
      component.selectedDate.set(TODAY);
      expect(component.isToday()).toBeTrue();
    });

    it('is false for a past date', () => {
      component.selectedDate.set('2020-01-01');
      expect(component.isToday()).toBeFalse();
    });
  });

  // ── Arribar a /train ─────────────────────────────────────────────────────

  describe('arriving at /train', () => {
    function navigateTo(url: string, id = 1): void {
      const events = TestBed.inject(Router).events as unknown as Subject<NavigationEnd>;
      events.next(new NavigationEnd(id, url, url));
    }

    it('lands on today when coming from another page without ?date=', () => {
      component.selectedDate.set('2020-09-01');

      navigateTo('/home', 1);
      navigateTo('/train', 2);

      expect(component.selectedDate()).toBe(TODAY);
    });

    it('stays on the day being viewed when only its own query params change', () => {
      navigateTo('/train', 1);
      component.selectedDate.set('2020-09-01');

      navigateTo('/train?workout=w1', 2);

      expect(component.selectedDate()).toBe('2020-09-01');
    });

    // El que s'ha d'ensenyar ho diu l'adreça: la ruta es manté viva
    // (AppReuseStrategy) i abans això penjava d'un observable de la ruta que,
    // reenganxada, només torna a emetre si els paràmetres han canviat.
    describe("obrir el que diu l'adreça", () => {
      it('obre l\'entrenament que anomena el `?workout=`', () => {
        navigateTo('/home', 1);
        navigateTo('/train?workout=w1', 2);

        expect(component.activeWorkoutId()).toBe('w1');
      });

      it('el torna a obrir després d\'haver-lo tancat, encara que sigui el mateix', () => {
        navigateTo('/home', 1);
        navigateTo('/train?workout=w1', 2);
        component.closeWorkout();
        expect(component.activeWorkoutId()).toBeNull();

        navigateTo('/home', 3);
        navigateTo('/train?workout=w1', 4);

        expect(component.activeWorkoutId()).toBe('w1');
      });

      it('canvia d\'entrenament sense passar pel taulell', () => {
        navigateTo('/home', 1);
        navigateTo('/train?workout=w1', 2);
        navigateTo('/home', 3);
        navigateTo('/train?workout=w2', 4);

        expect(component.activeWorkoutId()).toBe('w2');
      });

      // Arribar-hi d'una altra pàgina posa el dia a avui, i això reinicia el
      // que hi hagi obert: obrir un entrenament no ho ha de patir.
      it('no es tanca sol quan el salt de dia va amb ell', () => {
        component.selectedDate.set('2020-09-01');
        navigateTo('/home', 1);
        navigateTo('/train?workout=w1', 2);
        TestBed.flushEffects();

        expect(component.selectedDate()).toBe(TODAY);
        expect(component.activeWorkoutId()).toBe('w1');
      });

      it('deixa l\'adreça com és: no navega enlloc en obrir-lo', () => {
        navigateTo('/home', 1);
        navigateTo('/train?workout=w1', 2);

        expect(navigateSpy).not.toHaveBeenCalled();
      });

      it('un `?date=` deep-link mou el dia encara que la pàgina ja fos viva', () => {
        navigateTo('/home', 1);
        navigateTo('/train?date=2024-03-05', 2);

        expect(component.selectedDate()).toBe('2024-03-05');
      });

      // Planificar avui: el dia ja hi és, però el que s'hi creï és un pla i
      // no una sessió que comenci ara.
      it('`?plan=1` fa que el dia d\'avui es planifiqui, no es comenci', () => {
        navigateTo('/home', 1);
        navigateTo(`/train?date=${TODAY}&plan=1`, 2);

        expect(component.planning()).toBeTrue();
        expect(component.isToday()).toBeTrue();
      });

      it('tornar a Entrenar sense demanar-ho deixa de planificar', () => {
        navigateTo('/home', 1);
        navigateTo(`/train?date=${TODAY}&plan=1`, 2);
        navigateTo('/home', 3);
        navigateTo('/train', 4);

        expect(component.planning()).toBeFalse();
      });

      it('un dia passat no es planifica encara que ho demanin', () => {
        navigateTo('/home', 1);
        navigateTo('/train?date=2024-03-05&plan=1', 2);

        expect(component.planning()).toBeFalse();
      });
    });

    // ── El que hi ha obert només el tanca canviar de dia ──────────────────
    //
    // Demanar les dades del mes i tancar el que hi hagi obert anaven junts en
    // un sol efecte, i tot el que `ensureMonthLoaded()` llegeix per dins
    // n'era dependència. Cada refresc —la sessió que arriba en recarregar, la
    // configuració, la cobertura que va i ve— et tancava l'entrenament que
    // acabaves d'obrir i et desfeia l'editar.
    describe('un refresc de dades no tanca res', () => {
      function openDoneWorkout(id: string): void {
        const workoutService = TestBed.inject(WorkoutService) as unknown as
          { workouts: ReturnType<typeof signal<Workout[]>> };
        workoutService.workouts.set([makeWorkout({ id, date: '2024-03-05' })]);
        navigateTo('/home', 1);
        navigateTo(`/train?workout=${id}`, 2);
        fixture.detectChanges();
      }

      it("deixa obert l'entrenament que s'acaba d'obrir", () => {
        openDoneWorkout('w1');
        expect(component.activeWorkoutId()).toBe('w1');

        monthLoadProbe.update(v => v + 1);
        fixture.detectChanges();

        expect(component.activeWorkoutId()).toBe('w1');
      });

      it("no desfà l'editar acabat de demanar", () => {
        openDoneWorkout('w1');
        component.startEditing();
        expect(component.editing()).toBeTrue();

        monthLoadProbe.update(v => v + 1);
        fixture.detectChanges();

        expect(component.editing()).toBeTrue();
      });

      // L'altra meitat: canviar de dia sí que ha de tancar el que hi havia.
      it('canviar de dia sí que tanca el que hi havia obert', () => {
        openDoneWorkout('w1');

        component.selectedDate.set('2020-09-01');
        fixture.detectChanges();

        expect(component.activeWorkoutId()).toBeNull();
      });
    });
  });

  // ── isSelectedPast() / selectedDateLabel() ───────────────────────────────

  describe('registering a past day', () => {
    it('isSelectedPast() is true for a past date and false for today', () => {
      component.selectedDate.set('2020-01-01');
      expect(component.isSelectedPast()).toBeTrue();
      component.selectedDate.set(TODAY);
      expect(component.isSelectedPast()).toBeFalse();
    });

    it('selectedDateLabel() reads "Ahir" for yesterday', () => {
      const y = new Date(TODAY + 'T12:00:00');
      y.setDate(y.getDate() - 1);
      component.selectedDate.set(y.toISOString().split('T')[0]);
      expect(component.selectedDateLabel()).toBe('Ahir');
    });

  });

  // ── heroDateLabel() ──────────────────────────────────────────────────────
  // La capçalera diu el dia com el diu el feed i la sessió d'esport: el mateix
  // dia no es pot dir de dues maneres segons la pantalla on siguis.

  describe('heroDateLabel()', () => {
    it('diu «Avui» quan l\'entrenament és d\'avui', () => {
      expect(component.heroDateLabel(makeWorkout({ date: TODAY }))).toBe('Avui');
    });

    it('escriu el dia quan ja fa dies', () => {
      const result = component.heroDateLabel(makeWorkout({ date: '2024-03-10' }));
      expect(result).not.toBe('Avui');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // ── isPlannedWorkout() ───────────────────────────────────────────────────

  describe('isPlannedWorkout()', () => {
    it('un entrenament sense estat ja s\'ha fet', () => {
      expect(component.isPlannedWorkout(makeWorkout({ date: TODAY }))).toBe(false);
    });

    it('un pla encara no s\'ha fet', () => {
      expect(component.isPlannedWorkout(makeWorkout({ date: TODAY, status: 'planned' }))).toBe(true);
    });
  });

  // ── canStartActivePlan() ─────────────────────────────────────────────────
  //
  // La mateixa regla que el botó de play del feed i que «Registrar la sessió»
  // d'un esport planificat: un pla es comença quan el seu dia ha arribat.

  describe('canStartActivePlan()', () => {
    it('ofereix començar el pla d\'avui', () => {
      expect(component.canStartActivePlan(makeWorkout({ date: TODAY, status: 'planned' }))).toBe(true);
    });

    it('no ofereix començar un pla que encara ha de venir', () => {
      expect(component.canStartActivePlan(makeWorkout({ date: '2999-01-01', status: 'planned' }))).toBe(false);
    });

    it('un entrenament ja fet no es comença: ja s\'ha començat', () => {
      expect(component.canStartActivePlan(makeWorkout({ date: TODAY }))).toBe(false);
    });
  });

  // ── shareWorkout() ───────────────────────────────────────────────────────

  describe('shareWorkout()', () => {
    let originalShare: unknown;
    let originalClipboard: unknown;
    let sharedWorkoutService: { share: jasmine.Spy };

    beforeEach(() => {
      sharedWorkoutService = TestBed.inject(SharedWorkoutService) as unknown as { share: jasmine.Spy };
      originalShare = (navigator as unknown as Record<string, unknown>)['share'];
      originalClipboard = (navigator as unknown as Record<string, unknown>)['clipboard'];
    });

    afterEach(() => {
      Object.defineProperty(navigator, 'share', { value: originalShare, configurable: true });
      Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, configurable: true });
    });

    it('shares the workout and copies the link when the Web Share API is unavailable', async () => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      const writeText = jasmine.createSpy('writeText').and.resolveTo(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

      const w = makeWorkout({ categories: ['push'], entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [] }] });
      await component.shareWorkout(w);

      expect(sharedWorkoutService.share).toHaveBeenCalledWith('Empenta', 'push', w.entries);
      expect(writeText).toHaveBeenCalled();
    });

    it('uses the Web Share API when available instead of copying to the clipboard', async () => {
      const share = jasmine.createSpy('share').and.resolveTo(undefined);
      Object.defineProperty(navigator, 'share', { value: share, configurable: true });
      const writeText = jasmine.createSpy('writeText').and.resolveTo(undefined);
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

      const w = makeWorkout({ categories: ['push', 'pull'], entries: [] });
      await component.shareWorkout(w);

      expect(share).toHaveBeenCalled();
      expect(writeText).not.toHaveBeenCalled();
      expect(sharedWorkoutService.share).toHaveBeenCalledWith(jasmine.any(String), 'mixed', w.entries);
    });
  });

  // Els suggeriments i les bafarades són la mateixa targeta: sempre es pinten
  // amb el gos al costat, com a molt un de gimnàs i un d'esport, i en tancar-ne
  // una no queda res al seu lloc.
  describe('suggestion bubbles', () => {
    const gym   = { type: 'gym',   category: 'legs', label: 'Cames',  color: '#81c784', icon: 'directions_run', reason: 'Fa 29 dies' } as never;
    const sport = { type: 'sport', sport: {} as never, label: 'Futbol', color: '#1E88E5', icon: 'sports_soccer', reason: 'Hi tornem? Fa 3 setmanes' } as never;

    const padel = {
      id: 's1', name: 'Pàdel', icon: 'sports_tennis', color: '#1E88E5',
      subtypes: [], metricDefs: [], createdAt: new Date(),
    };

    /** Un perfil que fa que aquell esport i aquell tipus siguin proposables. */
    function withSportAndGym(): void {
      sportService['sports'].set([padel]);
      profileSignal.set({
        gym: {
          push: { daysSinceLast: 9, typicalGapDays: 3, overdueScore: 3, everDone: true, sessions: 40 },
          pull: EMPTY_CATEGORY_PROFILE,
          legs: EMPTY_CATEGORY_PROFILE,
        },
        sport: { s1: { daysSinceLast: 40, typicalGapDays: 4, overdueScore: 10, everDone: true, sessions: 30 } },
        minRecovery: 2,
      });
      fixture.detectChanges();
    }

    it('the Marley proposes gym', () => {
      expect(component.suggestionMascot(gym).figure).toContain('marley');
    });

    it('the Xoco proposes sport', () => {
      expect(component.suggestionMascot(sport).figure).toContain('xoco');
    });

    it('uses the cut-out figure, not the round avatar, next to the card', () => {
      expect(component.suggestionMascot(gym).figure).toContain('-full');
    });

    // El Xoco surt a l'esquerra i a dalt; el Marley, a la dreta i a sota.
    it('el Xoco va a l\'esquerra i el Marley a la dreta', () => {
      expect(component.suggestionSide(sport)).toBe('left');
      expect(component.suggestionSide(gym)).toBe('right');
    });

    it('com a molt dos: un d\'esport i un de gimnàs, i l\'esport primer', () => {
      withSportAndGym();
      const kinds = component.todaySuggestions().map(s => s.type);
      expect(kinds).toEqual(['sport', 'gym']);
      expect(fixture.nativeElement.querySelectorAll('.suggestion-float-row').length).toBe(2);
    });

    it('proposa tornar a un esport que fa temps que no fas', () => {
      withSportAndGym();
      const s = component.todaySuggestions().find(x => x.type === 'sport')!;
      expect(s.source).toBe('comeback');
      expect(s.reason).toContain('Hi tornem?');
    });

    it('tancar-ne una deixa l\'altra al seu lloc', () => {
      withSportAndGym();
      component.dismissSuggestion('sport');
      fixture.detectChanges();

      expect(component.todaySuggestions().map(s => s.type)).toEqual(['gym']);
      expect(fixture.nativeElement.querySelectorAll('.suggestion-float-row').length).toBe(1);
    });

    it('tancar-les totes dues no deixa res darrere', () => {
      withSportAndGym();
      component.dismissSuggestion('sport');
      component.dismissSuggestion('gym');
      fixture.detectChanges();

      const host: HTMLElement = fixture.nativeElement;
      expect(component.todaySuggestions()).toEqual([]);
      expect(host.querySelector('.suggestion-float-row')).toBeNull();
      expect(host.querySelector('.suggestion-stack')).toBeNull();
    });

    // El que ja has fet avui no es proposa: seria dir-te que facis el que
    // acabes de fer.
    it('no proposa el que ja s\'ha fet avui', () => {
      sportService['getSportSessionsForDate'].and.returnValue([
        { sport: padel, session: { id: 'x', date: TODAY, sportId: 's1', status: 'done', createdAt: new Date() } },
      ]);
      withSportAndGym();

      expect(component.todaySuggestions().map(s => s.type)).toEqual(['gym']);
    });

    // Una cosa que has dit que faries mana sobre qualsevol estadística.
    it('el que tens planificat per avui passa al davant, i tocar-lo el comença', async () => {
      const session = {
        id: 'routine:x', date: TODAY, sportId: 's1',
        status: 'planned', plannedSource: 'routine', createdAt: new Date(),
      };
      sportService['getPlannedSportSessionsForDate'].and.returnValue([{ sport: padel, session }]);
      sportService['startPlannedSession'] = jasmine.createSpy().and.resolveTo('sess-1');
      withSportAndGym();

      const s = component.todaySuggestions().find(x => x.type === 'sport')!;
      expect(s.source).toBe('planned');
      expect(s.reason).toBe('Toca avui, per la rutina');

      await component.handleSuggestionClick(s);
      expect(sportService['startPlannedSession']).toHaveBeenCalledWith('routine:x', TODAY);
    });

    // Qui ve a deixar el dia apuntat no el vol començar: el gos proposa
    // planificar, i si el dia ja té pla, calla.
    describe('planificant el dia', () => {
      beforeEach(() => component.planRequested.set(true));

      it('el verb passa a ser planificar, per als dos gossos', () => {
        withSportAndGym();
        const kinds = component.todaySuggestions();

        expect(kinds.map(x => component.suggestionVerb(x))).toEqual(['Planificar', 'Planificar']);
      });

      it('i el que es proposa es deixa apuntat, no es comença', async () => {
        withSportAndGym();
        const s = component.todaySuggestions().find(x => x.type === 'sport')!;

        await component.handleSuggestionClick(s);

        expect(sportService['logSession']).toHaveBeenCalledWith(
          TODAY, 's1', jasmine.any(Object), 'planned', 'manual');
      });

      it('un de gimnàs obre el full per triar amb què omplir el pla', () => {
        withSportAndGym();
        const s = component.todaySuggestions().find(x => x.type === 'gym')!;

        void component.handleSuggestionClick(s);

        expect(component.pickerCat()).toBe(s.type === 'gym' ? s.category : null);
      });

      it('i si el dia ja té alguna cosa apuntada, aquell gos calla', () => {
        const session = {
          id: 'sess-p', date: TODAY, sportId: 's1',
          status: 'planned', plannedSource: 'manual', createdAt: new Date(),
        };
        sportService['getPlannedSportSessionsForDate'].and.returnValue([{ sport: padel, session }]);
        withSportAndGym();

        // L'esport ja és al pla —i surt a la secció «Planificat»—, o sigui que
        // el Xoco no el repeteix; el gimnàs, que no en té, sí que es proposa.
        expect(component.todaySuggestions().map(x => x.type)).toEqual(['gym']);
      });
    });
  });

  describe('propostes de l\'entrenador ignorades', () => {
    const proposal: TrainerProposal = {
      id: 'prop-1', trainerId: 't-1', clientId: 'user-1', proposalType: 'specific',
      date: null, weekday: null, entries: [], notes: null, status: 'pending',
      createdAt: new Date('2024-03-01T00:00:00.000Z'),
    };

    function withProposal(): void {
      const trainer = TestBed.inject(TrainerService) as unknown as {
        getProposalForDate: jasmine.Spy;
      };
      trainer.getProposalForDate.and.returnValue(proposal);
      hasTrainerSignal.set(true);
    }

    it('ignorar-la la guarda a la configuració, no en aquest dispositiu', () => {
      withProposal();
      const date = component.selectedDate();

      component.ignoreProposal();

      expect(updateSettings).toHaveBeenCalledWith({ dismissedProposalDates: [date] });
      expect(localStorage.getItem('gymgoli_dismissed_proposals_user-1')).toBeNull();
    });

    it('la targeta marxa a l\'instant, sense esperar cap altre canvi', () => {
      withProposal();
      expect(component.activeProposal()).toBe(proposal);

      component.ignoreProposal();

      expect(component.activeProposal()).toBeNull();
    });

    it('no la torna a guardar si ja hi és', () => {
      withProposal();
      component.ignoreProposal();
      updateSettings.calls.reset();

      component.ignoreProposal();

      expect(updateSettings).not.toHaveBeenCalled();
    });
  });

});
