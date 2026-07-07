import { Component, OnDestroy, ViewEncapsulation, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatDialog } from '@angular/material/dialog';

import { CATEGORY_COLORS, CATEGORY_LABELS, SUBCATEGORY_LABELS } from '../../../core/models/exercise.model';
import { FEELING_EMOJI, FEELING_LABEL, FeelingLevel, Workout, WorkoutEntry, WorkoutSet, setMaxWeight } from '../../../core/models/workout.model';
import { FitnessGoal, FITNESS_GOAL_LABELS } from '../../../core/models/user-settings.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { OfflineService } from '../../../core/services/offline.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { ExerciseStatsDialogComponent } from '../exercise-stats-dialog.component';
import { kgToDisplay, displayToKg, weightStep } from '../../utils/weight.utils';
import { ExerciseEntryCardComponent } from '../exercise-entry-card/exercise-entry-card.component';
import { FeedbackService } from '../../services/feedback.service';

const GOAL_REC: Record<FitnessGoal, { sets: number; reps: number }> = {
  strength: { sets: 4, reps: 5 },
  fitness:  { sets: 3, reps: 10 },
  weight:   { sets: 4, reps: 12 },
  sport:    { sets: 3, reps: 12 },
};

// Module-level: persists collapsed/done state per workout for the entire browser session
const _collapsedByWorkout = new Map<string, Set<string>>();

