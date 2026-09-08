import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';

import { Sport, SportMetricDef, SportSession } from '../../core/models/sport.model';
import { FeelingLevel } from '../../core/models/workout.model';
import { SportService } from '../../core/services/sport.service';
import { TodayService } from '../../core/services/today.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { ActivityIconComponent } from '../../shared/components/activity-icon/activity-icon.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { SportDetailComponent } from '../../shared/components/sport-detail/sport-detail.component';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { feedDayLabel, formatFeeling } from '../../shared/utils/workout-card.utils';

/**
 * Una sessió d'esport, a la seva pàgina.
 *
 * És el que un entrenament té a `/train?workout=`: obrir una activitat et
 * porta a una pantalla sencera, amb capçalera i botó d'enrere, no a un full
 * que tapa el que estaves mirant. La targeta del feed hi porta, i aquí es pot
 * llegir (`app-sport-detail`, amb rècords i context) i canviar —que és
 * l'única banda on una sessió es toca.
 */
@Component({
  selector: 'app-sport-session',
  standalone: true,
  imports: [ActivityIconComponent, PageHeaderComponent, SportDetailComponent],
  template: `
    <div class="page">

      @if (pair(); as p) {

        <app-page-header [title]="p.sport.name" [showBack]="true" backFallback="/home" />

        <!-- ── Qui, quan i com ha anat ── -->
        <div class="activity-hero" [class.activity-hero--planned]="isPlanned()" [style.--ac]="p.sport.color">
          <span class="ah-bar" aria-hidden="true"></span>
          <app-activity-icon [icon]="p.sport.icon" [color]="p.sport.color" mascot="xoco" />
          <div class="ah-text">
            <div class="ah-title-row">
              <span class="ah-title">{{ p.sport.name }}</span>
              @if (subtypeName(); as sub) { <span class="ss-subtype">{{ sub }}</span> }
            </div>
            <span class="ah-date">{{ dateLabel() }}</span>
          </div>
          @if (isPlanned()) {
            <span class="ah-pill">
              <span class="material-symbols-outlined" aria-hidden="true">event_upcoming</span>
              Planificat
            </span>
          } @else if (p.session.feeling) {
            <span class="ah-feeling">{{ emojiOf(p.session.feeling) }}</span>
          }
        </div>

        <!-- Un pla del dia d'avui o d'abans encara es pot donar per fet tal com
             estava previst, sense passar pel formulari. -->
        @if (isPlanned() && p.session.date <= today()) {
          <button class="register-btn" [disabled]="saving()" (click)="registerPlan(p)">
            <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
            Registrar la sessió
          </button>
        }

        <div class="detail-card">
          <app-sport-detail [sport]="p.sport" [session]="p.session" />
        </div>

        <!-- ── Editar ──
             Plegada de sèrie: la pàgina és per llegir la sessió, i el
             formulari només s'obre si vas a canviar-hi res. -->
        <div class="card-section edit-card" [class.edit-card--open]="editOpen()">
          <h2 class="section-heading">
            <button class="section-header" (click)="toggleEdit(p)" [attr.aria-expanded]="editOpen()">
              <span class="material-symbols-outlined section-icon" aria-hidden="true">edit_note</span>
              <span class="section-title">Editar la sessió</span>
              <span class="material-symbols-outlined section-chevron" aria-hidden="true">expand_more</span>
            </button>
          </h2>

          @if (editOpen()) {
            <div class="edit-body">

              <div class="sl-field">
                <span class="sl-field-label">Durada</span>
                <div class="sl-row">
                  <div class="sl-quick-btns">
                    @for (t of durationPresets; track t) {
                      <button class="sl-quick-btn" [class.active]="editDuration() === t"
                              (click)="editDuration.set(t)">{{ t }}min</button>
                    }
                  </div>
                  <div class="sl-stepper">
                    <button class="sl-step-btn" (click)="adjustDuration(-5)" aria-label="Menys 5 minuts">−5</button>
                    <span class="sl-step-val">{{ editDuration() }}<small>min</small></span>
                    <button class="sl-step-btn" (click)="adjustDuration(5)" aria-label="Més 5 minuts">+5</button>
                  </div>
                </div>
              </div>

              @if (p.sport.subtypes.length) {
                <div class="sl-field">
                  <span class="sl-field-label">Subtipus</span>
                  <div class="sl-chips">
                    @for (sub of p.sport.subtypes; track sub.id) {
                      <button class="sl-chip" [class.active]="editSubtype() === sub.id"
                              [attr.aria-pressed]="editSubtype() === sub.id"
                              (click)="toggleSubtype(sub.id)">{{ sub.name }}</button>
                    }
                  </div>
                </div>
              }

              @for (def of p.sport.metricDefs; track def.key) {
                <div class="sl-field">
                  <span class="sl-field-label">{{ def.label }}@if (def.unit) { <small>({{ def.unit }})</small> }</span>
                  @if (def.type === 'select') {
                    <div class="sl-chips">
                      @for (opt of def.options ?? []; track opt.value) {
                        <button class="sl-chip" [class.active]="editMetric(def.key) === opt.value"
                                [attr.aria-pressed]="editMetric(def.key) === opt.value"
                                (click)="setMetric(def.key, editMetric(def.key) === opt.value ? null : opt.value)">
                          {{ opt.label }}
                        </button>
                      }
                    </div>
                  } @else {
                    <div class="sl-stepper">
                      <button class="sl-step-btn" (click)="adjustMetric(def, -1)" aria-label="Menys">−</button>
                      <span class="sl-step-val">{{ editMetricNum(def) }}<small>@if (def.unit) { {{ def.unit }} }</small></span>
                      <button class="sl-step-btn" (click)="adjustMetric(def, 1)" aria-label="Més">+</button>
                    </div>
                  }
                </div>
              }

              <!-- Un pla del futur encara no s'ha viscut: la sensació no hi té res a dir. -->
              @if (!isFuture()) {
                <div class="sl-field">
                  <span class="sl-field-label">Sensació</span>
                  <div class="sl-feeling-row">
                    @for (level of feelingLevels; track level) {
                      <button class="sl-feeling-btn" [class.active]="editFeeling() === level"
                              [attr.aria-pressed]="editFeeling() === level"
                              (click)="toggleFeeling(level)">{{ emojiOf(level) }}</button>
                    }
                  </div>
                </div>
              }

              <div class="sl-field">
                <span class="sl-field-label">Notes</span>
                <textarea class="sl-notes" placeholder="Afegeix una nota opcional..."
                          [value]="editNotes()" (input)="editNotes.set($any($event.target).value)"
                          rows="2"></textarea>
              </div>

              <div class="sl-actions">
                <button class="sl-delete-btn" [disabled]="saving()" (click)="deleteSession(p)">
                  <span class="material-symbols-outlined" aria-hidden="true">delete</span>
                  Eliminar
                </button>
                <div class="sl-main-actions">
                  <button class="sl-cancel" (click)="editOpen.set(false)">Cancel·lar</button>
                  <button class="sl-save" [disabled]="saving()" (click)="save(p)">Guardar</button>
                </div>
              </div>
            </div>
          }
        </div>

      } @else if (loading()) {

        <app-page-header title="Sessió" [showBack]="true" backFallback="/home" />
        <div class="sk-wrap">
          <div class="sk sk-hero"></div>
          <div class="sk sk-block"></div>
        </div>

      } @else {

        <app-page-header title="Sessió" [showBack]="true" backFallback="/home" />
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">search_off</span>
          <h2>Sessió no trobada</h2>
          <p>Potser l'has eliminada des d'un altre dispositiu.</p>
        </div>

      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 24px; }

    /* ── Capçalera de la sessió ──
       La targeta és la compartida (.activity-hero, a styles.scss), la mateixa
       que corona un entrenament. D'aquí només és el subtipus, que un
       entrenament no té. */
    .ss-subtype {
      flex-shrink: 0; padding: 1px 8px; border-radius: 8px;
      background: color-mix(in srgb, var(--ac) 14%, transparent);
      color: color-mix(in srgb, var(--ac) 65%, var(--c-text));
      font-size: 11px; font-weight: 700; line-height: 1.5;
    }

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
       l'embolcalla no n'hi posa una altra. */
    .detail-card {
      margin: 12px 16px 0; border-radius: 16px; overflow: hidden;
      border: 1.5px solid var(--c-border-2); box-shadow: 0 2px 10px var(--c-shadow);
    }

    /* ── Secció d'edició (plegable) ── */
    .card-section {
      margin: 12px 16px 0; padding: 14px;
      background: var(--c-card); border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .edit-card--open { padding-bottom: 16px; }
    .section-heading { margin: 0; }
    .section-header {
      display: flex; align-items: center; gap: 7px;
      width: 100%; padding: 0; border: none; background: none;
      text-align: left; font: inherit;
      cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent;
    }
    .section-icon  { font-size: 18px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }
    .section-chevron { font-size: 20px; color: var(--c-text-3); flex-shrink: 0; transition: transform 0.2s; }
    .edit-card--open .section-chevron { transform: rotate(180deg); }

    .edit-body { padding-top: 4px; animation: section-open 0.18s ease-out; }
    @keyframes section-open {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      .edit-body { animation: none; }
      .section-chevron { transition: none; }
    }

    /* ── Camps del formulari ── */
    .sl-field { margin-top: 14px; }
    .sl-field-label {
      display: block; font-size: 11px; font-weight: 700; color: var(--c-text-2);
      letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 8px;
      small { font-size: 10px; color: var(--c-text-3); font-weight: 400; text-transform: none; margin-left: 4px; }
    }
    .sl-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .sl-quick-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .sl-quick-btn {
      padding: 6px 12px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sl-stepper { display: flex; align-items: center; gap: 6px; }
    .sl-step-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 14px; font-weight: 700; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sl-step-val {
      min-width: 50px; text-align: center;
      font-size: 16px; font-weight: 800; color: var(--c-text);
      small { font-size: 11px; color: var(--c-text-3); margin-left: 2px; }
    }
    .sl-chips { display: flex; gap: 7px; flex-wrap: wrap; }
    .sl-chip {
      padding: 7px 14px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sl-feeling-row { display: flex; gap: 8px; }
    .sl-feeling-btn {
      display: flex; align-items: center; justify-content: center;
      flex: 1; height: 40px; border-radius: 12px;
      border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      font-size: 20px; cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.08); transform: scale(1.1); }
      &:hover:not(.active) { border-color: var(--c-border); background: var(--c-hover); }
    }
    .sl-notes {
      width: 100%; box-sizing: border-box;
      padding: 9px 12px; border: 1.5px solid var(--c-border); border-radius: 10px;
      font-size: 13px; font-family: inherit; color: var(--c-text); background: var(--c-card);
      resize: none; outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
      &::placeholder { color: var(--c-text-3); }
    }
    .sl-actions {
      display: flex; align-items: center; gap: 8px;
      margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--c-border-2);
    }
    .sl-delete-btn {
      display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
      height: 38px; padding: 0 13px; border-radius: 10px;
      border: 1.5px solid rgba(239,83,80,0.3); background: rgba(239,83,80,0.06); color: #ef5350;
      font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(239,83,80,0.12); border-color: #ef5350; }
      &:disabled { opacity: 0.6; cursor: default; }
    }
    .sl-main-actions { display: flex; gap: 8px; flex: 1; justify-content: flex-end; }
    .sl-cancel {
      height: 38px; padding: 0 16px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }
    .sl-save {
      height: 38px; padding: 0 18px; border-radius: 10px; border: none;
      background: var(--c-brand); color: white; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.6; cursor: default; }
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
  readonly today          = inject(TodayService).today;

  /** Seeded from the route snapshot so a deep-link renders on first paint. */
  private readonly sessionId = toSignal(
    this.route.paramMap.pipe(map(p => p.get('id'))),
    { initialValue: this.route.snapshot.paramMap.get('id') },
  );

  /** Una sessió acabada de registrar arriba amb `?nova=1`: hi véns a omplir-la,
   *  així que el formulari ja t'espera obert. */
  private readonly isNew = this.route.snapshot.queryParamMap.get('nova') === '1';

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

  readonly isPlanned = computed(() => this.pair()?.session.status === 'planned');
  readonly isFuture  = computed(() => (this.pair()?.session.date ?? '') > this.today());

  readonly dateLabel = computed(() => {
    const date = this.pair()?.session.date;
    return date ? feedDayLabel(date, this.today()) : '';
  });

  readonly subtypeName = computed(() => {
    const p = this.pair();
    if (!p?.session.subtypeId) return '';
    return p.sport.subtypes.find(s => s.id === p.session.subtypeId)?.name ?? '';
  });

  readonly durationPresets: number[] = [30, 45, 60, 90];
  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  readonly editOpen     = signal(false);
  readonly saving       = signal(false);
  readonly editDuration = signal(60);
  readonly editSubtype  = signal<string | null>(null);
  readonly editFeeling  = signal<FeelingLevel | null>(null);
  readonly editMetrics  = signal<Record<string, string | number>>({});
  readonly editNotes    = signal('');

  constructor() {
    this.sportService.ensureLoaded();
    // El formulari es carrega amb la sessió, que pot arribar més tard que la
    // pàgina: s'obre al primer moment que la tenim, i només aquell cop.
    let openedForNew = false;
    effect(() => {
      const p = this.pair();
      if (!p || !this.isNew || openedForNew) return;
      openedForNew = true;
      untracked(() => this.toggleEdit(p));
    });

    // La pàgina s'obre per l'URL i no sap de quin mes és la sessió. Abans
    // l'única manera de trobar-la era tenir-les totes; ara es demana aquella
    // fila, que és una consulta d'una fila.
    effect(() => {
      const id = this.sessionId();
      if (id) void this.sportService.ensureSessionLoaded(id);
    });

    // Si la sessió desapareix mentre la mires (l'has eliminada, o ho ha fet un
    // altre dispositiu), la pàgina no es queda buida: torna d'on venies.
    let hadSession = false;
    effect(() => {
      const has = !!this.pair();
      if (has) hadSession = true;
      else if (hadSession) { hadSession = false; this.navHistory.goBack('/home'); }
    });
  }

  emojiOf(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  /** Obrir el formulari el carrega amb el que la sessió ja porta; tancar-lo
   *  llença els canvis sense guardar. */
  toggleEdit(p: { sport: Sport; session: SportSession }): void {
    if (this.editOpen()) { this.editOpen.set(false); return; }
    this.editDuration.set(p.session.duration ?? 60);
    this.editSubtype.set(p.session.subtypeId ?? null);
    this.editFeeling.set(p.session.feeling ?? null);
    this.editMetrics.set({ ...(p.session.metrics ?? {}) });
    this.editNotes.set(p.session.notes ?? '');
    this.editOpen.set(true);
  }

  editMetric(key: string): string | number | null {
    return this.editMetrics()[key] ?? null;
  }

  editMetricNum(def: SportMetricDef): number {
    const v = this.editMetrics()[def.key];
    return typeof v === 'number' ? v : (def.min ?? 0);
  }

  adjustMetric(def: SportMetricDef, delta: number): void {
    const step = def.step ?? 1;
    const next = Math.max(def.min ?? 0, Math.min(def.max ?? 9999, this.editMetricNum(def) + delta * step));
    this.editMetrics.update(m => ({ ...m, [def.key]: next }));
  }

  setMetric(key: string, value: string | number | null): void {
    this.editMetrics.update(m => {
      const copy = { ...m };
      if (value === null) delete copy[key]; else copy[key] = value;
      return copy;
    });
  }

  toggleSubtype(id: string): void {
    this.editSubtype.update(v => v === id ? null : id);
  }

  adjustDuration(delta: number): void {
    this.editDuration.update(v => Math.max(5, v + delta));
  }

  toggleFeeling(level: FeelingLevel): void {
    this.editFeeling.update(v => v === level ? null : level);
  }

  async save(p: { sport: Sport; session: SportSession }): Promise<void> {
    this.saving.set(true);
    try {
      const metrics = this.editMetrics();
      // Omplir les dades d'un pla d'avui o d'abans és registrar-lo: si es
      // quedava 'planned' la sessió no comptava enlloc (ni al calendari ni a
      // les estadístiques), igual que al registre de la pàgina d'Entrenar.
      const promote = this.isPlanned() && p.session.date <= this.today();
      await this.sportService.updateSession(p.session.id, p.session.date, {
        subtypeId: this.editSubtype() ?? undefined,
        duration:  this.editDuration() || undefined,
        feeling:   this.editFeeling() ?? undefined,
        metrics:   Object.keys(metrics).length ? metrics : undefined,
        notes:     this.editNotes().trim() || undefined,
      }, promote ? 'done' : undefined);
      this.editOpen.set(false);
    } catch {
      this.feedback.error('Error en guardar', 2500);
    } finally {
      this.saving.set(false);
    }
  }

  async registerPlan(p: { sport: Sport; session: SportSession }): Promise<void> {
    this.saving.set(true);
    try {
      await this.sportService.startPlannedSession(p.session.id, p.session.date);
      this.feedback.success(`${p.sport.name} registrat`, 2000);
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
    this.saving.set(true);
    try {
      await this.sportService.deleteSession(p.session.id, p.session.date);
      this.feedback.success('Sessió eliminada', 2000);
      // Sortir d'aquí ho fa l'efecte que vigila que la sessió existeixi: si ho
      // féssim també des d'aquí, la pila de navegació es desapilaria dos cops.
    } catch {
      this.feedback.error('Error en eliminar', 2500);
      this.saving.set(false);
    }
  }
}
