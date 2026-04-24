import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { UserSettingsService } from '../../core/services/user-settings.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  template: `
    <div class="page">

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
          <button
            class="toggle-btn"
            [class.active]="settingsService.metricsEnabled()"
            (click)="toggleMetrics()"
            [attr.aria-label]="settingsService.metricsEnabled() ? 'Desactivar consells' : 'Activar consells'"
          >
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
          </button>
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
      padding: 16px 16px 84px;
      max-width: 540px;
      margin: 0 auto;
    }

    .section {
      background: white;
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
      padding: 16px;
      margin-bottom: 16px;
    }

    .section-title {
      margin: 0 0 14px;
      font-size: 13px;
      font-weight: 700;
      color: #888;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }

    .setting-row {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .setting-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .setting-label {
      font-size: 15px;
      font-weight: 700;
      color: #1a1a1a;
    }

    .setting-desc {
      font-size: 12px;
      font-weight: 400;
      color: #888;
      line-height: 1.4;
    }

    /* ── Toggle switch ── */
    .toggle-btn {
      flex-shrink: 0;
      width: 48px;
      height: 28px;
      border: none;
      background: transparent;
      cursor: pointer;
      padding: 0;
      touch-action: manipulation;
    }

    .toggle-track {
      display: flex;
      align-items: center;
      width: 48px;
      height: 28px;
      border-radius: 14px;
      background: #e0e0e0;
      padding: 3px;
      transition: background 0.22s ease;
      position: relative;

      .toggle-btn.active & {
        background: #006874;
      }
    }

    .toggle-thumb {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);

      .toggle-btn.active & {
        transform: translateX(20px);
      }
    }

    /* ── Hint ── */
    .setting-hint {
      display: flex;
      align-items: flex-start;
      gap: 6px;
      margin-top: 12px;
      padding: 10px 12px;
      background: rgba(0, 104, 116, 0.06);
      border-radius: 10px;
      border: 1px solid rgba(0, 104, 116, 0.15);
      font-size: 12px;
      color: #555;
      line-height: 1.4;
    }

    .hint-icon {
      font-size: 15px;
      color: #006874;
      flex-shrink: 0;
      margin-top: 1px;
      font-variation-settings: 'FILL' 1;
    }
  `],
})
export class SettingsComponent {
  readonly settingsService = inject(UserSettingsService);
  private router           = inject(Router);

  toggleMetrics(): void {
    this.settingsService.update({ metricsEnabled: !this.settingsService.metricsEnabled() });
  }
}
