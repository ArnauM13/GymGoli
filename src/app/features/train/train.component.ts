import { LowerCasePipe } from '@angular/common';
import { Component, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { InlineDatePickerComponent } from '../../shared/components/inline-date-picker/inline-date-picker.component';
import { workoutCategories } from '../../shared/utils/calendar-utils';

import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, Exercise, ExerciseCategory,
} from '../../core/models/exercise.model';
import { Sport, SportMetricDef } from '../../core/models/sport.model';
import { BUILT_IN_TEMPLATES, BuiltInTemplate, WorkoutTemplate } from '../../core/models/template.model';
import { FEELING_EMOJI, FeelingLevel, Workout, WorkoutEntry } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { TemplateService } from '../../core/services/template.service';
import { SportService } from '../../core/services/sport.service';
import { WorkoutService } from '../../core/services/workout.service';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { FitnessInsightsComponent } from '../../shared/components/fitness-insights/fitness-insights.component';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';
import { WeeklySummaryComponent } from './components/weekly-summary.component';

const TODAY = (): string => new Date().toISOString().split('T')[0];

const WORKOUT_TYPES: { value: ExerciseCategory; label: string; icon: string; color: string }[] = [
  { value: 'push', label: CATEGORY_LABELS.push, icon: CATEGORY_ICONS.push, color: CATEGORY_COLORS.push },
  { value: 'pull', label: CATEGORY_LABELS.pull, icon: CATEGORY_ICONS.pull, color: CATEGORY_COLORS.pull },
  { value: 'legs', label: CATEGORY_LABELS.legs, icon: CATEGORY_ICONS.legs, color: CATEGORY_COLORS.legs },
];

