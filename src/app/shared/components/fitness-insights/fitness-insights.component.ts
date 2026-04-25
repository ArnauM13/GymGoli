import { Component, computed, inject, signal } from '@angular/core';

import { FitnessMetricsService } from '../../../core/services/fitness-metrics.service';
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
              <div class="ic-left">
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
      margin: 12px 16px 0;
      animation: ins-in 0.3s ease both;
    }
    @keyframes ins-in {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .insight-card {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 12px 10px 12px 14px;
      border-radius: 16px;
      border: 1.5px solid color-mix(in srgb, var(--ic) 25%, #e8e8e8);
      background: color-mix(in srgb, var(--ic) 7%, white);
    }

    .ic-left {
      flex-shrink: 0;
      font-size: 26px; line-height: 1; margin-top: 1px;
    }

    .ic-body {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 3px;
    }

    .ic-title {
      font-size: 13px; font-weight: 800; line-height: 1.2;
      color: color-mix(in srgb, var(--ic) 70%, #1a1a1a);
    }

    .ic-msg {
      font-size: 12px; font-weight: 500; color: #555; line-height: 1.35;
    }

    .ic-dismiss {
      flex-shrink: 0;
      width: 28px; height: 28px; border-radius: 50%;
      border: none; background: transparent; cursor: pointer;
      color: #bbb; touch-action: manipulation; margin-top: -2px;
      display: flex; align-items: center; justify-content: center;
      transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { color: #888; background: rgba(0,0,0,0.06); }
    }
  `],
})
export class FitnessInsightsComponent {
  readonly settingsService = inject(UserSettingsService);
  private metricsService   = inject(FitnessMetricsService);

  private readonly dismissed    = signal<Set<string>>(new Set());
  readonly visibleInsights = computed(() =>
    this.metricsService.insights().filter(i => !this.dismissed().has(i.type))
  );

  dismiss(type: string): void {
    this.dismissed.update(set => new Set([...set, type]));
  }
}
