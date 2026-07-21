import { Component, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { workoutCategories } from '../../shared/utils/calendar-utils';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { TrainerService } from '../../core/services/trainer.service';
import { AuthService } from '../../core/services/auth.service';

import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, CATEGORY_MUSCLES,
  Exercise, ExerciseCategory,
} from '../../core/models/exercise.model';
import { Sport, SportMetricDef } from '../../core/models/sport.model';
import { WorkoutTemplate } from '../../core/models/template.model';
import { FeelingLevel, Workout, WorkoutEntry, setMaxWeight } from '../../core/models/workout.model';
import { TemplateService } from '../../core/services/template.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { SportService } from '../../core/services/sport.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { WorkoutService } from '../../core/services/workout.service';
import { OfflineService } from '../../core/services/offline.service';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { WorkoutProfileService } from '../../core/services/workout-profile.service';
import { AppHintService } from '../../core/services/app-hint.service';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import {
  formatFeeling, workoutCardColor, workoutPrimaryColor, workoutVolumeFmt,
} from '../../shared/utils/workout-card.utils';

const TODAY = (): string => new Date().toISOString().split('T')[0];

type GymSuggestion   = { type: 'gym';   category: ExerciseCategory; label: string; color: string; icon: string; reason: string };
type SportSuggestion = { type: 'sport'; sport: Sport;               label: string; color: string; icon: string; reason: string };
type TodaySuggestion = GymSuggestion | SportSuggestion;

const WORKOUT_TYPES: { value: ExerciseCategory; label: string; icon: string; color: string }[] = [
  { value: 'push', label: CATEGORY_LABELS.push, icon: CATEGORY_ICONS.push, color: CATEGORY_COLORS.push },
  { value: 'pull', label: CATEGORY_LABELS.pull, icon: CATEGORY_ICONS.pull, color: CATEGORY_COLORS.pull },
  { value: 'legs', label: CATEGORY_LABELS.legs, icon: CATEGORY_ICONS.legs, color: CATEGORY_COLORS.legs },
];