@Component({
  selector: 'app-train',
  standalone: true,
  imports: [WorkoutEditorComponent, LowerCasePipe, InlineDatePickerComponent, FitnessInsightsComponent, WeeklySummaryComponent],
  template: `
    <div class="page">

      @if (activeWorkout(); as w) {

        <!-- ══ ACTIVE WORKOUT MODE ══ -->
        <div class="workout-topbar">
          <button class="topbar-back" (click)="closeWorkout()" title="Tornar">
            <span class="material-symbols-outlined">arrow_back_ios</span>
          </button>
          <div class="topbar-center">
            <div class="topbar-badges">
              @for (cat of activeWorkoutCategoryItems(); track cat.value) {
                <span class="type-badge" [style.background]="cat.color">{{ cat.label }}</span>
              }
              @if (activeWorkoutCategoryItems().length > 1) {
                <span class="hybrid-badge">Híbrid</span>
              }
            </div>
            <span class="topbar-meta">
              {{ topbarDateLabel(w) }}
              @if (w.entries.length > 0) { · {{ w.entries.length }} exerc }
            </span>
          </div>
          <button class="topbar-delete" (click)="deleteActiveWorkout()" title="Eliminar entrenament">
            <span class="material-symbols-outlined">delete</span>
          </button>
        </div>

        <app-workout-editor
          #editor
          [workout]="w"
          [editMode]="false"
          [alwaysEditable]="true"
          (requestAddExercise)="openPicker()"
        />

      } @else {

        <!-- ══ DASHBOARD MODE ══ -->
        <app-inline-date-picker
          [selectedDate]="selectedDate()"
          (dateSelected)="selectedDate.set($event)"
        />

        <!-- ── Fitness insights ── -->

        <!-- ── Skeleton (initial data load) ── -->
        @if (workoutService.isLoading() && dateWorkouts().length === 0 && !creating()) {
          <div class="sk-workout-section">
            <div class="sk-section-header">
              <div class="sk sk-icon-ph"></div>
              <div class="sk sk-title-ph"></div>
            </div>
            <div class="sk-card-ph">
              <div class="sk sk-card-bar"></div>
              <div class="sk-card-body">
                <div class="sk sk-line sk-line--55"></div>
                <div class="sk sk-line sk-line--30"></div>
              </div>
            </div>
            <div class="sk-btn-grid">
              <div class="sk sk-btn-ph"></div>
              <div class="sk sk-btn-ph"></div>
              <div class="sk sk-btn-ph"></div>
            </div>
          </div>
          <div class="sk-sports-section">
            <div class="sk-section-header">
              <div class="sk sk-icon-ph"></div>
              <div class="sk sk-title-ph"></div>
            </div>
            <div class="sk-btn-grid">
              <div class="sk sk-btn-ph"></div>
              <div class="sk sk-btn-ph"></div>
              <div class="sk sk-btn-ph"></div>
            </div>
          </div>
        }

        <!-- ── Creating spinner (brief, while new workout is being saved) ── -->
        @if (creating()) {
          <div class="loading-state">
            <span class="material-symbols-outlined spin">sync</span>
          </div>
        }

        @if ((!workoutService.isLoading() || dateWorkouts().length > 0) && !creating()) {

          <app-fitness-insights />
          <app-weekly-summary />

          <!-- Entrenaments section -->
          <div class="workout-section">
            <div class="sports-header">
              <span class="material-symbols-outlined sports-header-icon">fitness_center</span>
              <h2 class="sports-title">Entrenaments</h2>
            </div>

            <!-- Existing workout cards -->
            @for (w of dateWorkouts(); track w.id) {
              <div class="workout-card" (click)="openWorkout(w.id)">
                <div class="wc-bar" [style.background]="workoutCardColor(w)"></div>
                <div class="wc-info">
                  <span class="wc-label">{{ workoutLabel(w) }}</span>
                  <span class="wc-detail">
                    {{ w.entries.length }} exerc
                    @if (workoutSetsCount(w); as n) { · {{ n }} sèr }
                  </span>
                </div>
                <button class="wc-delete" (click)="$event.stopPropagation(); confirmDeleteWorkout(w)" title="Eliminar">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            }

            <!-- Type buttons -->
            <div class="type-grid" [class.type-grid--mt]="dateWorkouts().length > 0"
                 [style.grid-template-columns]="gridCols(workoutTypes.length)">
              @for (cat of workoutTypes; track cat.value) {
                <button class="type-btn"
                  [style.--cat-color]="cat.color"
                  [class.type-btn--done]="doneCategories().has(cat.value)"
                  (click)="selectType(cat.value)">
                  @if (doneCategories().has(cat.value)) {
                    <span class="type-done-check material-symbols-outlined">check_circle</span>
                  }
                  <span class="material-symbols-outlined type-icon">{{ cat.icon }}</span>
                  <span class="type-label">{{ cat.label }}</span>
                </button>
              }
            </div>
          </div>

          <!-- Sports section -->
          <div class="sports-section">
            <div class="sports-header">
              <span class="material-symbols-outlined sports-header-icon">sports_soccer</span>
              <h2 class="sports-title">Esports</h2>
            </div>
            <div class="sports-grid" [style.grid-template-columns]="gridCols(sportService.sports().length)">
              @for (sport of sportService.sports(); track sport.id) {
                <button
                  class="sport-btn"
                  [class.active]="isSportDone(sport.id)"
                  [style.--sport-color]="sport.color"
                  (click)="openSessionLogger(sport)"
                  [disabled]="sportToggling()"
                >
                  @if (isSportDone(sport.id)) {
                    <span class="sport-check material-symbols-outlined">check_circle</span>
                  }
                  <span class="material-symbols-outlined sport-icon">{{ sport.icon }}</span>
                  <span class="sport-name">{{ sport.name }}</span>
                  @if (sessionSummary(sport.id); as sum) {
                    <span class="sport-summary">{{ sum }}</span>
                  }
                </button>
              }
            </div>
          </div>

        }
      }

    </div>

    <!-- ── FAB: add exercise (active workout mode only) ── -->
    @if (activeWorkout()) {
      <button class="add-exercise-fab" (click)="openPicker()" title="Afegir exercici">
        <span class="material-symbols-outlined">add</span>
      </button>
    }

    <!-- ── Bottom bar: quick-open workouts (dashboard) ── -->
    @if (!activeWorkout() && dateWorkouts().length > 0) {
      <div class="bottom-bar" [class.bottom-bar--multi]="dateWorkouts().length > 1">
        @for (w of dateWorkouts(); track w.id) {
          <button class="bar-shortcut"
                  [style.--wc]="workoutPrimaryColor(w)"
                  (click)="openWorkout(w.id)">
            <span class="material-symbols-outlined bar-shortcut-icon">fitness_center</span>
            <div class="bar-shortcut-info">
              <span class="bar-shortcut-label">{{ workoutLabel(w) }}</span>
              <span class="bar-shortcut-detail">
                {{ w.entries.length }} exerc
                @if (workoutSetsCount(w); as n) { · {{ n }} sèr }
              </span>
            </div>
            <span class="material-symbols-outlined bar-shortcut-arrow">arrow_forward_ios</span>
          </button>
        }
      </div>
    }

    <!-- ── Template picker bottom sheet ── -->
    @if (pickerCat()) {
      <div class="tp-backdrop" (click)="closePicker()"></div>
      <div class="tp-sheet">
        <div class="tp-header">
          <div class="tp-header-left">
            <div class="tp-dot" [style.background]="pickerColor()"></div>
            <span class="tp-title">{{ pickerLabel() }}</span>
          </div>
          <button class="tp-close" (click)="closePicker()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <button class="tp-option tp-option--primary" (click)="pickerStartEmpty()">
          <span class="material-symbols-outlined tp-opt-icon">add_circle</span>
          <div class="tp-opt-info">
            <span class="tp-opt-name">Entrenament buit</span>
            <span class="tp-opt-sub">Comença de zero</span>
          </div>
        </button>

        @if (pickerLast()) {
          <button class="tp-option" (click)="pickerStartFromLast()">
            <span class="material-symbols-outlined tp-opt-icon">history</span>
            <div class="tp-opt-info">
              <span class="tp-opt-name">Repetir últim</span>
              <span class="tp-opt-sub">{{ pickerLastAgo() }} · {{ pickerLast()!.entries.length }} exercici{{ pickerLast()!.entries.length === 1 ? '' : 's' }}</span>
            </div>
          </button>
        }

        @if (pickerUserTemplates().length) {
          <div class="tp-section">Les meves plantilles</div>
          @for (t of pickerUserTemplates(); track t.id) {
            <button class="tp-option" (click)="pickerStartFromTemplate(t)">
              <span class="material-symbols-outlined tp-opt-icon">bookmark</span>
              <div class="tp-opt-info">
                <span class="tp-opt-name">{{ t.name }}</span>
                <span class="tp-opt-sub">{{ t.entries.length ? t.entries.length + ' exercici' + (t.entries.length === 1 ? '' : 's') : 'Sense exercicis' }}</span>
              </div>
            </button>
          }
        }

        @if (pickerBuiltIns().length) {
          <div class="tp-section">Suggeriments</div>
          @for (t of pickerBuiltIns(); track t.id) {
            <button class="tp-option" (click)="pickerStartFromBuiltIn(t)">
              <span class="material-symbols-outlined tp-opt-icon">auto_awesome</span>
              <div class="tp-opt-info">
                <span class="tp-opt-name">{{ t.name }}</span>
                <span class="tp-opt-sub">{{ t.exerciseNames.length }} exercicis</span>
              </div>
            </button>
          }
        }

        <button class="tp-manage" (click)="goToTemplates()">
          <span>Gestionar plantilles</span>
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>
    }

    <!-- ── Session logger bottom sheet ── -->
    @if (loggerSport()) {
      <div class="sl-backdrop" (click)="closeSessionLogger()"></div>
      <div class="sl-sheet">
        <div class="sl-header">
          <div class="sl-header-left">
            <span class="material-symbols-outlined sl-sport-icon" [style.color]="loggerSport()!.color">
              {{ loggerSport()!.icon }}
            </span>
            <span class="sl-sport-name">{{ loggerSport()!.name }}</span>
          </div>
          <button class="sl-close" (click)="closeSessionLogger()">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <!-- Duration -->
        <div class="sl-field">
          <span class="sl-field-label">Durada</span>
          <div class="sl-row">
            <div class="sl-quick-btns">
              @for (t of durationPresets; track t) {
                <button class="sl-quick-btn" [class.active]="loggerDuration() === t"
                        (click)="loggerDuration.set(t)">{{ t }}min</button>
              }
            </div>
            <div class="sl-stepper">
              <button class="sl-step-btn" (click)="adjustDuration(-5)">−5</button>
              <span class="sl-step-val">{{ loggerDuration() }}<small>min</small></span>
              <button class="sl-step-btn" (click)="adjustDuration(5)">+5</button>
            </div>
          </div>
        </div>

        <!-- Subtypes (if any) -->
        @if (loggerSport()!.subtypes.length) {
          <div class="sl-field">
            <span class="sl-field-label">Subtipus</span>
            <div class="sl-chips">
              @for (sub of loggerSport()!.subtypes; track sub.id) {
                <button class="sl-chip" [class.active]="loggerSubtype() === sub.id"
                        (click)="toggleSubtype(sub.id)">{{ sub.name }}</button>
              }
            </div>
          </div>
        }

        <!-- Metric fields -->
        @for (def of loggerSport()!.metricDefs; track def.key) {
          <div class="sl-field">
            <span class="sl-field-label">{{ def.label }}@if (def.unit) { <small>({{ def.unit }})</small> }</span>
            @if (def.type === 'select') {
              <div class="sl-chips">
                @for (opt of def.options ?? []; track opt.value) {
                  <button class="sl-chip"
                          [class.active]="loggerMetric(def.key) === opt.value"
                          (click)="setMetric(def.key, loggerMetric(def.key) === opt.value ? null : opt.value)">
                    {{ opt.label }}
                  </button>
                }
              </div>
            } @else {
              <div class="sl-stepper">
                <button class="sl-step-btn" (click)="adjustMetric(def, -1)">−</button>
                <span class="sl-step-val">{{ loggerMetricNum(def) }}<small>@if (def.unit) { {{ def.unit }} }</small></span>
                <button class="sl-step-btn" (click)="adjustMetric(def, 1)">+</button>
              </div>
            }
          </div>
        }

        <!-- Feeling -->
        <div class="sl-field">
          <span class="sl-field-label">Sensació</span>
          <div class="sl-feeling-row">
            @for (level of feelingLevels; track level) {
              <button class="sl-feeling-btn" [class.active]="loggerFeeling() === level"
                      (click)="toggleFeeling(level)">
                {{ feelingEmoji(level) }}
              </button>
            }
          </div>
        </div>

        <!-- Notes -->
        <div class="sl-field">
          <span class="sl-field-label">Notes</span>
          <textarea class="sl-notes"
            placeholder="Afegeix una nota opcional..."
            [value]="loggerNotes()"
            (input)="loggerNotes.set($any($event.target).value)"
            rows="2"
          ></textarea>
        </div>

        <!-- Footer actions -->
        <div class="sl-actions">
          @if (loggerSessionId()) {
            <button class="sl-delete-btn" (click)="deleteLoggerSession()">
              <span class="material-symbols-outlined">delete</span>
              Eliminar
            </button>
          }
          <div class="sl-main-actions">
            <button class="sl-cancel" (click)="closeSessionLogger()">Cancel·lar</button>
            <button class="sl-save" (click)="saveSession()" [disabled]="sportToggling()">
              Guardar
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .page { padding: 0 0 84px; }

    /* ── Workout topbar (active mode, sticky) ── */
    .workout-topbar {
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px 12px;
      background: var(--c-card);
      box-shadow: 0 2px 8px var(--c-shadow);
    }
    .topbar-back {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; flex-shrink: 0; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-hover); }
    }
    .topbar-center {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
    }
    .topbar-badges {
      display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
    }
    .topbar-meta {
      font-size: 11px; color: var(--c-text-2); font-weight: 500;
    }
    .topbar-delete {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; flex-shrink: 0; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(239,83,80,0.1); color: #ef5350; }
    }

    /* ── Type badges (topbar) ── */
    .type-badge {
      padding: 3px 10px; border-radius: 10px;
      font-size: 12px; font-weight: 600; color: var(--c-card);
    }
    .hybrid-badge {
      padding: 3px 10px; border-radius: 10px;
      font-size: 11px; font-weight: 700;
      background: linear-gradient(90deg, #ef5350 0%, #9c27b0 50%, #2196f3 100%);
      color: var(--c-card); letter-spacing: 0.3px;
    }

    /* ── Bottom bar: last workout shortcut ── */
    .bottom-bar {
      position: fixed;
      bottom: calc(64px + env(safe-area-inset-bottom) + 10px);
      left: 12px; right: 12px;
      z-index: 90;
      border-radius: 22px;
      box-shadow: 0 8px 28px var(--c-shadow-md), 0 2px 6px var(--c-shadow);
      animation: bar-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes bar-in {
      from { transform: translateY(14px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .bottom-bar--multi {
      border-radius: 20px;
      background: var(--c-card);
      border: 1.5px solid var(--c-border-2);
      overflow: hidden;
      .bar-shortcut {
        border-radius: 0; border: none;
        border-bottom: 1px solid var(--c-border-2);
        &:last-child { border-bottom: none; }
      }
    }
    .bar-shortcut {
      width: 100%; display: flex; align-items: center; gap: 12px;
      border: 2px solid color-mix(in srgb, var(--wc) 22%, var(--c-border));
      background: color-mix(in srgb, var(--wc) 10%, var(--c-card));
      border-radius: 22px;
      padding: 14px 16px;
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s, transform 0.1s;
      &:hover  { background: color-mix(in srgb, var(--wc) 16%, var(--c-card)); }
      &:active { transform: scale(0.98); }
    }
    .bar-shortcut-icon {
      font-size: 26px; flex-shrink: 0;
      color: var(--wc);
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .bar-shortcut-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
    }
    .bar-shortcut-label {
      font-size: 15px; font-weight: 800; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .bar-shortcut-detail { font-size: 12px; font-weight: 500; color: var(--c-text-2); }
    .bar-shortcut-arrow { font-size: 18px; flex-shrink: 0; color: var(--wc); opacity: 0.7; }

    /* ── Type grid (inside workout-section) ── */
    .type-grid {
      display: grid; gap: 10px;
      &.type-grid--mt { margin-top: 10px; }
    }
    .type-btn {
      display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 16px 4px 14px;
      border: 2px solid color-mix(in srgb, var(--cat-color) 40%, var(--c-border));
      border-radius: 16px;
      background: color-mix(in srgb, var(--cat-color) 4%, var(--c-card));
      cursor: pointer;
      color: color-mix(in srgb, var(--cat-color) 70%, var(--c-text));
      transition: all 0.18s; touch-action: manipulation;
      &:hover {
        border-color: var(--cat-color);
        background: color-mix(in srgb, var(--cat-color) 10%, var(--c-card));
        transform: translateY(-1px);
      }
      &:active { transform: scale(0.97); }
      .type-icon { font-size: 28px; }
      .type-label { font-size: 11px; font-weight: 700; letter-spacing: 0.2px; text-align: center; }
      &.type-btn--done {
        border-color: var(--cat-color);
        background: color-mix(in srgb, var(--cat-color) 10%, var(--c-card));
        position: relative;
      }
    }
    .type-done-check {
      position: absolute; top: 6px; right: 7px;
      font-size: 15px;
      color: var(--cat-color);
      font-variation-settings: 'FILL' 1;
    }

    /* ── Add-exercise FAB (active workout mode) ── */
    .add-exercise-fab {
      position: fixed;
      bottom: calc(64px + env(safe-area-inset-bottom) + 16px);
      right: 20px;
      z-index: 90;
      width: 52px; height: 52px; border-radius: 50%; border: none;
      background: var(--c-brand); color: var(--c-card);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px rgba(var(--c-brand-rgb), 0.4), 0 1px 4px var(--c-shadow);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 26px; }
      &:hover { background: var(--c-brand-dk); transform: scale(1.06); }
      &:active { transform: scale(0.96); }
    }

    /* ── Loading ── */
    .loading-state {
      display: flex; justify-content: center; padding: 48px;
      .material-symbols-outlined { font-size: 32px; color: var(--c-border); }
    }

    /* ── Workout section (dashboard) ── */
    .workout-section {
      margin: 12px 16px 0;
      padding: 14px 14px 16px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }

    /* ── Workout summary cards ── */
    .workout-card {
      display: flex; align-items: center;
      margin-bottom: 8px;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden;
      cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s;
      touch-action: manipulation;
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
    }
    .wc-bar {
      width: 5px; align-self: stretch; flex-shrink: 0;
    }
    .wc-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
      padding: 10px 10px;
    }
    .wc-label {
      font-size: 13px; font-weight: 700; color: var(--c-text);
    }
    .wc-detail {
      font-size: 11px; color: var(--c-text-2);
    }
    .wc-delete {
      width: 40px; height: 40px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-border); transition: color 0.15s; touch-action: manipulation;
      margin-right: 4px;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { color: #ef5350; }
    }

    /* ── Template picker bottom sheet ── */
    .tp-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.4);
    }
    .tp-sheet {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: var(--c-card); border-radius: 20px 20px 0 0;
      padding: 20px 16px 40px;
      box-shadow: 0 -4px 24px var(--c-shadow-md);
      max-height: 80vh; overflow-y: auto;
      animation: tp-in 0.25s cubic-bezier(0.32, 1.2, 0.64, 1) both;
    }
    @keyframes tp-in {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
    .tp-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .tp-header-left { display: flex; align-items: center; gap: 10px; }
    .tp-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .tp-title { font-size: 18px; font-weight: 800; color: var(--c-text); }
    .tp-close {
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: var(--c-subtle); cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
    }
    .tp-section {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.5px;
      padding: 10px 4px 6px;
    }
    .tp-option {
      display: flex; align-items: center; gap: 12px;
      width: 100%; padding: 13px 12px; border-radius: 12px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      text-align: left; cursor: pointer; touch-action: manipulation;
      transition: all 0.15s; margin-bottom: 6px;
      &:hover { background: var(--c-subtle); border-color: var(--c-border); }
      &:active { transform: scale(0.98); }
    }
    .tp-option--primary {
      border-color: rgba(var(--c-brand-rgb), 0.3);
      background: rgba(var(--c-brand-rgb), 0.04);
      .tp-opt-icon { color: var(--c-brand); }
      &:hover { background: rgba(var(--c-brand-rgb), 0.1); border-color: var(--c-brand); }
    }
    .tp-opt-icon { font-size: 22px; color: var(--c-text-3); flex-shrink: 0; }
    .tp-opt-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .tp-opt-name { font-size: 15px; font-weight: 600; color: var(--c-text); }
    .tp-opt-sub  { font-size: 12px; color: var(--c-text-3); }
    .tp-manage {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; padding: 14px 12px; border-radius: 12px;
      border: none; background: transparent;
      color: var(--c-text-2); font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; margin-top: 4px;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; color: var(--c-text-3); }
      &:hover { background: var(--c-subtle); }
    }

    /* ── Sports section ── */
    .sports-section {
      margin: 12px 16px 0;
      padding: 14px 14px 16px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }

    .sports-header {
      display: flex; align-items: center; gap: 7px;
      margin-bottom: 14px;
    }
    .sports-header-icon {
      font-size: 18px; color: var(--c-text-2);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .sports-title {
      margin: 0; font-size: 14px; font-weight: 700;
      color: var(--c-text-2); letter-spacing: 0.2px;
    }

    .sports-grid {
      display: grid; gap: 10px;
    }

    .sport-btn {
      position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 16px 4px 14px;
      border: 1.5px solid color-mix(in srgb, var(--sport-color) 30%, var(--c-border));
      border-radius: 16px;
      background: var(--c-card);
      color: color-mix(in srgb, var(--sport-color) 65%, var(--c-text));
      cursor: pointer; touch-action: manipulation;
      transition: all 0.18s ease;

      &:hover:not(:disabled) {
        border-color: var(--sport-color);
        background: color-mix(in srgb, var(--sport-color) 6%, var(--c-card));
        transform: translateY(-1px);
      }
      &:active:not(:disabled) { transform: scale(0.97); }

      &.active {
        border-color: var(--sport-color);
        background: color-mix(in srgb, var(--sport-color) 10%, var(--c-card));
      }
      &:disabled { opacity: 0.65; cursor: default; }
    }

    .sport-icon {
      font-size: 28px;
      font-variation-settings: 'FILL' 0, 'wght' 300;
      transition: font-variation-settings 0.15s;
      .active & { font-variation-settings: 'FILL' 1, 'wght' 400; }
    }

    .sport-name {
      font-size: 11px; font-weight: 700; letter-spacing: 0.2px;
      text-align: center; line-height: 1.1;
    }

    .sport-check {
      position: absolute; top: 6px; right: 6px;
      font-size: 15px;
      color: var(--sport-color);
      font-variation-settings: 'FILL' 1, 'wght' 500;
    }

    .sport-subtype-label {
      font-size: 10px; font-weight: 600; color: var(--sport-color);
      text-align: center; line-height: 1.1;
      max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ── Subtype picker row ── */
    .subtype-row {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      padding: 10px 2px 2px;
    }
    .subtype-row-label {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      flex-shrink: 0;
    }
    .subtype-chip {
      padding: 5px 12px;
      border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active {
        background: var(--c-brand); color: var(--c-card); border-color: var(--c-brand);
      }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }

    /* ── Skeleton screens ── */
    @keyframes sk-shimmer {
      from { background-position: -300px 0; }
      to   { background-position: calc(300px + 100%) 0; }
    }
    .sk {
      background: linear-gradient(90deg, var(--c-border-2) 0%, var(--c-border) 40%, var(--c-border-2) 80%);
      background-size: 600px 100%;
      animation: sk-shimmer 1.5s ease-in-out infinite;
      border-radius: 8px;
    }
    .sk-workout-section, .sk-sports-section {
      margin: 12px 16px 0;
      padding: 14px 14px 16px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .sk-section-header {
      display: flex; align-items: center; gap: 7px;
      margin-bottom: 14px;
    }
    .sk-icon-ph  { width: 18px; height: 18px; border-radius: 4px; flex-shrink: 0; }
    .sk-title-ph { width: 90px; height: 13px; }
    .sk-card-ph {
      display: flex; align-items: stretch;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      overflow: hidden; margin-bottom: 12px;
    }
    .sk-card-bar { width: 5px; min-height: 52px; flex-shrink: 0; border-radius: 0; }
    .sk-card-body {
      flex: 1; padding: 10px;
      display: flex; flex-direction: column; gap: 7px;
    }
    .sk-line      { height: 12px; }
    .sk-line--55  { width: 55%; }
    .sk-line--30  { width: 30%; height: 10px; }
    .sk-btn-grid  { display: flex; gap: 10px; }
    .sk-btn-ph    { flex: 1; height: 74px; border-radius: 16px; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spin { animation: spin 1s linear infinite; }

    /* ── Sport summary line ── */
    .sport-summary {
      font-size: 10px; font-weight: 600; color: var(--sport-color);
      text-align: center; line-height: 1.1;
    }

    /* ── Session logger bottom sheet ── */
    .sl-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.4);
      animation: fade-in 0.18s ease;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

    .sl-sheet {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: white; border-radius: 24px 24px 0 0;
      padding: 0 16px calc(env(safe-area-inset-bottom) + 16px);
      max-height: 85vh; overflow-y: auto;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.14);
      animation: sheet-up 0.22s cubic-bezier(0.34, 1.2, 0.64, 1);
    }
    @keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

    .sl-header {
      display: flex; align-items: center;
      padding: 16px 0 12px; border-bottom: 1px solid #f0f0f0; margin-bottom: 12px;
    }
    .sl-header-left { flex: 1; display: flex; align-items: center; gap: 10px; }
    .sl-sport-icon {
      font-size: 26px;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .sl-sport-name { font-size: 17px; font-weight: 800; color: #1a1a1a; }
    .sl-close {
      width: 34px; height: 34px; border-radius: 50%; border: none;
      background: #f0f0f0; cursor: pointer; color: #555;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; flex-shrink: 0;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: #e0e0e0; }
    }

    .sl-field { margin-bottom: 16px; }
    .sl-field-label {
      display: block; font-size: 12px; font-weight: 700; color: #666;
      letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 8px;
      small { font-size: 11px; color: #999; font-weight: 400; text-transform: none; margin-left: 4px; }
    }
    .sl-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .sl-quick-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .sl-quick-btn {
      padding: 6px 12px; border: 1.5px solid #e0e0e0; border-radius: 20px;
      background: white; font-size: 13px; font-weight: 600; color: #555;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: #006874; color: white; border-color: #006874; }
      &:hover:not(.active) { border-color: #006874; color: #006874; }
    }
    .sl-stepper { display: flex; align-items: center; gap: 6px; }
    .sl-step-btn {
      width: 34px; height: 34px; border-radius: 10px;
      border: 1.5px solid #e0e0e0; background: white;
      font-size: 14px; font-weight: 700; color: #555;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &:hover { border-color: #006874; color: #006874; }
    }
    .sl-step-val {
      min-width: 52px; text-align: center;
      font-size: 18px; font-weight: 800; color: #1a1a1a;
      small { font-size: 11px; color: #888; margin-left: 2px; }
    }
    .sl-chips { display: flex; gap: 7px; flex-wrap: wrap; }
    .sl-chip {
      padding: 7px 14px; border: 1.5px solid #e0e0e0; border-radius: 20px;
      background: white; font-size: 13px; font-weight: 600; color: #555;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: #006874; color: white; border-color: #006874; }
      &:hover:not(.active) { border-color: #006874; color: #006874; }
    }
    .sl-feeling-row { display: flex; gap: 8px; }
    .sl-feeling-btn {
      flex: 1; height: 44px; border-radius: 12px;
      border: 1.5px solid #e8e8e8; background: #fafafa;
      font-size: 22px; cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &.active { border-color: #006874; background: rgba(0,104,116,0.08); transform: scale(1.1); }
      &:hover:not(.active) { border-color: #aaa; background: #f0f0f0; }
    }
    .sl-notes {
      width: 100%; box-sizing: border-box;
      padding: 9px 12px; border: 1.5px solid #e0e0e0; border-radius: 10px;
      font-size: 13px; font-family: inherit; color: #333; resize: none;
      outline: none; transition: border-color 0.15s;
      &:focus { border-color: #006874; }
      &::placeholder { color: #bbb; }
    }
    .sl-actions {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 0 4px; border-top: 1px solid #f0f0f0; margin-top: 4px;
    }
    .sl-delete-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 0 12px; height: 40px; border-radius: 10px;
      border: 1.5px solid rgba(239,83,80,0.3); background: rgba(239,83,80,0.06);
      color: #ef5350; font-size: 12px; font-weight: 700;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { background: rgba(239,83,80,0.12); border-color: #ef5350; }
    }
    .sl-main-actions { display: flex; gap: 8px; flex: 1; justify-content: flex-end; }
    .sl-cancel {
      height: 40px; padding: 0 18px; border-radius: 10px;
      border: 1.5px solid #e0e0e0; background: white;
      font-size: 14px; font-weight: 600; color: #666;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: #aaa; color: #333; }
    }
    .sl-save {
      height: 40px; padding: 0 22px; border-radius: 10px;
      border: none; background: #006874; color: white;
      font-size: 14px; font-weight: 700;
      cursor: pointer; transition: background 0.15s; touch-action: manipulation;
      &:hover:not(:disabled) { background: #005a63; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  `],
})
export class TrainComponent {
  readonly workoutService  = inject(WorkoutService);
  readonly sportService    = inject(SportService);
  private exerciseService  = inject(ExerciseService);
  private templateService  = inject(TemplateService);
  private router           = inject(Router);
  private dialog           = inject(MatDialog);
  private snackBar         = inject(MatSnackBar);

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  readonly selectedDate    = signal<string>(TODAY());
  readonly sportToggling   = signal(false);
  readonly workoutTypes    = WORKOUT_TYPES;
  readonly activeWorkoutId = signal<string | null>(null);
  readonly loggerSport     = signal<Sport | null>(null);
  readonly loggerSessionId = signal<string | null>(null);
  readonly loggerDuration  = signal<number>(60);
  readonly loggerSubtype   = signal<string | null>(null);
  readonly loggerFeeling   = signal<FeelingLevel | null>(null);
  readonly loggerMetrics   = signal<Record<string, string | number>>({});
  readonly loggerNotes     = signal<string>('');
  readonly creating        = signal(false);

