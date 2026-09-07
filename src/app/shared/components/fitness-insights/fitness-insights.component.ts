import { Component, computed, effect, inject, signal, untracked } from '@angular/core';

import { InsightDetailSheetComponent } from './insight-detail-sheet.component';
import { MASCOTS, MascotMeta } from '../../../core/models/mascot.model';
import { FitnessInsight } from '../../../core/models/insight.model';
import { UserSettings } from '../../../core/models/user-settings.model';
import { FitnessMetricsService } from '../../../core/services/fitness-metrics.service';
import { TodayService } from '../../../core/services/today.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';

/** Claus d'abans que això visqués a `user_settings`. Només es llegeixen un
 *  cop, per no perdre el que ja hi hagi en aquest dispositiu, i s'esborren. */
const LEGACY_DISMISS_KEY = 'gymgoli_insight_dismissed';
const LEGACY_SHOWN_KEY   = 'gymgoli_insight_shown';
const LEGACY_ONCE_KEY    = 'gymgoli_insight_once';
/** Les entrades més velles que això ja no diuen res: es poden llençar. */
const KEEP_DAYS = 60;
/**
 * Fites recordades. No caduquen mai (una felicitació repetida mesos després
 * seria una equivocació, no un record), així que la llista es talla per
 * quantitat: les més velles ja no poden tornar a ser candidates.
 */
const KEEP_ONCE = 100;

type SeenMap = Record<string, string>;

interface LegacySeen { dismissed: SeenMap; shownAt: SeenMap; once: string[]; }

function readMap(key: string): SeenMap {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch { return {}; }
}

function daysSince(dateStr: string | undefined, today: string): number | null {
  if (!dateStr) return null;
  const a = new Date(dateStr + 'T12:00:00').getTime();
  const b = new Date(today   + 'T12:00:00').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
}

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === 'string') : [];
  } catch { return []; }
}

/** El que hi hagi en aquest dispositiu de l'època del `localStorage`, o null
 *  si no hi ha res a recuperar. */
function readLegacy(): LegacySeen | null {
  const dismissed = readMap(LEGACY_DISMISS_KEY);
  const shownAt   = readMap(LEGACY_SHOWN_KEY);
  const once      = readList(LEGACY_ONCE_KEY);
  const empty = !Object.keys(dismissed).length && !Object.keys(shownAt).length && !once.length;
  return empty ? null : { dismissed, shownAt, once };
}

function dropLegacy(): void {
  for (const key of [LEGACY_DISMISS_KEY, LEGACY_SHOWN_KEY, LEGACY_ONCE_KEY]) {
    try { localStorage.removeItem(key); } catch { /* mode privat */ }
  }
}

function prune(map: SeenMap, today: string): SeenMap {
  const out: SeenMap = {};
  for (const [type, date] of Object.entries(map)) {
    const age = daysSince(date, today);
    if (age !== null && age < KEEP_DAYS) out[type] = date;
  }
  return out;
}

