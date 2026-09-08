import { NO_ERRORS_SCHEMA, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';

import { SportSessionComponent } from './sport-session.component';
import { Sport, SportSession } from '../../core/models/sport.model';
import { SportService } from '../../core/services/sport.service';
import { TodayService } from '../../core/services/today.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';

const TODAY = '2024-03-10';

const SPORT: Sport = {
  id: 'padel', name: 'Pàdel', icon: 'sports_tennis', color: '#FB8C00',
  subtypes: [{ id: 'dobles', name: 'Dobles' }],
  metricDefs: [{ key: 'sets_won', label: 'Sets guanyats', type: 'number', min: 0, max: 4, step: 1 }],
  createdAt: new Date(),
};

function makeSession(overrides: Partial<SportSession> = {}): SportSession {
  return { id: 'sess1', date: '2024-03-05', sportId: 'padel', createdAt: new Date(), ...overrides };
}

describe('SportSessionComponent', () => {
  let component: SportSessionComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<SportSessionComponent>>;
  let allSessions: ReturnType<typeof signal<SportSession[]>>;
  let allLoaded: ReturnType<typeof signal<boolean>>;
  let ensureSessionLoaded: jasmine.Spy;
  let updateSession: jasmine.Spy;
  let deleteSession: jasmine.Spy;
  let startPlannedSession: jasmine.Spy;
  let confirm: jasmine.Spy;
  let goBack: jasmine.Spy;

  function build(sessionId = 'sess1', query: Record<string, string> = {}): void {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: {
        paramMap: of(convertToParamMap({ id: sessionId })),
        snapshot: {
          paramMap: convertToParamMap({ id: sessionId }),
          queryParamMap: convertToParamMap(query),
        },
      },
    });
    fixture = TestBed.createComponent(SportSessionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(async () => {
    allSessions         = signal<SportSession[]>([makeSession()]);
    allLoaded           = signal(true);
    ensureSessionLoaded = jasmine.createSpy().and.resolveTo(undefined);
    updateSession       = jasmine.createSpy().and.resolveTo(undefined);
    deleteSession       = jasmine.createSpy().and.resolveTo(undefined);
    startPlannedSession = jasmine.createSpy().and.resolveTo(undefined);
    confirm             = jasmine.createSpy().and.resolveTo(true);
    goBack              = jasmine.createSpy();

    await TestBed.configureTestingModule({
      imports: [SportSessionComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'sess1' })),
            snapshot: {
              paramMap: convertToParamMap({ id: 'sess1' }),
              queryParamMap: convertToParamMap({}),
            },
          },
        },
        {
          provide: SportService,
          useValue: {
            sports: signal([SPORT]),
            sportsLoaded: signal(true),
            sessions: computed(() => allSessions().filter(s => s.status !== 'planned')),
            plannedSessions: computed(() => allSessions().filter(s => s.status === 'planned')),
            sessionLookupDone: () => allLoaded(),
            // El detall de la sessió, que la pàgina inclou, demana l'historial
            // d'aquell esport per als seus rècords.
            sportHistoryLoaded:   () => allLoaded(),
            loadSessionsForSport: jasmine.createSpy().and.resolveTo(undefined),
            getSessionById: (id: string) => allSessions().find(s => s.id === id),
            ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
            ensureSessionLoaded, updateSession, deleteSession, startPlannedSession,
          },
        },
        { provide: TodayService, useValue: { today: signal(TODAY) } },
        { provide: UserSettingsService, useValue: { difficultyScale: signal('emoji') } },
        { provide: FeedbackService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
        { provide: ConfirmDialogService, useValue: { confirm } },
        { provide: NavigationHistoryService, useValue: { goBack } },
      ],
    })
      .overrideComponent(SportSessionComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();
  });

  it('troba la sessió per l\'id de la ruta i la presenta', () => {
    allSessions.set([makeSession({ duration: 90, subtypeId: 'dobles' })]);
    build();

    const el = fixture.nativeElement as HTMLElement;
    expect(component.pair()?.session.id).toBe('sess1');
    expect(el.querySelector('.hero-title')?.textContent?.trim()).toBe('Pàdel');
    expect(el.querySelector('.hero-subtype')?.textContent?.trim()).toBe('Dobles');
  });

  // Abans, l'única manera de trobar-la era tenir-les totes. Ara es demana
  // aquella fila, que és una consulta d'una fila.
  it("demana la sessió pel seu id: hi arriba per l'URL i no sap de quin mes és", () => {
    build();
    expect(ensureSessionLoaded).toHaveBeenCalledWith('sess1');
  });

  it('diu que no hi és quan la sessió no existeix i ja ho tenim tot', () => {
    allSessions.set([]);
    build('fantasma');

    expect(component.loading()).toBeFalse();
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty-state')).toBeTruthy();
  });

  it('espera abans de dir que no hi és, mentre encara la pot estar buscant', () => {
    allSessions.set([]);
    allLoaded.set(false);
    build('sess1');

    expect(component.loading()).toBeTrue();
    expect((fixture.nativeElement as HTMLElement).querySelector('.empty-state')).toBeNull();
  });

  describe('editar', () => {
    // Registrar un esport et deixa aquí amb la sessió acabada de crear: hi
    // véns a omplir-la, no a mirar-la.
    it("una sessió acabada de registrar arriba amb el formulari obert", () => {
      const session = makeSession({ duration: 60 });
      allSessions.set([session]);
      build('sess1', { nova: '1' });

      expect(component.editOpen()).toBeTrue();
      expect(component.editDuration()).toBe(60);
    });

    it('el formulari arrenca plegat i es carrega amb el que la sessió porta', () => {
      const session = makeSession({ duration: 75, subtypeId: 'dobles', feeling: 4, notes: 'Bé', metrics: { sets_won: 2 } });
      allSessions.set([session]);
      build();

      expect(component.editOpen()).toBeFalse();
      component.toggleEdit({ sport: SPORT, session });

      expect(component.editOpen()).toBeTrue();
      expect(component.editDuration()).toBe(75);
      expect(component.editSubtype()).toBe('dobles');
      expect(component.editFeeling()).toBe(4);
      expect(component.editNotes()).toBe('Bé');
      expect(component.editMetrics()).toEqual({ sets_won: 2 });
    });

    it('guarda els canvis sense tocar l\'estat d\'una sessió ja feta', async () => {
      const session = makeSession({ duration: 60 });
      allSessions.set([session]);
      build();

      component.toggleEdit({ sport: SPORT, session });
      component.editDuration.set(45);
      await component.save({ sport: SPORT, session });

      expect(updateSession).toHaveBeenCalledWith(
        'sess1', '2024-03-05', jasmine.objectContaining({ duration: 45 }), undefined);
      expect(component.editOpen()).toBeFalse();
    });

    it("guardar un pla d'un dia que ja ha arribat el registra", async () => {
      const session = makeSession({ date: '2024-03-05', status: 'planned', duration: 60 });
      allSessions.set([session]);
      build();

      component.toggleEdit({ sport: SPORT, session });
      component.editDuration.set(90);
      await component.save({ sport: SPORT, session });

      expect(updateSession).toHaveBeenCalledWith(
        'sess1', '2024-03-05', jasmine.objectContaining({ duration: 90 }), 'done');
    });

    it('un pla del futur es guarda i segueix sent un pla', async () => {
      const session = makeSession({ date: '2999-01-01', status: 'planned' });
      allSessions.set([session]);
      build();

      component.toggleEdit({ sport: SPORT, session });
      await component.save({ sport: SPORT, session });

      expect(updateSession).toHaveBeenCalledWith(
        'sess1', '2999-01-01', jasmine.any(Object), undefined);
    });
  });

  describe('planificada', () => {
    it('ofereix registrar-la quan el dia ja ha arribat', () => {
      allSessions.set([makeSession({ date: '2024-03-05', status: 'planned' })]);
      build();
      expect((fixture.nativeElement as HTMLElement).querySelector('.register-btn')).toBeTruthy();
    });

    it('no ofereix registrar un pla que encara ha de venir', () => {
      allSessions.set([makeSession({ date: '2999-01-01', status: 'planned' })]);
      build();
      expect((fixture.nativeElement as HTMLElement).querySelector('.register-btn')).toBeNull();
    });

    it('registerPlan() promou la sessió a feta', async () => {
      const session = makeSession({ date: '2024-03-05', status: 'planned' });
      allSessions.set([session]);
      build();

      await component.registerPlan({ sport: SPORT, session });
      expect(startPlannedSession).toHaveBeenCalledWith('sess1', '2024-03-05');
    });
  });

  describe('eliminar', () => {
    it('demana confirmació abans de fer-ho', async () => {
      const session = makeSession();
      allSessions.set([session]);
      build();

      await component.deleteSession({ sport: SPORT, session });
      expect(confirm).toHaveBeenCalled();
      expect(deleteSession).toHaveBeenCalledWith('sess1', '2024-03-05');
    });

    it('no fa res si es cancel·la', async () => {
      confirm.and.resolveTo(false);
      const session = makeSession();
      allSessions.set([session]);
      build();

      await component.deleteSession({ sport: SPORT, session });
      expect(deleteSession).not.toHaveBeenCalled();
    });

    it('surt de la pàgina quan la sessió deixa d\'existir', async () => {
      const session = makeSession();
      allSessions.set([session]);
      build();
      expect(goBack).not.toHaveBeenCalled();

      // Com quan el servei confirma l'esborrat (o ho fa un altre dispositiu).
      allSessions.set([]);
      fixture.detectChanges();

      expect(goBack).toHaveBeenCalledWith('/home');
    });
  });
});
