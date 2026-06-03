import { Component, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { FitnessMetricsService } from '../../core/services/fitness-metrics.service';
import { SportService } from '../../core/services/sport.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { TrainerService } from '../../core/services/trainer.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import {
  FitnessGoal, GoalMode, ThemeMode, WeightUnit,
  FITNESS_GOAL_EMOJIS, FITNESS_GOAL_LABELS, FITNESS_GOAL_WEEKLY_DEFAULTS,
} from '../../core/models/user-settings.model';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [MatSlideToggleModule, RouterLink],
  template: `
    <div class="page">

      <!-- ── Identity ── -->
      <div class="identity">
        @if (userAvatarUrl(); as url) {
          <img [src]="url" class="identity-avatar" [alt]="userName() ?? ''" referrerpolicy="no-referrer">
        } @else {
          <span class="material-symbols-outlined identity-icon">account_circle</span>
        }
        @if (userName(); as n) { <span class="identity-name">{{ n }}</span> }
        @if (authService.user()?.email; as e) { <span class="identity-email">{{ e }}</span> }
      </div>

      <!-- ── Bloc 1: El meu objectiu ── -->
      <div class="section">
        <h2 class="section-title">El meu objectiu</h2>

        @if (!settingsService.fitnessGoal()) {
          <p class="section-desc">Tria un objectiu i l'app adaptarà els consells i l'objectiu setmanal per a tu.</p>
        }
        <div class="fitness-goal-grid">
          @for (g of fitnessGoalOptions; track g.value) {
            <button class="fg-btn" [class.selected]="settingsService.fitnessGoal() === g.value"
                    (click)="setFitnessGoal(g.value)">
              <span class="fg-emoji">{{ g.emoji }}</span>
              <span class="fg-label">{{ g.label }}</span>
            </button>
          }
        </div>

        @if (settingsService.metricsEnabled()) {
          <div class="setting-divider"></div>

          <h3 class="subsection-title">Objectiu setmanal</h3>

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
            <div class="setting-row">
              <div class="setting-info">
                <span class="setting-label">Activitats per setmana</span>
                <span class="setting-desc">Gym i esport compten igual.</span>
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
        } @else {
          <div class="setting-hint">
            <span class="material-symbols-outlined hint-icon">info</span>
            Activa els insights personalitzats a Preferències per definir un objectiu setmanal.
          </div>
        }
      </div>

      <!-- ── Bloc 2: Configuració ── -->
      <div class="section">
        <h2 class="section-title">Configuració</h2>

        <a class="nav-row" routerLink="/exercises">
          <span class="material-symbols-outlined nav-row-icon">fitness_center</span>
          <div class="setting-info">
            <span class="setting-label">Configurar exercicis</span>
            <span class="setting-desc">Afegeix, edita i organitza els teus exercicis.</span>
          </div>
          <span class="material-symbols-outlined nav-row-arrow">chevron_right</span>
        </a>

        <div class="setting-divider"></div>

        <a class="nav-row" routerLink="/sports-config">
          <span class="material-symbols-outlined nav-row-icon">sports_soccer</span>
          <div class="setting-info">
            <span class="setting-label">Configurar esports</span>
            <span class="setting-desc">Gestiona els teus esports, mètriques i subtipus.</span>
          </div>
          <span class="material-symbols-outlined nav-row-arrow">chevron_right</span>
        </a>
      </div>

      <!-- ── Bloc 3: Preferències ── -->
      <div class="section">
        <h2 class="section-title">Preferències</h2>

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Tema</span>
            <span class="setting-desc">Clar, fosc, o automàtic segons el sistema.</span>
          </div>
          <div class="unit-toggle">
            <button class="unit-btn" [class.unit-btn--active]="settingsService.themeMode() === 'light'"  (click)="setThemeMode('light')"  aria-label="Tema clar">☀️</button>
            <button class="unit-btn" [class.unit-btn--active]="settingsService.themeMode() === 'system'" (click)="setThemeMode('system')" aria-label="Tema del sistema">🌗</button>
            <button class="unit-btn" [class.unit-btn--active]="settingsService.themeMode() === 'dark'"   (click)="setThemeMode('dark')"   aria-label="Tema fosc">🌙</button>
          </div>
        </div>

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Unitat de pes</span>
            <span class="setting-desc">Els valors es guarden sempre en kg.</span>
          </div>
          <div class="unit-toggle">
            <button class="unit-btn" [class.unit-btn--active]="settingsService.weightUnit() === 'kg'" (click)="setWeightUnit('kg')">kg</button>
            <button class="unit-btn" [class.unit-btn--active]="settingsService.weightUnit() === 'lb'" (click)="setWeightUnit('lb')">lb</button>
          </div>
        </div>

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Descans entre sèries</span>
            <span class="setting-desc">Temporitzador automàtic en afegir una sèrie.</span>
          </div>
          <mat-slide-toggle
            [checked]="restTimerEnabled()"
            (change)="toggleRestTimer()"
            color="primary"
          />
        </div>

        @if (restTimerEnabled()) {
          <div class="setting-row setting-row--top rest-timer-input-row">
            <div class="setting-info">
              <span class="setting-label">Durada del descans</span>
            </div>
            <div class="rest-input-wrap">
              <input
                class="rest-input"
                type="number"
                min="1"
                max="3600"
                [value]="settingsService.restTimerSeconds()"
                (change)="setRestTimerFromInput($event)"
              />
              <span class="rest-input-unit">s</span>
            </div>
          </div>
        }

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Insights personalitzats</span>
            <span class="setting-desc">Consells basats en el teu historial i seguiment de l'objectiu setmanal.</span>
          </div>
          <mat-slide-toggle
            [checked]="settingsService.metricsEnabled()"
            (change)="toggleMetrics()"
            color="primary"
          />
        </div>

      </div>

      <!-- ── Bloc 3: Mode entrenador ── -->
      <div class="section">
        <h2 class="section-title">Mode entrenador</h2>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Activa el mode entrenador</span>
            <span class="setting-desc">Gestiona clients, crea rutines i proposa entrenaments.</span>
          </div>
          <mat-slide-toggle
            [checked]="trainerService.isTrainer()"
            [disabled]="togglingTrainer()"
            (change)="toggleTrainerMode()"
            color="primary"
          />
        </div>

        @if (trainerService.isTrainer()) {
          <div class="setting-divider"></div>

          <a class="nav-row" routerLink="/trainer">
            <div class="setting-info">
              <span class="setting-label">Dashboard de clients</span>
              <span class="setting-desc">Gestiona els teus clients i les seves propostes.</span>
            </div>
            <span class="material-symbols-outlined nav-row-arrow">chevron_right</span>
          </a>

          <div class="setting-row setting-row--top">
            <div class="setting-info">
              <span class="setting-label">Invitació</span>
              <span class="setting-desc">Comparteix el codi o l'enllaç als teus clients.</span>
            </div>
            @if (!trainerService.activeInvite()) {
              <button class="goal-set-btn" (click)="generateTrainerInvite()" [disabled]="generatingInvite()">
                @if (generatingInvite()) {
                  <span class="material-symbols-outlined spin">sync</span>
                } @else {
                  <span class="material-symbols-outlined">add</span>
                  Genera
                }
              </button>
            }
          </div>

          @if (trainerService.activeInvite(); as inv) {
            <div class="invite-block">
              <div class="invite-code-display">{{ inv.code }}</div>
              <div class="invite-btns">
                <button class="invite-action-btn" (click)="copyInviteCode(inv.code)">
                  <span class="material-symbols-outlined">content_copy</span>
                  Copia codi
                </button>
                <button class="invite-action-btn" (click)="copyInviteLink(inv.token)">
                  <span class="material-symbols-outlined">share</span>
                  Copia enllaç
                </button>
                <button class="invite-action-btn" (click)="generateTrainerInvite()" [disabled]="generatingInvite()">
                  <span class="material-symbols-outlined">refresh</span>
                  Nou
                </button>
              </div>
            </div>
          }
        }
      </div>

      <!-- ── Bloc 4: El meu entrenador ── -->
      <div class="section">
        <h2 class="section-title">El meu entrenador</h2>

        @if (trainerService.hasTrainer()) {
          <div class="setting-row">
            <div class="setting-info">
              <span class="setting-label">{{ trainerService.myTrainer()?.displayName ?? 'Entrenador' }}</span>
              <span class="setting-desc">Entrenador personal connectat.</span>
            </div>
          </div>
          <div class="setting-row setting-row--top">
            <div class="setting-info">
              <span class="setting-label danger-label">Desconnectar entrenador</span>
              <span class="setting-desc">Deixaràs de rebre propostes d'entrenament.</span>
            </div>
            <button class="danger-btn" (click)="disconnectTrainer()">Desconnecta</button>
          </div>
        } @else {
          <p class="section-desc">Tens un codi d'invitació? Introdueix-lo per connectar-te amb el teu entrenador.</p>

          @if (!showInviteInput()) {
            <button class="goal-set-btn" (click)="showInviteInput.set(true)">
              <span class="material-symbols-outlined">key</span>
              Introduir codi
            </button>
          } @else {
            <div class="invite-input-row">
              <input
                class="invite-code-input"
                type="text"
                placeholder="Ex: A3B7F2XQ"
                maxlength="8"
                [value]="inviteCodeInput()"
                (input)="inviteCodeInput.set($any($event.target).value.toUpperCase())"
                (keydown.enter)="acceptInviteCode()"
              />
              <button class="btn-primary-sm" (click)="acceptInviteCode()" [disabled]="acceptingInvite() || inviteCodeInput().length < 6">
                @if (acceptingInvite()) {
                  <span class="material-symbols-outlined spin">sync</span>
                } @else {
                  Unir-me
                }
              </button>
              <button class="icon-btn-sm" (click)="showInviteInput.set(false)">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          }
        }
      </div>

      <!-- ── Bloc 6: Contingut ── -->
      <div class="section">
        <h2 class="section-title">Contingut</h2>

        <a class="nav-row" routerLink="/templates">
          <div class="setting-info">
            <span class="setting-label">Plantilles</span>
            <span class="setting-desc">Crea i gestiona les teves plantilles d'entrenament.</span>
          </div>
          <span class="material-symbols-outlined nav-row-arrow">chevron_right</span>
        </a>

        <div class="setting-row setting-row--top">
          <div class="setting-info">
            <span class="setting-label">Exportar les meves dades</span>
            <span class="setting-desc">Descarrega un JSON amb tots els teus entrenaments, esports i configuració.</span>
          </div>
          <button class="export-btn" (click)="exportData()" aria-label="Descarregar dades">
            <span class="material-symbols-outlined">download</span>
          </button>
        </div>
      </div>

      <!-- ── Bloc 4: Compte ── -->
      <div class="section section--danger">
        <h2 class="section-title">Compte</h2>

        <div class="setting-row">
          <div class="setting-info">
            <span class="setting-label">Tancar sessió</span>
            <span class="setting-desc">Sortiràs de l'aplicació en aquest dispositiu.</span>
          </div>
          <button class="danger-btn danger-btn--soft" (click)="logout()">Sortir</button>
        </div>

        <a class="nav-row nav-row--top" routerLink="/privacy">
          <div class="setting-info">
            <span class="setting-label">Política de privacitat</span>
            <span class="setting-desc">Condicions d'ús i tractament de dades.</span>
          </div>
          <span class="material-symbols-outlined nav-row-arrow">chevron_right</span>
        </a>

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

    </div>
  `,
  styles: [`
    .page {
      padding: 0 16px 16px;
      max-width: 540px; margin: 0 auto;
    }

    /* ── Identity ── */
    .identity {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      padding: 24px 16px 20px;
    }
    .identity-icon {
      font-size: 64px; color: var(--c-text-3);
      font-variation-settings: 'FILL' 1, 'wght' 300;
    }
    .identity-avatar {
      width: 72px; height: 72px; border-radius: 50%; object-fit: cover;
      box-shadow: 0 2px 8px var(--c-shadow);
    }
    .identity-name  { font-size: 18px; font-weight: 800; color: var(--c-text); letter-spacing: -0.3px; }
    .identity-email { font-size: 13px; color: var(--c-text-2); }

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
    .subsection-title {
      margin: 0 0 12px;
      font-size: 13px; font-weight: 700; color: var(--c-text);
    }
    .section-desc {
      margin: -8px 0 12px; font-size: 13px; color: var(--c-text-3); line-height: 1.5;
    }

    .setting-row {
      display: flex; align-items: center; gap: 14px;
      &.setting-row--top { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--c-border-2); }
    }

    /* ── Nav row (link with chevron) ── */
    .nav-row {
      display: flex; align-items: center; gap: 14px;
      text-decoration: none; color: inherit;
      cursor: pointer; touch-action: manipulation;
      transition: opacity 0.15s;
      &:hover { opacity: 0.8; }
      &.nav-row--top { margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--c-border-2); }
    }
    .nav-row-arrow {
      font-size: 22px; color: var(--c-text-3); flex-shrink: 0;
    }
    .nav-row-icon {
      font-size: 22px; color: var(--c-brand); flex-shrink: 0;
      font-variation-settings: 'FILL' 0, 'wght' 400;
    }

    /* ── Unit toggle ── */
    .unit-toggle {
      display: flex; border: 1.5px solid var(--c-border); border-radius: 10px; overflow: hidden; flex-shrink: 0;
    }
    .rest-timer-input-row { align-items: center; }
    .rest-input-wrap {
      display: flex; align-items: center; gap: 4px; flex-shrink: 0;
    }
    .rest-input {
      width: 72px; padding: 7px 10px;
      border: 1.5px solid var(--c-border); border-radius: 10px;
      background: var(--c-card); color: var(--c-text);
      font-size: 16px; font-weight: 700; text-align: center;
      outline: none; transition: border-color 0.15s;
      -moz-appearance: textfield;
      &::-webkit-outer-spin-button, &::-webkit-inner-spin-button { -webkit-appearance: none; }
      &:focus { border-color: var(--c-brand); }
    }
    .rest-input-unit { font-size: 13px; font-weight: 600; color: var(--c-text-2); }
    .unit-btn {
      padding: 7px 10px; border: none; background: var(--c-card);
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
    .separate-goals { display: flex; flex-direction: column; gap: 12px; }

    .goal-row { display: flex; align-items: center; gap: 12px; }

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

    .goal-stepper { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }

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

    /* ── Fitness goal grid ── */
    .fitness-goal-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
    }
    .fg-btn {
      display: flex; align-items: center; gap: 10px;
      padding: 12px 14px; border-radius: 14px;
      border: 2px solid var(--c-border-2); background: var(--c-subtle);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation; text-align: left;
      outline: none;
      &:focus-visible { box-shadow: 0 0 0 3px rgba(var(--c-brand-rgb), 0.25); }
      &.selected {
        border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.12);
        .fg-label { color: var(--c-brand); }
      }
    }
    @media (hover: hover) {
      .fg-btn:not(.selected):hover {
        border-color: color-mix(in srgb, var(--c-brand) 50%, var(--c-border-2));
        background: rgba(var(--c-brand-rgb), 0.04);
      }
    }
    .fg-emoji { font-size: 22px; line-height: 1; flex-shrink: 0; }
    .fg-label { font-size: 13px; font-weight: 700; color: var(--c-text-2); line-height: 1.2; }

    /* ── Goal streak ── */
    .streak-row {
      display: flex; align-items: center; gap: 8px;
      margin-top: 10px; padding: 8px 12px;
      background: rgba(230, 81, 0, 0.07); border-radius: 10px;
    }
    .streak-fire { font-size: 17px; line-height: 1; flex-shrink: 0; }
    .streak-text { font-size: 13px; font-weight: 700; color: #e65100; }

    /* ── Export button ── */
    .export-btn {
      width: 38px; height: 38px; border-radius: 10px; border: 1.5px solid var(--c-border);
      background: var(--c-card); cursor: pointer; color: var(--c-text-2); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.04); }
    }

    /* ── Account / danger section ── */
    .section--danger { margin-top: 8px; }

    .setting-divider {
      height: 1px; background: var(--c-border-2); margin: 14px 0;
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

    /* ── Invite block ── */
    .invite-block {
      margin-top: 12px; padding: 12px 14px;
      background: rgba(0,104,116,0.06); border-radius: 12px;
      border: 1.5px solid rgba(0,104,116,0.15);
    }
    .invite-code-display {
      font-size: 28px; font-weight: 800; letter-spacing: 5px;
      color: var(--c-brand); font-family: monospace;
      text-align: center; margin-bottom: 10px;
    }
    .invite-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .invite-action-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 8px 10px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation; white-space: nowrap;
      .material-symbols-outlined { font-size: 15px; }
      &:hover:not(:disabled) { border-color: var(--c-brand); color: var(--c-brand); }
      &:disabled { opacity: 0.5; cursor: default; }
    }

    /* ── Invite code input ── */
    .invite-input-row { display: flex; gap: 6px; align-items: center; margin-top: 10px; }
    .invite-code-input {
      flex: 1; padding: 9px 12px; border: 1.5px solid var(--c-border);
      border-radius: 10px; font-size: 15px; font-weight: 700;
      letter-spacing: 3px; text-transform: uppercase; color: var(--c-text);
      background: var(--c-card); outline: none; font-family: monospace;
      transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
      &::placeholder { font-weight: 500; letter-spacing: 1px; color: var(--c-text-3); }
    }
    .btn-primary-sm {
      padding: 8px 14px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap;
      transition: background 0.15s; touch-action: manipulation; flex-shrink: 0;
      &:hover:not(:disabled) { background: #005a63; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
    .icon-btn-sm {
      width: 34px; height: 34px; border-radius: 8px; border: 1.5px solid var(--c-border);
      background: var(--c-card); cursor: pointer; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { border-color: var(--c-text-3); color: var(--c-text-2); }
    }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; font-size: 15px !important; }
  `],
})
export class SettingsComponent {
  readonly authService     = inject(AuthService);
  readonly settingsService = inject(UserSettingsService);
  readonly metricsService  = inject(FitnessMetricsService);
  readonly trainerService  = inject(TrainerService);
  private exerciseService  = inject(ExerciseService);
  private sportService     = inject(SportService);
  private workoutService   = inject(WorkoutService);
  private router           = inject(Router);
  private snackBar         = inject(MatSnackBar);
  private doc              = inject(DOCUMENT);
  private confirmDialog    = inject(ConfirmDialogService);

