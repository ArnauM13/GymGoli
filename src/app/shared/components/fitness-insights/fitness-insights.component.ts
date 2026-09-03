import { Component, computed, inject, signal } from '@angular/core';

import { MASCOTS, MascotMeta } from '../../../core/models/mascot.model';
import { FitnessInsight, FitnessMetricsService } from '../../../core/services/fitness-metrics.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';

@Component({
  selector: 'app-fitness-insights',
  standalone: true,
  template: `
    @if (settingsService.metricsEnabled() && settingsService.loaded()) {
      @if (visibleInsights().length) {
        <div class="insights-wrap">
          @for (insight of visibleInsights(); track insight.type) {
            <div class="insight-card" [style.--ic]="insight.color">
              <div class="ic-accent"></div>
              <div class="ic-who" [class.ic-who--pair]="mascotsOf(insight).length > 1">
                @for (m of mascotsOf(insight); track m.name) {
                  <img class="ic-avatar" [src]="m.avatar" [alt]="m.alt">
                }
                <span class="ic-emoji">{{ insight.emoji }}</span>
              </div>
              <div class="ic-body">
                <span class="ic-title">{{ insight.title }}</span>
                <span class="ic-msg">{{ insight.message }}</span>
              </div>
              <button class="ic-dismiss" (click)="dismiss(insight.type)" title="Tancar">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          }
        </div>
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

  private static readonly _SK = 'gymgoli_dismissed_insights';

  private readonly dismissed = signal<Set<string>>(FitnessInsightsComponent._loadDismissed());

  private static _loadDismissed(): Set<string> {
    try {
      const raw = sessionStorage.getItem(FitnessInsightsComponent._SK);
      return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
    } catch { return new Set(); }
  }

  readonly visibleInsights = computed(() =>
    this.metricsService.insights().filter(i => !this.dismissed().has(i.type))
  );

  /** `both` es pinta com els dos avatars encavalcats, no com una foto de grup. */
  mascotsOf(insight: FitnessInsight): MascotMeta[] {
    return insight.mascot === 'both'
      ? [MASCOTS.marley, MASCOTS.xoco]
      : [MASCOTS[insight.mascot]];
  }

  dismiss(type: string): void {
    this.dismissed.update(s => {
      const next = new Set([...s, type]);
      try { sessionStorage.setItem(FitnessInsightsComponent._SK, JSON.stringify([...next])); } catch {}
      return next;
    });
  }
}
