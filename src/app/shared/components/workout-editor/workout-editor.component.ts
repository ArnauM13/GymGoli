import { Component, OnDestroy, ViewEncapsulation, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CATEGORY_COLORS, CATEGORY_LABELS, SUBCATEGORY_LABELS } from '../../../core/models/exercise.model';
import { FEELING_EMOJI, FEELING_LABEL, FeelingLevel, Workout, WorkoutEntry, WorkoutSet } from '../../../core/models/workout.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { ExerciseStatsDialogComponent } from '../exercise-stats-dialog.component';
import { kgToDisplay, displayToKg, weightStep } from '../../utils/weight.utils';

// Module-level: persists collapsed state per workout for the entire browser session
const _collapsedByWorkout = new Map<string, Set<string>>();

@Component({
  selector: 'app-workout-editor',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, DragDropModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (workout(); as w) {
      <div class="we-entries" cdkDropList (cdkDropListDropped)="onDrop($event)">

        @for (entry of w.entries; track entry.exerciseId) {
          <div class="we-entry-card"
               cdkDrag [cdkDragDisabled]="!editMode() && !alwaysEditable()"
               [style.--we-cat-color]="getCatColor(entry)"
               [class.we-entry-solo-edit]="!editMode() && !alwaysEditable() && editingEntry() === entry.exerciseId">

            <div class="we-drag-placeholder" *cdkDragPlaceholder></div>

            <!-- ── Entry header ── -->
            <div class="we-entry-header">
              <!-- Drag handle: always on the left in train mode, restricts drag to handle only -->
              @if (editMode() || alwaysEditable()) {
                <span class="we-drag-handle material-symbols-outlined" cdkDragHandle>drag_indicator</span>
              }
              <div class="we-entry-title" (click)="toggleCollapse(entry.exerciseId)">
                <div class="we-entry-badges">
                  <span class="we-category-badge" [style.background]="getCatColor(entry)">
                    {{ getCatLabel(entry) }}
                  </span>
                  @if (getSubLabel(entry)) {
                    <span class="we-subcategory-badge">{{ getSubLabel(entry) }}</span>
                  }
                </div>
                <div class="we-entry-name-row">
                  <span class="we-entry-name">{{ entry.exerciseName }}</span>
                  @if (prEntries().has(entry.exerciseId)) {
                    <span class="we-pr-badge">🏆</span>
                  }
                  <span class="we-collapse-chevron material-symbols-outlined"
                        [class.rotated]="isCollapsed(entry.exerciseId)">
                    expand_more
                  </span>
                </div>
              </div>

              <!-- Grup: sentiment + estadístiques (only when expanded) -->
              @if (!isCollapsed(entry.exerciseId)) {
                <div class="we-entry-actions-group">
                  @if (entry.feeling || isEntryEditable(entry.exerciseId)) {
                    <button type="button" class="we-icon-btn-sm we-fatiga-btn"
                      [class.we-fatiga-btn--set]="!!entry.feeling"
                      [class.we-fatiga-btn--editable]="isEntryEditable(entry.exerciseId)"
                      [title]="entry.feeling ? getFeelingLabel(entry.feeling) : 'Afegir fatiga'"
                      (click)="isEntryEditable(entry.exerciseId) && openFatigaPicker(entry.exerciseId)">
                      @if (entry.feeling) {
                        <span class="we-fatiga-btn-emoji">{{ getFeelingEmoji(entry.feeling) }}</span>
                      } @else {
                        <span class="material-symbols-outlined">sentiment_neutral</span>
                      }
                    </button>
                  }
                  <button class="we-icon-btn-sm" (click)="openStats(entry)" title="Estadístiques">
                    <span class="material-symbols-outlined">bar_chart</span>
                  </button>
                </div>
              }

              @if (editMode() || alwaysEditable()) {
                <button class="we-remove-btn" (click)="removeEntry(entry.exerciseId)" title="Eliminar exercici">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              } @else if (!alwaysEditable()) {
                <!-- Per-entry edit toggle (only in history mode) -->
                @if (editingEntry() === entry.exerciseId) {
                  <button class="we-icon-btn-sm we-entry-done-btn" (click)="editingEntry.set(null)" title="Tancar edició">
                    <span class="material-symbols-outlined">check</span>
                  </button>
                } @else {
                  <button class="we-icon-btn-sm" (click)="startEntryEdit(entry.exerciseId)" title="Editar exercici">
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                }
              }
            </div>


            <!-- ── Col·lapsable body ── -->
            <div class="we-entry-body" [class.collapsed]="isCollapsed(entry.exerciseId)">
            <div class="we-entry-body-inner">

            <!-- ── Last session info banner ── -->
            @if (lastSessionData()?.exerciseId === entry.exerciseId && entry.sets.length === 0 && addingFor() === entry.exerciseId) {
              <div class="we-last-session-banner">
                <span class="material-symbols-outlined we-lsb-icon">history</span>
                <div class="we-lsb-info">
                  <span class="we-lsb-label">Última sessió</span>
                  <span class="we-lsb-date">{{ formatLastDate(lastSessionData()!.date) }}</span>
                </div>
                <div class="we-lsb-stats">
                  <span class="we-lsb-weight">{{ dispW(lastSessionData()!.maxWeight) }}{{ unit() }}</span>
                  @if (lastSessionData()!.feeling) {
                    <span class="we-lsb-feeling">{{ getFeelingEmoji(lastSessionData()!.feeling!) }}</span>
                  }
                </div>
              </div>
            }

            <!-- ── Sets list ── -->
            @if (entry.sets.length > 0) {
              <div class="we-sets-list">
                @for (set of entry.sets; track $index) {
                  @if (isEditingSet(entry.exerciseId, $index)) {
                    <!-- Inline edit row -->
                    <div class="we-edit-set-row">
                      <span class="we-set-num">{{ $index + 1 }}</span>
                      <form [formGroup]="editSetForm" (ngSubmit)="saveEditSet()" class="we-inline-edit">
                        <div class="we-inline-inputs">
                          <div class="we-inline-group">
                            <label>Pes</label>
                            <div class="we-number-input compact">
                              <button type="button" (click)="adjustEditWeight(-1)">−</button>
                              <input type="number" formControlName="weight" min="0" step="2.5"
                                     (focus)="$any($event.target).select()">
                              <button type="button" (click)="adjustEditWeight(1)">+</button>
                            </div>
                          </div>
                          <div class="we-inline-group">
                            <label>Reps</label>
                            <div class="we-number-input compact">
                              <button type="button" (click)="adjustEditReps(-1)">−</button>
                              <input type="number" formControlName="reps" min="1" step="1"
                                     (focus)="$any($event.target).select()">
                              <button type="button" (click)="adjustEditReps(1)">+</button>
                            </div>
                          </div>
                        </div>
                        <div class="we-inline-actions">
                          <button type="button" mat-button (click)="cancelEditSet()">Cancel·lar</button>
                          <button type="submit" mat-flat-button [disabled]="editSetForm.invalid">Desar</button>
                        </div>
                      </form>
                    </div>
                  } @else {
                    <!-- Set row: tap to edit when entry is editable -->
                    <div class="we-set-row"
                         [class.we-set-row-tappable]="isEntryEditable(entry.exerciseId)"
                         (click)="isEntryEditable(entry.exerciseId) && startEditSet(entry.exerciseId, $index, set)">
                      <span class="we-set-num">{{ $index + 1 }}</span>
                      <div class="we-set-pills">
                        <span class="we-set-pill weight">{{ dispW(set.weight) }}<small>{{ unit() }}</small></span>
                        <span class="we-set-pill reps">{{ set.reps }}<small>r</small></span>
                      </div>
                      @if (isEntryEditable(entry.exerciseId)) {
                        <button class="we-icon-btn-sm danger"
                          (click)="$event.stopPropagation(); removeSet(entry.exerciseId, $index)"
                          aria-label="Eliminar sèrie">
                          <span class="material-symbols-outlined">close</span>
                        </button>
                      }
                    </div>
                  }
                }
              </div>
            } @else if (!isEntryEditable(entry.exerciseId)) {
              <p class="we-no-sets-hint">Sense sèries registrades</p>
            }

            <!-- ── Add-sets form / buttons ── -->
            @if (isEntryEditable(entry.exerciseId)) {
              @if (addingFor() === entry.exerciseId) {
                <form [formGroup]="setForm" class="we-set-form">
                  <div class="we-set-inputs">
                    <div class="we-input-group">
                      <label>Pes ({{ unit() }})</label>
                      <div class="we-number-input">
                        <button type="button" (click)="adjustWeight(-1)">−</button>
                        <input type="number" formControlName="weight" min="0" step="2.5"
                               (focus)="$any($event.target).select()">
                        <button type="button" (click)="adjustWeight(1)">+</button>
                      </div>
                    </div>
                    <div class="we-input-group">
                      <label>Repeticions</label>
                      <div class="we-number-input">
                        <button type="button" (click)="adjustReps(-1)">−</button>
                        <input type="number" formControlName="reps" min="1" step="1"
                               (focus)="$any($event.target).select()">
                        <button type="button" (click)="adjustReps(1)">+</button>
                      </div>
                    </div>
                  </div>
                  <div class="we-set-form-actions">
                    <button type="button" class="we-cancel-btn" (click)="cancelSet()">Cancel·lar</button>
                    <div class="we-quick-add">
                      <button type="button" class="we-qty-btn" (click)="submitSets(entry.exerciseId, 2)"
                              [disabled]="setForm.invalid">×2</button>
                      <button type="button" class="we-qty-btn" (click)="submitSets(entry.exerciseId, 4)"
                              [disabled]="setForm.invalid">×4</button>
                      <button type="button" class="we-submit-btn" (click)="submitSets(entry.exerciseId, 1)"
                              [disabled]="setForm.invalid">
                        <span class="material-symbols-outlined">add</span>
                        Afegir
                      </button>
                    </div>
                  </div>
                </form>
              } @else {
                <!-- Add / Repeat row -->
                <div class="we-add-set-row">
                  <button class="we-add-set-btn" (click)="startAddSet(entry)">
                    <span class="material-symbols-outlined">add</span>
                    Afegir sèries
                  </button>
                  @if (entry.sets.length > 0) {
                    <button class="we-repeat-btn" (click)="repeatLastSet(entry)"
                            [title]="'Repetir: ' + dispW(entry.sets[entry.sets.length - 1].weight) + unit() + ' × ' + entry.sets[entry.sets.length - 1].reps">
                      <span class="material-symbols-outlined">repeat</span>
                      <span class="we-repeat-label">{{ dispW(entry.sets[entry.sets.length - 1].weight) }}{{ unit() }} × {{ entry.sets[entry.sets.length - 1].reps }}</span>
                    </button>
                  }
                </div>
              }
            }

            </div><!-- /we-entry-body-inner -->
            </div><!-- /we-entry-body -->

          </div>
        }

        @if (alwaysEditable() || editMode()) {
          <button class="we-add-exercise-btn" (click)="requestAddExercise.emit()">
            <span class="material-symbols-outlined">add</span>
            Afegir exercici
          </button>
        }

      </div>

      <!-- ── Rest timer ── -->
      @if (timerActive()) {
        <div class="we-rest-timer" [class.we-rt--ending]="timerRemaining() <= 5">
          <div class="we-rt-header">
            <div class="we-rt-info">
              <span class="material-symbols-outlined we-rt-icon">timer</span>
              <span class="we-rt-label">Descans</span>
            </div>
            <button class="we-rt-close" (click)="cancelTimer()" title="Saltar descans">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
          <div class="we-rt-countdown" (click)="cancelTimer()">{{ formatTimer(timerRemaining()) }}</div>
          <div class="we-rt-controls">
            <button class="we-rt-adj" (click)="adjustTimer(-30)">−30s</button>
            <button class="we-rt-adj" (click)="adjustTimer(30)">+30s</button>
          </div>
        </div>
      }

      <!-- ── Fatiga popup ── -->
      @if (feelingPickerFor()) {
        <div class="we-fatiga-backdrop" (click)="closeFatigaPicker()"></div>
        <div class="we-fatiga-popup">
          <div class="we-fatiga-popup-header">
            <span class="we-fatiga-popup-title">Fatiga</span>
            @if (fatigaEntry()?.feeling) {
              <button class="we-fatiga-clear-btn" (click)="pickFeeling(fatigaEntry()!.feeling!)">
                <span class="material-symbols-outlined">close</span>
              </button>
            }
          </div>
          <div class="we-fatiga-options">
            @for (level of feelingLevels; track level) {
              <button type="button" class="we-fatiga-option"
                [class.selected]="fatigaEntry()?.feeling === level"
                (click)="pickFeeling(level)">
                <span class="we-fatiga-option-emoji">{{ getFeelingEmoji(level) }}</span>
                <span class="we-fatiga-option-label">{{ getFeelingLabel(level) }}</span>
              </button>
            }
          </div>
        </div>
      }

    }
  `,
  styles: [`
    .we-entries {
      padding: 10px 16px 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ── Entry card ── */
    .we-entry-card {
      background: var(--c-card);
      border-radius: 14px;
      box-shadow: 0 2px 8px var(--c-shadow);
      overflow: hidden;
      border-left: 4px solid var(--we-cat-color, #ccc);
      transition: box-shadow 0.2s, border-left-width 0.2s;
    }

    .we-entry-solo-edit {
      box-shadow: 0 3px 14px rgba(var(--c-brand-rgb), 0.18);
      border-left-width: 5px;
    }

    .we-entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 10px 14px 8px;
      gap: 8px;
    }

    .we-drag-handle {
      font-size: 22px; color: var(--c-border); cursor: grab;
      padding: 6px 2px; flex-shrink: 0;
      user-select: none; touch-action: none;
      &:active { cursor: grabbing; color: var(--c-text-3); }
    }

    .we-entry-card.cdk-drag-preview {
      box-shadow: 0 8px 24px var(--c-shadow-md);
      border-radius: 14px; opacity: 0.95;
    }
    .we-drag-placeholder {
      height: 60px; border: 2px dashed rgba(var(--c-brand-rgb), 0.2);
      border-radius: 14px; background: rgba(var(--c-brand-rgb), 0.04);
    }
    .cdk-drag-animating .we-entry-card { transition: transform 200ms ease; }

    .we-entry-title { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .we-entry-name  { font-size: 16px; font-weight: 600; color: var(--c-text); }
    .we-entry-name-row { display: flex; align-items: center; gap: 2px; }

    .we-collapse-chevron {
      font-size: 18px; color: var(--c-text-3); flex-shrink: 0;
      transition: transform 0.22s ease;
      &.rotated { transform: rotate(-90deg); }
    }

    .we-entry-title {
      cursor: pointer;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    /* ── Col·lapsable body ── */
    .we-entry-body {
      display: grid;
      grid-template-rows: 1fr;
      transition: grid-template-rows 0.22s ease;
    }
    .we-entry-body.collapsed {
      grid-template-rows: 0fr;
    }
    .we-entry-body-inner { overflow: hidden; }

    /* ── Grup accions (sentiment + estadístiques) ── */
    .we-entry-actions-group {
      display: flex; align-items: center; gap: 0;
      background: var(--c-subtle); border: 1px solid var(--c-border-2); border-radius: 8px;
      overflow: hidden; flex-shrink: 0;
      .we-icon-btn-sm {
        border: none; border-radius: 0; background: transparent;
        &:hover { background: var(--c-hover); }
        & + .we-icon-btn-sm { border-left: 1px solid var(--c-border-2); }
      }
    }

    /* ── Botó fatiga (dins del grup) ── */
    .we-fatiga-btn {
      cursor: default;
      .material-symbols-outlined { color: var(--c-border); }
    }
    .we-fatiga-btn--editable {
      cursor: pointer;
      &:hover { background: var(--c-hover) !important; }
      &:active { transform: scale(0.94); }
    }
    .we-fatiga-btn--set .material-symbols-outlined { color: var(--c-text-3); }
    .we-fatiga-btn-emoji { font-size: 18px; line-height: 1; }

    .we-entry-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

    .we-category-badge {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600; color: white; width: fit-content;
    }
    .we-subcategory-badge {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 500; color: var(--c-text-2); background: var(--c-border-2); width: fit-content;
    }

    .we-remove-btn {
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s, color 0.15s; flex-shrink: 0;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(239,83,80,0.1); color: #ef5350; }
    }

    .we-entry-done-btn {
      background: rgba(var(--c-brand-rgb), 0.1) !important;
      border-color: rgba(var(--c-brand-rgb), 0.3) !important;
      color: var(--c-brand) !important;
    }

    /* ── Fatiga popup ── */
    .we-fatiga-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.35);
    }
    .we-fatiga-popup {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: var(--c-card); border-radius: 20px 20px 0 0;
      padding: 20px 20px 32px;
      box-shadow: 0 -4px 24px var(--c-shadow-md);
    }
    .we-fatiga-popup-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 20px;
    }
    .we-fatiga-popup-title {
      font-size: 17px; font-weight: 700; color: var(--c-text);
    }
    .we-fatiga-clear-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      border: 1.5px solid rgba(239,83,80,0.3); background: rgba(239,83,80,0.07);
      color: #ef5350; cursor: pointer;
      touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(239,83,80,0.16); }
    }
    .we-fatiga-options {
      display: flex; gap: 8px; justify-content: space-between;
    }
    .we-fatiga-option {
      flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 12px 4px; border-radius: 14px;
      border: 2px solid transparent; background: var(--c-subtle);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { background: var(--c-hover); transform: translateY(-2px); }
      &:active { transform: scale(0.94); }
      &.selected {
        border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.1);
        transform: translateY(-2px);
      }
    }
    .we-fatiga-option-emoji { font-size: 28px; line-height: 1; }
    .we-fatiga-option-label { font-size: 10px; font-weight: 600; color: var(--c-text-2); text-align: center; }

    /* ── Last session banner ── */
    .we-last-session-banner {
      display: flex; align-items: center; gap: 10px;
      margin: 4px 14px 6px; padding: 10px 14px;
      background: rgba(var(--c-brand-rgb), 0.07); border: 1px solid rgba(var(--c-brand-rgb), 0.15);
      border-radius: 10px;
    }
    .we-lsb-icon { font-size: 20px; color: var(--c-brand); flex-shrink: 0; }
    .we-lsb-info { display: flex; flex-direction: column; gap: 1px; flex: 1; }
    .we-lsb-label { font-size: 10px; font-weight: 600; color: var(--c-text-2); text-transform: uppercase; letter-spacing: 0.4px; }
    .we-lsb-date  { font-size: 13px; font-weight: 600; color: var(--c-text); }
    .we-lsb-stats { display: flex; align-items: center; gap: 6px; }
    .we-lsb-weight { font-size: 16px; font-weight: 700; color: var(--c-brand); }
    .we-lsb-feeling { font-size: 20px; line-height: 1; }

    .we-no-sets-hint {
      margin: 0; padding: 4px 14px 12px;
      font-size: 13px; color: var(--c-text-3); font-style: italic;
    }

    /* ── Sets list ── */
    .we-sets-list { padding: 0 14px 4px; }

    .we-set-row {
      display: flex; align-items: center; gap: 10px;
      min-height: 48px; border-bottom: 1px solid var(--c-border-2);
      border-radius: 8px; padding: 0 4px;
      transition: background 0.12s;
      &:last-child { border-bottom: none; }

      &.we-set-row-tappable {
        cursor: pointer;
        &:hover { background: rgba(var(--c-brand-rgb), 0.05); }
        &:active { background: rgba(var(--c-brand-rgb), 0.1); }
      }
    }

    .we-set-num {
      color: var(--c-text-3); font-size: 12px; font-weight: 500;
      width: 20px; text-align: center; flex-shrink: 0;
    }

    .we-set-pills { flex: 1; display: flex; gap: 8px; }

    .we-set-pill {
      display: inline-flex; align-items: baseline; gap: 3px;
      padding: 6px 12px; border-radius: 20px; font-size: 15px; font-weight: 700;
      small { font-size: 11px; font-weight: 500; opacity: 0.7; }
      &.weight { background: rgba(var(--c-brand-rgb), 0.1); color: var(--c-brand); }
      &.reps   { background: var(--c-border-2); color: var(--c-text-2); }
    }

    /* ── Icon buttons ── */
    .we-icon-btn-sm {
      background: var(--c-subtle); border: 1px solid var(--c-border-2); border-radius: 8px;
      cursor: pointer; color: var(--c-text-2); padding: 7px 10px;
      display: flex; align-items: center; min-width: 40px; min-height: 36px;
      justify-content: center; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover        { background: var(--c-hover); color: var(--c-text-2); }
      &.danger       { background: rgba(239,83,80,0.08); border-color: rgba(239,83,80,0.2); color: #ef5350; }
      &.danger:hover { background: rgba(239,83,80,0.16); }
    }

    /* ── Inline set-edit row ── */
    .we-edit-set-row {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 0 8px; background: rgba(var(--c-brand-rgb), 0.05); border-radius: 10px; margin: 4px 0;
      .we-set-num { padding-top: 14px; }
    }
    .we-inline-edit { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .we-inline-inputs { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
    .we-inline-group {
      display: flex; flex-direction: column; gap: 3px;
      label { font-size: 11px; color: var(--c-text-2); font-weight: 600; }
    }
    .we-number-input.compact {
      button { width: 26px; height: 30px; font-size: 15px; }
      input  { font-size: 16px; font-weight: 600; padding: 4px 0; min-width: 48px; }
    }
    .we-inline-actions { display: flex; justify-content: flex-end; gap: 6px; }

    /* ── Add-sets form ── */
    .we-set-form {
      padding: 12px 14px; background: var(--c-subtle); border-top: 1px solid var(--c-border-2);
      display: flex; flex-direction: column; gap: 12px;
    }

    .we-set-inputs { display: flex; gap: 10px; }

    .we-input-group {
      flex: 1; display: flex; flex-direction: column; gap: 4px;
      label { font-size: 12px; color: var(--c-text-2); font-weight: 500; }
    }

    .we-number-input {
      display: flex; align-items: center;
      border: 1.5px solid var(--c-border); border-radius: 8px; overflow: hidden; background: var(--c-card);
      button {
        width: 30px; height: 38px; border: none; background: var(--c-subtle);
        font-size: 18px; cursor: pointer; color: var(--c-text); touch-action: manipulation;
        &:hover  { background: var(--c-hover); }
        &:active { background: var(--c-border-2); }
      }
      input {
        flex: 1; border: none; text-align: center;
        font-size: 16px; font-weight: 600; outline: none;
        width: 0; min-width: 0; padding: 8px 0; background: var(--c-card); color: var(--c-text);
      }
    }

    /* ── Add-set form action buttons ── */
    .we-set-form-actions {
      display: flex; align-items: center; gap: 8px;
    }
    .we-cancel-btn {
      padding: 10px 14px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: transparent;
      color: var(--c-text-3); font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { background: var(--c-subtle); color: var(--c-text-2); }
      &:active { transform: scale(0.95); }
    }
    .we-quick-add {
      flex: 1; display: flex; gap: 6px; justify-content: flex-end; align-items: stretch;
    }
    .we-qty-btn {
      padding: 10px 14px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-subtle);
      color: var(--c-text-2); font-size: 14px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover:not(:disabled) { background: var(--c-hover); color: var(--c-text); }
      &:active:not(:disabled) { transform: scale(0.95); }
      &:disabled { opacity: 0.4; cursor: default; }
    }
    .we-submit-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 10px 16px; border-radius: 10px;
      border: none; background: var(--c-brand);
      color: white; font-size: 14px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:active:not(:disabled) { transform: scale(0.95); }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    /* ── Add / Repeat row ── */
    .we-add-set-row {
      display: flex; align-items: stretch;
      border-top: 1px solid rgba(var(--c-brand-rgb), 0.08);
    }

    .we-add-set-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 14px; border: none; background: rgba(var(--c-brand-rgb), 0.06);
      color: var(--c-brand); font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      &:hover { background: rgba(var(--c-brand-rgb), 0.12); }
    }

    .we-repeat-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 14px 16px;
      border: none; border-left: 1px solid rgba(var(--c-brand-rgb), 0.12);
      background: rgba(var(--c-brand-rgb), 0.04);
      color: var(--c-brand); font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s; white-space: nowrap;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(var(--c-brand-rgb), 0.12); }
    }
    .we-repeat-label { font-size: 13px; font-weight: 600; }

    /* ── Add-exercise button (history edit mode) ── */
    .we-add-exercise-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 15px;
      border: 2px dashed rgba(var(--c-brand-rgb), 0.5); border-radius: 14px;
      background: rgba(var(--c-brand-rgb), 0.05); color: var(--c-brand);
      font-size: 14px; font-weight: 700;
      cursor: pointer; margin-top: 8px; transition: all 0.18s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; line-height: 1; vertical-align: middle; }
      &:hover { border-color: var(--c-brand); border-style: solid; background: rgba(var(--c-brand-rgb), 0.1); }
      &:active { transform: scale(0.98); }
    }

    .we-set-actions { display: flex; gap: 2px; align-items: center; }

    /* ── Personal Record badge ── */
    .we-pr-badge {
      font-size: 14px; line-height: 1; flex-shrink: 0;
      animation: pr-pop 0.4s cubic-bezier(0.34, 1.6, 0.64, 1) both;
    }
    @keyframes pr-pop {
      from { opacity: 0; transform: scale(0.3) rotate(-20deg); }
      to   { opacity: 1; transform: scale(1) rotate(0deg); }
    }

    /* ── Rest timer ── */
    .we-rest-timer {
      position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
      z-index: 100; width: calc(100% - 64px); max-width: 300px;
      display: flex; flex-direction: column; gap: 4px;
      background: var(--c-card); border-radius: 20px;
      box-shadow: 0 4px 24px var(--c-shadow-md);
      padding: 14px 16px 16px;
      border: 1.5px solid rgba(var(--c-brand-rgb), 0.2);
      animation: rt-in 0.25s cubic-bezier(0.34, 1.3, 0.64, 1) both;
      &.we-rt--ending {
        border-color: rgba(239,83,80,0.4);
        .we-rt-countdown { color: #ef5350; }
      }
    }
    @keyframes rt-in {
      from { opacity: 0; transform: translateX(-50%) translateY(12px); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    .we-rt-header { display: flex; align-items: center; justify-content: space-between; }
    .we-rt-info { display: flex; align-items: center; gap: 5px; }
    .we-rt-icon { font-size: 16px; color: var(--c-brand); }
    .we-rt-label { font-size: 12px; font-weight: 600; color: var(--c-text-2); }
    .we-rt-close {
      width: 28px; height: 28px; border-radius: 50%;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
    }
    .we-rt-countdown {
      text-align: center; padding: 4px 0;
      font-size: 42px; font-weight: 800; color: var(--c-text);
      font-variant-numeric: tabular-nums; letter-spacing: -2px;
      cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
      transition: color 0.15s;
      &:active { opacity: 0.7; }
    }
    .we-rt-controls { display: flex; gap: 8px; }
    .we-rt-adj {
      flex: 1; padding: 8px 12px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-subtle);
      font-size: 13px; font-weight: 700; color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: background 0.12s;
      &:hover { background: var(--c-hover); }
    }
  `],
})
export class WorkoutEditorComponent implements OnDestroy {
  private workoutService   = inject(WorkoutService);
  private exerciseService  = inject(ExerciseService);
  private settingsService  = inject(UserSettingsService);
  private snackBar         = inject(MatSnackBar);
  private fb               = inject(FormBuilder);
  private dialog           = inject(MatDialog);

  readonly unit = this.settingsService.weightUnit;

  readonly workout        = input<Workout | null>(null);
  readonly editMode       = input<boolean>(false);
  /** When true (Today mode): all entries are always editable, no per-entry toggle shown */
  readonly alwaysEditable = input<boolean>(false);

  readonly requestAddExercise = output<void>();

  readonly addingFor        = signal<string | null>(null);
  readonly editingSet       = signal<{ exerciseId: string; index: number } | null>(null);
  readonly editingEntry     = signal<string | null>(null);
  readonly lastSessionData  = signal<{ exerciseId: string; date: string; maxWeight: number; feeling?: FeelingLevel } | null>(null);
  readonly feelingPickerFor = signal<string | null>(null);
  readonly collapsedEntries = signal<Set<string>>(new Set());

  // ── Rest timer ─────────────────────────────────────────────────────────────
  readonly timerActive    = signal(false);
  readonly timerRemaining = signal(0);
  readonly timerTotal     = signal(0);
  private _timerId: ReturnType<typeof setInterval> | null = null;
  private _timerForExercise: string | null = null;

  // ── Personal Records ───────────────────────────────────────────────────────
  readonly prEntries = signal<Set<string>>(new Set());

  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  readonly fatigaEntry = computed(() => {
    const id = this.feelingPickerFor();
    const w  = this.workout();
    if (!id || !w) return null;
    return w.entries.find(e => e.exerciseId === id) ?? null;
  });

  readonly setForm = this.fb.group({
    weight: [0, [Validators.required, Validators.min(0)]],
    reps:   [8, [Validators.required, Validators.min(1)]],
  });

  readonly editSetForm = this.fb.group({
    weight: [0, [Validators.required, Validators.min(0)]],
    reps:   [8, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    // Restore persisted collapsed state when the workout changes
    effect(() => {
      const id = this.workout()?.id;
      if (id) {
        untracked(() => this.collapsedEntries.set(
          new Set(_collapsedByWorkout.get(id) ?? [])
        ));
      }
    }, { allowSignalWrites: true });
  }

  isEntryEditable(exerciseId: string): boolean {
    return this.editMode() || this.alwaysEditable() || this.editingEntry() === exerciseId;
  }

  isCollapsed(id: string): boolean { return this.collapsedEntries().has(id); }

  toggleCollapse(id: string): void {
    const s = new Set(this.collapsedEntries());
    s.has(id) ? s.delete(id) : s.add(id);
    this.collapsedEntries.set(s);
    const wid = this.workout()?.id;
    if (wid) _collapsedByWorkout.set(wid, new Set(s));
  }

  private _expandEntry(id: string): void {
    if (!this.collapsedEntries().has(id)) return;
    const s = new Set(this.collapsedEntries());
    s.delete(id);
    this.collapsedEntries.set(s);
    const wid = this.workout()?.id;
    if (wid) _collapsedByWorkout.set(wid, new Set(s));
  }

  reset(): void {
    this._resetForm();
    this.editingEntry.set(null);
    this.lastSessionData.set(null);
  }

  private _resetForm(): void {
    this.addingFor.set(null);
    this.editingSet.set(null);
    this.setForm.reset({ weight: 0, reps: 8 });
  }

  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }
  getFeelingLabel(level: FeelingLevel): string { return FEELING_LABEL[level]; }

  getCatColor(entry: WorkoutEntry): string {
    const ex = this.exerciseService.getById(entry.exerciseId);
    return ex ? CATEGORY_COLORS[ex.category] : '#bbb';
  }
  getCatLabel(entry: WorkoutEntry): string {
    const ex = this.exerciseService.getById(entry.exerciseId);
    return ex ? CATEGORY_LABELS[ex.category] : '';
  }
  getSubLabel(entry: WorkoutEntry): string {
    const ex = this.exerciseService.getById(entry.exerciseId);
    return ex?.subcategory ? (SUBCATEGORY_LABELS[ex.subcategory] ?? ex.subcategory) : '';
  }

  formatLastDate(dateStr: string): string {
    const d    = new Date(dateStr + 'T12:00:00');
    const now  = new Date();
    const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
    if (days === 1) return 'ahir';
    if (days < 7)  return `fa ${days} dies`;
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
  }

  startEntryEdit(exerciseId: string): void {
    this._expandEntry(exerciseId);
    this.editingEntry.set(exerciseId);
    this.addingFor.set(null);
    this.editingSet.set(null);
  }

  openStats(entry: WorkoutEntry): void {
    this.dialog.open(ExerciseStatsDialogComponent, {
      data: { exerciseId: entry.exerciseId, exerciseName: entry.exerciseName },
      width: '400px', maxHeight: '85vh',
    });
  }

  async onDrop(event: CdkDragDrop<WorkoutEntry[]>): Promise<void> {
    if (event.previousIndex === event.currentIndex) return;
    const w = this.workout();
    if (!w) return;
    const entries = [...w.entries];
    moveItemInArray(entries, event.previousIndex, event.currentIndex);
    try {
      await this.workoutService.reorderEntries(w.id, entries);
    } catch {
      this.snackBar.open('Error en reordenar', '', { duration: 2000 });
    }
  }

  dispW(kg: number): number { return kgToDisplay(kg, this.unit()); }

  adjustWeight(delta: number): void {
    const step = weightStep(this.unit());
    const v = (this.setForm.value.weight ?? 0) + delta * step;
    this.setForm.patchValue({ weight: Math.max(0, Math.round(v * 10) / 10) });
  }
  adjustReps(delta: number): void {
    const v = (this.setForm.value.reps ?? 1) + delta;
    this.setForm.patchValue({ reps: Math.max(1, v) });
  }

  adjustEditWeight(delta: number): void {
    const step = weightStep(this.unit());
    const v = (this.editSetForm.value.weight ?? 0) + delta * step;
    this.editSetForm.patchValue({ weight: Math.max(0, Math.round(v * 10) / 10) });
  }
  adjustEditReps(delta: number): void {
    const v = (this.editSetForm.value.reps ?? 1) + delta;
    this.editSetForm.patchValue({ reps: Math.max(1, v) });
  }

  openFatigaPicker(exerciseId: string): void { this.feelingPickerFor.set(exerciseId); }
  closeFatigaPicker(): void { this.feelingPickerFor.set(null); }

  async pickFeeling(level: FeelingLevel): Promise<void> {
    const entry = this.fatigaEntry();
    if (!entry) return;
    await this.setEntryFeeling(entry, level);
    this.closeFatigaPicker();
  }

  async setEntryFeeling(entry: WorkoutEntry, level: FeelingLevel): Promise<void> {
    const w = this.workout();
    if (!w) return;
    const newFeeling = entry.feeling === level ? undefined : level;
    try {
      await this.workoutService.updateEntryFeeling(w.id, entry.exerciseId, newFeeling);
    } catch {
      this.snackBar.open('Error en actualitzar la fatiga', '', { duration: 2000 });
    }
  }

  startAddSet(entry: WorkoutEntry): void {
    this._expandEntry(entry.exerciseId);
    this.editingSet.set(null);
    this.addingFor.set(entry.exerciseId);
    const w = this.workout();
    const u = this.unit();
    if (entry.sets.length === 0 && w) {
      const info = this.workoutService.getLastSessionInfo(entry.exerciseId, w.id);
      if (info) {
        this.lastSessionData.set({ exerciseId: entry.exerciseId, ...info });
        this.setForm.patchValue({ weight: kgToDisplay(info.maxWeight, u), reps: 8 });
      } else {
        this.lastSessionData.set(null);
        this.setForm.reset({ weight: 0, reps: 8 });
      }
    } else {
      this.lastSessionData.set(null);
      const last = entry.sets.at(-1);
      if (last) this.setForm.patchValue({ weight: kgToDisplay(last.weight, u), reps: last.reps });
    }
  }

  cancelSet(): void {
    this._resetForm();
    this.lastSessionData.set(null);
  }

  async repeatLastSet(entry: WorkoutEntry): Promise<void> {
    const w = this.workout();
    if (!w || !entry.sets.length) return;
    const last = entry.sets.at(-1)!;
    try {
      await this.workoutService.addSetsToEntry(w.id, entry.exerciseId, [{ weight: last.weight, reps: last.reps }]);
    } catch {
      this.snackBar.open('Error en repetir', '', { duration: 2000 });
    }
  }

  isEditingSet(exerciseId: string, index: number): boolean {
    const es = this.editingSet();
    return es?.exerciseId === exerciseId && es?.index === index;
  }

  startEditSet(exerciseId: string, index: number, set: WorkoutSet): void {
    this.addingFor.set(null);
    this.editingSet.set({ exerciseId, index });
    this.editSetForm.setValue({ weight: kgToDisplay(set.weight, this.unit()), reps: set.reps });
  }

  cancelEditSet(): void { this.editingSet.set(null); }

  async saveEditSet(): Promise<void> {
    if (this.editSetForm.invalid) return;
    const es = this.editingSet();
    if (!es) return;
    const { weight, reps } = this.editSetForm.value;
    const w = this.workout();
    if (!w) return;
    try {
      await this.workoutService.updateSetInEntry(w.id, es.exerciseId, es.index, {
        weight: displayToKg(weight!, this.unit()), reps: reps!,
      });
      this.cancelEditSet();
    } catch {
      this.snackBar.open('Error en actualitzar la sèrie', '', { duration: 3000 });
    }
  }

  async submitSets(exerciseId: string, count: number): Promise<void> {
    if (this.setForm.invalid) return;
    const { weight, reps } = this.setForm.value;
    const w = this.workout();
    if (!w) return;
    const weightKg = displayToKg(weight!, this.unit());
    const sets = Array.from({ length: count }, () => ({ weight: weightKg, reps: reps! }));
    try {
      await this.workoutService.addSetsToEntry(w.id, exerciseId, sets);
      // PR detection: compare against all historical data excluding this workout
      const prevMax = this.workoutService.getAllTimeMaxWeight(exerciseId, w.id);
      if (weightKg > prevMax) {
        this.prEntries.update(s => new Set([...s, exerciseId]));
      }
      // Start rest timer after logging sets
      const restSecs = this.settingsService.restTimerSeconds();
      if (restSecs > 0) this.startRestTimer(restSecs, exerciseId);
      this.cancelSet();
    } catch {
      this.snackBar.open('Error en afegir les sèries', '', { duration: 3000 });
    }
  }

  async removeSet(exerciseId: string, index: number): Promise<void> {
    const w = this.workout();
    if (!w) return;
    try {
      await this.workoutService.removeSetFromEntry(w.id, exerciseId, index);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async removeEntry(exerciseId: string): Promise<void> {
    const w = this.workout();
    if (!w) return;
    if (this._timerForExercise === exerciseId) this.cancelTimer();
    try {
      await this.workoutService.removeEntryFromWorkout(w.id, exerciseId);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  // ── Rest timer ─────────────────────────────────────────────────────────────
  startRestTimer(seconds: number, exerciseId?: string): void {
    this.cancelTimer();
    this._timerForExercise = exerciseId ?? null;
    this.timerTotal.set(seconds);
    this.timerRemaining.set(seconds);
    this.timerActive.set(true);
    this._timerId = setInterval(() => {
      const next = this.timerRemaining() - 1;
      if (next <= 0) {
        this.cancelTimer();
      } else {
        this.timerRemaining.set(next);
      }
    }, 1000);
  }

  adjustTimer(delta: number): void {
    if (!this.timerActive()) return;
    this.timerRemaining.set(Math.max(1, this.timerRemaining() + delta));
  }

  cancelTimer(): void {
    if (this._timerId !== null) {
      clearInterval(this._timerId);
      this._timerId = null;
    }
    this._timerForExercise = null;
    this.timerActive.set(false);
    this.timerRemaining.set(0);
  }

  formatTimer(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  ngOnDestroy(): void { this.cancelTimer(); }
}
