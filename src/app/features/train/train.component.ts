import { Component, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { workoutCategories, mondayOf, addDays } from '../../shared/utils/calendar-utils';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { TrainerService } from '../../core/services/trainer.service';
import { AuthService } from '../../core/services/auth.service';

import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, CATEGORY_MUSCLES,
  Exercise, ExerciseCategory,
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
import { WeeklySummaryComponent } from './components/weekly-summary.component';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';

const TODAY = (): string => new Date().toISOString().split('T')[0];

type GymSuggestion   = { type: 'gym';   category: ExerciseCategory; label: string; color: string; icon: string };
type SportSuggestion = { type: 'sport'; sport: Sport;               label: string; color: string; icon: string };
type TodaySuggestion = GymSuggestion | SportSuggestion;

type BottomCard = {
  kind: 'workout' | 'suggestion' | 'plan';
  color: string;
  icon: string;
  label: string;
  meta: string;
  workoutId?: string;
  suggestion?: TodaySuggestion;
};

const WORKOUT_TYPES: { value: ExerciseCategory; label: string; icon: string; color: string }[] = [
  { value: 'push', label: CATEGORY_LABELS.push, icon: CATEGORY_ICONS.push, color: CATEGORY_COLORS.push },
  { value: 'pull', label: CATEGORY_LABELS.pull, icon: CATEGORY_ICONS.pull, color: CATEGORY_COLORS.pull },
  { value: 'legs', label: CATEGORY_LABELS.legs, icon: CATEGORY_ICONS.legs, color: CATEGORY_COLORS.legs },
];

@Component({
  selector: 'app-train',
  standalone: true,
  imports: [WorkoutEditorComponent, CalendarComponent, FitnessInsightsComponent, WeeklySummaryComponent],
  template: `
    <div class="page" [style.padding-bottom]="pagePaddingBottom()">

      @if (activeWorkout(); as w) {

        <!-- ══ ACTIVE WORKOUT MODE ══ -->

        <!-- Floating card header (same style as dashboard workout-card) -->
        <div class="workout-card aw-header-sticky" [style.--wc]="workoutPrimaryColor(w)">
          <div class="wc-bar" [style.background]="workoutCardColor(w)"></div>
          <div class="wc-info">
            <span class="wc-label">{{ workoutLabel(w) }}</span>
            <div class="wc-stats">
              <span class="wc-stat">
                <span class="material-symbols-outlined">fitness_center</span>
                <strong>{{ w.entries.length }}</strong> exerc
              </span>
              @if (topbarTotalSets(w); as n) {
                <span class="wc-stat-sep">·</span>
                <span class="wc-stat">
                  <span class="material-symbols-outlined">repeat</span>
                  <strong>{{ n }}</strong> sèr
                </span>
              }
              @if (workoutVolumeFmt(w); as vol) {
                <span class="wc-stat-sep">·</span>
                <span class="wc-stat wc-stat--vol">
                  <span class="material-symbols-outlined">weight</span>
                  <strong>{{ vol }}</strong>
                </span>
              }
            </div>
          </div>
          <div class="aw-header-right">
            <button class="aw-feeling-btn" (click)="$event.stopPropagation(); awFeelingOpen.set(!awFeelingOpen())"
                    [class.aw-feeling-btn--set]="w.feeling">
              @if (w.feeling) {
                <span class="aw-feeling-emoji">{{ emojiOf(w.feeling) }}</span>
              } @else {
                <span class="material-symbols-outlined">sentiment_neutral</span>
              }
            </button>
            <span class="aw-date">{{ topbarDateLabel(w) }}</span>
          </div>
        </div>

        <!-- Feeling picker (slides in below header) -->
        @if (awFeelingOpen()) {
          <div class="aw-feeling-row">
            @for (level of feelingLevels5; track level) {
              <button class="aw-feeling-opt" [class.active]="w.feeling === level"
                      (click)="pickWorkoutFeeling(w.id, level)">
                {{ emojiOf(level) }}
              </button>
            }
            @if (w.feeling) {
              <button class="aw-feeling-clear" (click)="pickWorkoutFeeling(w.id, undefined)">
                <span class="material-symbols-outlined">close</span>
              </button>
            }
          </div>
        }

        <app-workout-editor
          #editor
          [workout]="w"
          [editMode]="false"
          [alwaysEditable]="true"
          (requestAddExercise)="openPicker()"
        />

        <button class="aw-delete-fab" (click)="deleteActiveWorkout()">
          <span class="material-symbols-outlined">delete</span>
        </button>
        <button class="aw-back-fab" (click)="closeWorkout()">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>

      } @else {

        <!-- ══ DASHBOARD MODE ══ -->
        <header class="page-header">
          <div class="page-header-top">
            <h1>Entrenament</h1>
          </div>
        </header>

        <div class="calendar-wrap">
          <app-calendar
            [selectedDate]="selectedDate()"
            (dateSelected)="selectedDate.set($event)"
          />
        </div>
        <app-weekly-summary [weekAnchor]="selectedDate()" />

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

          <!-- ── Trainer proposal card ── -->
          @if (activeProposal(); as prop) {
            <div class="proposal-card">
              <div class="proposal-header">
                <span class="material-symbols-outlined proposal-icon">sports</span>
                <div class="proposal-header-info">
                  <span class="proposal-title">Proposta de l'entrenador</span>
                  @if (trainerService.myTrainer()?.displayName; as name) {
                    <span class="proposal-trainer">{{ name }}</span>
                  }
                </div>
              </div>
              <div class="proposal-exercises">
                @for (entry of prop.entries.slice(0, 4); track entry.exerciseName) {
                  <span class="proposal-ex">{{ entry.exerciseName }}</span>
                }
                @if (prop.entries.length > 4) {
                  <span class="proposal-ex proposal-ex--more">+{{ prop.entries.length - 4 }} més</span>
                }
              </div>
              @if (prop.notes) {
                <p class="proposal-notes">{{ prop.notes }}</p>
              }
              <div class="proposal-actions">
                <button class="proposal-accept" (click)="acceptProposal(prop)" [disabled]="acceptingProposal()">
                  @if (acceptingProposal()) {
                    <span class="material-symbols-outlined spin">sync</span>
                  } @else {
                    <span class="material-symbols-outlined">check</span>
                  }
                  Accepta
                </button>
                <button class="proposal-ignore" (click)="ignoreProposal()">
                  <span class="material-symbols-outlined">close</span>
                  Ignora
                </button>
              </div>
            </div>
          }

          <!-- Entrenaments section -->
          <!-- ── Entrenaments section ── -->
          <div class="workout-section">
            <div class="sports-header" (click)="gymCollapsed.set(!gymCollapsed())">
              <span class="material-symbols-outlined sports-header-icon">fitness_center</span>
              <h2 class="sports-title">Entrenaments</h2>
              @if (dateWorkouts().length > 0) {
                <span class="section-count-badge">{{ dateWorkouts().length }}</span>
              }
              <span class="material-symbols-outlined section-chevron"
                    [class.rotated]="gymCollapsed()">expand_more</span>
            </div>
            <div class="section-body" [class.collapsed]="gymCollapsed()">
              <div class="section-body-inner">
                <div class="sbi-content">
                  @for (w of dateWorkouts(); track w.id) {
                    <div class="workout-card" [style.--wc]="workoutPrimaryColor(w)" (click)="openWorkout(w.id)">
                      <div class="wc-bar" [style.background]="workoutCardColor(w)"></div>
                      <div class="wc-info">
                        <span class="wc-label">
                          {{ workoutLabel(w) }}
                          @if (w.feeling) {
                            <span class="wc-feeling">{{ emojiOf(w.feeling) }}</span>
                          }
                        </span>
                        <div class="wc-stats">
                          <span class="wc-stat">
                            <span class="material-symbols-outlined">fitness_center</span>
                            <strong>{{ w.entries.length }}</strong> exerc
                          </span>
                          @if (workoutSetsCount(w); as n) {
                            <span class="wc-stat-sep">·</span>
                            <span class="wc-stat">
                              <span class="material-symbols-outlined">repeat</span>
                              <strong>{{ n }}</strong> sèr
                            </span>
                          }
                          @if (workoutVolumeFmt(w); as vol) {
                            <span class="wc-stat-sep">·</span>
                            <span class="wc-stat wc-stat--vol">
                              <span class="material-symbols-outlined">weight</span>
                              <strong>{{ vol }}</strong>
                            </span>
                          }
                        </div>
                      </div>
                      <button class="wc-delete" (click)="$event.stopPropagation(); confirmDeleteWorkout(w)" title="Eliminar">
                        <span class="material-symbols-outlined">delete</span>
                      </button>
                    </div>
                  }
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
              </div>
            </div>
          </div>

          <!-- ── Planificació section ── -->
          <div class="plan-section" (click)="navigateToPlanner()">
            <div class="sports-header">
              <span class="material-symbols-outlined sports-header-icon">calendar_month</span>
              <h2 class="sports-title">Planifica el teu entrenament</h2>
              @if (upcomingPlansCount() > 0) {
                <span class="section-count-badge">{{ upcomingPlansCount() }}</span>
              }
              <span class="material-symbols-outlined section-chevron" style="transform:rotate(-90deg)">expand_more</span>
            </div>
          </div>

          <!-- ── Esports section ── -->
          <div class="sports-section">
            <div class="sports-header" (click)="sportsCollapsed.set(!sportsCollapsed())">
              <span class="material-symbols-outlined sports-header-icon">sports_soccer</span>
              <h2 class="sports-title">Esports</h2>
              @if (dateSportSessions().length > 0) {
                <span class="section-count-badge">{{ dateSportSessions().length }}</span>
              }
              <span class="material-symbols-outlined section-chevron"
                    [class.rotated]="sportsCollapsed()">expand_more</span>
            </div>
            <div class="section-body" [class.collapsed]="sportsCollapsed()">
              <div class="section-body-inner">
                <div class="sbi-content">
                  @if (sportService.sports().length > 0) {
                    <div class="type-grid"
                         [style.grid-template-columns]="gridCols(sportService.sports().length)">
                      @for (sport of sportService.sports(); track sport.id) {
                        <button class="type-btn"
                          [style.--cat-color]="sport.color"
                          [class.type-btn--done]="sportDoneMap().has(sport.id)"
                          (click)="openSessionLogger(sport)"
                          [disabled]="sportToggling()">
                          @if (sportDoneMap().has(sport.id)) {
                            <span class="type-done-check material-symbols-outlined">check_circle</span>
                          }
                          <span class="material-symbols-outlined type-icon">{{ sport.icon }}</span>
                          <span class="type-label">{{ sport.name }}</span>
                          @if (sportDoneMap().get(sport.id)?.subtypeId; as sid) {
                            <span class="type-sport-sub">{{ subtypeName(sport, sid) }}</span>
                          }
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>

        }
      }

    </div>

    <!-- ── Speed Dial FAB (dashboard only) ── -->
    @if (!activeWorkout()) {
    @if (speedDialOpen()) {
      <div class="sd-backdrop" (click)="speedDialOpen.set(false)"></div>
    }

    <!-- Bottom action row: activity/suggestion card + FAB -->
    <div class="bottom-bar">
      @if (bottomCard(); as bc) {
        <button class="suggestion-card" [class.sc--done]="bc.kind !== 'suggestion'"
                [style.--sc]="bc.color" (click)="handleBottomCardClick(bc)">
          <div class="sc-bar"></div>
          <div class="sc-icon-wrap">
            <span class="material-symbols-outlined sc-icon"
                  [class.sc-icon--fill]="bc.kind !== 'suggestion'">{{ bc.icon }}</span>
          </div>
          <div class="sc-info">
            <span class="sc-eyebrow">{{ bc.kind === 'suggestion' ? 'Avui toca' : bc.kind === 'plan' ? 'Pla pendent' : 'Fet avui' }}</span>
            <span class="sc-label">{{ bc.label }}</span>
          </div>
          @if (bc.kind === 'suggestion') {
            <span class="material-symbols-outlined sc-chevron">chevron_right</span>
          } @else if (bc.meta) {
            <span class="sc-stats">{{ bc.meta }}</span>
          }
        </button>
      }

      <div class="sd-container">
        @if (speedDialOpen()) {
          <div class="sd-items">
            @for (sport of sportService.sports(); track sport.id; let i = $index) {
              <div class="sd-item" [style.--sd-i]="i">
                <span class="sd-label">{{ sport.name }}</span>
                <button class="sd-btn" [style.background]="sport.color"
                  (click)="speedDialPickSport(sport)">
                  <span class="material-symbols-outlined">{{ sport.icon }}</span>
                </button>
              </div>
            }
            @for (cat of workoutTypes; track cat.value; let i = $index) {
              <div class="sd-item" [style.--sd-i]="sportService.sports().length + i">
                <span class="sd-label">{{ cat.label }}</span>
                <button class="sd-btn" [style.background]="cat.color"
                  (click)="speedDialPickCategory(cat.value)">
                  <span class="material-symbols-outlined">{{ cat.icon }}</span>
                </button>
              </div>
            }
          </div>
        }
        <button class="sd-fab" [class.sd-fab--open]="speedDialOpen()"
          (click)="toggleSpeedDial()">
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
    </div>

    } <!-- /!activeWorkout() -->

    <!-- ── Template picker bottom sheet ── -->
    @if (pickerCat()) {
      <div class="tp-backdrop" (click)="closePicker()"></div>
      <div class="tp-sheet">
        <div class="tp-header">
          <div class="tp-header-left">
            <div class="tp-dot" [style.background]="pickerColor()"></div>
            <div class="tp-header-info">
              <span class="tp-title">{{ pickerLabel() }}</span>
              <span class="tp-muscles">{{ pickerMuscles() }}</span>
            </div>
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
    .page { padding: 0; }

    /* ── Page header ── */
    .page-header { padding: 16px 16px 10px; }
    .page-header-top {
      display: flex; align-items: center; justify-content: space-between;
      h1 { margin: 0; font-size: 22px; font-weight: 700; }
    }

    /* ── Calendar wrapper ── */
    .calendar-wrap {
      margin: 0 16px 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 16px; overflow: hidden;
      background: var(--c-card);
    }

    /* ── Active workout floating header (reuses .workout-card) ── */
    .aw-header-sticky {
      position: sticky; top: 12px; z-index: 10;
      margin: 12px 16px 0;
      cursor: default;
      &:hover { box-shadow: none; background: color-mix(in srgb, var(--wc, var(--c-card)) 8%, var(--c-card)); border-color: color-mix(in srgb, var(--wc, var(--c-border-2)) 30%, var(--c-border-2)); }
    }
    .aw-header-right {
      display: flex; align-items: center; gap: 4px; flex-shrink: 0;
    }
    .aw-date {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      padding: 0 14px 0 0; flex-shrink: 0;
    }
    .aw-feeling-btn {
      width: 34px; height: 34px; border-radius: 50%;
      border: none; background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      color: var(--c-text-3);
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); }
      &.aw-feeling-btn--set { color: var(--c-text-2); }
    }
    .aw-feeling-emoji { font-size: 18px; line-height: 1; }
    .aw-feeling-row {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      margin: 4px 16px 0;
      padding: 10px 14px;
      background: var(--c-card);
      border-radius: 14px;
      box-shadow: 0 2px 10px var(--c-shadow);
      border: 1.5px solid var(--c-border-2);
      animation: feel-in 0.18s cubic-bezier(0.34, 1.4, 0.64, 1);
    }
    @keyframes feel-in {
      from { opacity: 0; transform: translateY(-6px) scale(0.95); }
      to   { opacity: 1; transform: none; }
    }
    .aw-feeling-opt {
      flex: 1; height: 44px; border-radius: 10px;
      border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      font-size: 20px; cursor: pointer; transition: all 0.12s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &.active { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.08); transform: scale(1.1); }
      &:hover:not(.active) { border-color: var(--c-border); background: var(--c-hover); }
    }
    .aw-feeling-clear {
      width: 38px; height: 44px; border-radius: 10px; flex-shrink: 0;
      border: 1.5px solid var(--c-border-2); background: transparent;
      color: var(--c-text-3); cursor: pointer; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.12s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { color: #ef5350; border-color: rgba(239,83,80,0.3); background: rgba(239,83,80,0.06); }
    }
    .wc-feeling { font-size: 14px; line-height: 1; }

    /* ── Active workout action FABs ── */
    .aw-delete-fab {
      position: fixed; right: 20px;
      bottom: calc(var(--nav-height) + 16px);
      z-index: 89;
      width: 56px; height: 56px; border-radius: 50%;
      border: 1.5px solid rgba(239,83,80,0.35); background: var(--c-card); color: #ef5350;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px var(--c-shadow-md);
      transition: background 0.15s, color 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 24px; }
      &:hover { background: rgba(239,83,80,0.08); transform: scale(1.06); }
      &:active { transform: scale(0.94); }
    }
    .aw-back-fab {
      position: fixed; left: 20px;
      bottom: calc(var(--nav-height) + 16px);
      z-index: 89;
      width: 56px; height: 56px; border-radius: 50%; border: 1.5px solid var(--c-border);
      background: var(--c-card); color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px var(--c-shadow-md);
      transition: background 0.15s, color 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 24px; }
      &:hover { background: var(--c-hover); color: var(--c-text); transform: scale(1.06); }
      &:active { transform: scale(0.94); }
    }
    @keyframes pill-in {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: none; }
    }

    /* ── "Avui toca" suggestion card (flex child in .bottom-bar, aligned with FAB) ── */
    .suggestion-card {
      flex: 1; min-width: 0;
      display: flex; align-items: center; gap: 0;
      height: 56px; border-radius: 14px; padding: 0;
      border: 1.5px solid color-mix(in srgb, var(--sc) 35%, var(--c-border-2));
      background: color-mix(in srgb, var(--sc) 8%, var(--c-card));
      box-shadow: 0 3px 14px var(--c-shadow-md);
      cursor: pointer; touch-action: manipulation; overflow: hidden;
      animation: pill-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1) both;
      transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
      &:hover {
        box-shadow: 0 4px 18px var(--c-shadow-md);
        border-color: color-mix(in srgb, var(--sc) 55%, var(--c-border));
        background: color-mix(in srgb, var(--sc) 13%, var(--c-card));
      }
      &:active { transform: scale(0.98); }
    }
    .sc-bar {
      width: 5px; align-self: stretch; flex-shrink: 0;
      background: var(--sc);
    }
    .sc-icon-wrap {
      width: 46px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
    }
    .sc-icon {
      font-size: 22px; color: var(--sc);
      font-variation-settings: 'FILL' 1;
    }
    .sc-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
    }
    .sc-eyebrow {
      font-size: 9px; font-weight: 700; line-height: 1;
      color: color-mix(in srgb, var(--sc) 70%, var(--c-text-3));
      text-transform: uppercase; letter-spacing: 0.6px;
    }
    .sc-label {
      font-size: 13px; font-weight: 700; color: var(--c-text); line-height: 1.2;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sc-chevron {
      font-size: 18px; color: var(--c-text-3); margin-right: 10px; flex-shrink: 0;
    }
    .sc-stats {
      font-size: 11px; font-weight: 700; color: var(--sc);
      background: color-mix(in srgb, var(--sc) 10%, var(--c-card));
      padding: 3px 8px; border-radius: 8px; line-height: 1.3;
      margin-right: 12px; flex-shrink: 0;
    }
    .sc-icon--fill { font-variation-settings: 'FILL' 1; }
    .sc--done .sc-eyebrow { color: color-mix(in srgb, var(--sc) 80%, var(--c-text-3)); }

    /* ── Type grid (inside workout-section) ── */
    .type-grid {
      display: grid; gap: 10px;
      &.type-grid--mt { margin-top: 10px; }
    }
    .type-btn {
      display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 16px 4px 14px;
      border: 2px solid color-mix(in srgb, var(--cat-color) 55%, var(--c-border));
      border-radius: 16px;
      background: color-mix(in srgb, var(--cat-color) 10%, var(--c-card));
      cursor: pointer;
      color: color-mix(in srgb, var(--cat-color) 80%, var(--c-text));
      transition: all 0.18s; touch-action: manipulation;
      &:hover {
        border-color: var(--cat-color);
        background: color-mix(in srgb, var(--cat-color) 18%, var(--c-card));
        transform: translateY(-1px);
      }
      &:active { transform: scale(0.97); }
      .type-icon { font-size: 28px; }
      .type-label { font-size: 11px; font-weight: 700; letter-spacing: 0.2px; text-align: center; }
      &.type-btn--done {
        border-color: var(--cat-color);
        background: color-mix(in srgb, var(--cat-color) 16%, var(--c-card));
        position: relative;
      }
    }
    .type-done-check {
      position: absolute; top: 6px; right: 7px;
      font-size: 15px;
      color: var(--cat-color);
      font-variation-settings: 'FILL' 1;
    }

    /* ── Speed Dial FAB ── */
    .sd-backdrop { position: fixed; inset: 0; z-index: 88; }

    /* ── Bottom action bar: holds the suggestion card + speed dial FAB ── */
    .bottom-bar {
      position: fixed;
      left: 16px; right: 20px;
      bottom: calc(var(--nav-height) + 16px);
      z-index: 89;
      display: flex; align-items: flex-end; gap: 12px;
      pointer-events: none;
    }
    .bottom-bar > * { pointer-events: auto; }

    .sd-container {
      flex-shrink: 0; margin-left: auto;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    }
    .sd-items {
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      padding-bottom: 4px;
      animation: sd-items-in 0.2s cubic-bezier(0.34, 1.4, 0.64, 1) both;
    }
    @keyframes sd-items-in {
      from { opacity: 0; transform: scale(0.88) translateY(12px); }
      to   { opacity: 1; transform: none; }
    }
    .sd-item {
      display: flex; align-items: center; gap: 10px;
      animation: sd-item-in 0.18s calc(var(--sd-i, 0) * 28ms) both;
    }
    @keyframes sd-item-in {
      from { opacity: 0; transform: translateX(10px); }
      to   { opacity: 1; transform: none; }
    }
    .sd-label {
      background: var(--c-card); color: var(--c-text);
      padding: 6px 12px; border-radius: 20px;
      font-size: 13px; font-weight: 600;
      box-shadow: 0 2px 8px var(--c-shadow); white-space: nowrap;
    }
    .sd-btn {
      width: 46px; height: 46px; border-radius: 50%; border: none; color: white;
      cursor: pointer; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 3px 12px rgba(0,0,0,0.22);
      transition: transform 0.15s;
      .material-symbols-outlined { font-size: 22px; font-variation-settings: 'FILL' 1; }
      &:hover  { transform: scale(1.08); }
      &:active { transform: scale(0.93); }
    }
    .sd-fab {
      width: 56px; height: 56px; border-radius: 50%; border: none;
      background: var(--c-brand); color: white;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px rgba(var(--c-brand-rgb), 0.4), 0 1px 4px var(--c-shadow);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 28px; transition: transform 0.22s ease; }
      &:hover { background: var(--c-brand-dk); transform: scale(1.06); }
      &:active { transform: scale(0.94); }
      &.sd-fab--open .material-symbols-outlined { transform: rotate(45deg); }
    }

    /* ── Loading ── */
    .loading-state {
      display: flex; justify-content: center; padding: 48px;
      .material-symbols-outlined { font-size: 32px; color: var(--c-border); }
    }

    /* ── Workout section (dashboard) ── */
    .workout-section {
      margin: 12px 16px 0;
      padding: 14px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }

    /* ── Workout summary cards ── */
    .workout-card {
      display: flex; align-items: center;
      margin-bottom: 8px;
      border: 1.5px solid color-mix(in srgb, var(--wc, var(--c-border-2)) 30%, var(--c-border-2));
      border-radius: 14px;
      background: color-mix(in srgb, var(--wc, var(--c-card)) 8%, var(--c-card));
      overflow: hidden;
      cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
      touch-action: manipulation;
      &:hover {
        box-shadow: 0 2px 8px var(--c-shadow);
        background: color-mix(in srgb, var(--wc, var(--c-card)) 14%, var(--c-card));
        border-color: color-mix(in srgb, var(--wc, var(--c-border)) 50%, var(--c-border));
      }
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
      display: inline-flex; align-items: center; gap: 5px;
    }
    .wc-icon { font-size: 15px; font-variation-settings: 'FILL' 1, 'wght' 400; }
    .wc-stats {
      display: flex; align-items: center; gap: 4px;
      font-size: 11px; color: var(--c-text-3);
    }
    .wc-stat {
      display: flex; align-items: center; gap: 2px;
      .material-symbols-outlined { font-size: 11px; }
      strong { color: var(--c-text-2); font-weight: 700; }
    }
    .wc-stat-sep { color: var(--c-border); }
    .wc-stat--vol strong { color: var(--wc, var(--c-brand)); }
    .wc-delete {
      width: 40px; height: 40px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); transition: color 0.15s, background 0.15s; touch-action: manipulation;
      border-radius: 10px; margin-right: 4px;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
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
    .tp-header-info { display: flex; flex-direction: column; gap: 1px; }
    .tp-muscles { font-size: 12px; color: var(--c-text-3); }
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
    .plan-section {
      margin: 12px 16px 0;
      padding: 14px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
      cursor: pointer; -webkit-tap-highlight-color: transparent;
      transition: box-shadow 0.15s;
      &:hover  { box-shadow: 0 4px 16px var(--c-shadow); }
      &:active { opacity: 0.85; }
      .sports-header { cursor: default; }
    }

    .sports-section {
      margin: 12px 16px 0;
      padding: 14px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }

    .sports-header {
      display: flex; align-items: center; gap: 7px;
      margin: -4px -4px 0; padding: 4px 4px;
      border-radius: 10px;
      cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
      transition: background 0.12s;
      &:hover  { background: var(--c-hover); }
      &:active { background: var(--c-border-2); }
    }
    .sports-header-icon {
      font-size: 18px; color: var(--c-text-2);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .sports-title {
      margin: 0; flex: 1; font-size: 14px; font-weight: 700;
      color: var(--c-text-2); letter-spacing: 0.2px;
    }
    .section-count-badge {
      font-size: 11px; font-weight: 700; color: var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.1);
      border-radius: 10px; padding: 2px 8px; flex-shrink: 0;
    }
    .section-chevron {
      font-size: 18px; color: var(--c-text-3); flex-shrink: 0;
      transition: transform 0.22s ease;
      &.rotated { transform: rotate(-90deg); }
    }
    .section-body {
      display: grid; grid-template-rows: 1fr;
      transition: grid-template-rows 0.22s ease;
    }
    .section-body.collapsed { grid-template-rows: 0fr; }
    .section-body-inner { overflow: hidden; }
    .section-body-inner .sbi-content { padding-top: 12px; }

    .type-sport-sub {
      font-size: 9px; font-weight: 700; color: var(--cat-color);
      text-align: center; line-height: 1; letter-spacing: 0.1px;
      max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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
      padding: 14px;
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

    /* ── Trainer proposal card ── */
    .proposal-card {
      margin: 12px 16px 0;
      padding: 14px 14px 12px;
      background: var(--c-card);
      border-radius: 18px;
      border: 2px solid rgba(0,104,116,0.25);
      box-shadow: 0 2px 10px var(--c-shadow);
      animation: bar-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .proposal-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
    }
    .proposal-icon {
      font-size: 22px; color: var(--c-brand); flex-shrink: 0;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .proposal-header-info { display: flex; flex-direction: column; gap: 1px; }
    .proposal-title  { font-size: 13px; font-weight: 800; color: var(--c-brand); letter-spacing: 0.1px; }
    .proposal-trainer { font-size: 11px; color: var(--c-text-2); }
    .proposal-exercises {
      display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;
    }
    .proposal-ex {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      background: var(--c-subtle); border-radius: 8px; padding: 3px 8px;
    }
    .proposal-ex--more { color: var(--c-text-3); font-style: italic; }
    .proposal-notes {
      margin: 0 0 10px; font-size: 12px; color: var(--c-text-2); font-style: italic; line-height: 1.4;
    }
    .proposal-actions { display: flex; gap: 8px; }
    .proposal-accept {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 9px 14px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 16px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.6; cursor: default; }
    }
    .proposal-ignore {
      display: flex; align-items: center; gap: 5px;
      padding: 9px 14px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card); color: var(--c-text-2);
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spin { animation: spin 1s linear infinite; }


    /* ── Session logger bottom sheet ── */
    .sl-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.4);
      animation: fade-in 0.18s ease;
    }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

    .sl-sheet {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: var(--c-card); border-radius: 24px 24px 0 0;
      padding: 0 16px calc(env(safe-area-inset-bottom) + 16px);
      max-height: 85vh; overflow-y: auto;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.14);
      animation: sheet-up 0.22s cubic-bezier(0.34, 1.2, 0.64, 1);
    }
    @keyframes sheet-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

    .sl-header {
      display: flex; align-items: center;
      padding: 16px 0 12px; border-bottom: 1px solid var(--c-border-2); margin-bottom: 12px;
    }
    .sl-header-left { flex: 1; display: flex; align-items: center; gap: 10px; }
    .sl-sport-icon {
      font-size: 26px;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .sl-sport-name { font-size: 17px; font-weight: 800; color: var(--c-text); }
    .sl-close {
      width: 34px; height: 34px; border-radius: 50%; border: none;
      background: var(--c-subtle); cursor: pointer; color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; flex-shrink: 0;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); }
    }

    .sl-field { margin-bottom: 16px; }
    .sl-field-label {
      display: block; font-size: 12px; font-weight: 700; color: var(--c-text-2);
      letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 8px;
      small { font-size: 11px; color: var(--c-text-3); font-weight: 400; text-transform: none; margin-left: 4px; }
    }
    .sl-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .sl-quick-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .sl-quick-btn {
      padding: 6px 12px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sl-stepper { display: flex; align-items: center; gap: 6px; }
    .sl-step-btn {
      width: 34px; height: 34px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 14px; font-weight: 700; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sl-step-val {
      min-width: 52px; text-align: center;
      font-size: 18px; font-weight: 800; color: var(--c-text);
      small { font-size: 11px; color: var(--c-text-3); margin-left: 2px; }
    }
    .sl-chips { display: flex; gap: 7px; flex-wrap: wrap; }
    .sl-chip {
      padding: 7px 14px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sl-feeling-row { display: flex; gap: 8px; }
    .sl-feeling-btn {
      flex: 1; height: 44px; border-radius: 12px;
      border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      font-size: 22px; cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &.active { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.08); transform: scale(1.1); }
      &:hover:not(.active) { border-color: var(--c-border); background: var(--c-hover); }
    }
    .sl-notes {
      width: 100%; box-sizing: border-box;
      padding: 9px 12px; border: 1.5px solid var(--c-border); border-radius: 10px;
      font-size: 13px; font-family: inherit; color: var(--c-text); resize: none; background: var(--c-card);
      outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
      &::placeholder { color: var(--c-text-3); }
    }
    .sl-actions {
      display: flex; align-items: center; gap: 8px;
      padding: 12px 0 4px; border-top: 1px solid var(--c-border-2); margin-top: 4px;
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
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 14px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }
    .sl-save {
      height: 40px; padding: 0 22px; border-radius: 10px;
      border: none; background: var(--c-brand); color: white;
      font-size: 14px; font-weight: 700;
      cursor: pointer; transition: background 0.15s; touch-action: manipulation;
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  `],
})
export class TrainComponent {
  readonly workoutService  = inject(WorkoutService);
  readonly sportService    = inject(SportService);
  readonly trainerService  = inject(TrainerService);
  private settingsService  = inject(UserSettingsService);
  private exerciseService  = inject(ExerciseService);
  private templateService  = inject(TemplateService);
  private router           = inject(Router);
  private dialog           = inject(MatDialog);
  private snackBar         = inject(MatSnackBar);

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  readonly selectedDate    = signal<string>(TODAY());
  readonly sportToggling   = signal(false);
  readonly workoutTypes    = WORKOUT_TYPES;
  readonly speedDialOpen   = signal(false);
  readonly activeWorkoutId = signal<string | null>(null);
  readonly gymCollapsed    = signal(false);
  readonly sportsCollapsed = signal(false);
  readonly loggerSport     = signal<Sport | null>(null);
  readonly loggerSessionId = signal<string | null>(null);
  readonly loggerDuration  = signal<number>(60);
  readonly loggerSubtype   = signal<string | null>(null);
  readonly loggerFeeling   = signal<FeelingLevel | null>(null);
  readonly loggerMetrics   = signal<Record<string, string | number>>({});
  readonly loggerNotes     = signal<string>('');
  readonly creating          = signal(false);
  readonly awFeelingOpen     = signal(false);
  readonly feelingLevels5: FeelingLevel[] = [1, 2, 3, 4, 5];
  readonly acceptingProposal = signal(false);