  readonly isToday = computed(() => this.selectedDate() === TODAY());

  readonly dateWorkouts = computed(() =>
    this.workoutService.getWorkoutsForDate(this.selectedDate())
  );

  readonly activeWorkout = computed((): Workout | null => {
    const id = this.activeWorkoutId();
    if (!id) return null;
    return this.dateWorkouts().find(w => w.id === id) ?? null;
  });

  readonly activeWorkoutCategories = computed((): string[] => {
    const w = this.activeWorkout();
    return w ? workoutCategories(w) : [];
  });

  readonly activeWorkoutCategoryItems = computed(() =>
    this.activeWorkoutCategories()
      .map(c => WORKOUT_TYPES.find(t => t.value === c))
      .filter((t): t is typeof WORKOUT_TYPES[0] => !!t)
  );

  readonly doneCategories = computed((): Set<string> =>
    new Set(this.dateWorkouts().flatMap(w => workoutCategories(w)))
  );

  readonly pickerCat = signal<ExerciseCategory | null>(null);

  readonly pickerLast = computed(() => {
    const cat = this.pickerCat();
    return cat ? this.workoutService.getLastWorkoutByCategory(cat) : null;
  });

  readonly pickerLabel = computed(() => {
    const cat = this.pickerCat();
    return cat ? (WORKOUT_TYPES.find(t => t.value === cat)?.label ?? '') : '';
  });

