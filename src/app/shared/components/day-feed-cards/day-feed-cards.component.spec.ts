import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DayFeedCardsComponent } from './day-feed-cards.component';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FeedbackService } from '../../services/feedback.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { Workout } from '../../../core/models/workout.model';
import { Sport, SportSession } from '../../../core/models/sport.model';

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: '2024-01-01', entries: [], createdAt: new Date(), ...overrides };
}

/** Què ofereix el peu de cada sessió: unir, separar, o res. Sense la icona,
 *  que amb la font de símbols també és text. */
function footLabels(host: HTMLElement): string[] {
  return Array.from(host.querySelectorAll('.sg-foot .sg-split'), btn => {
    const copy = btn.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.material-symbols-outlined').forEach(icon => icon.remove());
    return copy.textContent?.trim() ?? '';
  });
}

describe('DayFeedCardsComponent', () => {
  let component: DayFeedCardsComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<DayFeedCardsComponent>>;
  let startPlannedWorkout: jasmine.Spy;
  let editPlannedWorkout: jasmine.Spy;
  let setWorkoutGroup: jasmine.Spy;
  let setSportGroup: jasmine.Spy;
  let deleteWorkout: jasmine.Spy;
  let updateSession: jasmine.Spy;
  let deleteSession: jasmine.Spy;
  let startPlannedSession: jasmine.Spy;
  let confirm: jasmine.Spy;
  /** El que el dia té apuntat, que és el que el servei llegeix per dir amb
   *  què es pot unir cada sessió. */
  let dayWorkouts: Workout[];
  let daySports: { sport: Sport; session: SportSession }[];

  beforeEach(async () => {
    // Torna l'id de l'entrenament que s'ha d'obrir: un planificat de la
    // rutina no és cap fila fins que es comença, i llavors n'és una de nova.
    startPlannedWorkout = jasmine.createSpy().and.callFake((id: string) => Promise.resolve(id));
    // Igual que començar-lo: torna l'id del pla que s'ha d'obrir, que d'una
    // projecció de la rutina és el de la fila que s'acaba de crear.
    editPlannedWorkout = jasmine.createSpy().and.callFake((id: string) => Promise.resolve(id));
    deleteWorkout = jasmine.createSpy().and.resolveTo(undefined);
    updateSession = jasmine.createSpy().and.resolveTo(undefined);
    deleteSession = jasmine.createSpy().and.resolveTo(undefined);
    startPlannedSession = jasmine.createSpy().and.resolveTo(undefined);
    confirm = jasmine.createSpy().and.resolveTo(true);
    setWorkoutGroup = jasmine.createSpy().and.resolveTo(undefined);
    setSportGroup   = jasmine.createSpy().and.resolveTo(undefined);
    // El que el dia té apuntat, tal com ho llegiria `SessionGroupService`:
    // és el que decideix si aquesta sessió es pot unir amb cap altra.
    dayWorkouts = [];
    daySports   = [];

    await TestBed.configureTestingModule({
      imports: [DayFeedCardsComponent],
      providers: [
        { provide: WorkoutService, useValue: {
          startPlannedWorkout, editPlannedWorkout, deleteWorkout, setSessionGroup: setWorkoutGroup,
          getPlannedForDate: () => dayWorkouts.filter(w => w.status === 'planned'),
          getDoneWorkoutsForDate: () => dayWorkouts.filter(w => (w.status ?? 'done') !== 'planned'),
        } },
        { provide: SportService, useValue: {
          updateSession, deleteSession, startPlannedSession, setSessionGroup: setSportGroup,
          getPlannedSportSessionsForDate: () => daySports.filter(p => p.session.status === 'planned'),
          getSportSessionsForDate: () => daySports.filter(p => (p.session.status ?? 'done') !== 'planned'),
          sessions: signal([]),
          sportHistoryLoaded: () => false,
          loadSessionsForSport: jasmine.createSpy().and.resolveTo(undefined),
        } },
        { provide: UserSettingsService, useValue: { difficultyScale: signal('emoji'), bodyweightKg: signal(null), weightUnit: signal<'kg' | 'lb'>('kg') } },
        { provide: ExerciseService, useValue: { loadTypeOf: () => undefined, getById: () => undefined } },
        { provide: FeedbackService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
        { provide: ConfirmDialogService, useValue: { confirm } },
      ],
    })
      .overrideComponent(DayFeedCardsComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();

    fixture = TestBed.createComponent(DayFeedCardsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('handleWorkoutClick()', () => {
    // Tocar un pla el llegeix, no el comença: començar-lo té el seu botó.
    it('desplega un planificat en comptes de començar-lo', async () => {
      const openSpy = spyOn(component.open, 'emit');
      const w = makeWorkout({ status: 'planned' });
      component.handleWorkoutClick(w);
      expect(component.expandedWorkoutId()).toBe('1');
      expect(startPlannedWorkout).not.toHaveBeenCalled();
      expect(openSpy).not.toHaveBeenCalled();

      // I el segon clic el plega, com qualsevol altra targeta.
      component.handleWorkoutClick(w);
      expect(component.expandedWorkoutId()).toBeNull();
      await fixture.whenStable();
    });

    it('desplega un entrenament fet en comptes d\'obrir-lo de dret', () => {
      const openSpy = spyOn(component.open, 'emit');
      component.handleWorkoutClick(makeWorkout());
      expect(component.expandedWorkoutId()).toBe('1');
      expect(openSpy).not.toHaveBeenCalled();
      expect(startPlannedWorkout).not.toHaveBeenCalled();

      // I el segon clic el plega.
      component.handleWorkoutClick(makeWorkout());
      expect(component.expandedWorkoutId()).toBeNull();
    });
  });

  describe('startPlan()', () => {
    it('emits open once the plan has started', async () => {
      const openSpy = spyOn(component.open, 'emit');
      await component.startPlan(makeWorkout({ id: 'plan1', status: 'planned' }));
      expect(startPlannedWorkout).toHaveBeenCalledWith('plan1');
      expect(openSpy).toHaveBeenCalledWith('plan1');
    });
  });

  describe('deletePlan()', () => {
    it('deletes the planned workout after confirmation', async () => {
      await component.deletePlan(makeWorkout({ id: 'plan1', status: 'planned' }));
      expect(confirm).toHaveBeenCalled();
      expect(deleteWorkout).toHaveBeenCalledWith('plan1');
    });

    it('does nothing when the confirmation is declined', async () => {
      confirm.and.resolveTo(false);
      await component.deletePlan(makeWorkout({ id: 'plan1', status: 'planned' }));
      expect(deleteWorkout).not.toHaveBeenCalled();
    });
  });

  // Una activitat registrada es desplega allà mateix, sigui d'avui o de fa
  // mesos: el feed es llegeix, i canviar-hi res passa per la seva pàgina.
  describe('tocar una targeta registrada', () => {
    it('la desplega allà mateix, i el chevron ho diu', () => {
      fixture.componentRef.setInput('day', {
        date: '2024-03-05',
        workouts: [makeWorkout({ id: 'w1', categories: ['push'] })],
        sports: [],
      });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.ac-chevron')?.textContent?.trim()).toBe('expand_more');
      (el.querySelector('.ac-main') as HTMLElement).click();
      expect(component.expandedWorkoutId()).toBe('w1');
    });
  });

  describe('unified activity card', () => {
    const day = {
      date: '2024-03-05',
      workouts: [makeWorkout({
        id: 'w1', categories: ['push'], feeling: 3 as const,
        entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [] }],
      })],
      sports: [{
        sport: { id: 'run', name: 'Running', icon: 'directions_run', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() },
        session: { id: 'sess1', date: '2024-03-05', sportId: 'run', duration: 30, createdAt: new Date() },
      }],
    };

    it('gives workouts and sports the same card shell', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('.act-card').length).toBe(2);
      expect(el.querySelectorAll('.ac-bar').length).toBe(2);
      expect(el.querySelectorAll('.ac-main').length).toBe(2);
    });

    it('titles a workout with its training type, not the exercise list', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const title = (fixture.nativeElement as HTMLElement).querySelector('.ac-title') as HTMLElement;
      expect(title.textContent?.trim()).toBe('Empenta');
    });

    it('gives the feeling its own slot on the right, just before the chevron', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const el      = fixture.nativeElement as HTMLElement;
      const feeling = el.querySelector('.ac-main > .ac-feeling') as HTMLElement;
      expect(feeling).toBeTruthy();
      expect(feeling.nextElementSibling?.classList).toContain('ac-chevron');
      expect(el.querySelector('.ac-title-row .ac-feeling')).toBeNull();
      expect(el.querySelector('.ac-stats .ac-feeling')).toBeNull();
    });

    it('keeps the exercise list out of the card preview', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).not.toContain('Press banca');
      // Les xifres resum sí que s'hi queden.
      expect(el.querySelector('.ac-stats')).toBeTruthy();
    });

    it('posa la nota al costat del títol, mai en una línia pròpia', () => {
      const withNote = {
        ...day,
        workouts: [makeWorkout({ id: 'w1', categories: ['push'], notes: 'Bon dia' })],
        sports: [{
          ...day.sports[0],
          session: { ...day.sports[0].session, notes: 'Fluix' },
        }],
      };
      fixture.componentRef.setInput('day', withNote);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const notes = Array.from(el.querySelectorAll('.ac-detail'));
      expect(notes.length).toBe(2);
      // Dins la fila del títol: així la targeta no passa mai de dues línies
      // (identitat a dalt, xifres a sota).
      for (const note of notes) expect(note.parentElement?.classList).toContain('ac-title-row');
    });

    it('amaga el volum quan se li demana, i el manté per defecte', () => {
      const withVolume = {
        ...day,
        workouts: [makeWorkout({
          id: 'w1', categories: ['push'],
          entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [{ reps: 10, weight: 50 }] }],
        })],
        sports: [],
      };
      fixture.componentRef.setInput('day', withVolume);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.ac-stat--vol')).toBeTruthy();

      fixture.componentRef.setInput('hideVolume', true);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.ac-stat--vol')).toBeNull();
    });

    it('desplega l\'entrenament a la mateixa targeta, a tot arreu', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.ac-chevron')?.textContent?.trim())
        .toBe('expand_more');

      const row = (fixture.nativeElement as HTMLElement).querySelector('.ac-main') as HTMLElement;
      row.click();
      fixture.detectChanges();
      expect(component.expandedWorkoutId()).toBe('w1');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-workout-detail')).toBeTruthy();

      row.click();
      fixture.detectChanges();
      expect(component.expandedWorkoutId()).toBeNull();
    });

    it('still opens the workout from the expanded panel', () => {
      const openSpy = spyOn(component.open, 'emit');
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();
      component.handleWorkoutClick(day.workouts[0]);
      fixture.detectChanges();

      const btn = (fixture.nativeElement as HTMLElement).querySelector('.ac-open-btn') as HTMLElement;
      btn.click();
      expect(openSpy).toHaveBeenCalledWith('w1');
    });

    // Un planificat es llegeix igual que un esport planificat: es desplega en
    // mode consulta, i el peu porta «Obrir» i res més. Començar-lo és el
    // botó de play del costat de la targeta, no un segon botó aquí sota.
    it('desplega un planificat en mode consulta, sense repetir-hi el començar', () => {
      fixture.componentRef.setInput('day', {
        ...day,
        workouts: [makeWorkout({ id: 'plan1', categories: ['push'], status: 'planned' })],
      });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.ac-chevron')?.textContent?.trim()).toBe('expand_more');
      (el.querySelector('.ac-main') as HTMLElement).click();
      fixture.detectChanges();

      expect(component.expandedWorkoutId()).toBe('plan1');
      expect(el.querySelector('app-workout-detail')).toBeTruthy();
      expect(startPlannedWorkout).not.toHaveBeenCalled();

      // Un sol botó al peu, el mateix que el d'un esport.
      const footer = el.querySelectorAll('.ac-detail-actions .ac-open-btn');
      expect(footer.length).toBe(1);
      expect(footer[0].textContent?.trim()).toContain('Obrir');
      // I el play continua al costat de la targeta.
      expect(el.querySelector('.ac-act--start')).toBeTruthy();
    });

    // La mateixa regla que un esport planificat: un entrenament de demà es
    // llegeix, però encara no es pot haver fet.
    it('no deixa començar un planificat que encara no ha arribat', async () => {
      fixture.componentRef.setInput('day', {
        ...day, date: '2999-01-01',
        workouts: [makeWorkout({ id: 'plan1', date: '2999-01-01', categories: ['push'], status: 'planned' })],
      });
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      expect(el.querySelector('.ac-act--start')).toBeNull();
      // I es continua podent desplegar: llegir el pla no depèn del dia.
      (el.querySelector('.ac-main') as HTMLElement).click();
      fixture.detectChanges();
      expect(component.expandedWorkoutId()).toBe('plan1');
      expect(el.querySelector('app-workout-detail')).toBeTruthy();

      // Ni per la porta del darrere.
      await component.startPlan(makeWorkout({ id: 'plan1', date: '2999-01-01', status: 'planned' }));
      expect(startPlannedWorkout).not.toHaveBeenCalled();
    });

    // Obrir un pla és tocar-lo —afegir-hi o treure'n exercicis— i es queda
    // pla. Val sempre, també per a un dia que encara ha de venir: preparar el
    // de dimecres no s'ha d'esperar a dimecres.
    it('obre un planificat per tocar-lo, arribi el dia o no', async () => {
      const openSpy = spyOn(component.open, 'emit');
      for (const date of ['2024-03-05', '2999-01-01']) {
        fixture.componentRef.setInput('day', {
          ...day, date,
          workouts: [makeWorkout({ id: 'plan1', date, categories: ['push'], status: 'planned' })],
        });
        fixture.detectChanges();
        const el = fixture.nativeElement as HTMLElement;

        (el.querySelector('.ac-main') as HTMLElement).click();
        fixture.detectChanges();
        (el.querySelector('.ac-detail-actions .ac-open-btn') as HTMLElement).click();
        await fixture.whenStable();

        expect(editPlannedWorkout).toHaveBeenCalledWith('plan1');
        expect(openSpy).toHaveBeenCalledWith('plan1');
        // Obrir-lo no el comença: continua sent un pla.
        expect(startPlannedWorkout).not.toHaveBeenCalled();
        editPlannedWorkout.calls.reset();
        component.handleWorkoutClick(makeWorkout({ id: 'plan1' }));   // plega
      }
    });

    it('obre el pla de debò quan el que es toca és una projecció de la rutina', async () => {
      const openSpy = spyOn(component.open, 'emit');
      editPlannedWorkout.and.resolveTo('fila-nova');

      await component.openPlan(makeWorkout({
        id: 'routine:2024-03-05:gym:push', date: '2024-03-05', status: 'planned',
      }));

      expect(editPlannedWorkout).toHaveBeenCalledWith('routine:2024-03-05:gym:push');
      expect(openSpy).toHaveBeenCalledWith('fila-nova');
    });
  });

  describe('sport row', () => {
    const day = {
      date: '2024-03-05',
      workouts: [],
      sports: [{
        sport: { id: 'run', name: 'Running', icon: 'directions_run', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() },
        session: { id: 'sess1', date: '2024-03-05', sportId: 'run', duration: 30, createdAt: new Date() },
      }],
    };

    it('desplega el detall de la sessió, i el plega al segon clic', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const row = (fixture.nativeElement as HTMLElement).querySelector('.ac-main') as HTMLElement;
      row.click();
      fixture.detectChanges();
      expect(component.expandedSportId()).toBe('sess1');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-sport-detail')).toBeTruthy();

      row.click();
      fixture.detectChanges();
      expect(component.expandedSportId()).toBeNull();
    });

    // El feed és de lectura, com el d'un entrenament: cap camp, cap botó de
    // guardar i cap manera de tocar la sessió sense sortir d'aquí.
    it('no deixa modificar res des de la targeta', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ac-main')!.click();
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('input, textarea, select')).toBeNull();
      expect(el.querySelector('.sport-edit')).toBeNull();
      expect(el.querySelector('.sd-save')).toBeNull();
      expect(updateSession).not.toHaveBeenCalled();
    });

    it('obre la sessió des del panell desplegat', () => {
      const openSportSpy = spyOn(component.openSport, 'emit');
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();
      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ac-main')!.click();
      fixture.detectChanges();

      (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.ac-open-btn')!.click();
      expect(openSportSpy).toHaveBeenCalledWith(day.sports[0]);
    });
  });

  describe('sessions agrupades', () => {
    const SPORT = { id: 'padel', name: 'Pàdel', icon: 'sports_tennis', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() };
    const day = (workoutGroup?: string, sportGroup?: string) => ({
      date: '2024-03-05',
      workouts: [makeWorkout({ id: 'w1', date: '2024-03-05', sessionGroupId: workoutGroup })],
      sports: [{
        sport: SPORT,
        session: { id: 'sess1', date: '2024-03-05', sportId: 'padel', duration: 60, createdAt: new Date(), sessionGroupId: sportGroup },
      }],
    });

    it('sense grup, cada activitat és una targeta solta i no hi ha cap caixa', () => {
      fixture.componentRef.setInput('day', day());
      fixture.detectChanges();

      expect(component.groups().length).toBe(2);
      expect((fixture.nativeElement as HTMLElement).querySelector('.sg--grouped')).toBeNull();
    });

    it('el que s\'ha fet d\'una tirada es llegeix com una sola sessió', () => {
      fixture.componentRef.setInput('day', day('g1', 'g1'));
      fixture.detectChanges();

      const groups = component.groups();
      expect(groups.length).toBe(1);
      expect(groups[0].grouped).toBeTrue();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.sg--grouped')).toBeTruthy();
      expect(el.querySelector('.sg-count')?.textContent).toContain('2 activitats');
      // I les dues activitats hi continuen sent, cadascuna amb la seva targeta.
      expect(el.querySelectorAll('app-activity-card').length).toBe(2);
    });

    it('el botó de separar és de la caixa, a baix, i no de cap targeta', () => {
      fixture.componentRef.setInput('day', day('g1', 'g1'));
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      const foot = el.querySelector('.sg--grouped > .sg-foot');
      expect(foot?.querySelector('.sg-split')?.textContent).toContain('Separar sessions');
      // I no hi és quan cada activitat ja va sola: no hi ha res a separar.
      fixture.componentRef.setInput('day', day());
      fixture.detectChanges();
      expect(footLabels(el)).not.toContain('Separar sessions');
    });

    it('separar desfà la sessió sencera', async () => {
      fixture.componentRef.setInput('day', day('g1', 'g1'));
      fixture.detectChanges();

      await component.split(component.groups()[0]);

      expect(setWorkoutGroup).toHaveBeenCalledWith('w1', undefined);
      expect(setSportGroup).toHaveBeenCalledWith('sess1', '2024-03-05', null);
    });

    // Unir i separar són les dues cares de la mateixa cosa i viuen al mateix
    // peu: el de després, quan les dues activitats ja estan apuntades.
    describe('unir des de la targeta', () => {
      /** El dia, tal com el llegiria el servei: dues sessions soltes. */
      function twoLooseSessions(): void {
        const d = day();
        dayWorkouts = d.workouts;
        daySports   = d.sports;
        fixture.componentRef.setInput('day', d);
        fixture.detectChanges();
      }

      it('s\'ofereix quan el dia té una altra sessió', () => {
        twoLooseSessions();
        expect(footLabels(fixture.nativeElement).filter(t => t === 'Unir amb una altra').length).toBe(2);
      });

      it('i no quan no n\'hi ha cap més', () => {
        fixture.componentRef.setInput('day', day());
        fixture.detectChanges();
        expect(footLabels(fixture.nativeElement)).not.toContain('Unir amb una altra');
      });

      it('tocar-lo desplega les altres sessions del dia, i només una alhora', () => {
        twoLooseSessions();
        const [first, second] = component.groups();

        component.toggleMerge(first);
        fixture.detectChanges();
        expect((fixture.nativeElement as HTMLElement).querySelectorAll('.sg-merge').length).toBe(1);

        component.toggleMerge(second);
        expect(component.mergeOpen()).toBe(second.key);

        component.toggleMerge(second);
        expect(component.mergeOpen()).toBeNull();
      });

      // Un planificat de la rutina no és cap fila: no s'hi pot posar res dins.
      it('una sessió que la rutina només proposa no s\'ofereix', () => {
        const projected = makeWorkout({ id: 'routine:2024-03-05:gym:push', date: '2024-03-05', status: 'planned' });
        expect(component.canMerge({ key: projected.id, grouped: false, items: [{ kind: 'workout', workout: projected }] }))
          .toBeFalse();
      });
    });
  });

  describe('esport planificat', () => {
    const plannedDay = (date: string) => ({
      date,
      workouts: [],
      sports: [{
        sport: { id: 'padel', name: 'Pàdel', icon: 'sports_tennis', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() },
        session: { id: 'sess1', date, sportId: 'padel', duration: 60, status: 'planned' as const, createdAt: new Date() },
      }],
    });

    it('es llegeix com un pla per la targeta, sense cap xapa que ho repeteixi', () => {
      fixture.componentRef.setInput('day', plannedDay('2024-03-05'));
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.act-card')?.classList).toContain('act-card--planned');
      expect(el.querySelector('.ac-tag')).toBeNull();
    });

    it('ofereix registrar-lo i eliminar-lo quan el dia ja ha arribat', () => {
      fixture.componentRef.setInput('day', plannedDay('2024-03-05'));
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.ac-act--del')).toBeTruthy();
      expect(el.querySelector('.ac-act--start')).toBeTruthy();
    });

    it('no ofereix registrar un pla que encara no ha arribat', () => {
      fixture.componentRef.setInput('day', plannedDay('2999-01-01'));
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.ac-act--del')).toBeTruthy();
      expect(el.querySelector('.ac-act--start')).toBeNull();
    });

    it('registerSportPlan() promou la sessió a feta', async () => {
      await component.registerSportPlan(plannedDay('2024-03-05').sports[0]);
      expect(startPlannedSession).toHaveBeenCalledWith('sess1', '2024-03-05');
    });

    it('no registra un pla que encara no ha arribat', async () => {
      await component.registerSportPlan(plannedDay('2999-01-01').sports[0]);
      expect(startPlannedSession).not.toHaveBeenCalled();
    });

    it('deleteSportPlan() elimina el pla després de confirmar-ho', async () => {
      await component.deleteSportPlan(plannedDay('2024-03-05').sports[0]);
      expect(confirm).toHaveBeenCalled();
      expect(deleteSession).toHaveBeenCalledWith('sess1', '2024-03-05');
    });

    it('deleteSportPlan() no fa res si es cancel·la', async () => {
      confirm.and.resolveTo(false);
      await component.deleteSportPlan(plannedDay('2024-03-05').sports[0]);
      expect(deleteSession).not.toHaveBeenCalled();
    });
  });
});