@Component({
  selector: 'app-fitness-insights',
  standalone: true,
  imports: [InsightDetailSheetComponent],
  template: `
    <!-- Aquí els gossos no surten a parlar: els insights es queden en
         targetes. Les bafarades es reserven per a l'entrenament suggerit.

         I només n'hi cap un. Dos alhora feien que cap dels dos es llegís,
         i la majoria de dies el correcte és que no n'hi hagi cap. -->
    @if (insight(); as ins) {
      <div class="insights-wrap">
        <div class="insight-card" [style.--ic]="ins.color">
          <div class="ic-accent"></div>
          <!-- Tota la targeta obre el detall; la creu queda a fora del botó,
               que si no seria un botó dins d'un botó. -->
          <button class="ic-open" (click)="openDetail()"
                  [attr.aria-label]="openLabel(ins)">
            <span class="ic-who" [class.ic-who--pair]="mascotsOf(ins).length > 1">
              @for (m of mascotsOf(ins); track m.name) {
                <img class="ic-avatar" [src]="m.avatar" [alt]="m.alt">
              }
              <span class="ic-emoji" aria-hidden="true">{{ ins.emoji }}</span>
            </span>
            <span class="ic-body">
              <span class="ic-title">{{ ins.title }}</span>
              <span class="ic-stat">{{ ins.stat }}</span>
              <span class="ic-msg">{{ ins.message }}</span>
            </span>
            <span class="material-symbols-outlined ic-more" aria-hidden="true">chevron_right</span>
          </button>
          <button class="ic-dismiss" (click)="dismiss(ins.type)" aria-label="Tancar">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
      </div>

      @if (detailOpen()) {
        <app-insight-detail-sheet [insight]="ins" (close)="closeDetail()" />
      }
    }
  `,
  styles: [`
    .insights-wrap {
      display: flex; flex-direction: column; gap: 10px;
      margin: 16px 16px 0;
    }

    .insight-card {
      display: flex; align-items: center; gap: 0;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
      overflow: hidden;
      animation: ic-in 0.25s cubic-bezier(0.34, 1.4, 0.64, 1) both;
    }

    @keyframes ic-in {
      from { opacity: 0; transform: translateY(-6px) scale(0.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .ic-accent {
      width: 5px; align-self: stretch; flex-shrink: 0;
      background: var(--ic);
    }

    /* La targeta sencera és el botó que obre el detall. Es pinta com abans:
       el botó no ha d'afegir cap marc, només fer-la tocable. */
    .ic-open {
      flex: 1; min-width: 0;
      display: flex; align-items: center; gap: 0;
      border: none; background: transparent; padding: 0;
      font: inherit; color: inherit; text-align: left;
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s;
      &:hover { background: color-mix(in srgb, var(--ic) 5%, transparent); }
      &:active { background: color-mix(in srgb, var(--ic) 8%, transparent); }
      &:focus-visible { outline: 2px solid var(--ic); outline-offset: -2px; }
    }

    .ic-more {
      flex-shrink: 0; font-size: 18px; color: var(--c-text-3);
      opacity: 0.65;
    }

    /* Qui parla (avatar) + com se sent (emoji, com a xapa a sota a la dreta).
     * Quan el missatge és transversal hi surten tots dos, encavalcats. */
    .ic-who {
      position: relative; flex-shrink: 0;
      display: flex; align-items: center;
      padding: 11px 10px 11px 12px;
    }

    .ic-avatar {
      width: 38px; height: 38px; border-radius: 50%;
      object-fit: cover; display: block;
      background: var(--c-subtle);
      box-shadow: 0 1px 4px var(--c-shadow);
    }

    .ic-who--pair .ic-avatar {
      width: 30px; height: 30px;
      border: 2px solid var(--c-card);
      &:not(:first-child) { margin-left: -12px; }
    }

    .ic-emoji {
      position: absolute; right: 2px; bottom: 4px;
      width: 18px; height: 18px; border-radius: 50%;
      display: grid; place-items: center;
      font-size: 12px; line-height: 1;
      background: var(--c-card);
      box-shadow: 0 1px 3px var(--c-shadow);
    }

    .ic-body {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
      padding: 12px 4px 12px 0;
    }

    .ic-title, .ic-stat, .ic-msg { display: block; }

    .ic-title {
      font-size: 13px; font-weight: 800; line-height: 1.2;
      color: color-mix(in srgb, var(--ic) 60%, var(--c-text));
    }

    /* La xifra. És el motiu pel qual la targeta existeix, així que va per
     * sobre del missatge i amb el color del text principal. */
    .ic-stat {
      font-size: 12.5px; font-weight: 700; color: var(--c-text); line-height: 1.35;
    }

    .ic-msg {
      font-size: 12px; font-weight: 500; color: var(--c-text-2); line-height: 1.4;
    }

    .ic-dismiss {
      flex-shrink: 0;
      width: 40px; height: 40px;
      align-self: center;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); touch-action: manipulation; margin-right: 4px;
      display: flex; align-items: center; justify-content: center;
      transition: color 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { color: var(--c-text-3); }
    }
  `],
})
export class FitnessInsightsComponent {
  readonly settingsService = inject(UserSettingsService);
  private metricsService   = inject(FitnessMetricsService);
  private todayService     = inject(TodayService);

  /**
   * Quan es va mostrar cada tipus per última vegada, i les fites ja
   * celebrades. Són còpies mortes a propòsit: si el filtre les llegís en
   * calent, l'insight es taparia a si mateix en el mateix moment de
   * pintar-se. Es prenen un sol cop, quan la configuració ha carregat.
   */
  private _shownAt: SeenMap = {};
  private _seenOnce = new Set<string>();
  private _snapshotTaken = false;
  private readonly _seenReady = signal(false);

  /** Un i prou: el primer candidat que avui es pot ensenyar. */
  readonly insight = computed((): FitnessInsight | null => {
    if (!this.settingsService.metricsEnabled() || !this.settingsService.loaded()) return null;
    // Fins que no se sap què s'ha ensenyat abans, callar: ensenyar un insight
    // que tocava descansar és pitjor que ensenyar-lo mig segon més tard.
    if (!this._seenReady()) return null;

    const today     = this.todayService.today();
    const dismissed = this.settingsService.insightDismissedAt();

    return this.metricsService.insights().find(i =>
      dismissed[i.type] !== today && !this._resting(i, today) && !this._alreadyCelebrated(i)
    ) ?? null;
  });

  /** El full amb el «per què t'ho diem». S'obre tocant la targeta. */
  private readonly _detailOpen = signal(false);
  readonly detailOpen = this._detailOpen.asReadonly();