  readonly pickerColor = computed(() => {
    const cat = this.pickerCat();
    return cat ? CATEGORY_COLORS[cat] : '';
  });

  readonly pickerLastAgo = computed(() => {
    const last = this.pickerLast();
    if (!last) return '';
    const diffDays = Math.round(
      (new Date(TODAY() + 'T12:00:00').getTime() - new Date(last.date + 'T12:00:00').getTime())
      / 86_400_000
    );
    if (diffDays === 0) return 'avui';
    if (diffDays === 1) return 'ahir';
    if (diffDays < 7)  return `fa ${diffDays} dies`;
    if (diffDays < 14) return 'fa una setmana';
    return `fa ${Math.round(diffDays / 7)} setmanes`;
  });

  readonly pickerUserTemplates = computed(() => {
    const cat = this.pickerCat();
    return cat ? this.templateService.forCategory(cat) : [];
  });

  readonly pickerBuiltIns = computed(() => {
    const cat = this.pickerCat();
    if (!cat) return [];
    return BUILT_IN_TEMPLATES.filter(t => t.category === cat);
  });

  constructor() {
    effect(() => {
      const date = this.selectedDate();
      const [yearStr, monthStr] = date.split('-');
      const year  = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      this.workoutService.ensureMonthLoaded(year, month);
      this.sportService.ensureMonthLoaded(year, month);
      untracked(() => {
        this.activeWorkoutId.set(null);
        this.pickerCat.set(null);
        this.loggerSport.set(null);
      });
    });
  }

