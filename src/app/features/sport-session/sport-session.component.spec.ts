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
import { SessionGroupService } from '../../core/services/session-group.service';

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
  let goBackFromSession: jasmine.Spy;

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
    goBackFromSession   = jasmine.createSpy();

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
        { provide: NavigationHistoryService, useValue: { goBack, goBackFromSession } },
        // La pàgina ofereix unir la sessió amb una altra del dia; qui diu amb
        // quines és el servei, i aquí el dia no en té cap més.
        {
          provide: SessionGroupService,
          useValue: { groupsForDay: () => [], merge: jasmine.createSpy().and.resolveTo('g1') },
        },
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
    // La targeta és la compartida amb el feed (`app-activity-card`).
    expect(el.querySelector('.ac-title')?.textContent?.trim()).toBe('Pàdel');
    expect(el.querySelector('.ac-subtype')?.textContent?.trim()).toBe('Dobles');
    // El dia el diu la capçalera, no la targeta.
    expect(el.querySelector('.ph-sub')?.textContent?.trim()).toBeTruthy();
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

  // ── Editar ──
  // No hi ha mode de consulta i mode d'edició: la fila que diu la dada és la
  // que la deixa tocar, i el que es toca puja sol. Com al gimnàs.
  describe('editar', () => {
    it('la sessió es llegeix i es toca al mateix lloc, sense cap botó pel mig', () => {
      allSessions.set([makeSession({ duration: 60 })]);
      build();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('app-sport-detail')).toBeTruthy();
      expect(el.querySelector('.edit-btn')).toBeNull();
      expect(el.querySelector('.sl-save')).toBeNull();
      expect(el.querySelector('.sl-cancel')).toBeNull();
    });

    // El retall es pinta per sobre de la sessió guardada: un toc es veu de
    // seguida, sense esperar que la pujada torni.
    it('un canvi es veu a l\'instant, abans de pujar', () => {
      allSessions.set([makeSession({ duration: 60 })]);
      build();

      component.applyPatch({ duration: 45 });
      expect(component.shown()!.session.duration).toBe(45);
      expect(updateSession).not.toHaveBeenCalled();
    });

    it('puja la sessió sencera, no només el que s\'ha tocat', async () => {
      allSessions.set([makeSession({ duration: 60, subtypeId: 'dobles', feeling: 4, notes: 'Bé' })]);
      build();

      component.applyPatch({ duration: 45 });
      await component.flush();

      expect(updateSession).toHaveBeenCalledWith('sess1', '2024-03-05', {
        subtypeId: 'dobles', duration: 45, feeling: 4, metrics: undefined, notes: 'Bé',
      });
    });

    // Diversos tocs seguits són una sola pujada: apujar la durada de 30 a 60
    // en serien sis.
    it('ajunta els tocs seguits en una sola pujada', async () => {
      allSessions.set([makeSession({ duration: 30 })]);
      build();

      component.applyPatch({ duration: 35 });
      component.applyPatch({ duration: 40 });
      component.applyPatch({ duration: 45 });
      await component.flush();

      expect(updateSession).toHaveBeenCalledTimes(1);
      expect(updateSession).toHaveBeenCalledWith(
        'sess1', '2024-03-05', jasmine.objectContaining({ duration: 45 }));
    });

    // Un cop guardat, el retall ja no cal: deixar-lo taparia el que arribés
    // d'un altre dispositiu.
    it('el retall es buida quan ja és a la sessió', async () => {
      allSessions.set([makeSession({ duration: 60 })]);
      build();

      component.applyPatch({ duration: 45 });
      await component.flush();

      allSessions.set([makeSession({ duration: 90 })]);
      expect(component.shown()!.session.duration).toBe(90);
    });

    it('no puja res si no s\'ha tocat res', async () => {
      allSessions.set([makeSession({ duration: 60 })]);
      build();

      await component.flush();
      expect(updateSession).not.toHaveBeenCalled();
    });

    // Treure una dada és dir-ho, no callar: la clau hi va amb `undefined`.
    it('treure un valor el treu de debò', async () => {
      allSessions.set([makeSession({ duration: 60, feeling: 4 })]);
      build();

      component.applyPatch({ feeling: undefined });
      await component.flush();

      expect(updateSession).toHaveBeenCalledWith(
        'sess1', '2024-03-05', jasmine.objectContaining({ feeling: undefined }));
    });

    // Editar un pla és afinar-lo, no fer-lo: el registra el seu botó, i tant
    // se val que el dia ja hagi arribat.
    it("guardar un pla d'un dia que ja ha arribat el deixa pla", async () => {
      allSessions.set([makeSession({ date: '2024-03-05', status: 'planned', duration: 60 })]);
      build();

      component.applyPatch({ duration: 90 });
      await component.flush();

      expect(updateSession).toHaveBeenCalledWith(
        'sess1', '2024-03-05', jasmine.objectContaining({ duration: 90 }));
      expect(startPlannedSession).not.toHaveBeenCalled();
    });

    it('un pla del futur es guarda i segueix sent un pla', async () => {
      allSessions.set([makeSession({ date: '2999-01-01', status: 'planned' })]);
      build();

      component.applyPatch({ duration: 40 });
      await component.flush();

      expect(updateSession).toHaveBeenCalledWith('sess1', '2999-01-01', jasmine.any(Object));
      expect(startPlannedSession).not.toHaveBeenCalled();
    });

    // Un pla del futur no s'ha viscut: la sensació no hi té res a dir.
    it('la sensació no es pot omplir en un pla que encara ha de venir', () => {
      allSessions.set([makeSession({ date: '2999-01-01', status: 'planned' })]);
      build();
      expect(component.isFuture()).toBeTrue();
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

  // ── El menú de la capçalera ──
  // El que no es fa cada dia hi viu dins: unir la sessió amb una altra del
  // dia i esborrar-la. Al cos de la pàgina no hi ha cap de les dues coses.
  describe('menú de la sessió', () => {
    beforeEach(() => {
      allSessions.set([makeSession()]);
      build();
    });

    it("unir no ocupa la pàgina: s'obre des del menú", () => {
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('app-session-merge')).toBeNull();

      host.querySelector<HTMLElement>('.fab-menu-btn')!.click();
      fixture.detectChanges();
      expect(component.menuOpen()).toBeTrue();

      component.openMerge();
      fixture.detectChanges();
      expect(component.menuOpen()).toBeFalse();
      expect(component.mergeOpen()).toBeTrue();
      expect(host.querySelector('app-session-merge')).toBeTruthy();
    });

    it('i esborrar tampoc no és al cos de la pàgina', () => {
      const host = fixture.nativeElement as HTMLElement;
      expect(host.querySelector('.sl-delete-btn')).toBeNull();

      component.menuOpen.set(true);
      fixture.detectChanges();
      expect(Array.from(host.querySelectorAll('.fab-menu-item'))
        .some(b => b.textContent?.includes('Eliminar'))).toBeTrue();
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
      expect(goBackFromSession).not.toHaveBeenCalled();

      // Com quan el servei confirma l'esborrat (o ho fa un altre dispositiu).
      allSessions.set([]);
      fixture.detectChanges();

      expect(goBackFromSession).toHaveBeenCalled();
    });
  });
});
