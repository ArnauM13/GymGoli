import { Component, ViewEncapsulation, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CATEGORY_COLORS, CATEGORY_LABELS, SUBCATEGORY_LABELS } from '../../../core/models/exercise.model';
import { FEELING_EMOJI, FEELING_LABEL, FeelingLevel, Workout, WorkoutEntry, WorkoutSet } from '../../../core/models/workout.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { ExerciseStatsDialogComponent } from '../exercise-stats-dialog.component';

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
               cdkDrag [cdkDragDisabled]="!editMode()"
               [style.--we-cat-color]="getCatColor(entry)"
               [class.we-entry-solo-edit]="!editMode() && !alwaysEditable() && editingEntry() === entry.exerciseId">

            <div class="we-drag-placeholder" *cdkDragPlaceholder></div>

            <!-- ── Entry header ── -->
            <div class="we-entry-header">
              @if (editMode()) {
                <span class="we-drag-handle material-symbols-outlined" cdkDragHandle>drag_indicator</span>
              }
              <div class="we-entry-title">
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
                  @if (entry.feeling && addingFor() !== entry.exerciseId) {
                    <span class="we-entry-feeling-inline" [title]="getFeelingLabel(entry.feeling)">
                      {{ getFeelingEmoji(entry.feeling) }}
                    </span>
                  }
                </div>
              </div>

              <!-- Stats button (always visible) -->
              <button class="we-icon-btn-sm" (click)="openStats(entry)" title="Estadístiques">
                <span class="material-symbols-outlined">bar_chart</span>
              </button>

              @if (editMode()) {
                <button mat-icon-button class="we-remove-btn" (click)="removeEntry(entry.exerciseId)" title="Eliminar exercici">
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

            <!-- ── Feeling picker (visible while adding sets for this entry, or in edit mode) ── -->
            @if ((editMode() && !alwaysEditable()) || editingEntry() === entry.exerciseId || addingFor() === entry.exerciseId) {
              <div class="we-entry-feeling-row edit">
                <span class="we-feeling-label">Sensació</span>
                @for (level of feelingLevels; track level) {
                  <button type="button" class="we-feeling-btn sm"
                    [class.selected]="entry.feeling === level"
                    [title]="getFeelingLabel(level)"
                    (click)="setEntryFeeling(entry, level)"
                  >{{ getFeelingEmoji(level) }}</button>
                }
              </div>
            }

            <!-- ── Last session info banner ── -->
            @if (lastSessionData()?.exerciseId === entry.exerciseId && entry.sets.length === 0 && addingFor() === entry.exerciseId) {
              <div class="we-last-session-banner">
                <span class="material-symbols-outlined we-lsb-icon">history</span>
                <div class="we-lsb-info">
                  <span class="we-lsb-label">Última sessió</span>
                  <span class="we-lsb-date">{{ formatLastDate(lastSessionData()!.date) }}</span>
                </div>
                <div class="we-lsb-stats">
                  <span class="we-lsb-weight">{{ lastSessionData()!.maxWeight }}kg</span>
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
                              <button type="button" (click)="adjustEditWeight(-2.5)">−</button>
                              <input type="number" formControlName="weight" min="0" step="2.5"
                                     (focus)="$any($event.target).select()">
                              <button type="button" (click)="adjustEditWeight(2.5)">+</button>
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
                        <span class="we-set-pill weight">{{ set.weight }}<small>kg</small></span>
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
                      <label>Pes (kg)</label>
                      <div class="we-number-input">
                        <button type="button" (click)="adjustWeight(-2.5)">−</button>
                        <input type="number" formControlName="weight" min="0" step="2.5"
                               (focus)="$any($event.target).select()">
                        <button type="button" (click)="adjustWeight(2.5)">+</button>
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
                  <!-- ×1 ×2 ×3 quick-add buttons -->
                  <div class="we-set-form-actions">
                    <button type="button" class="we-cancel-btn" (click)="cancelSet()">Cancel·lar</button>
                    <div class="we-quick-add">
                      <button type="button" class="we-quick-btn" (click)="submitSets(entry.exerciseId, 1)"
                              [disabled]="setForm.invalid">×1</button>
                      <button type="button" class="we-quick-btn" (click)="submitSets(entry.exerciseId, 2)"
                              [disabled]="setForm.invalid">×2</button>
                      <button type="button" class="we-quick-btn we-quick-btn-primary" (click)="submitSets(entry.exerciseId, 3)"
                              [disabled]="setForm.invalid">×3</button>
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
                            [title]="'Repetir: ' + entry.sets[entry.sets.length - 1].weight + 'kg × ' + entry.sets[entry.sets.length - 1].reps">
                      <span class="material-symbols-outlined">repeat</span>
                      <span class="we-repeat-label">{{ entry.sets[entry.sets.length - 1].weight }}kg × {{ entry.sets[entry.sets.length - 1].reps }}</span>
                    </button>
                  }
                </div>
              }
            }

          </div>
        }

        @if (editMode() && !alwaysEditable()) {
          <button class="we-add-exercise-btn" (click)="requestAddExercise.emit()">
            <span class="material-symbols-outlined">add</span>
            Afegir exercici
          </button>
        }

      </div>
    }
  `,
  styles: [`
    .we-entries {
      padding: 0 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    /* ── Entry card ── */
    .we-entry-card {
      background: white;
      border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
      border-left: 4px solid var(--we-cat-color, #ccc);
      transition: box-shadow 0.2s, border-left-width 0.2s;
    }

    .we-entry-solo-edit {
      box-shadow: 0 3px 14px rgba(0,104,116,0.18);
      border-left-width: 5px;
    }

    .we-entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 8px 6px 14px;
      gap: 4px;
    }

    .we-drag-handle {
      font-size: 20px; color: #ccc; cursor: grab;
      padding: 4px 4px 4px 0; flex-shrink: 0;
      user-select: none; touch-action: none;
      &:active { cursor: grabbing; }
    }

    .we-entry-card.cdk-drag-preview {
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      border-radius: 14px; opacity: 0.95;
    }
    .we-drag-placeholder {
      height: 60px; border: 2px dashed #d0e8ea;
      border-radius: 14px; background: rgba(0,104,116,0.04);
    }
    .cdk-drag-animating .we-entry-card { transition: transform 200ms ease; }

    .we-entry-title { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .we-entry-name  { font-size: 16px; font-weight: 600; color: #1a1a1a; }
    .we-entry-name-row { display: flex; align-items: center; gap: 4px; }
    .we-entry-feeling-inline { font-size: 18px; line-height: 1; }
    .we-entry-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

    .we-category-badge {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600; color: white; width: fit-content;
    }
    .we-subcategory-badge {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 500; color: #666; background: #f0f0f0; width: fit-content;
    }

    .we-remove-btn { color: #bbb; flex-shrink: 0; }

    .we-entry-done-btn {
      background: rgba(0,104,116,0.1) !important;
      border-color: rgba(0,104,116,0.3) !important;
      color: #006874 !important;
    }

    /* ── Feeling row ── */
    .we-entry-feeling-row {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 14px 6px; min-height: 36px;
      border-bottom: 1px solid #f0f0f0;
    }
    .we-feeling-label {
      font-size: 11px; font-weight: 600; color: #aaa; margin-right: 4px; white-space: nowrap;
    }
    .we-feeling-btn {
      font-size: 22px; width: 44px; height: 44px;
      border: 2px solid transparent; border-radius: 50%;
      background: #f0f0f0; cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center; line-height: 1;
      touch-action: manipulation;
      &:hover   { transform: scale(1.1); }
      &.selected { border-color: #006874; background: rgba(0,104,116,0.1); transform: scale(1.15); }
      &.sm { font-size: 20px; width: 36px; height: 36px; }
    }

    /* ── Last session banner ── */
    .we-last-session-banner {
      display: flex; align-items: center; gap: 10px;
      margin: 4px 14px 6px; padding: 10px 14px;
      background: rgba(0,104,116,0.07); border: 1px solid rgba(0,104,116,0.15);
      border-radius: 10px;
    }
    .we-lsb-icon { font-size: 20px; color: #006874; flex-shrink: 0; }
    .we-lsb-info { display: flex; flex-direction: column; gap: 1px; flex: 1; }
    .we-lsb-label { font-size: 10px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.4px; }
    .we-lsb-date  { font-size: 13px; font-weight: 600; color: #1a1a1a; }
    .we-lsb-stats { display: flex; align-items: center; gap: 6px; }
    .we-lsb-weight { font-size: 16px; font-weight: 700; color: #006874; }
    .we-lsb-feeling { font-size: 20px; line-height: 1; }

    .we-no-sets-hint {
      margin: 0; padding: 4px 14px 12px;
      font-size: 13px; color: #bbb; font-style: italic;
    }

    /* ── Sets list ── */
    .we-sets-list { padding: 0 14px 4px; }

    .we-set-row {
      display: flex; align-items: center; gap: 10px;
      min-height: 48px; border-bottom: 1px solid #f5f5f5;
      border-radius: 8px; padding: 0 4px;
      transition: background 0.12s;
      &:last-child { border-bottom: none; }

      &.we-set-row-tappable {
        cursor: pointer;
        &:hover { background: rgba(0,104,116,0.05); }
        &:active { background: rgba(0,104,116,0.1); }
      }
    }

    .we-set-num {
      color: #bbb; font-size: 12px; font-weight: 500;
      width: 20px; text-align: center; flex-shrink: 0;
    }

    .we-set-pills { flex: 1; display: flex; gap: 8px; }

    .we-set-pill {
      display: inline-flex; align-items: baseline; gap: 3px;
      padding: 6px 12px; border-radius: 20px; font-size: 15px; font-weight: 700;
      small { font-size: 11px; font-weight: 500; opacity: 0.7; }
      &.weight { background: rgba(0,104,116,0.1); color: #006874; }
      &.reps   { background: #f0f0f0; color: #555; }
    }

    /* ── Icon buttons ── */
    .we-icon-btn-sm {
      background: #f5f5f5; border: 1px solid #e8e8e8; border-radius: 8px;
      cursor: pointer; color: #999; padding: 7px 10px;
      display: flex; align-items: center; min-width: 40px; min-height: 36px;
      justify-content: center; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover        { background: #eee; color: #666; }
      &.danger       { background: rgba(239,83,80,0.08); border-color: rgba(239,83,80,0.2); color: #ef5350; }
      &.danger:hover { background: rgba(239,83,80,0.16); }
    }

    /* ── Inline set-edit row ── */
    .we-edit-set-row {
      display: flex; align-items: flex-start; gap: 10px;
      padding: 10px 0 8px; background: #f0f9fa; border-radius: 10px; margin: 4px 0;
      .we-set-num { padding-top: 14px; }
    }
    .we-inline-edit { flex: 1; display: flex; flex-direction: column; gap: 8px; }
    .we-inline-inputs { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
    .we-inline-group {
      display: flex; flex-direction: column; gap: 3px;
      label { font-size: 11px; color: #555; font-weight: 600; }
    }
    .we-number-input.compact {
      button { width: 26px; height: 30px; font-size: 15px; }
      input  { font-size: 16px; font-weight: 600; padding: 4px 0; min-width: 48px; }
    }
    .we-inline-actions { display: flex; justify-content: flex-end; gap: 6px; }

    /* ── Add-sets form ── */
    .we-set-form {
      padding: 12px 14px; background: #fafafa; border-top: 1px solid #f0f0f0;
      display: flex; flex-direction: column; gap: 12px;
    }

    .we-set-inputs { display: flex; gap: 10px; }

    .we-input-group {
      flex: 1; display: flex; flex-direction: column; gap: 4px;
      label { font-size: 12px; color: #666; font-weight: 500; }
    }

    .we-number-input {
      display: flex; align-items: center;
      border: 1.5px solid #e0e0e0; border-radius: 8px; overflow: hidden; background: white;
      button {
        width: 30px; height: 38px; border: none; background: #f5f5f5;
        font-size: 18px; cursor: pointer; color: #333; touch-action: manipulation;
        &:hover  { background: #e8e8e8; }
        &:active { background: #ddd; }
      }
      input {
        flex: 1; border: none; text-align: center;
        font-size: 16px; font-weight: 600; outline: none;
        width: 0; min-width: 0; padding: 8px 0; background: white;
      }
    }

    /* ── ×1 ×2 ×3 quick-add ── */
    .we-set-form-actions {
      display: flex; align-items: center; gap: 8px;
    }
    .we-cancel-btn {
      padding: 8px 12px; border: none; background: transparent;
      color: #888; font-size: 13px; font-weight: 500; cursor: pointer;
      border-radius: 8px; touch-action: manipulation;
      &:hover { background: #f0f0f0; }
    }
    .we-quick-add {
      flex: 1; display: flex; gap: 6px; justify-content: flex-end;
    }
    .we-quick-btn {
      flex: 1; max-width: 72px;
      padding: 11px 0; border-radius: 10px;
      border: 1.5px solid #006874; background: white;
      color: #006874; font-size: 15px; font-weight: 700;
      cursor: pointer; touch-action: manipulation;
      transition: all 0.15s;
      &:hover:not(:disabled)  { background: rgba(0,104,116,0.08); }
      &:active:not(:disabled) { transform: scale(0.95); }
      &:disabled { opacity: 0.4; cursor: default; }
    }
    .we-quick-btn-primary {
      background: #006874; color: white;
      &:hover:not(:disabled) { background: #005a63; }
    }

    /* ── Add / Repeat row ── */
    .we-add-set-row {
      display: flex; align-items: stretch;
      border-top: 1px solid rgba(0,104,116,0.08);
    }

    .we-add-set-btn {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 14px; border: none; background: rgba(0,104,116,0.06);
      color: #006874; font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      &:hover { background: rgba(0,104,116,0.12); }
    }

    .we-repeat-btn {
      display: flex; align-items: center; gap: 5px;
      padding: 14px 16px;
      border: none; border-left: 1px solid rgba(0,104,116,0.12);
      background: rgba(0,104,116,0.04);
      color: #006874; font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s; white-space: nowrap;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(0,104,116,0.12); }
    }
    .we-repeat-label { font-size: 13px; font-weight: 600; }

    /* ── Add-exercise button (history edit mode) ── */
    .we-add-exercise-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 14px;
      border: 2px dashed #d0d0d0; border-radius: 14px;
      background: transparent; color: #888; font-size: 15px; font-weight: 500;
      cursor: pointer; margin-top: 4px; transition: all 0.2s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; line-height: 1; vertical-align: middle; }
      &:hover { border-color: #006874; color: #006874; background: rgba(0,104,116,0.04); }
    }

    .we-set-actions { display: flex; gap: 2px; align-items: center; }
  `],
})
export class WorkoutEditorComponent {
  private workoutService  = inject(WorkoutService);
  private exerciseService = inject(ExerciseService);
  private snackBar        = inject(MatSnackBar);
  private fb              = inject(FormBuilder);
  private dialog          = inject(MatDialog);

  readonly workout        = input<Workout | null>(null);
  readonly editMode       = input<boolean>(false);
  /** When true (Today mode): all entries are always editable, no per-entry toggle shown */
  readonly alwaysEditable = input<boolean>(false);

  readonly requestAddExercise = output<void>();

  readonly addingFor    = signal<string | null>(null);
  readonly editingSet   = signal<{ exerciseId: string; index: number } | null>(null);
  readonly editingEntry = signal<string | null>(null);
  readonly lastSessionData = signal<{ exerciseId: string; date: string; maxWeight: number; feeling?: FeelingLevel } | null>(null);

  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  readonly setForm = this.fb.group({
    weight: [0, [Validators.required, Validators.min(0)]],
    reps:   [8, [Validators.required, Validators.min(1)]],
  });

  readonly editSetForm = this.fb.group({
    weight: [0, [Validators.required, Validators.min(0)]],
    reps:   [8, [Validators.required, Validators.min(1)]],
  });

  isEntryEditable(exerciseId: string): boolean {
    return this.editMode() || this.alwaysEditable() || this.editingEntry() === exerciseId;
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

  adjustWeight(delta: number): void {
    const v = (this.setForm.value.weight ?? 0) + delta;
    this.setForm.patchValue({ weight: Math.max(0, Math.round(v * 4) / 4) });
  }
  adjustReps(delta: number): void {
    const v = (this.setForm.value.reps ?? 1) + delta;
    this.setForm.patchValue({ reps: Math.max(1, v) });
  }

  adjustEditWeight(delta: number): void {
    const v = (this.editSetForm.value.weight ?? 0) + delta;
    this.editSetForm.patchValue({ weight: Math.max(0, Math.round(v * 4) / 4) });
  }
  adjustEditReps(delta: number): void {
    const v = (this.editSetForm.value.reps ?? 1) + delta;
    this.editSetForm.patchValue({ reps: Math.max(1, v) });
  }

  async setEntryFeeling(entry: WorkoutEntry, level: FeelingLevel): Promise<void> {
    const w = this.workout();
    if (!w) return;
    const newFeeling = entry.feeling === level ? undefined : level;
    try {
      await this.workoutService.updateEntryFeeling(w.id, entry.exerciseId, newFeeling);
    } catch {
      this.snackBar.open('Error en actualitzar la sensació', '', { duration: 2000 });
    }
  }

  startAddSet(entry: WorkoutEntry): void {
    this.editingSet.set(null);
    this.addingFor.set(entry.exerciseId);
    const w = this.workout();
    if (entry.sets.length === 0 && w) {
      const info = this.workoutService.getLastSessionInfo(entry.exerciseId, w.id);
      if (info) {
        this.lastSessionData.set({ exerciseId: entry.exerciseId, ...info });
        this.setForm.patchValue({ weight: info.maxWeight, reps: 8 });
      } else {
        this.lastSessionData.set(null);
        this.setForm.reset({ weight: 0, reps: 8 });
      }
    } else {
      this.lastSessionData.set(null);
      const last = entry.sets.at(-1);
      if (last) this.setForm.patchValue({ weight: last.weight, reps: last.reps });
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
    this.editSetForm.setValue({ weight: set.weight, reps: set.reps });
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
        weight: weight!, reps: reps!,
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
    const sets = Array.from({ length: count }, () => ({ weight: weight!, reps: reps! }));
    try {
      await this.workoutService.addSetsToEntry(w.id, exerciseId, sets);
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
    try {
      await this.workoutService.removeEntryFromWorkout(w.id, exerciseId);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }
}