  constructor() {
    // Les còpies mortes es prenen quan la configuració ja hi és — abans no se
    // sap res, i en canviar d'usuari es tornen a prendre.
    effect(() => {
      if (!this.settingsService.loaded()) {
        this._snapshotTaken = false;
        this._seenReady.set(false);
        return;
      }
      if (this._snapshotTaken) return;
      this._snapshotTaken = true;
      untracked(() => this._hydrateSeen());
    });

    effect(() => {
      const ins = this.insight();
      if (ins) untracked(() => this._record(ins));
      // Si l'insight canvia sota els peus (canvi de dia, dades noves), el full
      // que hi havia obert ja no parla del que es veu: es tanca.
      if (!ins) this._detailOpen.set(false);
    });
  }

  /**
   * Pren les còpies mortes de la configuració, i recupera el que hagués
   * quedat al `localStorage` d'aquest dispositiu si encara no s'havia pujat
   * mai res: una fita ja celebrada no s'ha de tornar a celebrar pel fet
   * d'haver canviat d'on es guarda.
   */
  private _hydrateSeen(): void {
    const s      = this.settingsService.settings();
    const legacy = readLegacy();
    const synced = Object.keys(s.insightShownAt ?? {}).length > 0
                || Object.keys(s.insightDismissedAt ?? {}).length > 0
                || (s.insightCelebrated ?? []).length > 0;

    if (legacy && !synced) {
      this._shownAt  = legacy.shownAt;
      this._seenOnce = new Set(legacy.once);
      void this.settingsService.update({
        insightShownAt:     legacy.shownAt,
        insightDismissedAt: legacy.dismissed,
        insightCelebrated:  legacy.once.slice(-KEEP_ONCE),
      });
    } else {
      this._shownAt  = { ...(s.insightShownAt ?? {}) };
      this._seenOnce = new Set(s.insightCelebrated ?? []);
    }

    if (legacy) dropLegacy();
    this._seenReady.set(true);
  }

  /** El botó ha de dir on porta, no repetir el títol que ja es llegeix. */
  openLabel(insight: FitnessInsight): string {
    return `Veure per què t'ho diem: ${insight.title}`;
  }

  openDetail(): void  { this._detailOpen.set(true); }
  closeDetail(): void { this._detailOpen.set(false); }

  /**
   * Un estat lent (un patró de 12 setmanes) no canvia d'un dia per l'altre:
   * si sortís cada dia deixaria de dir res. Els esdeveniments porten
   * `cooldownDays: 0` i poden sortir sempre. El dia en què ja s'ha mostrat
   * no compta: un cop és l'insight del dia, s'hi queda tot el dia.
   */
  private _resting(insight: FitnessInsight, today: string): boolean {
    if (insight.cooldownDays <= 0) return false;
    const age = daysSince(this._shownAt[insight.type], today);
    return age !== null && age >= 1 && age < insight.cooldownDays;
  }

  /** Una fita ja celebrada no es torna a celebrar mai. Veure `once`. */
  private _alreadyCelebrated(insight: FitnessInsight): boolean {
    return insight.once !== undefined && this._seenOnce.has(insight.once);
  }

  /**
   * Deixa constància del que s'ha ensenyat, en una sola escriptura.
   *
   * La fita celebrada també s'apunta en memòria: és el que fa que demà, quan
   * el `computed()` es torni a fer, la felicitació d'avui ja no hi sigui,
   * sense esperar a reobrir l'app. El registre del dia, en canvi, no toca la
   * còpia morta: un cop és l'insight del dia, s'hi queda tot el dia.
   */
  private _record(insight: FitnessInsight): void {
    const today = this.todayService.today();
    const patch: Partial<UserSettings> = {};

    const shown = prune(this.settingsService.insightShownAt(), today);
    if (shown[insight.type] !== today) {
      shown[insight.type] = today;
      patch.insightShownAt = shown;
    }

    if (insight.once !== undefined && !this._seenOnce.has(insight.once)) {
      this._seenOnce.add(insight.once);
      const stored = this.settingsService.insightCelebrated().filter(k => k !== insight.once);
      stored.push(insight.once);
      patch.insightCelebrated = stored.slice(-KEEP_ONCE);
    }

    if (Object.keys(patch).length) void this.settingsService.update(patch);
  }

  /** `both` es pinta com els dos avatars encavalcats, no com una foto de grup. */
  mascotsOf(insight: FitnessInsight): MascotMeta[] {
    return insight.mascot === 'both'
      ? [MASCOTS.marley, MASCOTS.xoco]
      : [MASCOTS[insight.mascot]];
  }

  /** Es tanca i no torna en tot el dia. L'endemà sí. */
  dismiss(type: string): void {
    this._detailOpen.set(false);
    const today = this.todayService.today();
    const next  = prune(this.settingsService.insightDismissedAt(), today);
    next[type]  = today;
    void this.settingsService.update({ insightDismissedAt: next });
  }
}