  private readonly _dismissedKey = computed(() =>
    `gymgoli_dismissed_proposals_${this.auth?.uid() ?? ''}`
  );
  private _dismissedDates = new Set<string>();

  readonly activeProposal = computed(() => {
    if (!this.trainerService.hasTrainer()) return null;
    const date = this.selectedDate();
    const prop = this.trainerService.getProposalForDate(date);
    if (!prop) return null;
    if (this._dismissedDates.has(date)) return null;
    // Hide if already accepted as a done workout
    const alreadyAccepted = this.workoutService
      .getDoneWorkoutsForDate(date)
      .some(w => w.sourceProposalId === prop.id);
    return alreadyAccepted ? null : prop;
  });

  private readonly auth = inject(AuthService);

  readonly isToday = computed(() => this.selectedDate() === TODAY());

  readonly todaySuggestion = computed((): TodaySuggestion | null => {
    const today = TODAY();
    if (this.selectedDate() !== today) return null;

    // Only suggest when no activity has been logged today
    const hasGymToday = this.workoutService.getDoneWorkoutsForDate(today).length > 0;
    const hasSportToday = this.sportService.getSportSessionsForDate(today).length > 0;
    if (hasGymToday || hasSportToday) return null;

    const goal = this.settingsService.fitnessGoal();

    // Next gym category in weekly rotation (excluding today)
    const monday = mondayOf(today);
    const doneCats = new Set(
      Array.from({ length: 7 }, (_, i) => addDays(monday, i))
        .filter(d => d < today)
        .flatMap(d => this.workoutService.getDoneWorkoutsForDate(d).flatMap(w => workoutCategories(w)))
    );
    const gymOrder: ExerciseCategory[] = ['push', 'pull', 'legs'];
    const nextGymCat = gymOrder.find(c => !doneCats.has(c)) ?? null;
    const nextSport = this.sportService.sports()[0] ?? null;

    const mkGym = (cat: ExerciseCategory): GymSuggestion => ({
      type: 'gym', category: cat,
      label: CATEGORY_LABELS[cat], color: CATEGORY_COLORS[cat], icon: CATEGORY_ICONS[cat],
    });
    const mkSport = (s: Sport): SportSuggestion => ({
      type: 'sport', sport: s, label: s.name, color: s.color, icon: s.icon,
    });

    switch (goal) {
      case 'strength':
      case null:
        return nextGymCat ? mkGym(nextGymCat) : null;
      case 'fitness':
        if (nextGymCat) return mkGym(nextGymCat);
        if (nextSport)  return mkSport(nextSport);
        return null;
      case 'weight':
        if (nextSport)  return mkSport(nextSport);
        if (nextGymCat) return mkGym(nextGymCat);
        return null;
      case 'sport':
        return nextSport ? mkSport(nextSport) : null;
    }
  });

