import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { Sport, SportSession } from '../../core/models/sport.model';
import { FeelingLevel } from '../../core/models/workout.model';
import { SportService } from '../../core/services/sport.service';
import { TodayService } from '../../core/services/today.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { ActivityCardComponent } from '../../shared/components/activity-card/activity-card.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FabMenuComponent } from '../../shared/components/fab-menu/fab-menu.component';
import { SportDetailComponent, SportSessionPatch } from '../../shared/components/sport-detail/sport-detail.component';
import { SessionMergeComponent } from '../../shared/components/session-merge/session-merge.component';
import { ActivityItem } from '../../shared/utils/session-group.utils';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { ActivityStat, feedDayLabel, formatFeeling, sportCardStats } from '../../shared/utils/workout-card.utils';

/** Quant s'espera abans de pujar el que s'ha tocat. Al dispositiu el canvi hi
 *  és de seguida —el retall es pinta a l'instant—; això només ajunta els tocs
 *  seguits en una sola pujada, que si no pujar la durada de 30 a 60 minuts
 *  serien sis. */
const SAVE_DEBOUNCE_MS = 700;

/**
 * Una sessió d'esport, a la seva pàgina.
 *
 * És el que un entrenament té a `/train?workout=`: obrir una activitat et
 * porta a una pantalla sencera, amb capçalera i botó d'enrere, no a un full
 * que tapa el que estaves mirant. La targeta del feed hi porta, i aquí es
 * llegeix i es canvia —que és l'única banda on una sessió es toca.
 *
 * **No hi ha mode de consulta i mode d'edició**, com no n'hi ha al gimnàs: la
 * fila que diu la dada és la que la deixa tocar (`app-sport-detail` amb
 * `editable`), i el que es toca es guarda sol. Abans el formulari era una
 * caixa amb títol propi i peu de Cancel·lar/Guardar que tapava la sessió
 * sencera mentre l'omplies, o sigui que el rècord i el «+18 min que de
 * costum» desapareixien justament quan tocaves la xifra de què parlaven.
 *
 * Que s'ha guardat no es diu: guardar no és una notícia, és el que ha de
 * passar. Un entrenament tampoc no ho diu.
 */
