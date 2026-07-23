import { Component, inject } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import { UserSettingsService } from '../../core/services/user-settings.service';
import { DifficultyScale } from '../../core/models/user-settings.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-settings-advanced',
  standalone: true,
  imports: [MatSlideToggleModule, PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header title="Paràmetres avançats" [showBack]="true" />

      <div class="section">
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Agrupar en superset</span>
            <span class="setting-desc">Permet enllaçar exercicis perquè es facin seguits, sense descans.</span>
          </div>
          <mat-slide-toggle
            [checked]="settingsService.supersetsEnabled()"
            (change)="toggleSupersets()"
            color="primary"
          />
        </div>

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Dropsets</span>
            <span class="setting-desc">Permet afegir trams a pes reduït immediatament després d'una sèrie.</span>
          </div>
          <mat-slide-toggle
            [checked]="settingsService.dropsetsEnabled()"
            (change)="toggleDropsets()"
            color="primary"
          />
        </div>

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">RIR (Reps In Reserve)</span>
            <span class="setting-desc">Permet registrar quantes repeticions et quedaven a cada sèrie.</span>
          </div>
          <mat-slide-toggle
            [checked]="settingsService.rirEnabled()"
            (change)="toggleRir()"
            color="primary"
          />
        </div>

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Ajustar el factor de pes corporal</span>
            <span class="setting-desc">Mostra al formulari d'exercici el % del pes corporal que compta al volum (p. ex. flexions 65%). Per defecte ja ve amb valors sensats.</span>
          </div>
          <mat-slide-toggle
            [checked]="settingsService.bodyweightFactorEnabled()"
            (change)="toggleBodyweightFactor()"
            color="primary"
          />
        </div>

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Escala de dificultat</span>
            <span class="setting-desc">Com es mostra i es registra la sensació de cada exercici.</span>
          </div>
          <div class="unit-toggle">
            <button class="unit-btn" [class.unit-btn--active]="settingsService.difficultyScale() === 'emoji'" (click)="setDifficultyScale('emoji')">😐</button>
            <button class="unit-btn" [class.unit-btn--active]="settingsService.difficultyScale() === 'numeric'" (click)="setDifficultyScale('numeric')">1-10</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .page {
      padding: 0 16px 16px;
      max-width: 540px; margin: 0 auto;
    }
    .section {
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
      padding: 16px; margin-bottom: 16px;
    }
    .setting-row {
      display: flex; align-items: center; gap: 14px;
      &.setting-row--top { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--c-border-2); }
    }
    .setting-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 4px;
    }
    .setting-label { font-size: 15px; font-weight: 700; color: var(--c-text); }
    .setting-desc { font-size: 12px; color: var(--c-text-2); line-height: 1.4; }
    .unit-toggle {
      display: flex; border: 1.5px solid var(--c-border); border-radius: 10px; overflow: hidden; flex-shrink: 0;
    }
    .unit-btn {
      padding: 7px 10px; border: none; background: var(--c-card);
      font-size: 13px; font-weight: 700; color: var(--c-text-3);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover:not(.unit-btn--active) { background: var(--c-hover); color: var(--c-text-2); }
      &.unit-btn--active { background: var(--c-brand); color: white; }
    }
  `],
})
export class SettingsAdvancedComponent {
  readonly settingsService = inject(UserSettingsService);

  toggleSupersets(): void {
    this.settingsService.update({ supersetsEnabled: !this.settingsService.supersetsEnabled() });
  }

  toggleDropsets(): void {
    this.settingsService.update({ dropsetsEnabled: !this.settingsService.dropsetsEnabled() });
  }

  toggleRir(): void {
    this.settingsService.update({ rirEnabled: !this.settingsService.rirEnabled() });
  }

  toggleBodyweightFactor(): void {
    this.settingsService.update({ bodyweightFactorEnabled: !this.settingsService.bodyweightFactorEnabled() });
  }

  setDifficultyScale(scale: DifficultyScale): void {
    this.settingsService.update({ difficultyScale: scale });
  }
}
