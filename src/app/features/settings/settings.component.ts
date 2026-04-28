import { Component, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { FitnessMetricsService } from '../../core/services/fitness-metrics.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { GoalMode, WeightUnit } from '../../core/models/user-settings.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [MatSlideToggleModule, RouterLink],
  template: `
    <div class="page">

      <div class="page-header">
        <button class="back-btn" (click)="back()" title="Tornar">
          <span class="material-symbols-outlined">arrow_back_ios</span>
        </button>
        <h1 class="page-title">Configuració</h1>
      </div>

      <!-- ── Aparença ── -->
      <div class="section">
        <h2 class="section-title">Aparença</h2>
        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Mode fosc</span>
            <span class="setting-desc">Redueix la llum de la pantalla per a un ús nocturn còmode.</span>
          </div>
          <mat-slide-toggle
            [checked]="settingsService.darkMode()"
            (change)="toggleDarkMode()"
            color="primary"
          />
        </div>
        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Unitat de pes</span>
            <span class="setting-desc">Els pesos es mostren en l'unitat seleccionada. Els valors es guarden sempre en kg.</span>
          </div>
          <div class="unit-toggle">
            <button class="unit-btn" [class.unit-btn--active]="settingsService.weightUnit() === 'kg'" (click)="setWeightUnit('kg')">kg</button>
            <button class="unit-btn" [class.unit-btn--active]="settingsService.weightUnit() === 'lb'" (click)="setWeightUnit('lb')">lb</button>
          </div>
        </div>
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

      @if (settingsService.metricsEnabled()) {
        <div class="section">
          <h2 class="section-title">Objectiu setmanal</h2>

          <!-- Mode selector -->
          <div class="mode-selector">
            <button
              class="mode-btn"
              [class.mode-btn--active]="settingsService.goalMode() === 'combined'"
              (click)="setGoalMode('combined')"
            >Combinat</button>
            <button
              class="mode-btn"
              [class.mode-btn--active]="settingsService.goalMode() === 'separate'"
              (click)="setGoalMode('separate')"
            >Separat</button>
          </div>

          @if (settingsService.goalMode() === 'combined') {
            <!-- Combined goal (gym + sport together) -->
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Activitats per setmana</span>
                <span class="setting-desc">
                  Gym i esport compten igual. Els consells t'animaran quan ho aconsegueixis.
                </span>
              </div>

              @if (settingsService.weeklyActivityGoal() === null) {
                <button class="goal-set-btn" (click)="setGoal(3)">
                  <span class="material-symbols-outlined">add</span>
                  Definir
                </button>
              } @else {
                <div class="goal-stepper">
                  <button class="step-btn" (click)="adjustGoal(-1)" [disabled]="settingsService.weeklyActivityGoal()! <= 1" aria-label="Menys">
                    <span class="material-symbols-outlined">remove</span>
                  </button>
                  <span class="goal-value">{{ settingsService.weeklyActivityGoal() }}</span>
                  <button class="step-btn" (click)="adjustGoal(1)" [disabled]="settingsService.weeklyActivityGoal()! >= 7" aria-label="Més">
                    <span class="material-symbols-outlined">add</span>
                  </button>
                  <button class="step-btn step-btn--danger" (click)="clearGoal()" aria-label="Eliminar objectiu">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </div>
              }
            </div>
          } @else {
            <!-- Separate goals (gym and sport independently) -->
            <div class="separate-goals">

              <div class="goal-row">
                <div class="goal-row-info">
                  <span class="material-symbols-outlined goal-icon">fitness_center</span>
                  <div class="setting-info">
                    <span class="setting-label">Entrenos de gym</span>
                    <span class="setting-desc">Sessions de musculació per setmana.</span>
                  </div>
                </div>
                @if (settingsService.weeklyGymGoal() === null) {
                  <button class="goal-set-btn" (click)="setGymGoal(2)">
                    <span class="material-symbols-outlined">add</span>
                    Definir
                  </button>
                } @else {
                  <div class="goal-stepper">
                    <button class="step-btn" (click)="adjustGymGoal(-1)" [disabled]="settingsService.weeklyGymGoal()! <= 1" aria-label="Menys">
                      <span class="material-symbols-outlined">remove</span>
                    </button>
                    <span class="goal-value">{{ settingsService.weeklyGymGoal() }}</span>
                    <button class="step-btn" (click)="adjustGymGoal(1)" [disabled]="settingsService.weeklyGymGoal()! >= 7" aria-label="Més">
                      <span class="material-symbols-outlined">add</span>
                    </button>
                    <button class="step-btn step-btn--danger" (click)="clearGymGoal()" aria-label="Eliminar objectiu gym">
                      <span class="material-symbols-outlined">close</span>
                    </button>
                  </div>
                }
              </div>

              <div class="goal-row">
                <div class="goal-row-info">
                  <span class="material-symbols-outlined goal-icon">directions_run</span>
                  <div class="setting-info">
                    <span class="setting-label">Sessions d'esport</span>
                    <span class="setting-desc">Activitats esportives per setmana.</span>
                  </div>
                </div>
                @if (settingsService.weeklySportGoal() === null) {
                  <button class="goal-set-btn" (click)="setSportGoal(2)">
                    <span class="material-symbols-outlined">add</span>
                    Definir
                  </button>
                } @else {
                  <div class="goal-stepper">
                    <button class="step-btn" (click)="adjustSportGoal(-1)" [disabled]="settingsService.weeklySportGoal()! <= 1" aria-label="Menys">
                      <span class="material-symbols-outlined">remove</span>
                    </button>
                    <span class="goal-value">{{ settingsService.weeklySportGoal() }}</span>
                    <button class="step-btn" (click)="adjustSportGoal(1)" [disabled]="settingsService.weeklySportGoal()! >= 7" aria-label="Més">
                      <span class="material-symbols-outlined">add</span>
                    </button>
                    <button class="step-btn step-btn--danger" (click)="clearSportGoal()" aria-label="Eliminar objectiu esport">
                      <span class="material-symbols-outlined">close</span>
                    </button>
                  </div>
                }
              </div>

            </div>
          }

          @if (metricsService.goalStreak() > 0) {
            <div class="streak-row">
              <span class="streak-fire">🔥</span>
              <span class="streak-text">
                {{ metricsService.goalStreak() }}
                setmana{{ metricsService.goalStreak() !== 1 ? 'nes' : '' }}
                consecutiva{{ metricsService.goalStreak() !== 1 ? 's' : '' }}
              </span>
            </div>
          }
        </div>
      }

      <!-- ── Compte ── -->
      <div class="section section--danger">
        <h2 class="section-title">Compte</h2>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Tancar sessió</span>
            <span class="setting-desc">Sortiràs de l'aplicació en aquest dispositiu.</span>
          </div>
          <button class="danger-btn danger-btn--soft" (click)="logout()">Sortir</button>
        </div>

        <div class="setting-divider"></div>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label danger-label">Eliminar compte</span>
            <span class="setting-desc">S'eliminaran totes les teves dades de forma permanent.</span>
          </div>
          <button class="danger-btn" (click)="deleteAccount()" [disabled]="deletingAccount()">
            @if (deletingAccount()) {
              <span class="material-symbols-outlined spin">sync</span>
            } @else {
              Eliminar
            }
          </button>
        </div>
      </div>

      <a class="legal-link" routerLink="/privacy">
        <span class="material-symbols-outlined">policy</span>
        Política de privacitat i Condicions d'ús
      </a>

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
      background: transparent; cursor: pointer; color: var(--c-text-2); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-hover); }
    }

    .page-title {
      margin: 0;
      font-size: 20px; font-weight: 800; color: var(--c-text); letter-spacing: -0.3px;
    }

    .section {
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
      padding: 16px; margin-bottom: 16px;
    }

    .section-title {
      margin: 0 0 14px;
      font-size: 13px; font-weight: 700; color: var(--c-text-2);
      letter-spacing: 0.3px; text-transform: uppercase;
    }

    .setting-row {
      display: flex; align-items: center; gap: 14px;
      &.setting-row--top { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--c-border-2); }
    }

    /* ── Unit toggle (kg/lb) ── */
    .unit-toggle {
      display: flex; border: 1.5px solid var(--c-border); border-radius: 10px; overflow: hidden; flex-shrink: 0;
    }
    .unit-btn {
      padding: 7px 14px; border: none; background: var(--c-card);
      font-size: 13px; font-weight: 700; color: var(--c-text-3);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover:not(.unit-btn--active) { background: var(--c-hover); color: var(--c-text-2); }
      &.unit-btn--active { background: var(--c-brand); color: white; }
    }

    .setting-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 4px;
    }

    .setting-label {
      font-size: 15px; font-weight: 700; color: var(--c-text);
    }

    .setting-desc {
      font-size: 12px; color: var(--c-text-2); line-height: 1.4;
    }

    /* ── Hint ── */
    .setting-hint {
      display: flex; align-items: flex-start; gap: 6px;
      margin-top: 12px; padding: 10px 12px;
      background: rgba(var(--c-brand-rgb), 0.06); border-radius: 10px;
      border: 1px solid rgba(var(--c-brand-rgb), 0.15);
      font-size: 12px; color: var(--c-text-2); line-height: 1.4;
    }

    .hint-icon {
      font-size: 15px; color: var(--c-brand); flex-shrink: 0; margin-top: 1px;
      font-variation-settings: 'FILL' 1;
    }

    /* ── Mode selector ── */
    .mode-selector {
      display: flex; gap: 6px;
      margin-bottom: 16px;
    }

    .mode-btn {
      flex: 1; padding: 8px 12px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 13px; font-weight: 600; color: var(--c-text-3);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: var(--c-text-3); color: var(--c-text-2); }
      &.mode-btn--active {
        border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.07);
        color: var(--c-brand);
      }
    }

    /* ── Separate goals ── */
    .separate-goals {
      display: flex; flex-direction: column; gap: 12px;
    }

    .goal-row {
      display: flex; align-items: center; gap: 12px;
    }

    .goal-row-info {
      display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;
    }

    .goal-icon {
      font-size: 20px; color: var(--c-text-3); flex-shrink: 0;
      font-variation-settings: 'FILL' 0;
    }

    /* ── Goal stepper ── */
    .goal-set-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 8px 14px; border-radius: 10px; border: 1.5px solid var(--c-border);
      background: var(--c-card); color: var(--c-text-2); font-size: 13px; font-weight: 600;
      cursor: pointer; white-space: nowrap; touch-action: manipulation;
      transition: all 0.15s; flex-shrink: 0;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
    }

    .goal-stepper {
      display: flex; align-items: center; gap: 4px; flex-shrink: 0;
    }

    .goal-value {
      min-width: 28px; text-align: center;
      font-size: 20px; font-weight: 800; color: var(--c-brand);
    }

    .step-btn {
      width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid var(--c-border);
      background: var(--c-card); cursor: pointer; color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 16px; }
      &:hover:not(:disabled) { border-color: var(--c-brand); color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.04); }
      &:disabled { opacity: 0.3; cursor: default; }
      &.step-btn--danger:hover:not(:disabled) { border-color: #ef5350; color: #ef5350; background: rgba(239,83,80,0.06); }
    }

    /* ── Goal streak ── */
    .streak-row {
      display: flex; align-items: center; gap: 8px;
      margin-top: 10px; padding: 8px 12px;
      background: rgba(230, 81, 0, 0.07); border-radius: 10px;
    }
    .streak-fire { font-size: 17px; line-height: 1; flex-shrink: 0; }
    .streak-text { font-size: 13px; font-weight: 700; color: #e65100; }

    /* ── Account / danger section ── */
    .section--danger { margin-top: 8px; }

    .setting-divider {
      height: 1px; background: var(--c-border-2); margin: 10px 0;
    }

    .danger-label { color: #c62828; }

    .danger-btn {
      display: flex; align-items: center; justify-content: center; gap: 4px;
      padding: 8px 14px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; white-space: nowrap; flex-shrink: 0;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 15px; }
      &:hover:not(:disabled) { border-color: var(--c-text-3); color: var(--c-text); }
      &:disabled { opacity: 0.5; cursor: default; }
      &:not(.danger-btn--soft) {
        border-color: #ffcdd2; color: #c62828;
        &:hover:not(:disabled) { background: #fef2f2; border-color: #ef9a9a; }
      }
    }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; font-size: 15px !important; }

    /* ── Legal link ── */
    .legal-link {
      display: flex; align-items: center; gap: 8px;
      margin-top: 12px; padding: 12px 14px;
      background: var(--c-card); border-radius: 14px;
      box-shadow: 0 2px 10px var(--c-shadow);
      font-size: 13px; font-weight: 500; color: var(--c-text-2);
      text-decoration: none; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; color: var(--c-text-3); }
      &:hover { color: var(--c-brand); box-shadow: 0 2px 14px var(--c-shadow-md); }
    }
  `],
})
export class SettingsComponent {
  readonly settingsService  = inject(UserSettingsService);
  readonly metricsService   = inject(FitnessMetricsService);
  private authService       = inject(AuthService);
  private location         = inject(Location);
  private router           = inject(Router);
  private snackBar         = inject(MatSnackBar);