@Component({
  selector: 'app-workout-editor',
  standalone: true,
  imports: [ReactiveFormsModule, DragDropModule, ExerciseEntryCardComponent],
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (workout(); as w) {
      <div class="we-entries" [class.we-entries--dragging]="isDragging()"
           cdkDropList (cdkDropListDropped)="onDrop($event)">

        @for (entry of w.entries; track entry.exerciseId) {

          <!-- ── Section header (non-draggable, recalculates when entries reorder) ── -->
          @if (showSections() && sectionBreaks().get($index); as sec) {
            <button type="button" class="we-section-header"
                    [class.we-section-header--dragging]="isDragging()"
                    [attr.aria-expanded]="!isSectionCollapsed(sec.id)"
                    [attr.aria-label]="sec.label + ', ' + sectionCount(sec.id) + ' exercicis. ' + (isSectionCollapsed(sec.id) ? 'Desplega secció' : 'Plega secció')"
                    (click)="toggleSection(sec.id)">
              <span class="we-section-accent" aria-hidden="true"></span>
              <span class="we-section-title">{{ sec.label }}</span>
              <span class="we-section-count">{{ sectionCount(sec.id) }}</span>
              <span class="we-section-spacer" aria-hidden="true"></span>
              <span class="material-symbols-outlined we-section-chevron" aria-hidden="true"
                    [class.we-section-chevron--collapsed]="isSectionCollapsed(sec.id)">
                expand_more
              </span>
            </button>
          }

          @if (!isEntryHidden($index)) {

          @if (entry.supersetGroupId && supersetContinuations().has($index)) {
            <div class="we-superset-connector" aria-hidden="true">
              <span class="material-symbols-outlined">bolt</span>
              <span class="we-superset-connector-label">Sense descans</span>
            </div>
          }
          @if (entry.supersetGroupId && supersetGroupStarts().has($index)) {
            <div class="we-superset-chip">
              <span class="material-symbols-outlined">link</span>
              <span>Superset {{ supersetLabels().get(entry.supersetGroupId) }}</span>
              @if (alwaysEditable() || editMode()) {
                <button type="button" class="we-superset-ungroup-btn" (click)="ungroupSuperset(entry.exerciseId)" title="Desfer superset">
                  <span class="material-symbols-outlined">close</span>
                </button>
              }
            </div>
          }

          <app-exercise-entry-card
            cdkDrag [cdkDragDisabled]="!editMode() && !reorderable()"
            (cdkDragStarted)="isDragging.set(true)"
            (cdkDragEnded)="isDragging.set(false)"
            [entry]="entry"
            [catColor]="getCatColor(entry)"
            [catLoading]="!isExerciseResolved(entry)"
            [collapsed]="isCollapsed(entry.exerciseId)"
            [draggable]="editMode() || reorderable()"
            [hideMetaWhenCollapsed]="true"
            [maxWeight]="entryMaxWeight(entry)"
            [unit]="unit()"
            [feelingLevel]="entry.feeling"
            [prBadge]="prExerciseIds().has(entry.exerciseId)"
            [showStatsAction]="!offlineService.isOffline() && !groupingMode()"
            [showDeleteAction]="(alwaysEditable() || editMode()) && !groupingMode()"
            [selectable]="groupingMode()"
            [selected]="selectedForGroup().has(entry.exerciseId)"
            (statsClick)="openStats(entry)"
            (deleteClick)="removeEntry(entry.exerciseId)"
            (headerClick)="groupingMode() ? toggleGroupSelect(entry.exerciseId) : toggleCollapse(entry.exerciseId)">

            <!-- ── Projected body content ──

            <!-- ── Goal recommendation banner ── -->
            @if (recData()?.exerciseId === entry.exerciseId && addingFor() === entry.exerciseId) {
              <div class="we-rec-banner">
                <div class="we-rec-body">
                  <span class="material-symbols-outlined we-rec-icon">auto_awesome</span>
                  <div class="we-rec-info">
                    <span class="we-rec-label">{{ recData()!.goalLabel }}</span>
                    <span class="we-rec-desc">{{ recData()!.sets }} sèries · {{ recData()!.reps }} repeticions</span>
                  </div>
                  <button type="button" class="we-rec-dismiss" (click)="recData.set(null)" title="Tancar">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </div>
                <div class="we-rec-actions">
                  <button type="button" class="we-rec-customize-btn" (click)="applyRecCustomize()">Personalitzar</button>
                  <button type="button" class="we-rec-apply-btn" (click)="applyRecDirect(entry.exerciseId)">
                    Afegir ×{{ recData()!.sets }}
                  </button>
                </div>
              </div>
            }

            <!-- ── Last session info banner ── -->
            @if (lastSessionData()?.exerciseId === entry.exerciseId && entry.sets.length === 0 && addingFor() === entry.exerciseId && !recData()) {
              <div class="we-last-session-banner" role="button" tabindex="0"
                (click)="applyLastSession(entry.exerciseId)"
                (keydown.enter)="applyLastSession(entry.exerciseId)"
                (keydown.space)="applyLastSession(entry.exerciseId)">
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

            <!-- ── Previous session note banner ── -->
            @if (prevNoteData()?.exerciseId === entry.exerciseId && addingFor() === entry.exerciseId) {
              <div class="we-prev-note-banner">
                <span class="material-symbols-outlined we-pnb-icon">sticky_note_2</span>
                <div class="we-pnb-info">
                  <span class="we-pnb-label">Nota de l'última sessió</span>
                  <span class="we-pnb-text">{{ prevNoteData()!.notes }}</span>
                </div>
                <button type="button" class="we-pnb-dismiss" (click)="prevNoteData.set(null)">
                  <span class="material-symbols-outlined">close</span>
                </button>
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
                            <label for="edit-weight">{{ isUnilateral(entry) ? 'Esquerra' : 'Pes' }}</label>
                            <div class="we-number-input compact">
                              <button type="button" (click)="adjustEditWeight(-1)" aria-label="Menys pes">−</button>
                              <input id="edit-weight" type="number" formControlName="weight" min="0" step="2.5"
                                     (focus)="$any($event.target).select()">
                              <button type="button" (click)="adjustEditWeight(1)" aria-label="Més pes">+</button>
                            </div>
                          </div>
                          @if (isUnilateral(entry)) {
                            <div class="we-inline-group">
                              <label for="edit-weight-right">Dreta</label>
                              <div class="we-number-input compact">
                                <button type="button" (click)="adjustEditWeightRight(-1)" aria-label="Menys pes">−</button>
                                <input id="edit-weight-right" type="number" formControlName="weightRight" min="0" step="2.5"
                                       (focus)="$any($event.target).select()">
                                <button type="button" (click)="adjustEditWeightRight(1)" aria-label="Més pes">+</button>
                              </div>
                            </div>
                          }
                          <div class="we-inline-group">
                            <label for="edit-reps">Reps</label>
                            <div class="we-number-input compact">
                              <button type="button" (click)="adjustEditReps(-1)" aria-label="Menys repeticions">−</button>
                              <input id="edit-reps" type="number" formControlName="reps" min="1" step="1"
                                     (focus)="$any($event.target).select()">
                              <button type="button" (click)="adjustEditReps(1)" aria-label="Més repeticions">+</button>
                            </div>
                          </div>
                        </div>
                        <div class="we-drop-stages">
                          @for (d of editDropStages(); track $index) {
                            <div class="we-drop-stage-row">
                              <span class="material-symbols-outlined we-drop-arrow">subdirectory_arrow_right</span>
                              <div class="we-number-input compact">
                                <button type="button" (click)="adjustEditDropWeight($index, -1)" aria-label="Menys pes">−</button>
                                <input type="number" [value]="d.weight" (change)="setEditDropWeight($index, $any($event.target).value)" min="0" step="2.5">
                                <button type="button" (click)="adjustEditDropWeight($index, 1)" aria-label="Més pes">+</button>
                              </div>
                              <div class="we-number-input compact">
                                <button type="button" (click)="adjustEditDropReps($index, -1)" aria-label="Menys repeticions">−</button>
                                <input type="number" [value]="d.reps" (change)="setEditDropReps($index, $any($event.target).value)" min="1" step="1">
                                <button type="button" (click)="adjustEditDropReps($index, 1)" aria-label="Més repeticions">+</button>
                              </div>
                              <button type="button" class="we-drop-remove-btn" (click)="removeEditDropStage($index)" aria-label="Eliminar tram">
                                <span class="material-symbols-outlined">close</span>
                              </button>
                            </div>
                          }
                          <button type="button" class="we-add-drop-btn" (click)="addEditDropStage()">
                            <span class="material-symbols-outlined">add</span>
                            {{ editDropStages().length === 0 ? 'Afegir dropset' : 'Afegir un altre tram' }}
                          </button>
                        </div>
                        <div class="we-inline-actions">
                          <button type="button" class="we-inline-cancel" (click)="cancelEditSet()">Cancel·lar</button>
                          <button type="submit" class="we-inline-save" [disabled]="editSetForm.invalid">Desar</button>
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
                        @if (set.weightLeft != null) {
                          <span class="we-set-pill weight side"
                            [class.we-set-pill--tap]="isEntryEditable(entry.exerciseId)"
                            (click)="tapSetPill($event, entry.exerciseId, $index, set)">
                            E {{ dispW(set.weightLeft) }}<small>{{ unit() }}</small>
                          </span>
                          <span class="we-set-pill weight side"
                            [class.we-set-pill--tap]="isEntryEditable(entry.exerciseId)"
                            (click)="tapSetPill($event, entry.exerciseId, $index, set)">
                            D {{ dispW(set.weightRight!) }}<small>{{ unit() }}</small>
                          </span>
                        } @else {
                          <span class="we-set-pill weight"
                            [class.we-set-pill--pr]="prExerciseIds().has(entry.exerciseId) && set.weight > 0 && set.weight === entryMaxWeight(entry)"
                            [class.we-set-pill--tap]="isEntryEditable(entry.exerciseId)"
                            (click)="tapSetPill($event, entry.exerciseId, $index, set)">
                            {{ dispW(set.weight) }}<small>{{ unit() }}</small>
                          </span>
                        }
                        <span class="we-set-pill reps"
                          [class.we-set-pill--tap]="isEntryEditable(entry.exerciseId)"
                          (click)="tapSetPill($event, entry.exerciseId, $index, set)">
                          {{ set.reps }}<small>r</small>
                        </span>
                        @for (d of (set.drops ?? []); track $index) {
                          <span class="material-symbols-outlined we-drop-sep">arrow_forward</span>
                          <span class="we-set-pill weight drop">{{ dispW(d.weight) }}<small>{{ unit() }}</small></span>
                          <span class="we-set-pill reps drop">{{ d.reps }}<small>r</small></span>
                        }
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
                      <label for="add-weight">{{ isUnilateral(entry) ? 'Esquerra (' + unit() + ')' : 'Pes (' + unit() + ')' }}</label>
                      <div class="we-number-input">
                        <button type="button" (click)="adjustWeight(-1)" aria-label="Menys pes">−</button>
                        <input id="add-weight" type="number" formControlName="weight" min="0" step="2.5"
                               (focus)="$any($event.target).select()">
                        <button type="button" (click)="adjustWeight(1)" aria-label="Més pes">+</button>
                      </div>
                    </div>
                    @if (isUnilateral(entry)) {
                      <div class="we-input-group">
                        <label for="add-weight-right">Dreta ({{ unit() }})</label>
                        <div class="we-number-input">
                          <button type="button" (click)="adjustWeightRight(-1)" aria-label="Menys pes">−</button>
                          <input id="add-weight-right" type="number" formControlName="weightRight" min="0" step="2.5"
                                 (focus)="$any($event.target).select()">
                          <button type="button" (click)="adjustWeightRight(1)" aria-label="Més pes">+</button>
                        </div>
                      </div>
                    }
                    <div class="we-input-group">
                      <label for="add-reps">Repeticions</label>
                      <div class="we-number-input">
                        <button type="button" (click)="adjustReps(-1)" aria-label="Menys repeticions">−</button>
                        <input id="add-reps" type="number" formControlName="reps" min="1" step="1"
                               (focus)="$any($event.target).select()">
                        <button type="button" (click)="adjustReps(1)" aria-label="Més repeticions">+</button>
                      </div>
                    </div>
                  </div>
                  @if (dropStages().length === 0) {
                    <div class="we-qty-row">
                      @for (n of setQtyOptions; track n) {
                        <button type="button" class="we-qty-chip"
                                [class.we-qty-chip--active]="setQty() === n"
                                (click)="setQty.set(n)">×{{ n }}</button>
                      }
                    </div>
                  }
                  <div class="we-drop-stages">
                    @for (d of dropStages(); track $index) {
                      <div class="we-drop-stage-row">
                        <span class="material-symbols-outlined we-drop-arrow">subdirectory_arrow_right</span>
                        <div class="we-number-input compact">
                          <button type="button" (click)="adjustDropWeight($index, -1)" aria-label="Menys pes">−</button>
                          <input type="number" [value]="d.weight" (change)="setDropWeight($index, $any($event.target).value)" min="0" step="2.5">
                          <button type="button" (click)="adjustDropWeight($index, 1)" aria-label="Més pes">+</button>
                        </div>
                        <div class="we-number-input compact">
                          <button type="button" (click)="adjustDropReps($index, -1)" aria-label="Menys repeticions">−</button>
                          <input type="number" [value]="d.reps" (change)="setDropReps($index, $any($event.target).value)" min="1" step="1">
                          <button type="button" (click)="adjustDropReps($index, 1)" aria-label="Més repeticions">+</button>
                        </div>
                        <button type="button" class="we-drop-remove-btn" (click)="removeDropStage($index)" aria-label="Eliminar tram">
                          <span class="material-symbols-outlined">close</span>
                        </button>
                      </div>
                    }
                    <button type="button" class="we-add-drop-btn" (click)="addDropStage()">
                      <span class="material-symbols-outlined">add</span>
                      {{ dropStages().length === 0 ? 'Afegir dropset' : 'Afegir un altre tram' }}
                    </button>
                  </div>
                  <div class="we-set-form-actions">
                    <button type="button" class="we-cancel-btn" (click)="cancelSet()">
                      <span class="material-symbols-outlined">close</span>
                    </button>
                    <button type="button" class="we-submit-btn"
                            (click)="submitSets(entry.exerciseId, setQty())"
                            [disabled]="setForm.invalid">
                      <span class="material-symbols-outlined">add</span>
                      {{ dropStages().length > 0 ? 'Afegir dropset' : (setQty() > 1 ? 'Afegir ×' + setQty() : 'Afegir') }}
                    </button>
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
                            [title]="'Repetir: ' + repeatLabel(entry)">
                      <span class="material-symbols-outlined">repeat</span>
                      <span class="we-repeat-label">{{ repeatLabel(entry) }}</span>
                    </button>
                    @if (restTimerEnabled()) {
                      <button class="we-rest-trigger-btn" (click)="startManualRest(entry.exerciseId)" title="Iniciar descans">
                        <span class="material-symbols-outlined">timer</span>
                      </button>
                    }
                  }
                </div>
              }
            }

            <!-- ── Entry footer: feeling + stats + delete ── -->
            <div class="we-entry-footer">
              @if (alwaysEditable() || editMode()) {
                <button type="button" class="we-footer-feeling-btn"
                  [class.we-footer-feeling-btn--set]="entry.feeling"
                  (click)="openFatigaPicker(entry.exerciseId)">
                  @if (entry.feeling) {
                    {{ getFeelingEmoji(entry.feeling) }}
                  } @else {
                    <span class="material-symbols-outlined">sentiment_neutral</span>
                  }
                </button>
              }
              <div class="we-footer-actions">
                @if (!offlineService.isOffline()) {
                  <button class="we-footer-stats-btn" (click)="openStats(entry)">
                    <span class="material-symbols-outlined">bar_chart</span>
                  </button>
                }
                @if (alwaysEditable() || editMode()) {
                  <button class="we-footer-notes-btn" [class.we-footer-notes-btn--set]="entry.notes"
                    (click)="openNotesPopup(entry.exerciseId)" title="Nota de l'exercici">
                    <span class="material-symbols-outlined">{{ entry.notes ? 'sticky_note_2' : 'note_add' }}</span>
                  </button>
                  <button class="we-footer-delete-btn" (click)="removeEntry(entry.exerciseId)">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                }
              </div>
            </div>

            <!-- end projected body -->
          </app-exercise-entry-card>
          } <!-- end @if (!isEntryHidden) -->
        }

        @if ((alwaysEditable() || editMode()) && !isDragging()) {
          <button class="we-add-exercise-btn" (click)="requestAddExercise.emit()">
            <span class="material-symbols-outlined">add</span>
            Afegir exercici
          </button>
        }

      </div>

      <!-- ── Superset grouping confirm bar ── -->
      @if (groupingMode()) {
        <div class="we-group-confirm-bar">
          <span class="we-group-confirm-count">
            {{ selectedForGroup().size === 0 ? 'Selecciona 2 o més exercicis' : selectedForGroup().size + ' seleccionats' }}
          </span>
          <button type="button" class="we-group-confirm-btn" [disabled]="selectedForGroup().size < 2" (click)="confirmGroup()">
            <span class="material-symbols-outlined">link</span>
            Crear superset
          </button>
        </div>
      }

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
              <button class="we-fatiga-clear-btn" (click)="clearFeeling()">
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

      <!-- ── Notes popup ── -->
      @if (notesPopupFor()) {
        <div class="we-fatiga-backdrop" (click)="closeNotesPopup()"></div>
        <div class="we-notes-popup">
          <div class="we-notes-popup-header">
            <span class="material-symbols-outlined we-notes-popup-icon">sticky_note_2</span>
            <span class="we-notes-popup-title">Nota de l'exercici</span>
            @if (notesText()) {
              <button class="we-notes-clear-btn" (click)="notesText.set('')" title="Esborrar nota">
                <span class="material-symbols-outlined">close</span>
              </button>
            }
          </div>
          <textarea class="we-notes-textarea" rows="4"
            [value]="notesText()"
            (input)="notesText.set($any($event.target).value)"
            placeholder="Afegeix una nota per recordar a la propera sessió…"></textarea>
          <div class="we-notes-actions">
            <button type="button" class="we-inline-cancel" (click)="closeNotesPopup()">Cancel·lar</button>
            <button type="button" class="we-inline-save" (click)="saveNotes()">Desar</button>
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
    /* Extra drop space while dragging so an item can be placed after the last one */
    .we-entries--dragging { padding-bottom: 72px; }

    /* ── Entry drag animation ── */
    .cdk-drag-animating app-exercise-entry-card { transition: transform 200ms ease; }

    /* ── Drop placeholder (skeleton slot) ── */
    app-exercise-entry-card.cdk-drag-placeholder {
      border-radius: 14px;
      border: 2px dashed color-mix(in srgb, var(--c-brand) 55%, var(--c-border-2));
      background: color-mix(in srgb, var(--c-brand) 8%, var(--c-card));
    }
    app-exercise-entry-card.cdk-drag-placeholder > * { visibility: hidden; }

    /* ── Section headers ── */
    .we-section-header {
      display: flex; align-items: center; gap: 7px;
      width: 100%; margin: 5px 0 2px; padding: 6px 10px;
      font: inherit; text-align: left; appearance: none;
      border: 1.5px solid color-mix(in srgb, var(--c-brand) 32%, var(--c-border-2));
      border-radius: 9px;
      background: color-mix(in srgb, var(--c-brand) 13%, var(--c-card));
      cursor: pointer; user-select: none;
      -webkit-tap-highlight-color: transparent; touch-action: manipulation;
      transition: background 0.15s, border-color 0.15s;
    }
    .we-section-header:hover {
      background: color-mix(in srgb, var(--c-brand) 20%, var(--c-card));
      border-color: color-mix(in srgb, var(--c-brand) 45%, var(--c-border-2));
    }
    .we-section-header:focus-visible {
      outline: 2px solid var(--c-brand); outline-offset: 2px;
    }
    .we-section-header--dragging {
      opacity: 0; pointer-events: none; transition: opacity 0.15s;
    }
    .we-section-accent {
      width: 3px; align-self: stretch; min-height: 13px; border-radius: 3px;
      background: var(--c-brand); flex-shrink: 0;
    }
    .we-section-title {
      font-size: 10px; font-weight: 800; text-transform: uppercase;
      letter-spacing: 0.4px; color: var(--c-text); white-space: nowrap;
      flex-shrink: 0;
    }
    .we-section-count {
      font-size: 10px; font-weight: 700; color: #fff;
      background: var(--c-brand); border-radius: 20px;
      padding: 1px 7px; min-width: 18px; text-align: center; flex-shrink: 0;
      line-height: 1.3;
    }
    .we-section-spacer { flex: 1; }
    .we-section-chevron {
      font-size: 18px; color: var(--c-brand); flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    .we-section-chevron--collapsed { transform: rotate(-90deg); }



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
    .we-fatiga-popup-title { font-size: 17px; font-weight: 700; color: var(--c-text); }
    .we-fatiga-clear-btn {
      display: flex; align-items: center; justify-content: center;
      width: 32px; height: 32px; border-radius: 50%;
      border: 1.5px solid rgba(239,83,80,0.3); background: rgba(239,83,80,0.07);
      color: #ef5350; cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(239,83,80,0.16); }
    }
    .we-fatiga-options { display: flex; gap: 8px; justify-content: space-between; }
    .we-fatiga-option {
      flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 12px 4px; border-radius: 14px;
      border: 2px solid transparent; background: var(--c-subtle);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { background: var(--c-hover); transform: translateY(-2px); }
      &:active { transform: scale(0.94); }
      &.selected { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.1); transform: translateY(-2px); }
    }
    .we-fatiga-option-emoji { font-size: 28px; line-height: 1; }
    .we-fatiga-option-label { font-size: 10px; font-weight: 600; color: var(--c-text-2); text-align: center; }

    /* ── Entry footer: feeling + stats + delete ── */
    .we-entry-footer {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 14px 14px; border-top: 1px solid var(--c-border-2);
    }
    .we-footer-feeling-btn {
      width: 36px; height: 36px; border-radius: 10px; border: 1.5px solid transparent;
      background: var(--c-subtle); font-size: 18px; line-height: 1;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center;
      .material-symbols-outlined { font-size: 20px; color: var(--c-text-3); }
      &:hover { background: var(--c-hover); }
      &:active { transform: scale(0.92); }
      &.we-footer-feeling-btn--set { border-color: rgba(var(--c-brand-rgb), 0.3); background: rgba(var(--c-brand-rgb), 0.07); }
    }
    .we-footer-actions { display: flex; align-items: center; gap: 6px; }

    /* ── Entry footer: stats + delete ── */
    .we-entry-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 8px;
      padding: 10px 14px 14px; border-top: 1px solid var(--c-border-2);
      background: color-mix(in srgb, var(--cat) 9%, var(--c-card));
    }
    .we-footer-stats-btn {
      width: 36px; height: 36px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: transparent;
      color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-subtle); color: var(--c-text); }
    }
    .we-footer-delete-btn {
      width: 36px; height: 36px; border-radius: 10px;
      border: 1.5px solid rgba(239,83,80,0.3); background: transparent;
      color: #ef5350;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(239,83,80,0.08); border-color: #ef5350; }
    }

    /* ── Last session banner ── */
    .we-last-session-banner {
      display: flex; align-items: center; gap: 10px;
      margin: 10px 14px; padding: 10px 14px;
      background: rgba(var(--c-brand-rgb), 0.07); border: 1px solid rgba(var(--c-brand-rgb), 0.15);
      border-radius: 10px; cursor: pointer; transition: background 0.15s;
      &:hover { background: rgba(var(--c-brand-rgb), 0.13); }
    }
    .we-lsb-icon { font-size: 20px; color: var(--c-brand); flex-shrink: 0; }
    .we-lsb-info { display: flex; flex-direction: column; gap: 1px; flex: 1; }
    .we-lsb-label { font-size: 10px; font-weight: 600; color: var(--c-text-2); text-transform: uppercase; letter-spacing: 0.4px; }
    .we-lsb-date  { font-size: 13px; font-weight: 600; color: var(--c-text); }
    .we-lsb-stats { display: flex; align-items: center; gap: 6px; }
    .we-lsb-weight { font-size: 16px; font-weight: 700; color: var(--c-brand); }
    .we-lsb-feeling { font-size: 20px; line-height: 1; }

    /* ── Notes footer button ── */
    .we-footer-notes-btn {
      width: 36px; height: 36px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: transparent;
      color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-subtle); color: var(--c-text-2); }
      &.we-footer-notes-btn--set {
        border-color: rgba(var(--c-brand-rgb), 0.35);
        color: var(--c-brand);
        background: rgba(var(--c-brand-rgb), 0.07);
      }
    }

    /* ── Previous-note banner ── */
    .we-prev-note-banner {
      display: flex; align-items: flex-start; gap: 10px;
      margin: 6px 14px; padding: 10px 12px;
      background: rgba(var(--c-brand-rgb), 0.06); border: 1px solid rgba(var(--c-brand-rgb), 0.13);
      border-radius: 10px;
    }
    .we-pnb-icon { font-size: 18px; color: var(--c-brand); flex-shrink: 0; margin-top: 1px; }
    .we-pnb-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .we-pnb-label { font-size: 10px; font-weight: 700; color: var(--c-text-3); text-transform: uppercase; letter-spacing: 0.4px; }
    .we-pnb-text { font-size: 13px; color: var(--c-text-2); font-style: italic; line-height: 1.4; word-break: break-word; }
    .we-pnb-dismiss {
      display: flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
      border: none; background: transparent; cursor: pointer; color: var(--c-text-3);
      touch-action: manipulation; transition: background 0.12s;
      .material-symbols-outlined { font-size: 14px; }
      &:hover { background: var(--c-hover); }
    }

    /* ── Notes popup ── */
    .we-notes-popup {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: var(--c-card); border-radius: 20px 20px 0 0;
      padding: 20px 20px 32px;
      box-shadow: 0 -4px 24px var(--c-shadow-md);
      display: flex; flex-direction: column; gap: 14px;
    }
    .we-notes-popup-header {
      display: flex; align-items: center; gap: 8px;
    }
    .we-notes-popup-icon { font-size: 18px; color: var(--c-brand); }
    .we-notes-popup-title { font-size: 17px; font-weight: 700; color: var(--c-text); flex: 1; }
    .we-notes-clear-btn {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border-radius: 50%;
      border: 1.5px solid rgba(239,83,80,0.3); background: rgba(239,83,80,0.07);
      color: #ef5350; cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: rgba(239,83,80,0.16); }
    }
    .we-notes-textarea {
      width: 100%; box-sizing: border-box;
      border: 1.5px solid var(--c-border); border-radius: 10px;
      background: var(--c-subtle); color: var(--c-text);
      font-size: 14px; line-height: 1.5; padding: 10px 12px;
      resize: none; font-family: inherit; outline: none;
      transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
      &::placeholder { color: var(--c-text-3); }
    }
    .we-notes-actions { display: flex; justify-content: flex-end; gap: 8px; }

    /* ── Goal recommendation banner ── */
    .we-rec-banner {
      margin: 4px 14px 6px; padding: 10px 12px;
      background: rgba(217,119,6,0.07); border: 1px solid rgba(217,119,6,0.22);
      border-radius: 10px; display: flex; flex-direction: column; gap: 8px;
    }
    .we-rec-body { display: flex; align-items: center; gap: 10px; }
    .we-rec-icon { font-size: 20px; color: #d97706; flex-shrink: 0; }
    .we-rec-info { display: flex; flex-direction: column; gap: 1px; flex: 1; }
    .we-rec-label { font-size: 10px; font-weight: 700; color: #d97706; text-transform: uppercase; letter-spacing: 0.4px; }
    .we-rec-desc  { font-size: 14px; font-weight: 700; color: var(--c-text); }
    .we-rec-dismiss {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      border: none; background: transparent; cursor: pointer; color: var(--c-text-3);
      touch-action: manipulation; transition: background 0.12s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: var(--c-hover); }
    }
    .we-rec-actions { display: flex; gap: 8px; }
    .we-rec-customize-btn {
      flex: 1; padding: 8px 12px; border-radius: 8px;
      border: 1.5px solid rgba(217,119,6,0.3); background: transparent;
      color: #d97706; font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { background: rgba(217,119,6,0.08); }
    }
    .we-rec-apply-btn {
      flex: 2; padding: 8px 12px; border-radius: 8px;
      border: none; background: rgba(217,119,6,0.85);
      color: white; font-size: 13px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { background: #d97706; }
      &:active { transform: scale(0.96); }
    }

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

    .we-set-pills { flex: 1; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    .we-set-pill {
      display: inline-flex; align-items: baseline; gap: 3px;
      padding: 6px 12px; border-radius: 20px; font-size: 15px; font-weight: 700;
      small { font-size: 11px; font-weight: 500; opacity: 0.7; }
      &.weight { background: rgba(var(--c-brand-rgb), 0.1); color: var(--c-brand); }
      &.reps   { background: var(--c-border-2); color: var(--c-text-2); }
      &.we-set-pill--tap {
        cursor: pointer; transition: filter 0.12s;
        &:hover { filter: brightness(0.93); }
        &:active { filter: brightness(0.85); }
      }
      &.drop { padding: 4px 9px; font-size: 12px; opacity: 0.75; }
      &.side { padding: 6px 10px; font-size: 13px; }
    }
    .we-drop-sep { font-size: 14px; color: var(--c-text-3); flex-shrink: 0; }

    /* ── Dropset stage editor (add/edit forms) ── */
    .we-drop-stages { display: flex; flex-direction: column; gap: 8px; }
    .we-drop-stage-row {
      display: flex; align-items: center; gap: 6px;
    }
    .we-drop-arrow { font-size: 18px; color: var(--c-text-3); flex-shrink: 0; }
    .we-drop-remove-btn {
      width: 30px; height: 30px; flex-shrink: 0; border-radius: 8px;
      border: 1px solid rgba(239,83,80,0.2); background: rgba(239,83,80,0.08);
      color: #ef5350; cursor: pointer; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center; transition: background 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: rgba(239,83,80,0.16); }
    }
    .we-add-drop-btn {
      display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 9px; border-radius: 8px;
      border: 1.5px dashed var(--c-border); background: transparent;
      color: var(--c-text-2); font-size: 12.5px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.05); }
    }

    /* ── Superset grouping ── */
    .we-superset-chip {
      display: flex; align-items: center; gap: 6px;
      margin: 0 0 -12px; padding: 7px 12px 12px; border-radius: 10px 10px 0 0;
      background: color-mix(in srgb, var(--c-brand) 14%, var(--c-card));
      border: 1.5px solid rgba(var(--c-brand-rgb), 0.3); border-bottom: none;
      font-size: 11.5px; font-weight: 700; color: var(--c-brand);
      .material-symbols-outlined { font-size: 15px; }
    }
    .we-superset-ungroup-btn {
      margin-left: auto; width: 22px; height: 22px; border-radius: 50%;
      border: none; background: transparent; color: var(--c-brand);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 14px; }
      &:hover { background: rgba(var(--c-brand-rgb), 0.15); }
    }
    .we-superset-connector {
      display: flex; align-items: center; justify-content: center; gap: 5px;
      margin: -4px 0; color: var(--c-brand); opacity: 0.75;
      .material-symbols-outlined { font-size: 15px; }
    }
    .we-superset-connector-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }

    /* ── Grouping-mode confirm bar ── */
    .we-group-confirm-bar {
      position: fixed; bottom: 72px; left: 50%; transform: translateX(-50%);
      z-index: 100; width: calc(100% - 64px); max-width: 340px;
      display: flex; align-items: center; gap: 10px;
      background: var(--c-card); border-radius: 16px;
      box-shadow: 0 4px 24px var(--c-shadow-md);
      padding: 10px 10px 10px 16px;
      border: 1.5px solid rgba(var(--c-brand-rgb), 0.25);
      animation: rt-in 0.25s cubic-bezier(0.34, 1.3, 0.64, 1) both;
    }
    .we-group-confirm-count { flex: 1; font-size: 12.5px; font-weight: 600; color: var(--c-text-2); }
    .we-group-confirm-btn {
      display: flex; align-items: center; gap: 5px; flex-shrink: 0;
      padding: 10px 14px; border-radius: 10px; border: none;
      background: var(--c-brand); color: white; font-size: 13px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.4; cursor: default; }
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
    .we-inline-cancel {
      padding: 7px 14px; border-radius: 8px;
      border: 1.5px solid var(--c-border); background: transparent;
      color: var(--c-text-2); font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { background: var(--c-subtle); }
    }
    .we-inline-save {
      padding: 7px 18px; border-radius: 8px;
      border: none; background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover:not(:disabled) { opacity: 0.9; }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    /* ── Add-sets form ── */
    .we-set-form {
      padding: 12px 14px; background: var(--c-subtle); border-top: 1px solid var(--c-border-2);
      display: flex; flex-direction: column; gap: 12px;
    }

    .we-set-inputs { display: flex; gap: 10px; flex-wrap: wrap; }

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

    /* ── Quantity chips + form actions ── */
    .we-qty-row {
      display: flex; gap: 6px;
    }
    .we-qty-chip {
      flex: 1; padding: 10px 4px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      color: var(--c-text-2); font-size: 14px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
      &:active { transform: scale(0.94); }
      &.we-qty-chip--active {
        border-color: var(--c-brand);
        background: rgba(var(--c-brand-rgb), 0.1);
        color: var(--c-brand);
      }
    }
    .we-set-form-actions {
      display: flex; align-items: center; gap: 8px;
    }
    .we-cancel-btn {
      width: 44px; height: 44px; flex-shrink: 0; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: transparent;
      color: var(--c-text-3); cursor: pointer; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center; transition: all 0.15s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-subtle); color: var(--c-text-2); }
      &:active { transform: scale(0.94); }
    }
    .we-submit-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 12px 16px; border-radius: 10px;
      border: none; background: var(--c-brand);
      color: white; font-size: 15px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:active:not(:disabled) { transform: scale(0.97); }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    /* ── Add / Repeat row ── */
    .we-add-set-row {
      display: flex; align-items: stretch; gap: 8px;
      padding: 10px 14px; border-top: 1px solid var(--c-border-2);
    }
    .we-add-set-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 7px;
      padding: 12px; border-radius: 10px;
      border: 1.5px dashed rgba(var(--c-brand-rgb), 0.45);
      background: rgba(var(--c-brand-rgb), 0.05);
      color: var(--c-brand); font-size: 14px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(var(--c-brand-rgb), 0.1); border-style: solid; }
      &:active { transform: scale(0.97); }
    }
    .we-repeat-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 12px 14px; border-radius: 10px;
      border: 1.5px solid var(--c-border);
      background: var(--c-card);
      color: var(--c-text-2); font-size: 13px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s; white-space: nowrap;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.05); }
      &:active { transform: scale(0.97); }
    }
    .we-repeat-label { font-size: 13px; font-weight: 700; }
    .we-rest-trigger-btn {
      display: flex; align-items: center; justify-content: center;
      width: 44px; padding: 12px; border-radius: 10px;
      border: 1.5px solid var(--c-border);
      background: var(--c-card);
      color: var(--c-text-2); flex-shrink: 0;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.05); }
      &:active { transform: scale(0.97); }
    }

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


    .we-summary-chip--max {
      background: rgba(217,119,6,0.12) !important;
      color: #d97706 !important;
    }
    .we-set-pill--pr {
      background: rgba(217,119,6,0.12) !important;
      color: #d97706 !important;
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
  readonly offlineService  = inject(OfflineService);
  private feedback         = inject(FeedbackService);
  private fb               = inject(FormBuilder);
  private dialog           = inject(MatDialog);

  readonly unit = this.settingsService.weightUnit;

  readonly workout        = input<Workout | null>(null);
  readonly editMode       = input<boolean>(false);
  /** When true (Today mode): all entries are always editable, no per-entry toggle shown */
  readonly alwaysEditable = input<boolean>(false);
  /** Whether exercises can be dragged to reorder — off by default, the
   *  parent enables it explicitly (e.g. from an "Ordenar exercicis" menu
   *  action) so entries can't be reordered by accident. */
  readonly reorderable    = input<boolean>(false);
  /** Superset-grouping selection mode — off by default, the parent enables
   *  it explicitly (e.g. from an "Agrupar en superset" menu action). */
  readonly groupingMode   = input<boolean>(false);

  readonly requestAddExercise = output<void>();

  readonly addingFor        = signal<string | null>(null);
  readonly setQty           = signal(1);
  readonly setQtyOptions    = [1, 2, 3, 4, 5];
  readonly editingSet       = signal<{ exerciseId: string; index: number } | null>(null);
  readonly lastSessionData  = signal<{ exerciseId: string; date: string; maxWeight: number; feeling?: FeelingLevel; sets: WorkoutSet[] } | null>(null);
  readonly recData          = signal<{ exerciseId: string; sets: number; reps: number; goalLabel: string } | null>(null);
  readonly feelingPickerFor = signal<string | null>(null);
  readonly notesPopupFor   = signal<string | null>(null);
  readonly notesText       = signal<string>('');
  readonly prevNoteData    = signal<{ exerciseId: string; notes: string } | null>(null);
  readonly collapsedEntries  = signal<Set<string>>(new Set());
  readonly collapsedSections = signal<Set<string>>(new Set());
  readonly isDragging        = signal(false);

  // ── Dropsets ─────────────────────────────────────────────────────────────
  readonly dropStages     = signal<{ weight: number; reps: number }[]>([]);
  readonly editDropStages = signal<{ weight: number; reps: number }[]>([]);

  // ── Superset grouping ───────────────────────────────────────────────────
  readonly selectedForGroup = signal<Set<string>>(new Set());

  /** groupId → display label (A, B, C…), assigned in first-appearance order. */
  readonly supersetLabels = computed((): Map<string, string> => {
    const w = this.workout();
    const map = new Map<string, string>();
    if (!w) return map;
    let next = 0;
    for (const e of w.entries) {
      if (e.supersetGroupId && !map.has(e.supersetGroupId)) {
        map.set(e.supersetGroupId, String.fromCharCode(65 + (next++ % 26)));
      }
    }
    return map;
  });

  /** Entry index → true when it's the first entry of its superset group (chip shown here). */
  readonly supersetGroupStarts = computed((): Set<number> => {
    const w = this.workout();
    const set = new Set<number>();
    if (!w) return set;
    for (let i = 0; i < w.entries.length; i++) {
      const gid = w.entries[i].supersetGroupId;
      if (gid && w.entries[i - 1]?.supersetGroupId !== gid) set.add(i);
    }
    return set;
  });

  /** Entry index → true when it directly continues the previous entry's superset group (connector shown here). */
  readonly supersetContinuations = computed((): Set<number> => {
    const w = this.workout();
    const set = new Set<number>();
    if (!w) return set;
    for (let i = 1; i < w.entries.length; i++) {
      const gid = w.entries[i].supersetGroupId;
      if (gid && w.entries[i - 1].supersetGroupId === gid) set.add(i);
    }
    return set;
  });
  // ── Rest timer ─────────────────────────────────────────────────────────────
  readonly restTimerEnabled = computed(() => this.settingsService.restTimerSeconds() > 0);
  readonly timerActive    = signal(false);
  readonly timerRemaining = signal(0);
  readonly timerTotal     = signal(0);
  private _timerId: ReturnType<typeof setInterval> | null = null;
  private _timerForExercise: string | null = null;

  // ── Personal Records ───────────────────────────────────────────────────────
  // Reactive computed: recalculates whenever workout entries or historical data change
  readonly prExerciseIds = computed(() => {
    const w = this.workout();
    if (!w) return new Set<string>();
    const ids = new Set<string>();
    for (const entry of w.entries) {
      if (entry.sets.length === 0) continue;
      const maxInEntry = this.entryMaxWeight(entry);
      if (maxInEntry <= 0) continue;
      const prevMax = this.workoutService.getAllTimeMaxWeight(entry.exerciseId, w.id);
      if (prevMax > 0 && maxInEntry > prevMax) ids.add(entry.exerciseId);
    }
    return ids;
  });

  // ── Section grouping (pure frontend, no DB changes) ────────────────────────
  /**
   * Section id for each entry (by position). Each consecutive run of the same
   * subcategory is its own section, keyed by the run's start index — so two
   * separate "esquena" runs are independent sections.
   */
  readonly entrySectionIds = computed((): string[] => {
    const w = this.workout();
    if (!w) return [];
    const ids: string[] = [];
    let prevSub: string | null = null;
    let runStart = 0;
    for (let i = 0; i < w.entries.length; i++) {
      const sub = this.getSubLabel(w.entries[i]);
      if (sub !== prevSub) { runStart = i; prevSub = sub; }
      ids.push(String(runStart));
    }
    return ids;
  });

  /** entry index → { id, label } at the start of each consecutive run */
  readonly sectionBreaks = computed((): Map<number, { id: string; label: string }> => {
    const w = this.workout();
    if (!w) return new Map();
    const map = new Map<number, { id: string; label: string }>();
    let prevSub: string | null = null;
    for (let i = 0; i < w.entries.length; i++) {
      const sub = this.getSubLabel(w.entries[i]);
      if (sub !== prevSub) { map.set(i, { id: String(i), label: sub }); prevSub = sub; }
    }
    return map;
  });

  /** Show section headers whenever at least one run has an identifiable muscle group
   *  (even a single group should be labelled — only hide when no exercise has a subcategory). */
  readonly showSections = computed((): boolean => {
    const w = this.workout();
    if (!w || w.entries.length < 2) return false;
    return [...this.sectionBreaks().values()].some(b => b.label);
  });

  /** Maps CDK drag-index → flat entries index (accounts for collapsed sections hiding entries from CDK) */
  readonly visibleEntryIndices = computed((): number[] => {
    const w = this.workout();
    if (!w) return [];
    if (!this.showSections()) return w.entries.map((_, i) => i);
    const collapsed = this.collapsedSections();
    const ids       = this.entrySectionIds();
    return w.entries.map((_, i) => i).filter(i => !collapsed.has(ids[i]));
  });

  readonly feelingLevels3: FeelingLevel[] = [1, 3, 5];
  readonly feelingLevels: FeelingLevel[]  = [1, 2, 3, 4, 5];

  readonly fatigaEntry = computed(() => {
    const id = this.feelingPickerFor();
    const w  = this.workout();
    if (!id || !w) return null;
    return w.entries.find(e => e.exerciseId === id) ?? null;
  });

  readonly setForm = this.fb.group({
    weight:      [0, [Validators.required, Validators.min(0)]],
    weightRight: [0, [Validators.min(0)]],
    reps:        [8, [Validators.required, Validators.min(1)]],
  });

  readonly editSetForm = this.fb.group({
    weight:      [0, [Validators.required, Validators.min(0)]],
    weightRight: [0, [Validators.min(0)]],
    reps:        [8, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    this.exerciseService.ensureLoaded();

    // Restore collapsed/done state; collapse all entries when first opening a template-loaded workout.
    effect(() => {
      const w = this.workout();
      if (!w?.id) return;
      untracked(() => {
        const savedCollapsed = _collapsedByWorkout.get(w.id);
        if (savedCollapsed !== undefined) {
          this.collapsedEntries.set(new Set(savedCollapsed));
        } else {
          const initial = new Set(w.entries.map(e => e.exerciseId));
          this.collapsedEntries.set(initial);
          _collapsedByWorkout.set(w.id, new Set(initial));
        }
      });
    }, { allowSignalWrites: true });

    // Clear any pending selection whenever grouping mode is turned off.
    effect(() => {
      if (!this.groupingMode()) untracked(() => this.selectedForGroup.set(new Set()));
    }, { allowSignalWrites: true });
  }

  isEntryEditable(exerciseId: string): boolean {
    return this.editMode() || this.alwaysEditable();
  }

  isCollapsed(id: string): boolean { return this.collapsedEntries().has(id); }

  toggleCollapse(id: string): void {
    const s = new Set(this.collapsedEntries());
    s.has(id) ? s.delete(id) : s.add(id);
    this.collapsedEntries.set(s);
    const wid = this.workout()?.id;
    if (wid) _collapsedByWorkout.set(wid, new Set(s));
  }

  isSectionCollapsed(id: string): boolean { return this.collapsedSections().has(id); }

  toggleSection(id: string): void {
    const s = new Set(this.collapsedSections());
    s.has(id) ? s.delete(id) : s.add(id);
    this.collapsedSections.set(s);
  }

  isEntryHidden(index: number): boolean {
    if (!this.showSections()) return false;
    return this.collapsedSections().has(this.entrySectionIds()[index]);
  }

  sectionCount(id: string): number {
    return this.entrySectionIds().filter(s => s === id).length;
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
    this.lastSessionData.set(null);
    this.recData.set(null);
    this.prevNoteData.set(null);
  }

  private _resetForm(): void {
    this.addingFor.set(null);
    this.editingSet.set(null);
    this.setQty.set(1);
    this.setForm.reset({ weight: 0, weightRight: 0, reps: 8 });
    this.dropStages.set([]);
  }

  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }
  getFeelingLabel(level: FeelingLevel): string { return FEELING_LABEL[level]; }

  openFatigaPicker(exerciseId: string): void { this.feelingPickerFor.set(exerciseId); }
  closeFatigaPicker(): void { this.feelingPickerFor.set(null); }

  async pickFeeling(level: FeelingLevel): Promise<void> {
    const entry = this.fatigaEntry();
    if (!entry) return;
    await this.setEntryFeeling(entry, level);
    this.closeFatigaPicker();
  }

  async clearFeeling(): Promise<void> {
    const entry = this.fatigaEntry();
    if (!entry) return;
    const w = this.workout();
    if (!w) return;
    try {
      await this.workoutService.updateEntryFeeling(w.id, entry.exerciseId, undefined);
    } catch {
      this.feedback.error('Error en eliminar la fatiga', 2000);
    }
    this.closeFatigaPicker();
  }

  openNotesPopup(exerciseId: string): void {
    const w = this.workout();
    const current = w?.entries.find(e => e.exerciseId === exerciseId)?.notes ?? '';
    this.notesText.set(current);
    this.notesPopupFor.set(exerciseId);
  }

  closeNotesPopup(): void { this.notesPopupFor.set(null); }

  async saveNotes(): Promise<void> {
    const exerciseId = this.notesPopupFor();
    const w = this.workout();
    if (!exerciseId || !w) return;
    const notes = this.notesText().trim();
    try {
      await this.workoutService.updateEntryNotes(w.id, exerciseId, notes || undefined);
    } catch {
      this.feedback.error('Error en desar la nota', 2000);
    }
    this.closeNotesPopup();
  }

  getCatColor(entry: WorkoutEntry): string {
    const ex = this.exerciseService.getById(entry.exerciseId);
    return ex ? CATEGORY_COLORS[ex.category] : 'var(--c-border)';
  }
  /** False only in the brief window before exercise data has loaded/cached — drives the loading shimmer instead of a flat gray bar. */
  isExerciseResolved(entry: WorkoutEntry): boolean {
    return !!this.exerciseService.getById(entry.exerciseId);
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
    const visIndices = this.visibleEntryIndices();
    const fromFlat = visIndices[event.previousIndex] ?? event.previousIndex;
    const toFlat   = visIndices[event.currentIndex]   ?? event.currentIndex;
    const entries = [...w.entries];
    moveItemInArray(entries, fromFlat, toFlat);
    try {
      await this.workoutService.reorderEntries(w.id, entries);
    } catch {
      this.feedback.error('Error en reordenar', 2000);
    }
  }

  entryMaxWeight(entry: WorkoutEntry): number {
    return entry.sets.reduce((m, s) => Math.max(m, setMaxWeight(s)), 0);
  }

  isUnilateral(entry: WorkoutEntry): boolean {
    return !!this.exerciseService.getById(entry.exerciseId)?.unilateral;
  }

  dispW(kg: number): number { return kgToDisplay(kg, this.unit()); }

  repeatLabel(entry: WorkoutEntry): string {
    const last = entry.sets[entry.sets.length - 1];
    const u = this.unit();
    if (last.weightLeft != null) {
      return `E ${this.dispW(last.weightLeft)}${u} · D ${this.dispW(last.weightRight!)}${u} × ${last.reps}`;
    }
    return `${this.dispW(last.weight)}${u} × ${last.reps}`;
  }

  adjustWeight(delta: number): void {
    const step = weightStep(this.unit());
    const v = (this.setForm.value.weight ?? 0) + delta * step;
    this.setForm.patchValue({ weight: Math.max(0, Math.round(v * 10) / 10) });
  }
  adjustWeightRight(delta: number): void {
    const step = weightStep(this.unit());
    const v = (this.setForm.value.weightRight ?? 0) + delta * step;
    this.setForm.patchValue({ weightRight: Math.max(0, Math.round(v * 10) / 10) });
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
  adjustEditWeightRight(delta: number): void {
    const step = weightStep(this.unit());
    const v = (this.editSetForm.value.weightRight ?? 0) + delta * step;
    this.editSetForm.patchValue({ weightRight: Math.max(0, Math.round(v * 10) / 10) });
  }
  adjustEditReps(delta: number): void {
    const v = (this.editSetForm.value.reps ?? 1) + delta;
    this.editSetForm.patchValue({ reps: Math.max(1, v) });
  }

  async setEntryFeeling(entry: WorkoutEntry, level: FeelingLevel): Promise<void> {
    const w = this.workout();
    if (!w) return;
    const newFeeling = entry.feeling === level ? undefined : level;
    const hadWorkoutFeeling = w.feeling != null;
    try {
      await this.workoutService.updateEntryFeeling(w.id, entry.exerciseId, newFeeling);
      if (!hadWorkoutFeeling && this.workout()?.feeling != null) {
        this.feedback.info('Sensació general calculada automàticament', 2500);
      }
    } catch {
      this.feedback.error('Error en actualitzar la fatiga', 2000);
    }
  }

  startAddSet(entry: WorkoutEntry): void {
    this._expandEntry(entry.exerciseId);
    this.editingSet.set(null);
    this.addingFor.set(entry.exerciseId);
    const w    = this.workout();
    const u    = this.unit();
    const goal = this.settingsService.fitnessGoal();
    if (entry.sets.length === 0 && w) {
      const info = this.workoutService.getLastSessionInfo(entry.exerciseId, w.id);
      const goal = this.settingsService.fitnessGoal();
      if (info) {
        const lastEntry = this.workoutService.doneWorkouts()
          .filter(wk => wk.id !== w.id && wk.entries.some(e => e.exerciseId === entry.exerciseId && e.sets.length > 0))
          .sort((a, b) => b.date.localeCompare(a.date))[0]
          ?.entries.find(e => e.exerciseId === entry.exerciseId);
        this.lastSessionData.set({ exerciseId: entry.exerciseId, ...info, sets: lastEntry?.sets ?? [] });
        this.prevNoteData.set(lastEntry?.notes ? { exerciseId: entry.exerciseId, notes: lastEntry.notes } : null);
        const wR = kgToDisplay(info.maxWeight, u);
        if (goal) {
          const rec = GOAL_REC[goal];
          this.recData.set({ exerciseId: entry.exerciseId, sets: rec.sets, reps: rec.reps, goalLabel: FITNESS_GOAL_LABELS[goal] });
          this.setForm.reset({ weight: kgToDisplay(info.maxWeight, u), weightRight: wR, reps: rec.reps });
        } else {
          this.recData.set(null);
          this.setForm.patchValue({ weight: kgToDisplay(info.maxWeight, u), weightRight: wR, reps: 8 });
        }
      } else {
        this.lastSessionData.set(null);
        this.prevNoteData.set(null);
        if (goal) {
          const rec = GOAL_REC[goal];
          this.recData.set({ exerciseId: entry.exerciseId, sets: rec.sets, reps: rec.reps, goalLabel: FITNESS_GOAL_LABELS[goal] });
          this.setForm.reset({ weight: 0, weightRight: 0, reps: rec.reps });
        } else {
          this.recData.set(null);
          this.setForm.reset({ weight: 0, weightRight: 0, reps: 8 });
        }
      }
    } else {
      this.lastSessionData.set(null);
      this.recData.set(null);
      this.prevNoteData.set(null);
      const last = entry.sets.at(-1);
      if (last) {
        this.setForm.patchValue({
          weight: kgToDisplay(last.weight, u),
          weightRight: kgToDisplay(last.weightRight ?? last.weight, u),
          reps: last.reps,
        });
      }
    }
  }

  applyRecCustomize(): void {
    const rec = this.recData();
    if (!rec) return;
    this.setForm.patchValue({ reps: rec.reps });
    this.recData.set(null);
  }

  applyRecDirect(exerciseId: string): void {
    const rec = this.recData();
    if (!rec) return;
    this.setForm.patchValue({ reps: rec.reps });
    this.recData.set(null);
    this.submitSets(exerciseId, rec.sets);
  }

  cancelSet(): void {
    this._resetForm();
    this.lastSessionData.set(null);
    this.recData.set(null);
    this.prevNoteData.set(null);
  }

  async repeatLastSet(entry: WorkoutEntry): Promise<void> {
    const w = this.workout();
    if (!w || !entry.sets.length) return;
    const last = entry.sets.at(-1)!;
    try {
      await this.workoutService.addSetsToEntry(w.id, entry.exerciseId, [{
        weight: last.weight, reps: last.reps,
        ...(last.weightLeft != null ? { weightLeft: last.weightLeft, weightRight: last.weightRight } : {}),
      }]);
    } catch {
      this.feedback.error('Error en repetir', 2000);
    }
  }

  isEditingSet(exerciseId: string, index: number): boolean {
    const es = this.editingSet();
    return es?.exerciseId === exerciseId && es?.index === index;
  }

  tapSetPill(event: Event, exerciseId: string, setIndex: number, set: WorkoutSet): void {
    if (!this.isEntryEditable(exerciseId)) return;
    event.stopPropagation();
    this.startEditSet(exerciseId, setIndex, set);
  }

  startEditSet(exerciseId: string, index: number, set: WorkoutSet): void {
    this.addingFor.set(null);
    this.editingSet.set({ exerciseId, index });
    this.editSetForm.setValue({
      weight: kgToDisplay(set.weight, this.unit()),
      weightRight: kgToDisplay(set.weightRight ?? set.weight, this.unit()),
      reps: set.reps,
    });
    this.editDropStages.set((set.drops ?? []).map(d => ({ weight: kgToDisplay(d.weight, this.unit()), reps: d.reps })));
  }

  cancelEditSet(): void {
    this.editingSet.set(null);
    this.editDropStages.set([]);
  }

  async saveEditSet(): Promise<void> {
    if (this.editSetForm.invalid) return;
    const es = this.editingSet();
    if (!es) return;
    const { weight, weightRight, reps } = this.editSetForm.value;
    const w = this.workout();
    if (!w) return;
    const entry = w.entries.find(e => e.exerciseId === es.exerciseId);
    const unilateral = !!entry && this.isUnilateral(entry);
    const weightKg      = displayToKg(weight!, this.unit());
    const weightRightKg = displayToKg(weightRight!, this.unit());
    const drops = this.editDropStages();
    try {
      await this.workoutService.updateSetInEntry(w.id, es.exerciseId, es.index, {
        weight: unilateral ? Math.max(weightKg, weightRightKg) : weightKg,
        reps: reps!,
        ...(unilateral ? { weightLeft: weightKg, weightRight: weightRightKg } : {}),
        ...(drops.length > 0 ? { drops: drops.map(d => ({ weight: displayToKg(d.weight, this.unit()), reps: d.reps })) } : {}),
      });
      this.cancelEditSet();
    } catch {
      this.feedback.error('Error en actualitzar la sèrie', 3000);
    }
  }

  async submitSets(exerciseId: string, count: number): Promise<void> {
    if (this.setForm.invalid) return;
    const { weight, weightRight, reps } = this.setForm.value;
    const w = this.workout();
    if (!w) return;
    const entry = w.entries.find(e => e.exerciseId === exerciseId);
    const unilateral = !!entry && this.isUnilateral(entry);
    const weightKg      = displayToKg(weight!, this.unit());
    const weightRightKg = displayToKg(weightRight!, this.unit());
    const drops = this.dropStages();
    const baseSet: WorkoutSet = unilateral
      ? { weight: Math.max(weightKg, weightRightKg), reps: reps!, weightLeft: weightKg, weightRight: weightRightKg }
      : { weight: weightKg, reps: reps! };
    const sets: WorkoutSet[] = drops.length > 0
      ? [{ ...baseSet, drops: drops.map(d => ({ weight: displayToKg(d.weight, this.unit()), reps: d.reps })) }]
      : Array.from({ length: count }, () => ({ ...baseSet }));
    try {
      await this.workoutService.addSetsToEntry(w.id, exerciseId, sets);
      this.cancelSet();
    } catch {
      this.feedback.error('Error en afegir les sèries', 3000);
    }
  }

  async applyLastSession(exerciseId: string): Promise<void> {
    const data = this.lastSessionData();
    const w    = this.workout();
    if (!data || !w || data.sets.length === 0) return;
    try {
      await this.workoutService.addSetsToEntry(w.id, exerciseId, data.sets);
      this.lastSessionData.set(null);
      this.cancelSet();
    } catch {
      this.feedback.error('Error en aplicar l\'última sessió', 3000);
    }
  }

  async removeSet(exerciseId: string, index: number): Promise<void> {
    const w = this.workout();
    if (!w) return;
    try {
      await this.workoutService.removeSetFromEntry(w.id, exerciseId, index);
    } catch {
      this.feedback.error('Error en eliminar', 2000);
    }
  }

  async removeEntry(exerciseId: string): Promise<void> {
    const w = this.workout();
    if (!w) return;
    if (this._timerForExercise === exerciseId) this.cancelTimer();
    try {
      await this.workoutService.removeEntryFromWorkout(w.id, exerciseId);
    } catch {
      this.feedback.error('Error en eliminar', 2000);
    }
  }

  // ── Superset grouping ───────────────────────────────────────────────────
  toggleGroupSelect(exerciseId: string): void {
    const s = new Set(this.selectedForGroup());
    s.has(exerciseId) ? s.delete(exerciseId) : s.add(exerciseId);
    this.selectedForGroup.set(s);
  }

  async confirmGroup(): Promise<void> {
    const w = this.workout();
    const ids = [...this.selectedForGroup()];
    if (!w || ids.length < 2) return;
    try {
      await this.workoutService.groupIntoSuperset(w.id, ids);
      this.selectedForGroup.set(new Set());
    } catch {
      this.feedback.error('Error en agrupar', 2000);
    }
  }

  async ungroupSuperset(exerciseId: string): Promise<void> {
    const w = this.workout();
    if (!w) return;
    try {
      await this.workoutService.removeFromSuperset(w.id, exerciseId);
    } catch {
      this.feedback.error('Error en desfer el superset', 2000);
    }
  }

  // ── Dropsets ─────────────────────────────────────────────────────────────
  addDropStage(): void {
    const step = weightStep(this.unit());
    const last = this.dropStages().at(-1) ?? { weight: this.setForm.value.weight ?? 0, reps: this.setForm.value.reps ?? 8 };
    const reduced = Math.max(0, Math.round((last.weight * 0.8) / step) * step);
    this.dropStages.update(arr => [...arr, { weight: reduced, reps: last.reps }]);
  }
  removeDropStage(index: number): void {
    this.dropStages.update(arr => arr.filter((_, i) => i !== index));
  }
  adjustDropWeight(index: number, delta: number): void {
    const step = weightStep(this.unit());
    this.dropStages.update(arr => arr.map((d, i) => i === index ? { ...d, weight: Math.max(0, Math.round((d.weight + delta * step) * 10) / 10) } : d));
  }
  adjustDropReps(index: number, delta: number): void {
    this.dropStages.update(arr => arr.map((d, i) => i === index ? { ...d, reps: Math.max(1, d.reps + delta) } : d));
  }
  setDropWeight(index: number, raw: string): void {
    const v = Math.max(0, Number(raw) || 0);
    this.dropStages.update(arr => arr.map((d, i) => i === index ? { ...d, weight: v } : d));
  }
  setDropReps(index: number, raw: string): void {
    const v = Math.max(1, Number(raw) || 1);
    this.dropStages.update(arr => arr.map((d, i) => i === index ? { ...d, reps: v } : d));
  }

  addEditDropStage(): void {
    const step = weightStep(this.unit());
    const last = this.editDropStages().at(-1) ?? { weight: this.editSetForm.value.weight ?? 0, reps: this.editSetForm.value.reps ?? 8 };
    const reduced = Math.max(0, Math.round((last.weight * 0.8) / step) * step);
    this.editDropStages.update(arr => [...arr, { weight: reduced, reps: last.reps }]);
  }
  removeEditDropStage(index: number): void {
    this.editDropStages.update(arr => arr.filter((_, i) => i !== index));
  }
  adjustEditDropWeight(index: number, delta: number): void {
    const step = weightStep(this.unit());
    this.editDropStages.update(arr => arr.map((d, i) => i === index ? { ...d, weight: Math.max(0, Math.round((d.weight + delta * step) * 10) / 10) } : d));
  }
  adjustEditDropReps(index: number, delta: number): void {
    this.editDropStages.update(arr => arr.map((d, i) => i === index ? { ...d, reps: Math.max(1, d.reps + delta) } : d));
  }
  setEditDropWeight(index: number, raw: string): void {
    const v = Math.max(0, Number(raw) || 0);
    this.editDropStages.update(arr => arr.map((d, i) => i === index ? { ...d, weight: v } : d));
  }
  setEditDropReps(index: number, raw: string): void {
    const v = Math.max(1, Number(raw) || 1);
    this.editDropStages.update(arr => arr.map((d, i) => i === index ? { ...d, reps: v } : d));
  }

  // ── Rest timer ─────────────────────────────────────────────────────────────
  /** Manually triggered from the "Descans" button — the timer never starts
   *  on its own after logging a set, only when the user asks for it. */
  startManualRest(exerciseId: string): void {
    if (!this.restTimerEnabled()) return;
    this.startRestTimer(this.settingsService.restTimerSeconds(), exerciseId);
  }

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
