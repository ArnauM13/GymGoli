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

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: '2024-01-01', entries: [], createdAt: new Date(), ...overrides };
}

describe('DayFeedCardsComponent', () => {
  let component: DayFeedCardsComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<DayFeedCardsComponent>>;
  let startPlannedWorkout: jasmine.Spy;
  let setWorkoutGroup: jasmine.Spy;
  let setSportGroup: jasmine.Spy;
  let deleteWorkout: jasmine.Spy;
  let updateSession: jasmine.Spy;
  let deleteSession: jasmine.Spy;
  let startPlannedSession: jasmine.Spy;
  let confirm: jasmine.Spy;

  beforeEach(async () => {
    // Torna l'id de l'entrenament que s'ha d'obrir: un planificat de la
    // rutina no és cap fila fins que es comença, i llavors n'és una de nova.
    startPlannedWorkout = jasmine.createSpy().and.callFake((id: string) => Promise.resolve(id));
    deleteWorkout = jasmine.createSpy().and.resolveTo(undefined);
    updateSession = jasmine.createSpy().and.resolveTo(undefined);
    deleteSession = jasmine.createSpy().and.resolveTo(undefined);
    startPlannedSession = jasmine.createSpy().and.resolveTo(undefined);
    confirm = jasmine.createSpy().and.resolveTo(true);
    setWorkoutGroup = jasmine.createSpy().and.resolveTo(undefined);
    setSportGroup   = jasmine.createSpy().and.resolveTo(undefined);

    await TestBed.configureTestingModule({
      imports: [DayFeedCardsComponent],
      providers: [
        { provide: WorkoutService, useValue: { startPlannedWorkout, deleteWorkout, setSessionGroup: setWorkoutGroup } },
        { provide: SportService, useValue: {
          updateSession, deleteSession, startPlannedSession, setSessionGroup: setSportGroup,
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
    it('starts a planned workout instead of opening it directly', async () => {
      const openSpy = spyOn(component.open, 'emit');
      const w = makeWorkout({ status: 'planned' });
      component.handleWorkoutClick(w);
      expect(startPlannedWorkout).toHaveBeenCalledWith('1');
      expect(openSpy).not.toHaveBeenCalled();
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

    it('afegir-hi una activitat crea el grup i porta a registrar-la', async () => {
      const addSpy = spyOn(component.addActivity, 'emit');
      const w = makeWorkout({ id: 'w1', date: '2024-03-05' });

      await component.addToSession({ kind: 'workout', workout: w }, '2024-03-05');

      expect(setWorkoutGroup).toHaveBeenCalledWith('w1', jasmine.any(String));
      const groupId = setWorkoutGroup.calls.mostRecent().args[1] as string;
      expect(addSpy).toHaveBeenCalledWith({ date: '2024-03-05', groupId });
    });

    it('afegir-hi una activitat quan ja n\'hi ha una de sessió reaprofita el grup', async () => {
      const addSpy = spyOn(component.addActivity, 'emit');
      const w = makeWorkout({ id: 'w1', date: '2024-03-05', sessionGroupId: 'g1' });

      await component.addToSession({ kind: 'workout', workout: w }, '2024-03-05');

      expect(setWorkoutGroup).not.toHaveBeenCalled();
      expect(addSpy).toHaveBeenCalledWith({ date: '2024-03-05', groupId: 'g1' });
    });

    it('unir dues sessions del dia les deixa amb el mateix grup', async () => {
      fixture.componentRef.setInput('day', day());
      fixture.detectChanges();

      const [first, second] = component.groups();
      expect(component.canMerge(first)).toBeTrue();
      expect(component.mergeTargets(first).map(g => g.key)).toEqual([second.key]);

      await component.mergeWith(first, second);

      expect(setWorkoutGroup).toHaveBeenCalledTimes(1);
      const groupId = setWorkoutGroup.calls.mostRecent().args[1] as string;
      expect(setSportGroup).toHaveBeenCalledWith('sess1', '2024-03-05', groupId);
    });

    it('unir amb una sessió que ja té grup no en crea cap de nou', async () => {
      fixture.componentRef.setInput('day', day(undefined, 'g1'));
      fixture.detectChanges();

      const [workoutGroup, sportGroup] = component.groups();
      await component.mergeWith(workoutGroup, sportGroup);

      expect(setSportGroup).not.toHaveBeenCalled();
      expect(setWorkoutGroup).toHaveBeenCalledOnceWith('w1', 'g1');
    });

    it('sense cap altra sessió al dia no hi ha res a unir', () => {
      fixture.componentRef.setInput('day', { date: '2024-03-05', workouts: [makeWorkout({ id: 'w1', date: '2024-03-05' })], sports: [] });
      fixture.detectChanges();

      expect(component.canMerge(component.groups()[0])).toBeFalse();
    });

    it('una planificació no és cap anada: no surt entre les candidates', () => {
      fixture.componentRef.setInput('day', {
        date: '2024-03-05',
        workouts: [
          makeWorkout({ id: 'w1', date: '2024-03-05' }),
          makeWorkout({ id: 'w2', date: '2024-03-05', status: 'planned' }),
        ],
        sports: [],
      });
      fixture.detectChanges();

      const [done] = component.groups();
      expect(component.mergeTargets(done)).toEqual([]);
      expect(component.canMerge(done)).toBeFalse();
    });

    it('separar una activitat la treu del grup', async () => {
      const session = { id: 'sess1', date: '2024-03-05', sportId: 'padel', createdAt: new Date(), sessionGroupId: 'g1' };
      await component.detach({ kind: 'sport', sport: SPORT, session });

      expect(setSportGroup).toHaveBeenCalledWith('sess1', '2024-03-05', null);
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