  readonly deletingAccount = signal(false);

  back(): void { this.location.back(); }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.router.navigate(['/login']);
  }

  setWeightUnit(unit: WeightUnit): void {
    this.settingsService.update({ weightUnit: unit });
  }

  toggleDarkMode(): void {
    this.settingsService.update({ darkMode: !this.settingsService.darkMode() });
  }

  toggleMetrics(): void {
    this.settingsService.update({ metricsEnabled: !this.settingsService.metricsEnabled() });
  }

  setGoalMode(mode: GoalMode): void {
    this.settingsService.update({ goalMode: mode });
  }

  // ── Combined goal ────────────────────────────────────────────────────────

  setGoal(n: number): void {
    this.settingsService.update({ weeklyActivityGoal: n });
  }

  adjustGoal(delta: number): void {
    const current = this.settingsService.weeklyActivityGoal();
    if (current === null) return;
    this.settingsService.update({ weeklyActivityGoal: Math.max(1, Math.min(7, current + delta)) });
  }

  clearGoal(): void {
    this.settingsService.update({ weeklyActivityGoal: null });
  }

  // ── Gym goal ─────────────────────────────────────────────────────────────

  setGymGoal(n: number): void {
    this.settingsService.update({ weeklyGymGoal: n });
  }

  adjustGymGoal(delta: number): void {
    const current = this.settingsService.weeklyGymGoal();
    if (current === null) return;
    this.settingsService.update({ weeklyGymGoal: Math.max(1, Math.min(7, current + delta)) });
  }

  clearGymGoal(): void {
    this.settingsService.update({ weeklyGymGoal: null });
  }

  // ── Sport goal ───────────────────────────────────────────────────────────

  setSportGoal(n: number): void {
    this.settingsService.update({ weeklySportGoal: n });
  }

  adjustSportGoal(delta: number): void {
    const current = this.settingsService.weeklySportGoal();
    if (current === null) return;
    this.settingsService.update({ weeklySportGoal: Math.max(1, Math.min(7, current + delta)) });
  }

  clearSportGoal(): void {
    this.settingsService.update({ weeklySportGoal: null });
  }

  // ── Account ──────────────────────────────────────────────────────────────

  async deleteAccount(): Promise<void> {
    const confirmed = confirm(
      'Estàs segur/a que vols eliminar el compte?\n\nTotes les teves dades (entrenaments, esports, configuració) s\'eliminaran de forma permanent i no es podran recuperar.'
    );
    if (!confirmed) return;

    this.deletingAccount.set(true);
    try {
      await this.authService.deleteAccount();
      this.router.navigate(['/login']);
    } catch {
      this.snackBar.open(
        'Error en eliminar el compte. Contacta amb el suport si el problema persisteix.',
        'OK',
        { duration: 6000 }
      );
    } finally {
      this.deletingAccount.set(false);
    }
  }
}