  // ── Workout navigation ────────────────────────────────────────────────────

  openWorkout(id: string): void {
    this.activeWorkoutId.set(id);
    this.pickerCat.set(null);
  }

  closeWorkout(): void {
    this.activeWorkoutId.set(null);
    this.editor?.reset();
  }

  topbarDateLabel(w: Workout): string {
    const d = new Date(w.date + 'T12:00:00');
    if (w.date === this.selectedDate() && this.isToday()) return 'Avui';
    return d.toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  workoutLabel(w: Workout): string {
    const cats = workoutCategories(w);
    if (!cats.length) return 'Entrenament';
    return cats.map(c => CATEGORY_LABELS[c as ExerciseCategory] ?? c).join(' + ');
  }

  private _brand(): string {
    return getComputedStyle(document.documentElement).getPropertyValue('--c-brand').trim() || '#006874';
  }

  workoutCardColor(w: Workout): string {
    const cats = workoutCategories(w);
    if (!cats.length) return this._brand();
    if (cats.length === 1) return CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? this._brand();
    const fallback = this._brand();
    const colors = cats.map(c => CATEGORY_COLORS[c as ExerciseCategory] ?? fallback);
    const step = 100 / colors.length;
    return `linear-gradient(180deg, ${colors.map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`).join(', ')})`;
  }

  gridCols(count: number): string {
    return `repeat(${count % 2 === 0 ? 2 : 3}, 1fr)`;
  }

  workoutPrimaryColor(w: Workout): string {
    const cats   = workoutCategories(w);
    const brand  = this._brand();
    return cats.length ? (CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? brand) : brand;
  }

  workoutSetsCount(w: Workout): number {
    return w.entries.reduce((sum, e) => sum + e.sets.length, 0);
  }

  async deleteActiveWorkout(): Promise<void> {
    if (!confirm('Eliminar l\'entrenament?')) return;
    const w = this.activeWorkout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.activeWorkoutId.set(null);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async confirmDeleteWorkout(w: Workout): Promise<void> {
    if (!confirm(`Eliminar "${this.workoutLabel(w)}"?`)) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  // ── Workout creation ──────────────────────────────────────────────────────

  selectType(category: ExerciseCategory): void {
    this.pickerCat.set(category);
  }

  closePicker(): void { this.pickerCat.set(null); }

  async pickerStartEmpty(): Promise<void> {
    const cat = this.pickerCat();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    try {
      const id = await this.workoutService.createWorkoutForDate(this.selectedDate(), cat);
      this.openWorkout(id);
    } catch {
      this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
    } finally { this.creating.set(false); }
  }

  async pickerStartFromLast(): Promise<void> {
    const cat  = this.pickerCat();
    const last = this.pickerLast();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    try {
      const id = await this.workoutService.createWorkoutFromTemplate(
        this.selectedDate(), cat, last?.entries ?? []
      );
      this.openWorkout(id);
    } catch {
      this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
    } finally { this.creating.set(false); }
  }

  async pickerStartFromTemplate(t: WorkoutTemplate): Promise<void> {
    const cat = this.pickerCat();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    try {
      const useCat = t.category === 'mixed' ? cat : t.category as ExerciseCategory;
      const entries: WorkoutEntry[] = t.entries.map(e => ({ ...e, sets: [] }));
      const id = await this.workoutService.createWorkoutFromTemplate(
        this.selectedDate(), useCat, entries
      );
      this.openWorkout(id);
    } catch {
      this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
    } finally { this.creating.set(false); }
  }

  async pickerStartFromBuiltIn(t: BuiltInTemplate): Promise<void> {
    const cat = this.pickerCat();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    try {
      const exercises = this.exerciseService.exercises();
      const entries: WorkoutEntry[] = t.exerciseNames
        .map(name => exercises.find(e => e.name === name))
        .filter((e): e is Exercise => e !== undefined)
        .map(e => ({ exerciseId: e.id, exerciseName: e.name, sets: [] }));
      const id = await this.workoutService.createWorkoutFromTemplate(
        this.selectedDate(), cat, entries
      );
      this.openWorkout(id);
    } catch {
      this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
    } finally { this.creating.set(false); }
  }

  goToTemplates(): void {
    this.closePicker();
    this.router.navigate(['/templates']);
  }

  maxWeight(entry: WorkoutEntry): number {
    return entry.sets.length ? Math.max(...entry.sets.map(s => s.weight)) : 0;
  }

  openPicker(newCategory?: ExerciseCategory): void {
    const w               = this.activeWorkout();
    const excludeIds      = w?.entries.map(e => e.exerciseId) ?? [];
    const defaultCategory = (newCategory ?? w?.category) as ExerciseCategory | undefined;

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds, defaultCategory }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = w?.id;
        if (!workoutId) {
          workoutId = await this.workoutService.createWorkoutForDate(this.selectedDate(), defaultCategory);
          this.activeWorkoutId.set(workoutId);
        }

        await this.workoutService.addExerciseToWorkout(workoutId, {
          exerciseId: exercise.id, exerciseName: exercise.name, sets: [],
        });

        setTimeout(() => {
          this.editor?.startAddSet({ exerciseId: exercise.id, exerciseName: exercise.name, sets: [] });
        }, 0);
      } catch {
        this.snackBar.open('Error en afegir l\'exercici', '', { duration: 3000 });
      }
    });
  }

  // ── Sport helpers ─────────────────────────────────────────────────────────

  isSportDone(sportId: string): boolean {
    return this.sportService.hasSportOnDate(this.selectedDate(), sportId);
  }

  sessionSummary(sportId: string): string | null {
    const s = this.sportService.getSessionForDate(this.selectedDate(), sportId);
    if (!s) return null;
    const parts: string[] = [];
    if (s.duration) parts.push(`${s.duration}min`);
    if (s.feeling)  parts.push(FEELING_EMOJI[s.feeling]);
    return parts.length ? parts.join(' ') : null;
  }

  // ── Session logger ────────────────────────────────────────────────────────

  readonly durationPresets: number[] = [30, 45, 60, 90];
  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  openSessionLogger(sport: Sport): void {
    const existing = this.sportService.getSessionForDate(this.selectedDate(), sport.id);
    this.loggerSport.set(sport);
    this.loggerSessionId.set(existing?.id ?? null);
    this.loggerDuration.set(existing?.duration ?? 60);
    this.loggerSubtype.set(existing?.subtypeId ?? null);
    this.loggerFeeling.set(existing?.feeling ?? null);
    this.loggerMetrics.set({ ...(existing?.metrics ?? {}) });
    this.loggerNotes.set(existing?.notes ?? '');
  }

  closeSessionLogger(): void { this.loggerSport.set(null); }

  feelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }

  loggerMetric(key: string): string | number | null {
    return this.loggerMetrics()[key] ?? null;
  }

  loggerMetricNum(def: SportMetricDef): number {
    const v = this.loggerMetrics()[def.key];
    return typeof v === 'number' ? v : (def.min ?? 0);
  }

  adjustMetric(def: SportMetricDef, delta: number): void {
    const step = def.step ?? 1;
    const next = Math.max(def.min ?? 0, Math.min(def.max ?? 9999, this.loggerMetricNum(def) + delta * step));
    this.loggerMetrics.update(m => ({ ...m, [def.key]: next }));
  }

  setMetric(key: string, value: string | number | null): void {
    this.loggerMetrics.update(m => {
      const copy = { ...m };
      if (value === null) delete copy[key]; else copy[key] = value;
      return copy;
    });
  }

  toggleSubtype(id: string): void {
    this.loggerSubtype.update(v => v === id ? null : id);
  }

  adjustDuration(delta: number): void {
    this.loggerDuration.update(v => Math.max(5, v + delta));
  }

  toggleFeeling(level: FeelingLevel): void {
    this.loggerFeeling.update(v => v === level ? null : level);
  }

  async saveSession(): Promise<void> {
    const sport = this.loggerSport();
    if (!sport) return;
    this.sportToggling.set(true);
    try {
      const date = this.selectedDate();
      const metrics = this.loggerMetrics();
      const data = {
        subtypeId: this.loggerSubtype() ?? undefined,
        duration:  this.loggerDuration() || undefined,
        feeling:   this.loggerFeeling() ?? undefined,
        metrics:   Object.keys(metrics).length ? metrics : undefined,
        notes:     this.loggerNotes().trim() || undefined,
      };
      const existingId = this.loggerSessionId();
      if (existingId) {
        await this.sportService.updateSession(existingId, date, data);
      } else {
        await this.sportService.logSession(date, sport.id, data);
      }
      this.closeSessionLogger();
    } catch {
      this.snackBar.open('Error en guardar', '', { duration: 2500 });
    } finally {
      this.sportToggling.set(false);
    }
  }

  async deleteLoggerSession(): Promise<void> {
    const id = this.loggerSessionId();
    if (!id) return;
    this.sportToggling.set(true);
    try {
      await this.sportService.deleteSession(id, this.selectedDate());
      this.closeSessionLogger();
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2500 });
    } finally {
      this.sportToggling.set(false);
    }
  }
}