  readonly dateWorkouts = computed(() =>
    this.workoutService.getDoneWorkoutsForDate(this.selectedDate())
  );

  readonly pagePaddingBottom = computed(() =>
    '88px' // clear the FAB / bottom-bar in both modes
  );

  readonly dateSportSessions = computed(() =>
    this.sportService.getSportSessionsForDate(this.selectedDate())
  );

  readonly pendingSports = computed(() => {
    const doneIds = new Set(this.dateSportSessions().map(x => x.sport.id));
    return this.sportService.sports().filter(s => !doneIds.has(s.id));
  });

  readonly sportDoneMap = computed(() => {
    const map = new Map<string, { id: string; subtypeId?: string }>();
    for (const { session, sport } of this.dateSportSessions()) {
      map.set(sport.id, { id: session.id, subtypeId: session.subtypeId });
    }
    return map;
  });

  subtypeName(sport: Sport, subtypeId: string): string {
    return sport.subtypes.find(s => s.id === subtypeId)?.name ?? '';
  }

  async deleteSportSession(sessionId: string, ev: Event): Promise<void> {
    ev.stopPropagation();
    this.sportToggling.set(true);
    try {
      await this.sportService.deleteSession(sessionId, this.selectedDate());
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2500 });
    } finally {
      this.sportToggling.set(false);
    }
  }

  sportSummary(sub: { duration?: number; feeling?: FeelingLevel; subtypeId?: string }, sport: Sport): string {
    const parts: string[] = [];
    if (sub.subtypeId) {
      const sub2 = sport.subtypes.find(s => s.id === sub.subtypeId);
      if (sub2) parts.push(sub2.name);
    }
    if (sub.duration) parts.push(`${sub.duration}min`);
    if (sub.feeling)  parts.push(FEELING_EMOJI[sub.feeling]);
    return parts.join(' · ');
  }

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

  readonly upcomingPlansCount = computed(() => {
    const today = TODAY();
    return this.workoutService.plannedWorkouts().filter(w => w.date >= today).length;
  });

  navigateToPlanner(): void { this.router.navigate(['/calendar']); }

  readonly bottomCard = computed((): BottomCard | null => {
    const workouts = this.dateWorkouts();
    if (workouts.length > 0) {
      const w = workouts[0];
      const cats = workoutCategories(w);
      return {
        kind: 'workout',
        color: this.workoutPrimaryColor(w),
        icon: cats.length ? (CATEGORY_ICONS[cats[0] as ExerciseCategory] ?? 'fitness_center') : 'fitness_center',
        label: this.workoutLabel(w),
        meta: `${w.entries.length} ex · ${this.workoutSetsCount(w)} sèr`,
        workoutId: w.id,
      };
    }
    if (this.selectedDate() === TODAY()) {
      const plans = this.workoutService.getPlannedForDate(TODAY());
      if (plans.length > 0) {
        const brand = getComputedStyle(document.documentElement).getPropertyValue('--c-brand').trim() || '#006874';
        return {
          kind: 'plan', color: brand, icon: 'event',
          label: 'Tens un pla per avui',
          meta: `${plans.length} pla${plans.length > 1 ? 'ns' : ''} pendent${plans.length > 1 ? 's' : ''}`,
        };
      }
    }
    const s = this.todaySuggestion();
    if (s) {
      return { kind: 'suggestion', color: s.color, icon: s.icon, label: s.label, meta: '', suggestion: s };
    }
    return null;
  });

  handleBottomCardClick(bc: BottomCard): void {
    if (bc.kind === 'workout' && bc.workoutId) this.openWorkout(bc.workoutId);
    else if (bc.kind === 'suggestion' && bc.suggestion) this.handleSuggestionClick(bc.suggestion);
    else if (bc.kind === 'plan') this.router.navigate(['/calendar']);
  }



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

  readonly pickerMuscles = computed(() => {
    const cat = this.pickerCat();
    return cat ? CATEGORY_MUSCLES[cat] : '';
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

    // Load dismissed proposal dates from localStorage once auth resolves
    effect(() => {
      const uid = this.auth.uid();
      if (!uid) return;
      try {
        const key  = `gymgoli_dismissed_proposals_${uid}`;
        const list = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
        this._dismissedDates = new Set(list);
      } catch { }
    });
  }

  // ── Trainer proposal ─────────────────────────────────────────────────────

  async acceptProposal(prop: import('../../core/models/trainer.model').TrainerProposal): Promise<void> {
    this.acceptingProposal.set(true);
    try {
      const id = await this.workoutService.createWorkoutFromProposal(
        this.selectedDate(), prop.id, prop.entries,
      );
      this.openWorkout(id);
    } catch {
      this.snackBar.open('Error en acceptar la proposta', '', { duration: 3000 });
    } finally {
      this.acceptingProposal.set(false);
    }
  }

  ignoreProposal(): void {
    const date = this.selectedDate();
    this._dismissedDates.add(date);
    try {
      const key  = this._dismissedKey();
      const list = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
      if (!list.includes(date)) { list.push(date); localStorage.setItem(key, JSON.stringify(list)); }
    } catch { }
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

  topbarTotalSets(w: Workout): number {
    return w.entries.reduce((acc, e) => acc + e.sets.length, 0);
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

  workoutVolume(w: Workout): number {
    return w.entries.reduce((sum, e) =>
      sum + e.sets.reduce((s2, set) => s2 + set.weight * set.reps, 0), 0);
  }

  workoutVolumeFmt(w: Workout): string {
    const vol = this.workoutVolume(w);
    if (vol <= 0) return '';
    if (vol >= 1000) return `${(vol / 1000).toFixed(1)}t`;
    return `${Math.round(vol)}kg`;
  }

  emojiOf(level: FeelingLevel): string { return FEELING_EMOJI[level]; }

  async pickWorkoutFeeling(workoutId: string, level: FeelingLevel | undefined): Promise<void> {
    this.awFeelingOpen.set(false);
    try {
      await this.workoutService.updateWorkoutFeeling(workoutId, level);
    } catch {
      this.snackBar.open('Error en guardar la sensació', '', { duration: 2000 });
    }
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

  handleSuggestionClick(s: TodaySuggestion): void {
    if (s.type === 'gym') this.selectType(s.category);
    else this.openSessionLogger(s.sport);
  }

  toggleSpeedDial(): void { this.speedDialOpen.set(!this.speedDialOpen()); }

  speedDialPickCategory(cat: ExerciseCategory): void {
    this.speedDialOpen.set(false);
    if (this.activeWorkout()) this.openPicker(cat);
    else this.selectType(cat);
  }

  speedDialPickSport(sport: Sport): void {
    this.speedDialOpen.set(false);
    this.openSessionLogger(sport);
  }

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
    this.templateService.recordUse(t.id);
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