  readonly userName = computed(() =>
    this.authService.user()?.user_metadata?.['full_name'] as string | undefined
  );

  readonly userAvatarUrl = computed(() =>
    this.authService.user()?.user_metadata?.['avatar_url'] as string | undefined
  );

  readonly deletingAccount  = signal(false);
  readonly togglingTrainer  = signal(false);
  readonly generatingInvite = signal(false);
  readonly showInviteInput  = signal(false);
  readonly inviteCodeInput  = signal('');
  readonly acceptingInvite  = signal(false);
  readonly restTimerEnabled = computed(() => this.settingsService.restTimerSeconds() > 0);
  readonly fitnessGoalOptions = (Object.keys(FITNESS_GOAL_LABELS) as FitnessGoal[]).map(v => ({
    value: v, emoji: FITNESS_GOAL_EMOJIS[v], label: FITNESS_GOAL_LABELS[v],
  }));

  setFitnessGoal(goal: FitnessGoal): void {
    if (this.settingsService.fitnessGoal() === goal) {
      this.settingsService.update({ fitnessGoal: null });
      return;
    }
    const patch: Partial<Parameters<typeof this.settingsService.update>[0]> = { fitnessGoal: goal };
    if (!this.settingsService.metricsEnabled()) patch.metricsEnabled = true;
    this.settingsService.update(patch);
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    await this.router.navigate(['/login']);
    this.snackBar.open('Sessió tancada', '', { duration: 2000 });
  }