@Component({
  selector: 'app-sport-session',
  standalone: true,
  imports: [
    ActivityCardComponent, PageHeaderComponent, SportDetailComponent, SessionMergeComponent,
    FabMenuComponent,
  ],
  template: `
    <div class="page">

      @if (shown(); as p) {

        <app-page-header [title]="p.sport.name" [subtitle]="dateLabel()"
                         [showBack]="true" [fromSession]="true" />

        <!-- ── El menú de la sessió ──
             El que no es fa cada dia viu aquí dins: unir-la amb una altra
             activitat del dia i esborrar-la. Abans unir era una targeta
             plantada al final de la pàgina —ocupava com una acció principal
             una cosa que es fa un cop de cada deu— i esborrar només sortia
             amb el formulari obert, que és un lloc estrany per anar-hi a
             buscar. És el mateix menú que a l'entrenament, al mateix lloc:
             el botó rodó de baix a la dreta, a l'abast del polze. -->
        <app-fab-menu [(open)]="menuOpen" label="Opcions de la sessió">
          <button class="fab-menu-item" (click)="openMerge()">
            <span class="material-symbols-outlined">add_link</span>
            Unir amb una altra sessió
          </button>
          <button class="fab-menu-item fab-menu-item--danger" (click)="menuOpen.set(false); deleteSession(p)">
            <span class="material-symbols-outlined">delete</span>
            Eliminar la sessió
          </button>
        </app-fab-menu>

        <!-- ── Amb quina? ──
             La llista de sessions del dia, la mateixa que a Entrenar. Tocar-ne
             una les uneix i tanca. -->
        @if (mergeOpen()) {
          <div class="bottom-sheet-backdrop" (click)="mergeOpen.set(false)" aria-hidden="true"></div>
          <div class="ss-sheet bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="ss-merge-title">
            <span class="bottom-sheet-handle" aria-hidden="true"></span>
            <div class="ss-sheet-head">
              <span class="ss-sheet-title" id="ss-merge-title">Ha estat la mateixa sessió?</span>
              <span class="ss-sheet-sub">Uneix-la amb una altra activitat del dia i comptaran com una sola anada.</span>
            </div>
            <app-session-merge [item]="mergeItem(p)" (merged)="mergeOpen.set(false)" />
          </div>
        }

        <!-- ── Què és i com ha anat ──
             La targeta compartida, la mateixa que al feed: qui, les xifres
             d'un cop d'ull i la sensació. El dia el diu la capçalera d'aquí
             sobre, com a la pàgina d'un entrenament. -->
        <app-activity-card class="ss-hero"
            [accent]="p.sport.color" [icon]="p.sport.icon" mascot="xoco"
            [title]="p.sport.name" [subtype]="subtypeName()"
            [note]="p.session.notes ?? ''" [stats]="sessionStats(p)"
            [feeling]="p.session.feeling ? emojiOf(p.session.feeling) : ''"
            [planned]="isPlanned()" plannedPill />

        <!-- Un pla del dia d'avui o d'abans encara es pot donar per fet tal com
             estava previst. És l'únic botó de la pàgina perquè és l'únic que
             canvia d'estat la sessió; omplir-ne les dades no la fa. -->
        @if (isPlanned() && p.session.date <= today()) {
          <button class="register-btn" [disabled]="saving()" (click)="registerPlan(p)">
            <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
            Registrar la sessió
          </button>
        }

        <!-- ── Llegir-la i canviar-la, que és el mateix lloc ── -->
        <div class="detail-card" [style.--ac]="p.sport.color">
          <app-sport-detail [sport]="p.sport" [session]="p.session" editable
                            [feelingEditable]="!isFuture()"
                            (patch)="applyPatch($event)" />
        </div>

      } @else if (loading()) {

        <app-page-header title="Sessió" [showBack]="true" [fromSession]="true" />
        <div class="sk-wrap">
          <div class="sk sk-hero"></div>
          <div class="sk sk-block"></div>
        </div>

      } @else {

        <app-page-header title="Sessió" [showBack]="true" [fromSession]="true" />
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">search_off</span>
          <h2>Sessió no trobada</h2>
          <p>Potser l'has eliminada des d'un altre dispositiu.</p>
        </div>

      }

    </div>
  `,
  styles: [`
    /* La nav flota per damunt del contingut i el menú de tres punts hi és a
       sobre: el peu de la pàgina els deixa l'espai perquè l'últim element no
       hi quedi a sota. */
    .page { padding: 0 0 var(--page-pad-bottom-fab); }

    /* ── Capçalera de la sessió ──
       La targeta és la compartida (app-activity-card), la mateixa que al feed
       i la que corona un entrenament. D'aquí només és on es posa. */
    .ss-hero { display: block; margin: 4px 16px 0; }

    /* El menú de la sessió és el compartit (app-fab-menu, styles.scss):
       el mateix botó i les mateixes opcions que a un entrenament. */

    /* La fulla de baix és la de tota l'app (styles.scss); d'aquí només surt
       el seu farciment. */
    .ss-sheet { padding: 14px 14px 22px; }
    .ss-sheet-head { display: flex; flex-direction: column; gap: 3px; margin-bottom: 12px; }
    .ss-sheet-title { font-size: 15px; font-weight: 800; color: var(--c-text); }
    .ss-sheet-sub   { font-size: 12px; font-weight: 500; color: var(--c-text-3); line-height: 1.35; }

    /* ── Registrar un pla que ja toca ── */
    .register-btn {
      display: flex; align-items: center; justify-content: center; gap: 7px;
      width: calc(100% - 32px); box-sizing: border-box;
      margin: 12px 16px 0; padding: 13px; border: none; border-radius: 14px;
      background: var(--c-brand); color: white; font-size: 14px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s, transform 0.1s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:active:not(:disabled) { transform: scale(0.99); }
      &:disabled { opacity: 0.6; cursor: default; }
    }

    /* El detall porta la seva vora superior, així que la targeta que
       l'embolcalla no n'hi posa una altra. El color de l'esport hi entra per
       --ac: és el que tenyeix files, tries i controls a dins, com al
       calendari i a la targeta. */
    .detail-card {
      margin: 12px 16px 0; border-radius: 16px; overflow: hidden;
      border: 1.5px solid color-mix(in srgb, var(--ac, var(--c-border-2)) 22%, var(--c-border-2));
      box-shadow: 0 2px 10px var(--c-shadow);
    }

    /* ── Estats ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 40px 24px; text-align: center;
      .empty-icon { font-size: 56px; color: var(--c-border); }
      h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--c-text); }
      p { margin: 0; font-size: 14px; color: var(--c-text-2); }
    }

    @keyframes sk-shimmer {
      from { background-position: -300px 0; }
      to   { background-position: calc(300px + 100%) 0; }
    }
    .sk-wrap { display: flex; flex-direction: column; gap: 12px; margin: 4px 16px 0; }
    .sk {
      background: linear-gradient(90deg, var(--c-border-2) 0%, var(--c-border) 40%, var(--c-border-2) 80%);
      background-size: 600px 100%;
      animation: sk-shimmer 1.5s ease-in-out infinite;
      border-radius: 16px;
    }
    .sk-hero  { height: 72px; }
    .sk-block { height: 180px; }
  `],
})
export class SportSessionComponent {
  private sportService    = inject(SportService);
  private settingsService = inject(UserSettingsService);
  private feedback        = inject(FeedbackService);
  private confirmDialog   = inject(ConfirmDialogService);
  private navHistory      = inject(NavigationHistoryService);
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  readonly today          = inject(TodayService).today;