@Component({
  selector: 'app-train',
  standalone: true,
  imports: [FormsModule, WorkoutEditorComponent, PageHeaderComponent],
  template: `
    <div class="page" [style.padding-bottom]="pagePaddingBottom()">

      @if (activeWorkout(); as w) {

        <!-- ══ ACTIVE WORKOUT MODE ══ -->

        <header class="page-header page-header--aw">
          <button class="back-btn" (click)="closeWorkout()" aria-label="Tancar entrenament">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="aw-title-block">
            <h1>{{ (w.status ?? 'done') === 'planned' ? 'El meu pla' : 'El meu entrenament' }}</h1>
            <span class="aw-date-sub">{{ workoutDateLabel(w) }}</span>
          </div>
          <span class="aw-type-badge" [style.--bc]="workoutPrimaryColor(w)">{{ workoutLabel(w) }}</span>
        </header>

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
                    [class.aw-feeling-btn--set]="w.feeling"
                    [attr.aria-label]="w.feeling ? 'Canviar sensació' : 'Afegir sensació'"
                    [attr.aria-expanded]="awFeelingOpen()">
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
              <button class="aw-feeling-clear" (click)="pickWorkoutFeeling(w.id, undefined)" aria-label="Treure sensació">
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
          [reorderable]="reorderMode()"
          [groupingMode]="groupingMode()"
          (requestAddExercise)="openPicker()"
        />

        <!-- ── Nudge contextual: desa'l com a plantilla ── -->
        @if (w.entries.length >= 2 && !offlineService.isOffline()
             && !reorderMode() && !groupingMode()
             && !hintService.isDismissed('nudge-save-template')) {
          <div class="aw-nudge">
            <span class="material-symbols-outlined aw-nudge-icon">bookmark_add</span>
            <div class="aw-nudge-text">
              <span class="aw-nudge-title">Repeteixes aquest entrenament?</span>
              <span class="aw-nudge-sub">Desa'l com a plantilla i comença'l en un tap la propera vegada.</span>
            </div>
            <button class="aw-nudge-cta" (click)="saveTemplateFromNudge(w)">Desar</button>
            <button class="aw-nudge-x" (click)="hintService.dismiss('nudge-save-template')" aria-label="No tornar a mostrar">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        }

        <!-- ── Three-dots action menu ── -->
        @if (workoutMenuOpen()) {
          <div class="aw-menu-backdrop" (click)="workoutMenuOpen.set(false)"></div>
          <div class="aw-menu-dropdown">
            <button class="aw-menu-item" (click)="workoutMenuOpen.set(false); reorderMode.set(!reorderMode()); groupingMode.set(false)">
              <span class="material-symbols-outlined">{{ reorderMode() ? 'check' : 'swap_vert' }}</span>
              {{ reorderMode() ? 'Finalitzar ordenació' : 'Ordenar exercicis' }}
            </button>
            @if (settingsService.supersetsEnabled() || groupingMode()) {
              <button class="aw-menu-item" (click)="workoutMenuOpen.set(false); groupingMode.set(!groupingMode()); reorderMode.set(false)">
                <span class="material-symbols-outlined">{{ groupingMode() ? 'check' : 'link' }}</span>
                {{ groupingMode() ? 'Finalitzar agrupació' : 'Agrupar en superset' }}
              </button>
            }
            @if (!offlineService.isOffline()) {
              <button class="aw-menu-item" (click)="openSaveAsTemplate(w)">
                <span class="material-symbols-outlined">bookmark_add</span>
                Guardar com a plantilla
              </button>
              <button class="aw-menu-item" (click)="shareWorkout(w)">
                <span class="material-symbols-outlined">share</span>
                Compartir entrenament
              </button>
            }
            <button class="aw-menu-item aw-menu-item--danger" (click)="workoutMenuOpen.set(false); deleteActiveWorkout()">
              <span class="material-symbols-outlined">delete</span>
              Eliminar entrenament
            </button>
          </div>
        }
        <button class="aw-menu-fab" [class.aw-menu-fab--open]="workoutMenuOpen()"
                (click)="workoutMenuOpen.set(!workoutMenuOpen())"
                aria-label="Opcions de l'entrenament" [attr.aria-expanded]="workoutMenuOpen()">
          <span class="material-symbols-outlined">more_vert</span>
        </button>

        <!-- ── Save as template bottom sheet ── -->
        @if (saveTemplateOpen()) {
          <div class="aw-tpl-backdrop" (click)="saveTemplateOpen.set(false)"></div>
          <div class="aw-tpl-sheet">
            <div class="aw-tpl-header">
              <span class="aw-tpl-title">Guardar com a plantilla</span>
              <button class="aw-tpl-close" (click)="saveTemplateOpen.set(false)">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="aw-tpl-field">
              <label class="aw-tpl-label">Nom de la plantilla</label>
              <input class="aw-tpl-input" [(ngModel)]="saveTemplateName"
                     placeholder="Ex: Push A" maxlength="40" autocomplete="off">
            </div>
            <div class="aw-tpl-actions">
              <button class="aw-tpl-cancel" (click)="saveTemplateOpen.set(false)">Cancel·lar</button>
              <button class="aw-tpl-save" (click)="confirmSaveAsTemplate()"
                      [disabled]="!saveTemplateName.trim()">Guardar</button>
            </div>
          </div>
        }

      } @else {

        <!-- ══ DASHBOARD MODE ══ -->
        <app-page-header title="Entrenament" [showBack]="true" />

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

        <!-- ── Creating spinner (brief, while new workout is being saved) ── -->
        @if (creating()) {
          <div class="loading-state">
            <span class="material-symbols-outlined spin">sync</span>
          </div>
        }

        <!-- ── Gym ── -->
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">fitness_center</span>
            <h2 class="section-title">Gym</h2>
          </div>
          <div class="type-grid" [style.grid-template-columns]="gridCols(workoutTypes.length)">
            @for (cat of workoutTypes; track cat.value) {
              <button class="type-btn"
                [style.--cat-color]="cat.color"
                [class.type-btn--active]="pickerCat() === cat.value"
                (click)="selectType(cat.value)">
                <span class="material-symbols-outlined type-icon">{{ cat.icon }}</span>
                <span class="type-label">{{ cat.label }}</span>
              </button>
            }
          </div>
        </div>

        <!-- ── Esport ── -->
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">sports_soccer</span>
            <h2 class="section-title">Esport</h2>
          </div>
          @if (sportService.sports().length > 0) {
            <div class="type-grid" [style.grid-template-columns]="gridCols(sportService.sports().length)">
              @for (sport of sportService.sports(); track sport.id) {
                <button class="type-btn"
                  [style.--cat-color]="sport.color"
                  [class.type-btn--active]="loggerSport()?.id === sport.id"
                  (click)="openSessionLogger(sport)"
                  [disabled]="sportToggling()">
                  <span class="material-symbols-outlined type-icon">{{ sport.icon }}</span>
                  <span class="type-label">{{ sport.name }}</span>
                </button>
              }
            </div>
          } @else {
            <div class="es-empty">
              <span class="material-symbols-outlined es-empty-icon">sports_soccer</span>
              <span class="es-empty-msg">Afegeix els esports que practiques</span>
              <button class="es-empty-btn" (click)="router.navigate(['/sports-config'])">
                Configurar esports
                <span class="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          }
        </div>

      }

    </div>

    <!-- ── Suggeriment (ample complet, sobre la barra de navegació) ── -->
    @if (!activeWorkout() && todaySuggestion(); as s) {
      <div class="suggestion-float-row">
        <button class="suggestion-float" [style.--sc]="s.color" (click)="handleSuggestionClick(s)">
          <div class="sf-bar"></div>
          <div class="sf-icon-wrap">
            <span class="material-symbols-outlined sf-icon">{{ s.icon }}</span>
          </div>
          <div class="sf-info">
            <span class="sf-eyebrow">Suggerit</span>
            <span class="sf-label">{{ s.label }}</span>
            <span class="sf-reason">{{ s.reason }}</span>
          </div>
          <span class="material-symbols-outlined sf-chevron">chevron_right</span>
        </button>
      </div>
    }

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
          <button class="tp-close" (click)="closePicker()" aria-label="Tancar">
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

          <button class="tp-manage" (click)="goToTemplates()">
            <span>Gestionar plantilles</span>
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        } @else {
          <button class="tp-option tp-option--create" (click)="goToTemplates()">
            <span class="material-symbols-outlined tp-opt-icon">bookmark_add</span>
            <div class="tp-opt-info">
              <span class="tp-opt-name">Crea la teva primera plantilla</span>
              <span class="tp-opt-sub">Desa una rutina per reutilitzar-la ràpidament</span>
            </div>
          </button>
        }
      </div>
    }

    <!-- ── Session logger bottom sheet ── -->
    @if (loggerSport(); as sport) {
      <div class="sl-backdrop" (click)="closeSessionLogger()"></div>
      <div class="sl-sheet">
        <div class="sl-header">
          <div class="sl-header-left">
            <span class="material-symbols-outlined sl-sport-icon" [style.color]="sport.color">
              {{ sport.icon }}
            </span>
            <span class="sl-sport-name">{{ sport.name }}</span>
          </div>
          <button class="sl-close" (click)="closeSessionLogger()" aria-label="Tancar">
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
        @if (sport.subtypes.length) {
          <div class="sl-field">
            <span class="sl-field-label">Subtipus</span>
            <div class="sl-chips">
              @for (sub of sport.subtypes; track sub.id) {
                <button class="sl-chip" [class.active]="loggerSubtype() === sub.id"
                        (click)="toggleSubtype(sub.id)">{{ sub.name }}</button>
              }
            </div>
          </div>
        }

        <!-- Metric fields -->
        @for (def of sport.metricDefs; track def.key) {
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

        <!-- Feeling (only when logging a real session, not when planning) -->
        @if (!isSelectedFuture()) {
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
        }

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
              {{ isSelectedFuture() ? 'Planificar' : 'Guardar' }}
            </button>
          </div>
        </div>
      </div>
    }

  `,
  styles: [`
    .page { padding: 0; }

    /* ── Page header ── */
    .page-header--aw {
      padding: 16px 16px 10px;
      display: flex; align-items: center; gap: 10px;
    }
    .aw-title-block {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 1px;
      h1 { margin: 0; font-size: 16px; font-weight: 700; color: var(--c-text); line-height: 1.2; }
    }
    .aw-date-sub {
      font-size: 12px; color: var(--c-text-3); font-weight: 500;
      line-height: 1.2; text-transform: capitalize;
    }
    .aw-type-badge {
      --bc: var(--c-brand); flex-shrink: 0;
      padding: 4px 10px; border-radius: 20px;
      background: color-mix(in srgb, var(--bc) 12%, var(--c-card));
      color: var(--bc); font-size: 11px; font-weight: 700;
      border: 1px solid color-mix(in srgb, var(--bc) 25%, transparent);
      white-space: nowrap; max-width: 110px;
      overflow: hidden; text-overflow: ellipsis;
    }
    .back-btn {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: var(--c-subtle); color: var(--c-text-2);
      cursor: pointer; -webkit-tap-highlight-color: transparent;
      transition: background 0.15s; flex-shrink: 0;
      span { font-size: 20px; }
      &:hover  { background: var(--c-hover); }
      &:active { opacity: 0.7; }
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

    /* ── Active workout action menu FAB ── */
    .aw-menu-fab {
      position: fixed; right: 20px;
      bottom: calc(var(--nav-height) + 16px);
      z-index: 89;
      width: 56px; height: 56px; border-radius: 50%;
      border: 1.5px solid var(--c-border); background: var(--c-card); color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px var(--c-shadow-md);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 24px; }
      &:hover { background: var(--c-subtle); transform: scale(1.06); }
      &:active { transform: scale(0.94); }
      &.aw-menu-fab--open { background: var(--c-subtle); border-color: var(--c-brand); color: var(--c-brand); }
    }
    .aw-menu-backdrop { position: fixed; inset: 0; z-index: 88; }
    /* ── Contextual "save as template" nudge ── */
    .aw-nudge {
      position: relative;
      display: flex; align-items: center; gap: 10px;
      margin: 12px 16px 0; padding: 12px 32px 12px 12px;
      background: color-mix(in srgb, var(--c-brand) 5%, var(--c-card));
      border: 1.5px solid color-mix(in srgb, var(--c-brand) 22%, var(--c-border-2));
      border-radius: 14px;
    }
    .aw-nudge-icon { font-size: 22px; color: var(--c-brand); flex-shrink: 0; font-variation-settings: 'FILL' 0, 'wght' 400; }
    .aw-nudge-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .aw-nudge-title { font-size: 13px; font-weight: 800; color: var(--c-text); }
    .aw-nudge-sub { font-size: 11.5px; color: var(--c-text-3); line-height: 1.35; }
    .aw-nudge-cta {
      flex-shrink: 0; height: 34px; padding: 0 16px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white; font-size: 13px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover { background: var(--c-brand-dk); }
    }
    .aw-nudge-x {
      position: absolute; top: 6px; right: 6px;
      width: 24px; height: 24px; border-radius: 50%; border: none;
      background: transparent; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { background: var(--c-subtle); color: var(--c-text-2); }
    }

    .aw-menu-dropdown {
      position: fixed; right: 16px;
      bottom: calc(var(--nav-height) + 16px + 56px + 10px);
      z-index: 90; min-width: 230px;
      background: var(--c-card); border-radius: 14px;
      box-shadow: 0 4px 24px var(--c-shadow-md), 0 0 0 1px var(--c-border);
      padding: 6px;
      transform-origin: bottom right;
      animation: menu-in 0.18s cubic-bezier(0.34, 1.2, 0.64, 1) both;
    }
    @keyframes menu-in {
      from { opacity: 0; transform: scale(0.85); }
      to   { opacity: 1; transform: scale(1); }
    }
    .aw-menu-item {
      display: flex; align-items: center; gap: 12px;
      width: 100%; padding: 13px 14px; border-radius: 10px;
      border: none; background: transparent;
      color: var(--c-text); font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; text-align: left;
      transition: background 0.12s;
      .material-symbols-outlined { font-size: 20px; color: var(--c-text-3); }
      &:hover { background: var(--c-subtle); }
      &.aw-menu-item--danger { color: #ef5350; }
      &.aw-menu-item--danger .material-symbols-outlined { color: #ef5350; }
      &.aw-menu-item--danger:hover { background: rgba(239,83,80,0.07); }
    }

    /* ── Save as template sheet ── */
    .aw-tpl-backdrop { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,0.4); }
    .aw-tpl-sheet {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: var(--c-card); border-radius: 20px 20px 0 0;
      padding: 20px 20px 36px;
      box-shadow: 0 -4px 24px var(--c-shadow-md);
      animation: sheet-in 0.25s cubic-bezier(0.32, 1.2, 0.64, 1) both;
    }
    @keyframes sheet-in {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }
    .aw-tpl-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;
    }
    .aw-tpl-title { font-size: 17px; font-weight: 800; color: var(--c-text); }
    .aw-tpl-close {
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: var(--c-subtle); cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); }
    }
    .aw-tpl-field { margin-bottom: 4px; }
    .aw-tpl-label {
      display: block; font-size: 12px; font-weight: 700; color: var(--c-text-2);
      text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;
    }
    .aw-tpl-input {
      width: 100%; padding: 12px 14px; border-radius: 10px; box-sizing: border-box;
      border: 1.5px solid var(--c-border); background: var(--c-subtle);
      font-size: 16px; color: var(--c-text); outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); background: var(--c-card); }
    }
    .aw-tpl-actions { display: flex; gap: 8px; margin-top: 18px; }
    .aw-tpl-cancel {
      flex: 1; padding: 13px; border-radius: 12px;
      border: 1.5px solid var(--c-border); background: transparent;
      color: var(--c-text-2); font-size: 15px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover { background: var(--c-subtle); }
    }
    .aw-tpl-save {
      flex: 2; padding: 13px; border-radius: 12px;
      border: none; background: var(--c-brand);
      color: white; font-size: 15px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    /* ── Type grid (inside the Gym / Esport cards) ── */
    .es-empty {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 24px 16px; text-align: center;
    }
    .es-empty-icon { font-size: 32px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 200; }
    .es-empty-msg { font-size: 13px; color: var(--c-text-3); }
    .es-empty-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 8px 16px; border-radius: 10px; border: none;
      background: var(--c-brand); color: #fff;
      font-size: 13px; font-weight: 600; cursor: pointer;
      .material-symbols-outlined { font-size: 16px; }
    }

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
    }

    /* ── Loading ── */
    .loading-state {
      display: flex; justify-content: center; padding: 48px;
      .material-symbols-outlined { font-size: 32px; color: var(--c-border); }
    }

    /* ── Suggestion card: full-width bar, pinned above the nav bar ── */
    .suggestion-float-row {
      position: fixed; left: 16px; right: 16px; bottom: calc(var(--nav-height) + 16px); z-index: 90;
      display: flex;
    }
    .suggestion-float {
      display: flex; align-items: center; gap: 0; width: 100%;
      height: 60px; border-radius: 14px; padding: 0;
      border: 1.5px solid color-mix(in srgb, var(--sc) 35%, var(--c-border-2));
      background: color-mix(in srgb, var(--sc) 8%, var(--c-card));
      box-shadow: 0 4px 16px var(--c-shadow-md);
      cursor: pointer; touch-action: manipulation; overflow: hidden;
      transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
      &:hover {
        box-shadow: 0 5px 20px var(--c-shadow-md);
        border-color: color-mix(in srgb, var(--sc) 55%, var(--c-border));
        background: color-mix(in srgb, var(--sc) 13%, var(--c-card));
      }
      &:active { transform: scale(0.98); }
    }
    .sf-bar { width: 5px; align-self: stretch; flex-shrink: 0; background: var(--sc); }
    .sf-icon-wrap { width: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    .sf-icon { font-size: 23px; color: var(--sc); font-variation-settings: 'FILL' 1; }
    .sf-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .sf-eyebrow {
      font-size: 9.5px; font-weight: 700; line-height: 1;
      color: color-mix(in srgb, var(--sc) 70%, var(--c-text-3));
      text-transform: uppercase; letter-spacing: 0.6px;
    }
    .sf-label {
      font-size: 14px; font-weight: 700; color: var(--c-text); line-height: 1.2;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sf-reason {
      font-size: 11.5px; font-weight: 600; letter-spacing: 0.1px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: color-mix(in srgb, var(--sc) 65%, var(--c-text-3));
    }
    .sf-chevron { font-size: 20px; color: var(--c-text-3); margin-right: 12px; flex-shrink: 0; }

    /* ── "Nou entrenament" section card ── */
    .card-section {
      margin: 16px 16px 0;
      padding: 14px 14px 16px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .section-icon  { font-size: 21px; color: var(--c-brand); font-variation-settings: 'FILL' 1, 'wght' 400; }
    .section-title { margin: 0; flex: 1; font-size: 17px; font-weight: 800; color: var(--c-text); letter-spacing: 0.1px; }

    /* ── Workout summary cards ── */
    .workout-card {
      display: flex; align-items: center;
      margin-bottom: 8px;
      border: 1.5px solid color-mix(in srgb, var(--wc, var(--c-border-2)) 38%, var(--c-border-2));
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

    .type-btn--active {
      border-color: var(--cat-color);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--cat-color) 35%, transparent);
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
    .tp-option--create {
      border-style: dashed;
      border-color: rgba(var(--c-brand-rgb), 0.4);
      background: rgba(var(--c-brand-rgb), 0.03);
      margin-top: 6px;
      .tp-opt-icon { color: var(--c-brand); }
      .tp-opt-name { color: var(--c-brand); }
      &:hover { background: rgba(var(--c-brand-rgb), 0.09); border-color: var(--c-brand); border-style: solid; }
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

    /* ── Trainer proposal card ── */
    .proposal-card {
      margin: 16px 16px 0;
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
  readonly offlineService  = inject(OfflineService);
  readonly trainerService  = inject(TrainerService);
  readonly settingsService = inject(UserSettingsService);
  private templateService  = inject(TemplateService);
  private sharedWorkoutService = inject(SharedWorkoutService);
  private profileService   = inject(WorkoutProfileService);
  readonly hintService     = inject(AppHintService);
  readonly router          = inject(Router);
  private route            = inject(ActivatedRoute);
  private dialog           = inject(MatDialog);
  private feedback         = inject(FeedbackService);
  private confirmDialog    = inject(ConfirmDialogService);

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  readonly selectedDate    = signal<string>(TODAY());
  readonly sportToggling   = signal(false);
  readonly workoutTypes    = WORKOUT_TYPES;
  readonly workoutMenuOpen = signal(false);
  /** Off by default — exercises can only be dragged to reorder once the
   *  user turns this on from the workout's three-dot menu. */
  readonly reorderMode     = signal(false);
  /** Off by default — mutually exclusive with reorderMode; lets the user
   *  select 2+ exercises to link into a superset. */
  readonly groupingMode    = signal(false);
  readonly saveTemplateOpen = signal(false);
  saveTemplateName = '';
  /** Seeded synchronously from the route snapshot (rather than starting
   *  null and waiting for the query-param effect below) so a workout opened
   *  via ?workout=<id> renders straight into the editor on first paint,
   *  without a flash of the dashboard first. */
  readonly activeWorkoutId = signal<string | null>(this.route.snapshot.queryParamMap.get('workout'));
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

  /** Shown regardless of what's already been done today — always suggests
   *  the next overdue category / sport. */
  readonly todaySuggestion = computed((): TodaySuggestion | null => {
    const today = TODAY();
    if (this.selectedDate() !== today) return null;

    const goal    = this.settingsService.fitnessGoal();
    const profile = this.profileService.profile();

    // Score each gym category by how "overdue" it is relative to the user's
    // actual training cycle. Only include categories that have had enough
    // recovery time since the last session.
    const gymCandidates = (['push', 'pull', 'legs'] as ExerciseCategory[])
      .map(cat => ({ cat, ...profile.gym[cat] }))
      .filter(c => c.daysSinceLast >= profile.minRecovery)
      .sort((a, b) => b.overdueScore - a.overdueScore);

    const nextGymCat = gymCandidates[0]?.cat ?? null;

    // Sport: prefer the most-recently-done sport (maintains momentum),
    // fall back to the 30-day favourite, then first available.
    const nextSport = profile.recentSport ?? profile.favoriteSport
                   ?? this.sportService.sports()[0] ?? null;

    const mkGym = (cat: ExerciseCategory): GymSuggestion => {
      const p = profile.gym[cat];
      const daysStr = p.daysSinceLast === 1 ? 'Fa 1 dia' : `Fa ${p.daysSinceLast} dies`;
      const reason  = p.daysSinceLast >= 99
        ? 'Encara no l\'has entrenat'
        : p.overdueScore >= 1.3 ? `${daysStr} · ja toca` : daysStr;
      return {
        type: 'gym', category: cat,
        label: CATEGORY_LABELS[cat], color: CATEGORY_COLORS[cat], icon: CATEGORY_ICONS[cat],
        reason,
      };
    };
    const mkSport = (s: Sport): SportSuggestion => ({
      type: 'sport', sport: s, label: s.name, color: s.color, icon: s.icon,
      reason: profile.recentSport?.id === s.id ? 'El que vas fer l\'últim cop' : 'El teu esport habitual',
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

  handleSuggestionClick(s: TodaySuggestion): void {
    if (s.type === 'gym') this.selectType(s.category);
    else this.openSessionLogger(s.sport);
  }

  readonly isSelectedFuture = computed(() => this.selectedDate() > TODAY());

  readonly pagePaddingBottom = computed(() =>
    '88px' // clear the active-workout menu FAB / the floating suggestion card
  );

  /** Searches across every already-loaded month (not just `selectedDate`),
   *  since the feed lets you open a workout from any past day the month
   *  cache already covers. */
  readonly activeWorkout = computed((): Workout | null => {
    const id = this.activeWorkoutId();
    if (!id) return null;
    return this.workoutService.workouts().find(w => w.id === id) ?? null;
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

  constructor() {
    this.sportService.ensureLoaded();

    // Coming from the home feed with a specific workout to open (e.g. tapping
    // a day's card there navigates here with ?workout=<id>). Reactive (rather
    // than a one-off snapshot read) since this route is kept alive and reused
    // across nav-bar switches, so the query param can change without the
    // component being recreated.
    const queryWorkoutId = toSignal(this.route.queryParamMap.pipe(map(params => params.get('workout'))));
    effect(() => {
      const id = queryWorkoutId();
      if (id) untracked(() => {
        this.openWorkout(id);
        // The train route is kept alive (AppReuseStrategy), so its query-param
        // observable only re-emits when the value actually changes. Strip the
        // consumed ?workout= from the URL right away — otherwise re-tapping the
        // same workout later navigates to an identical URL that never re-fires
        // this effect, leaving the dashboard visible instead of the detail.
        queueMicrotask(() => this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { workout: null },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        }));
      });
    });

    // Coming from the home feed with a specific sport session to open
    // (e.g. tapping a sport row there navigates here with
    // ?sport=<id>&date=<date>). Reactive on sportService.sports() too,
    // since the list may still be loading on first visit; handledSportQueryId
    // stops it from reopening (or, worse, toggle-closing) the sheet every
    // time the sports list happens to change afterwards.
    const querySportId = toSignal(this.route.queryParamMap.pipe(map(params => params.get('sport'))));
    let handledSportQueryId: string | null = null;
    effect(() => {
      const sportId = querySportId();
      const sports  = this.sportService.sports();
      if (!sportId || sportId === handledSportQueryId) return;
      const sport = sports.find(s => s.id === sportId);
      if (!sport) return;
      handledSportQueryId = sportId;
      untracked(() => {
        const date = this.route.snapshot.queryParamMap.get('date');
        if (date && date !== this.selectedDate()) {
          suppressNextDateReset = true;
          this.selectedDate.set(date);
        }
        this.openSessionLogger(sport);
      });
    });

    let firstDateEffectRun = true;
    // Set right before a deep-link (e.g. the sport effect above) changes
    // selectedDate on purpose, so this effect's reset below doesn't
    // immediately close the picker/logger it just opened.
    let suppressNextDateReset = false;
    effect(() => {
      const date = this.selectedDate();
      const [yearStr, monthStr] = date.split('-');
      const year  = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      this.workoutService.ensureMonthLoaded(year, month);
      this.sportService.ensureMonthLoaded(year, month);
      untracked(() => {
        if (firstDateEffectRun) { firstDateEffectRun = false; return; }
        if (suppressNextDateReset) { suppressNextDateReset = false; return; }
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
      this.feedback.error('Error en acceptar la proposta', 3000);
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
    // Workouts are only ever opened from home, so closing one always returns
    // there — never leaves the user on the bare train dashboard.
    this.router.navigate(['/home']);
  }

  async startPlan(w: Workout): Promise<void> {
    try {
      await this.workoutService.startPlannedWorkout(w.id);
      this.openWorkout(w.id);
    } catch {
      this.feedback.error('Error en iniciar el pla', 2500);
    }
  }

  workoutDateLabel(w: Workout): string {
    const d = new Date(w.date + 'T12:00:00');
    const label = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  topbarDateLabel(w: Workout): string {
    const d = new Date(w.date + 'T12:00:00');
    if (w.date === this.selectedDate() && this.isToday()) return 'Avui';
    return d.toLocaleDateString('ca-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  topbarTotalSets(w: Workout): number {
    return w.entries.reduce((acc, e) => acc + e.sets.filter(s => !s.warmup).length, 0);
  }

  workoutLabel(w: Workout): string {
    const cats = workoutCategories(w);
    if (!cats.length) return 'Entrenament';
    return cats.map(c => CATEGORY_LABELS[c as ExerciseCategory] ?? c).join(' + ');
  }

  gridCols(count: number): string {
    return `repeat(${count % 2 === 0 ? 2 : 3}, 1fr)`;
  }

  readonly workoutCardColor    = workoutCardColor;
  readonly workoutPrimaryColor = workoutPrimaryColor;
  readonly workoutVolumeFmt    = workoutVolumeFmt;

  emojiOf(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  async pickWorkoutFeeling(workoutId: string, level: FeelingLevel | undefined): Promise<void> {
    this.awFeelingOpen.set(false);
    try {
      await this.workoutService.updateWorkoutFeeling(workoutId, level);
    } catch {
      this.feedback.error('Error en guardar la sensació', 2000);
    }
  }

  openSaveAsTemplate(w: Workout): void {
    this.workoutMenuOpen.set(false);
    const cats = w.categories ?? (w.category ? [w.category] : []);
    const cat = cats.length === 1 ? cats[0] as ExerciseCategory : null;
    this.saveTemplateName = cat ? (CATEGORY_LABELS[cat] ?? '') : '';
    this.saveTemplateOpen.set(true);
  }

  /** From the contextual nudge: opening the sheet means the user found the
   *  feature, so dismiss the nudge too. */
  saveTemplateFromNudge(w: Workout): void {
    this.hintService.dismiss('nudge-save-template');
    this.openSaveAsTemplate(w);
  }

  async confirmSaveAsTemplate(): Promise<void> {
    const name = this.saveTemplateName.trim();
    const w = this.activeWorkout();
    if (!name || !w) return;
    const cats = w.categories ?? (w.category ? [w.category] : []);
    const cat: ExerciseCategory | 'mixed' = cats.length === 1
      ? cats[0] as ExerciseCategory
      : 'mixed';
    const entries = w.entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName }));
    try {
      await this.templateService.create(name, cat, entries);
      this.saveTemplateOpen.set(false);
      this.saveTemplateName = '';
      this.feedback.success('Plantilla guardada', 2000);
    } catch {
      this.feedback.error('Error en guardar la plantilla', 3000);
    }
  }

  async shareWorkout(w: Workout): Promise<void> {
    this.workoutMenuOpen.set(false);
    try {
      const cats = w.categories ?? (w.category ? [w.category] : []);
      const cat: ExerciseCategory | 'mixed' = cats.length === 1 ? cats[0] as ExerciseCategory : 'mixed';
      const id  = await this.sharedWorkoutService.share(this.workoutLabel(w), cat, w.entries);
      const url = `${window.location.origin}/share/${id}`;

      if (navigator.share) {
        await navigator.share({ title: this.workoutLabel(w), text: 'T\'he compartit un entrenament!', url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        this.feedback.success('Enllaç copiat', 1800);
      }
    } catch {
      this.feedback.error('Error en compartir l\'entrenament', 3000);
    }
  }

  async deleteActiveWorkout(): Promise<void> {
    if (!await this.confirmDialog.confirm('Eliminar l\'entrenament?', { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    const w = this.activeWorkout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.closeWorkout();
    } catch {
      this.feedback.error('Error en eliminar', 2000);
    }
  }

  async confirmDeleteWorkout(w: Workout): Promise<void> {
    if (!await this.confirmDialog.confirm(`Eliminar "${this.workoutLabel(w)}"?`, { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
    } catch {
      this.feedback.error('Error en eliminar', 2000);
    }
  }

  // ── Workout creation ──────────────────────────────────────────────────────

  selectType(category: ExerciseCategory): void {
    if (this.pickerCat() === category) { this.closePicker(); return; }
    this.loggerSport.set(null);
    this.pickerCat.set(category);
  }

  closePicker(): void { this.pickerCat.set(null); }

  /** Create a planned workout (future date) or a live one (today/past), then open it. */
  private async _createForSelectedDate(cat: ExerciseCategory, entries: WorkoutEntry[]): Promise<string> {
    if (this.isSelectedFuture()) {
      return this.workoutService.createPlannedWorkout(this.selectedDate(), cat, entries);
    }
    if (entries.length) {
      return this.workoutService.createWorkoutFromTemplate(this.selectedDate(), cat, entries);
    }
    return this.workoutService.createWorkoutForDate(this.selectedDate(), cat);
  }

  async pickerStartEmpty(): Promise<void> {
    const cat = this.pickerCat();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    try {
      const id = await this._createForSelectedDate(cat, []);
      this.openWorkout(id);
    } catch {
      this.feedback.error('Error en crear l\'entrenament', 3000);
    } finally { this.creating.set(false); }
  }

  async pickerStartFromLast(): Promise<void> {
    const cat  = this.pickerCat();
    const last = this.pickerLast();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    try {
      const id = await this._createForSelectedDate(cat, last?.entries ?? []);
      this.openWorkout(id);
    } catch {
      this.feedback.error('Error en crear l\'entrenament', 3000);
    } finally { this.creating.set(false); }
  }

  async pickerStartFromTemplate(t: WorkoutTemplate): Promise<void> {
    const cat = this.pickerCat();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    this.templateService.recordUse(t.id).catch(() => {});
    try {
      const useCat = t.category === 'mixed' ? cat : t.category as ExerciseCategory;
      const entries: WorkoutEntry[] = t.entries.map(e => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        sets: (e.sets && e.reps && e.sets > 0 && e.reps > 0)
          ? Array.from({ length: e.sets }, () => ({ weight: e.weight ?? 0, reps: e.reps! }))
          : [],
      }));
      const id = await this._createForSelectedDate(useCat, entries);
      this.openWorkout(id);
    } catch {
      this.feedback.error('Error en crear l\'entrenament', 3000);
    } finally { this.creating.set(false); }
  }

  goToTemplates(): void {
    this.closePicker();
    this.router.navigate(['/templates']);
  }

  maxWeight(entry: WorkoutEntry): number {
    return entry.sets.length ? Math.max(...entry.sets.map(s => setMaxWeight(s))) : 0;
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
        this.feedback.error('Error en afegir l\'exercici', 3000);
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
    if (s.feeling)  parts.push(formatFeeling(s.feeling, this.settingsService.difficultyScale()));
    return parts.length ? parts.join(' ') : null;
  }

  // ── Session logger ────────────────────────────────────────────────────────

  readonly durationPresets: number[] = [30, 45, 60, 90];
  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  openSessionLogger(sport: Sport): void {
    if (this.loggerSport()?.id === sport.id) { this.closeSessionLogger(); return; }
    const existing = this.sportService.getSessionForDate(this.selectedDate(), sport.id);
    this.pickerCat.set(null);
    this.loggerSport.set(sport);
    this.loggerSessionId.set(existing?.id ?? null);
    this.loggerDuration.set(existing?.duration ?? 60);
    this.loggerSubtype.set(existing?.subtypeId ?? null);
    this.loggerFeeling.set(existing?.feeling ?? null);
    this.loggerMetrics.set({ ...(existing?.metrics ?? {}) });
    this.loggerNotes.set(existing?.notes ?? '');
  }

  closeSessionLogger(): void { this.loggerSport.set(null); }

  feelingEmoji(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

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
        await this.sportService.logSession(
          date, sport.id, data,
          this.isSelectedFuture() ? 'planned' : 'done',
          this.isSelectedFuture() ? 'manual' : undefined,
        );
      }
      this.closeSessionLogger();
    } catch {
      this.feedback.error('Error en guardar', 2500);
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
      this.feedback.error('Error en eliminar', 2500);
    } finally {
      this.sportToggling.set(false);
    }
  }
}
