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

const EMPTY_CATEGORY_PROFILE = { daysSinceLast: 99, typicalGapDays: 4, overdueScore: 0 };

describe('TrainComponent', () => {
  let component: TrainComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<TrainComponent>>;
  let forceOffline: ReturnType<typeof signal<boolean>>;
  let navigateSpy: jasmine.Spy;
  let goBackSpy: jasmine.Spy;
  let weeklyPlanSignal: ReturnType<typeof signal<WeeklyPlan>>;
  let settingsSignal: ReturnType<typeof signal<UserSettings>>;
  /** Com al servei de debò, un senyal: `activeProposal()` hi reacciona. */
  let hasTrainerSignal: ReturnType<typeof signal<boolean>>;
  let updateSettings: jasmine.Spy;
  let sportService: { [k: string]: any };

  beforeEach(async () => {
    forceOffline = signal(false);
    weeklyPlanSignal = signal<WeeklyPlan>(EMPTY_WEEKLY_PLAN);
    settingsSignal    = signal<UserSettings>(DEFAULT_USER_SETTINGS);
    hasTrainerSignal  = signal(false);
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
      ensureMonthLoaded:          jasmine.createSpy(),
      ensureWorkoutEntries:       jasmine.createSpy().and.resolveTo(undefined),
      createWorkoutForDate:       jasmine.createSpy().and.resolveTo('new-id'),
      createWorkoutFromTemplate:  jasmine.createSpy().and.resolveTo('new-id'),
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
      ensureMonthLoaded:       jasmine.createSpy(),
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
        { provide: OfflineService,      useValue: { isOffline: signal(false), forceOffline, toggleForceOffline: jasmine.createSpy() } },
        { provide: TrainerService,      useValue: { myTrainer: signal(null), hasTrainer: hasTrainerSignal, getProposalForDate: jasmine.createSpy().and.returnValue(null) } },
        { provide: TemplateService,     useValue: { forCategory: jasmine.createSpy().and.returnValue([]), create: jasmine.createSpy().and.resolveTo(undefined), recordUse: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: SharedWorkoutService, useValue: { share: jasmine.createSpy().and.resolveTo('share-id') } },
        { provide: WorkoutProfileService, useValue: { profile: signal({ gym: { push: EMPTY_CATEGORY_PROFILE, pull: EMPTY_CATEGORY_PROFILE, legs: EMPTY_CATEGORY_PROFILE }, favoriteSport: null, recentSport: null, minRecovery: 2 }) } },
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

  // Un entrenament d'un dia passat s'obre per llegir-lo, com una sessió
  // d'esport; el d'avui s'obre per fer-lo.
  describe('llegir o editar en obrir un entrenament', () => {
    function open(w: Workout): HTMLElement {
      const workoutService = TestBed.inject(WorkoutService) as unknown as { workouts: ReturnType<typeof signal<Workout[]>> };
      workoutService.workouts.set([w]);
      component.openWorkout(w.id);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it("el d'avui cau de dret a l'editor", () => {
      const el = open(makeWorkout({ id: 'today', date: TODAY, categories: ['push'] }));
      expect(component.editing()).toBeTrue();
      expect(el.querySelector('.edit-btn')).toBeNull();
    });

    it("un de passat s'obre a l'esquema, amb el botó d'editar", () => {
      const el = open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      expect(component.editing()).toBeFalse();
      expect(el.querySelector('app-workout-detail')).toBeTruthy();
      expect(el.querySelector('.edit-btn')).toBeTruthy();
    });

    it('i llavors es toca com el d\'avui: tot editable', () => {
      open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      component.startEditing();
      fixture.detectChanges();

      expect(component.editing()).toBeTrue();
      expect((fixture.nativeElement as HTMLElement).querySelector('.edit-btn')).toBeNull();
    });

    it('un de passat acabat de crear ja ve obert per omplir-lo', () => {
      open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      component.openWorkout('old', { edit: true });
      expect(component.editing()).toBeTrue();
    });

    it('tancar-lo oblida que se n\'havia demanat l\'edició', () => {
      open(makeWorkout({ id: 'old', date: '2024-03-05', categories: ['push'] }));
      component.startEditing();
      component.closeWorkout();
      component.openWorkout('old');
      fixture.detectChanges();

      expect(component.editing()).toBeFalse();
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

  // El suggeriment i la bafarada són la mateixa targeta: sempre es pinta amb
  // el gos al costat, i en tancar-la no queda res al seu lloc.
  describe('suggestion bubble', () => {
    const gym   = { type: 'gym',   category: 'legs', label: 'Cames',  color: '#81c784', icon: 'directions_run', reason: 'Fa 29 dies' } as never;
    const sport = { type: 'sport', sport: {} as never, label: 'Futbol', color: '#1E88E5', icon: 'sports_soccer', reason: 'El teu esport habitual' } as never;

    it('the Marley proposes gym', () => {
      expect(component.suggestionMascot(gym).figure).toContain('marley');
    });

    it('the Xoco proposes sport', () => {
      expect(component.suggestionMascot(sport).figure).toContain('xoco');
    });

    it('uses the cut-out figure, not the round avatar, next to the card', () => {
      expect(component.suggestionMascot(gym).figure).toContain('-full');
    });

    it('starts visible so the dog shows up', () => {
      expect(component.suggestionDismissed()).toBe(false);
    });

    it('closing it leaves nothing behind — no card, no fallback action', () => {
      component.dismissSuggestion();
      fixture.detectChanges();
      expect(component.suggestionDismissed()).toBe(true);
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelector('.suggestion-float-row')).toBeNull();
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