  setWeightUnit(unit: WeightUnit): void {
    this.settingsService.update({ weightUnit: unit });
  }

  toggleRestTimer(): void {
    const current = this.settingsService.restTimerSeconds();
    this.settingsService.update({ restTimerSeconds: current > 0 ? 0 : 90 });
  }

  setRestTimerFromInput(event: Event): void {
    const raw = parseInt((event.target as HTMLInputElement).value, 10);
    const secs = isNaN(raw) || raw < 1 ? 1 : Math.min(raw, 3600);
    (event.target as HTMLInputElement).value = String(secs);
    this.settingsService.update({ restTimerSeconds: secs });
  }

  setThemeMode(mode: ThemeMode): void {
    this.settingsService.update({ themeMode: mode });
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

  // ── Trainer mode ─────────────────────────────────────────────────────────

  async toggleTrainerMode(): Promise<void> {
    this.togglingTrainer.set(true);
    try {
      if (this.trainerService.isTrainer()) {
        await this.trainerService.deactivateTrainerMode();
      } else {
        await this.trainerService.activateTrainerMode();
        await this.trainerService.loadActiveInvite();
      }
    } catch (e) {
      this.snackBar.open((e as Error).message ?? 'Error', 'OK', { duration: 4000 });
    } finally {
      this.togglingTrainer.set(false);
    }
  }

  async generateTrainerInvite(): Promise<void> {
    this.generatingInvite.set(true);
    try {
      await this.trainerService.generateInvite();
    } catch (e) {
      this.snackBar.open((e as Error).message ?? 'Error', 'OK', { duration: 4000 });
    } finally {
      this.generatingInvite.set(false);
    }
  }

  copyInviteCode(code: string): void {
    navigator.clipboard.writeText(code).then(() =>
      this.snackBar.open('Codi copiat', '', { duration: 1800 })
    );
  }

  copyInviteLink(token: string): void {
    const url = `${window.location.origin}/join/${token}`;
    navigator.clipboard.writeText(url).then(() =>
      this.snackBar.open('Enllaç copiat', '', { duration: 1800 })
    );
  }

  async acceptInviteCode(): Promise<void> {
    const code = this.inviteCodeInput().trim();
    if (!code) return;
    this.acceptingInvite.set(true);
    try {
      await this.trainerService.acceptInviteByCode(code);
      this.showInviteInput.set(false);
      this.inviteCodeInput.set('');
      this.snackBar.open('Entrenador connectat correctament', '', { duration: 2500 });
    } catch (e) {
      this.snackBar.open((e as Error).message ?? 'Error', 'OK', { duration: 4000 });
    } finally {
      this.acceptingInvite.set(false);
    }
  }

  async disconnectTrainer(): Promise<void> {
    const trainerName = this.trainerService.myTrainer()?.displayName ?? 'l\'entrenador';
    if (!await this.confirmDialog.confirm(`Vols desconnectar-te de ${trainerName}? Deixaràs de rebre propostes d'entrenament.`, { confirmLabel: 'Desconnectar' })) return;
    try {
      await this.trainerService.disconnectFromTrainer();
      this.snackBar.open('Entrenador desconnectat', '', { duration: 2000 });
    } catch (e) {
      this.snackBar.open((e as Error).message ?? 'Error', 'OK', { duration: 4000 });
    }
  }

  // ── Data export ──────────────────────────────────────────────────────────

  async exportData(): Promise<void> {
    await this.exerciseService.ensureLoaded();
    const payload = {
      exportDate:   new Date().toISOString(),
      version:      1,
      workouts:     this.workoutService.workouts(),
      exercises:    this.exerciseService.exercises(),
      sports:       this.sportService.sports(),
      sportSessions: this.sportService.sessions(),
      settings:     this.settingsService.settings(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = this.doc.createElement('a');
    a.href     = url;
    a.download = `gymgoli-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Account ──────────────────────────────────────────────────────────────

  async deleteAccount(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm(
      'Totes les teves dades (entrenaments, esports, configuració) s\'eliminaran de forma permanent i no es podran recuperar.',
      { title: 'Eliminar compte', variant: 'danger', confirmLabel: 'Eliminar compte' }
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
