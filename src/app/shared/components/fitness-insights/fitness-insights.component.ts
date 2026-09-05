import { Component, computed, effect, inject, signal } from '@angular/core';

import { MASCOTS, MascotMeta } from '../../../core/models/mascot.model';
import { FitnessInsight, FitnessMetricsService } from '../../../core/services/fitness-metrics.service';
import { TodayService } from '../../../core/services/today.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';

const DISMISS_KEY = 'gymgoli_insight_dismissed';
const SHOWN_KEY   = 'gymgoli_insight_shown';
/** Les entrades més velles que això ja no diuen res: es poden llençar. */
const KEEP_DAYS = 60;

type SeenMap = Record<string, string>;

function readMap(key: string): SeenMap {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch { return {}; }
}

function writeMap(key: string, map: SeenMap): void {
  try { localStorage.setItem(key, JSON.stringify(map)); } catch { /* mode privat */ }
}

function daysSince(dateStr: string | undefined, today: string): number | null {
  if (!dateStr) return null;
  const a = new Date(dateStr + 'T12:00:00').getTime();
  const b = new Date(today   + 'T12:00:00').getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86_400_000);
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
  template: `
    <!-- Aquí els gossos no surten a parlar: els insights es queden en
         targetes. Les bafarades es reserven per a l'entrenament suggerit.

         I només n'hi cap un. Dos alhora feien que cap dels dos es llegís,
         i la majoria de dies el correcte és que no n'hi hagi cap. -->
    @if (insight(); as ins) {
      <div class="insights-wrap">
        <div class="insight-card" [style.--ic]="ins.color">
          <div class="ic-accent"></div>
          <div class="ic-who" [class.ic-who--pair]="mascotsOf(ins).length > 1">
            @for (m of mascotsOf(ins); track m.name) {
              <img class="ic-avatar" [src]="m.avatar" [alt]="m.alt">
            }
            <span class="ic-emoji">{{ ins.emoji }}</span>
          </div>
          <div class="ic-body">
            <span class="ic-title">{{ ins.title }}</span>
            <span class="ic-stat">{{ ins.stat }}</span>
            <span class="ic-msg">{{ ins.message }}</span>
          </div>
          <button class="ic-dismiss" (click)="dismiss(ins.type)" title="Tancar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      </div>
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

  /** Tancat → silenciat **només avui**. L'endemà torna si encara és cert. */
  private readonly dismissed = signal<SeenMap>(readMap(DISMISS_KEY));

  /**
   * Quan es va mostrar cada tipus per última vegada. És una còpia morta a
   * propòsit: si el filtre llegís això en calent, l'insight es taparia a si
   * mateix en el mateix moment de pintar-se.
   */
  private readonly shownAt: SeenMap = readMap(SHOWN_KEY);

  /** Un i prou: el primer candidat que avui es pot ensenyar. */
  readonly insight = computed((): FitnessInsight | null => {
    if (!this.settingsService.metricsEnabled() || !this.settingsService.loaded()) return null;

    const today     = this.todayService.today();
    const dismissed = this.dismissed();

    return this.metricsService.insights().find(i =>
      dismissed[i.type] !== today && !this._resting(i, today)
    ) ?? null;
  });

  constructor() {
    effect(() => {
      const ins = this.insight();
      if (ins) this._recordShown(ins.type, this.todayService.today());
    });
  }

  /**
   * Un estat lent (un patró de 12 setmanes) no canvia d'un dia per l'altre:
   * si sortís cada dia deixaria de dir res. Els esdeveniments porten
   * `cooldownDays: 0` i poden sortir sempre. El dia en què ja s'ha mostrat
   * no compta: un cop és l'insight del dia, s'hi queda tot el dia.
   */
  private _resting(insight: FitnessInsight, today: string): boolean {
    if (insight.cooldownDays <= 0) return false;
    const age = daysSince(this.shownAt[insight.type], today);
    return age !== null && age >= 1 && age < insight.cooldownDays;
  }

  private _recordShown(type: string, today: string): void {
    if (this.shownAt[type] === today) return;
    // La còpia en memòria no es toca: només el registre que llegirà el pròxim
    // arrencada de l'app.
    const stored = prune(readMap(SHOWN_KEY), today);
    if (stored[type] === today) return;
    stored[type] = today;
    writeMap(SHOWN_KEY, stored);
  }

  /** `both` es pinta com els dos avatars encavalcats, no com una foto de grup. */
  mascotsOf(insight: FitnessInsight): MascotMeta[] {
    return insight.mascot === 'both'
      ? [MASCOTS.marley, MASCOTS.xoco]
      : [MASCOTS[insight.mascot]];
  }

  /** Es tanca i no torna en tot el dia. L'endemà sí. */
  dismiss(type: string): void {
    const today = this.todayService.today();
    this.dismissed.update(prev => {
      const next = prune({ ...prev }, today);
      next[type] = today;
      writeMap(DISMISS_KEY, next);
      return next;
    });
  }
}