  /** Seeded from the route snapshot so a deep-link renders on first paint. */
  private readonly sessionId = toSignal(
    this.route.paramMap.pipe(map(p => p.get('id'))),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  /** Fals només mentre encara pot aparèixer: un cop s'ha preguntat per aquesta
   *  sessió i no hi és, ja no arribarà. */
  readonly loading = computed(() => {
    const id = this.sessionId();
    if (this.pair()) return false;
    return !this.sportService.sportsLoaded() || !id || !this.sportService.sessionLookupDone(id);
  });

  readonly pair = computed((): { sport: Sport; session: SportSession } | null => {
    const id = this.sessionId();
    if (!id) return null;
    // Dependència explícita sobre les dades crues: la pàgina s'omple sola quan
    // acaba d'arribar l'historial.
    this.sportService.sessions(); this.sportService.plannedSessions();
    const session = this.sportService.getSessionById(id);
    if (!session) return null;
    const sport = this.sportService.sports().find(s => s.id === session.sportId);
    return sport ? { sport, session } : null;
  });

  /** El que s'ha tocat i encara no ha pujat. La pàgina no l'espera: es pinta
   *  per sobre de la sessió, així que un toc es veu a l'instant i els rècords
   *  i el context es tornen a comptar amb el valor nou, no amb el vell. */
  private readonly draft = signal<SportSessionPatch>({});

  /** La sessió tal com es veu ara: la guardada amb el que s'acaba de tocar. */
  readonly shown = computed((): { sport: Sport; session: SportSession } | null => {
    const p = this.pair();
    return p ? { sport: p.sport, session: { ...p.session, ...this.draft() } } : null;
  });

  readonly isPlanned = computed(() => this.shown()?.session.status === 'planned');
  readonly isFuture  = computed(() => (this.shown()?.session.date ?? '') > this.today());

  readonly dateLabel = computed(() => {
    const date = this.shown()?.session.date;
    return date ? feedDayLabel(date, this.today()) : '';
  });

  readonly subtypeName = computed(() => {
    const p = this.shown();
    if (!p?.session.subtypeId) return '';
    return p.sport.subtypes.find(s => s.id === p.session.subtypeId)?.name ?? '';
  });

  /** El menú de la capçalera, i la llista d'unir que en surt. Un de sol
   *  obert a la vegada: la llista reemplaça el menú, no s'hi apila. */
  readonly menuOpen  = signal(false);
  readonly mergeOpen = signal(false);

  readonly saving = signal(false);

  /** Cert mentre un planificat de la rutina es converteix en fila: el pla
   *  d'abans deixa d'existir i el de debò encara no és a l'URL. És el buit
   *  que l'efecte de «ha desaparegut» no ha de confondre amb una eliminació. */
  private swapping = false;

  private saveTimer?: ReturnType<typeof setTimeout>;
  private pending = false;
  /** Les pujades van en fila índia. Si no, el primer canvi sobre un planificat
   *  de la rutina encara estaria materialitzant-lo quan el segon hi tornés amb
   *  l'id vell, i en sortirien dues sessions. */
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    this.sportService.ensureLoaded();

    // La pàgina s'obre per l'URL i no sap de quin mes és la sessió. Abans
    // l'única manera de trobar-la era tenir-les totes; ara es demana aquella
    // fila, que és una consulta d'una fila.
    effect(() => {
      const id = this.sessionId();
      if (id) void this.sportService.ensureSessionLoaded(id);
    });

    // Si la sessió desapareix mentre la mires (l'has eliminada, o ho ha fet un
    // altre dispositiu), la pàgina no es queda buida: torna d'on venies. El
    // relleu d'una projecció per la seva fila no hi compta: allà la sessió no
    // desapareix, canvia d'id.
    let hadSession = false;
    effect(() => {
      const has = !!this.pair();
      if (has) { hadSession = true; return; }
      if (!hadSession || this.swapping) return;
      hadSession = false;
      this.navHistory.goBackFromSession();
    });

    // Sortir de la pàgina no pot perdre l'últim toc: el que esperava el
    // rellotge puja ara. Tancar l'app tampoc, que en un mòbil és el que passa
    // més sovint que no pas navegar.
    const onHide = () => { if (document.visibilityState === 'hidden') void this.flush(); };
    document.addEventListener('visibilitychange', onHide);
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onHide);
      void this.flush();
    });
  }

  emojiOf(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  /** Aquesta sessió com a activitat, per oferir d'unir-la amb una altra del
   *  dia. Un pla també: una anada es prepara igual que es viu. */
  mergeItem(p: { sport: Sport; session: SportSession }): ActivityItem {
    return { kind: 'sport', sport: p.sport, session: p.session };
  }

  /** Del menú a la llista de sessions del dia: una fulla tanca i l'altra
   *  s'obre, que són la mateixa conversa. */
  openMerge(): void {
    this.menuOpen.set(false);
    this.mergeOpen.set(true);
  }

  /** La pàgina segueix la sessió, no l'id amb què s'hi va entrar: un
   *  planificat de la rutina no és cap fila, i registrar-lo o guardar-hi
   *  dades el converteix en una de nova. Es canvia l'URL enlloc seu perquè
   *  enrere torni d'on vas venir, no al pla que ja no hi és. */
  private async follow(id: string): Promise<void> {
    if (!id || id === this.sessionId()) return;
    this.swapping = true;
    try { await this.router.navigate(['/sport', id], { replaceUrl: true }); }
    finally { this.swapping = false; }
  }

  /** Les xifres de la targeta: la durada i la mètrica que més diu d'aquest
   *  esport, les mateixes que al feed. La resta són a sota, al detall. */
  sessionStats(p: { sport: Sport; session: SportSession }): ActivityStat[] {
    return sportCardStats(p.session, p.sport);
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  /** Un canvi d'una fila del detall. Es veu de seguida i puja tot sol; no hi
   *  ha res a confirmar perquè no hi ha res a descartar. */
  applyPatch(patch: SportSessionPatch): void {
    this.draft.update(d => ({ ...d, ...patch }));
    this.pending = true;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DEBOUNCE_MS);
  }

  /** Puja ara el que estigui esperant. */
  async flush(): Promise<void> {
    clearTimeout(this.saveTimer);
    if (!this.pending) return;
    this.pending = false;
    this.queue = this.queue.then(() => this._write());
    await this.queue;
  }

  private async _write(): Promise<void> {
    // Es llegeix aquí i no abans: entremig la sessió pot haver canviat d'id
    // (un planificat de la rutina que s'ha materialitzat) i el retall pot
    // haver crescut amb un altre toc.
    const p = this.shown();
    if (!p) return;
    const s = p.session;
    try {
      // Editar un pla és afinar-lo, no fer-lo: es queda planificat fins que el
      // registres des del seu botó. Abans, guardar-hi qualsevol canvi el
      // donava per fet, o sigui que apuntar quants minuts pensaves córrer avui
      // ja et comptava la cursa — i el pla que volies deixar preparat ja no
      // existia.
      const id = await this.sportService.updateSession(s.id, s.date, {
        subtypeId: s.subtypeId,
        duration:  s.duration,
        feeling:   s.feeling,
        metrics:   s.metrics && Object.keys(s.metrics).length ? s.metrics : undefined,
        notes:     s.notes?.trim() || undefined,
      });
      // Un cop guardat, el retall ja no diu res que la sessió no digui, i
      // deixar-lo taparia el que arribés d'un altre dispositiu. Si mentre
      // pujava s'ha tornat a tocar res, es queda: aquell toc encara no hi és.
      if (!this.pending) this.draft.set({});
      await this.follow(id);
    } catch {
      this.feedback.error('Error en guardar', 2500);
    }
  }

  async registerPlan(p: { sport: Sport; session: SportSession }): Promise<void> {
    this.saving.set(true);
    try {
      // El que s'acabi de tocar ha d'arribar-hi abans: registrar-la la treu de
      // ser un pla, i el que esperava el rellotge s'escriuria sobre una sessió
      // que ja hauria canviat de mans.
      await this.flush();
      const current = this.shown()?.session ?? p.session;
      const id = await this.sportService.startPlannedSession(current.id, current.date);
      // Registrar-la no es diu: la sessió mateixa ja deixa de ser un pla a la
      // pantalla. Guardar-hi canvis tampoc, que és el que ha de passar.
      await this.follow(id);
    } catch {
      this.feedback.error('Error en registrar', 2500);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteSession(p: { sport: Sport; session: SportSession }): Promise<void> {
    const ok = await this.confirmDialog.confirm('Eliminar aquesta sessió?', {
      variant: 'danger', confirmLabel: 'Eliminar', cancelLabel: 'Cancel·lar',
    });
    if (!ok) return;
    // El que encara esperava el rellotge ja no té on anar.
    clearTimeout(this.saveTimer);
    this.pending = false;
    this.saving.set(true);
    try {
      await this.sportService.deleteSession(p.session.id, p.session.date);
      this.feedback.success('Sessió eliminada', 2000, 'xoco');
      // Sortir d'aquí ho fa l'efecte que vigila que la sessió existeixi: si ho
      // féssim també des d'aquí, la pila de navegació es desapilaria dos cops.
    } catch {
      this.feedback.error('Error en eliminar', 2500);
      this.saving.set(false);
    }
  }
}
