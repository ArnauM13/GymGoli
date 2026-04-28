import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { UserSettingsService } from '../../core/services/user-settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [MatSlideToggleModule],
  template: `
    <div class="page">

      <div class="page-header">
        <button class="back-btn" (click)="back()" title="Tornar">
          <span class="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <h1 class="page-title">Configuració</h1>
      </div>

      <div class="section">
        <h2 class="section-title">Estadístiques i mètriques</h2>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Consells personalitzats</span>
            <span class="setting-desc">
              Rep suggeriments basats en el teu historial: setmanes fluixes,
              esports que fa dies que no fas, i molt més.
            </span>
          </div>
          <mat-slide-toggle
            [checked]="settingsService.metricsEnabled()"
            (change)="toggleMetrics()"
            color="primary"
          />
        </div>

        @if (settingsService.metricsEnabled()) {
          <div class="setting-hint">
            <span class="material-symbols-outlined hint-icon">info</span>
            Els consells apareixen a la pantalla d'inici. Pots tancar-los individualment en qualsevol moment.
          </div>
        }
      </div>

    </div>
  `,
  styles: [`
    .page {
      padding: 0 16px 84px;
      max-width: 540px; margin: 0 auto;
    }

    /* ── Header ── */
    .page-header {
      display: flex; align-items: center; gap: 4px;
      padding: 12px 0 16px;
    }

    .back-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: #555; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(0,0,0,0.06); }
    }

    .page-title {
      margin: 0;
      font-size: 20px; font-weight: 800; color: #1a1a1a; letter-spacing: -0.3px;
    }

    .section {
      background: white;
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
      padding: 16px; margin-bottom: 16px;
    }

    .section-title {
      margin: 0 0 14px;
      font-size: 13px; font-weight: 700; color: #666;
      letter-spacing: 0.3px; text-transform: uppercase;
    }

    .setting-row {
      display: flex; align-items: center; gap: 14px;
    }

    .setting-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 4px;
    }

    .setting-label {
      font-size: 15px; font-weight: 700; color: #1a1a1a;
    }

    .setting-desc {
      font-size: 12px; color: #666; line-height: 1.4;
    }

    /* ── Hint ── */
    .setting-hint {
      display: flex; align-items: flex-start; gap: 6px;
      margin-top: 12px; padding: 10px 12px;
      background: rgba(0, 104, 116, 0.06); border-radius: 10px;
      border: 1px solid rgba(0, 104, 116, 0.15);
      font-size: 12px; color: #555; line-height: 1.4;
    }

    .hint-icon {
      font-size: 15px; color: #006874; flex-shrink: 0; margin-top: 1px;
      font-variation-settings: 'FILL' 1;
    }
  `],
})
export class SettingsComponent {
  readonly settingsService = inject(UserSettingsService);
  private location         = inject(Location);

  back(): void { this.location.back(); }

  toggleMetrics(): void {
    this.settingsService.update({ metricsEnabled: !this.settingsService.metricsEnabled() });
  }
}
