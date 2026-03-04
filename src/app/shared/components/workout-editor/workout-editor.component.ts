import { Component, ViewEncapsulation, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CATEGORY_COLORS, CATEGORY_LABELS, SUBCATEGORY_LABELS } from '../../../core/models/exercise.model';
import { FEELING_EMOJI, FEELING_LABEL, FeelingLevel, Workout, WorkoutEntry, WorkoutSet } from '../../../core/models/workout.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { WorkoutService } from '../../../core/services/workout.service';

/**
 * WorkoutEditorComponent
 *
 * Shared component that handles the full entry/set editing UI for a given workout.
 * Used by both TodayComponent and HistoryComponent to avoid duplicating logic.
 *
 * Inputs:
 *   - workout:  the Workout object to display/edit (null → renders nothing)
 *   - editMode: whether the UI is in edit mode (shows edit/delete controls)
 *
 * Output:
 *   - requestAddExercise: emitted when the user clicks "Afegir exercici"
 *
 * Public methods (callable via ViewChild):
 *   - startAddSet(entry):  opens the add-sets form for the given entry
 *   - reset():             resets all form state (call when edit mode ends or workout changes)
 */
@Component({
  selector: 'app-workout-editor',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule, DragDropModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (workout(); as w) {
      <div class="we-entries" cdkDropList (cdkDropListDropped)="onDrop($event)">

        @for (entry of w.entries; track entry.exerciseId) {
          <div class="we-entry-card" cdkDrag [cdkDragDisabled]="!editMode()">

            <!-- Drag placeholder -->
            <div class="we-drag-placeholder" *cdkDragPlaceholder></div>

            <!-- Entry header -->
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
                  <!-- Feeling emoji next to the name in view mode -->
                  @if (!editMode() && entry.feeling) {
                    <span class="we-entry-feeling-inline" [title]="getFeelingLabel(entry.feeling)">
                      {{ getFeelingEmoji(entry.feeling) }}
                    </span>
                  }
                </div>
              </div>
              @if (editMode()) {
                <button mat-icon-button class="we-remove-btn" (click)="removeEntry(entry.exerciseId)">
                  <span class="material-symbols-outlined">close</span>
                </button>
              }
            </div>

            <!-- Feeling picker row (only in edit mode) -->
            @if (editMode()) {
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

            <!-- Sets table -->
            @if (entry.sets.length > 0) {
              <table class="we-sets-table">
                <thead><tr>
                  <th>#</th><th>Pes</th><th>Reps</th>
                  @if (editMode()) { <th></th> }
                </tr></thead>
                <tbody>
                  @for (set of entry.sets; track $index) {
                    @if (isEditingSet(entry.exerciseId, $index)) {
                      <!-- Inline edit row -->
                      <tr class="we-edit-set-row">
                        <td class="we-set-num">{{ $index + 1 }}</td>
                        <td colspan="3">
                          <form [formGroup]="editSetForm" (ngSubmit)="saveEditSet()" class="we-inline-edit">
                            <div class="we-inline-inputs">
                              <div class="we-inline-group">
                                <label>Pes</label>
                                <div class="we-number-input compact">
                                  <button type="button" (click)="adjustEditWeight(-2.5)">−</button>
                                  <input type="number" formControlName="weight" min="0" step="2.5">
                                  <button type="button" (click)="adjustEditWeight(2.5)">+</button>
                                </div>
                              </div>
                              <div class="we-inline-group">
                                <label>Reps</label>
                                <div class="we-number-input compact">
                                  <button type="button" (click)="adjustEditReps(-1)">−</button>
                                  <input type="number" formControlName="reps" min="1" step="1">
                                  <button type="button" (click)="adjustEditReps(1)">+</button>
                                </div>
                              </div>
                            </div>
                            <div class="we-inline-actions">
                              <button type="button" mat-button (click)="cancelEditSet()">Cancel·lar</button>
                              <button type="submit" mat-flat-button [disabled]="editSetForm.invalid">Desar</button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    } @else {
                      <!-- Normal set row -->
                      <tr>
                        <td class="we-set-num">{{ $index + 1 }}</td>
                        <td class="we-set-weight">{{ set.weight }}<small>kg</small></td>
                        <td class="we-set-reps">{{ set.reps }}<small>r</small></td>
                        @if (editMode()) {
                          <td class="we-set-actions">
                            <button class="we-icon-btn-sm"
                              (click)="startEditSet(entry.exerciseId, $index, set)"
                              aria-label="Editar sèrie">
                              <span class="material-symbols-outlined">edit</span>
                            </button>
                            <button class="we-icon-btn-sm danger"
                              (click)="removeSet(entry.exerciseId, $index)"
                              aria-label="Eliminar sèrie">
                              <span class="material-symbols-outlined">close</span>
                            </button>
                          </td>
                        }
                      </tr>
                    }
                  }
                </tbody>
              </table>
            } @else if (!editMode()) {
              <p class="we-no-sets-hint">Sense sèries registrades</p>
            }

            <!-- Add-sets form / button -->
            @if (editMode()) {
              @if (addingFor() === entry.exerciseId) {
                <form [formGroup]="setForm" (ngSubmit)="submitSets(entry.exerciseId)" class="we-set-form">
                  <div class="we-set-inputs">
                    <div class="we-input-group">
                      <label>Pes (kg)</label>
                      <div class="we-number-input">
                        <button type="button" (click)="adjustWeight(-2.5)">−</button>
                        <input type="number" formControlName="weight" min="0" step="2.5">
                        <button type="button" (click)="adjustWeight(2.5)">+</button>
                      </div>
                    </div>
                    <div class="we-input-group">
                      <label>Repeticions</label>
                      <div class="we-number-input">
                        <button type="button" (click)="adjustReps(-1)">−</button>
                        <input type="number" formControlName="reps" min="1" step="1">
                        <button type="button" (click)="adjustReps(1)">+</button>
                      </div>
                    </div>
                    <div class="we-input-group">
                      <label>Sèries</label>
                      <div class="we-number-input">
                        <button type="button" (click)="adjustSeries(-1)">−</button>
                        <input type="number" formControlName="series" min="1" step="1">
                        <button type="button" (click)="adjustSeries(1)">+</button>
                      </div>
                    </div>
                  </div>
                  <div class="we-set-form-actions">
                    <button type="button" mat-button (click)="cancelSet()">Cancel·lar</button>
                    <button type="submit" mat-flat-button [disabled]="setForm.invalid">
                      {{ addSetsLabel }}
                    </button>
                  </div>
                </form>
              } @else {
                <button class="we-add-set-btn" (click)="startAddSet(entry)">
                  <span class="material-symbols-outlined">add</span>
                  Afegir sèries
                </button>
              }
            }

          </div>
        }

        @if (editMode()) {
          <button class="we-add-exercise-btn" (click)="requestAddExercise.emit()">
            <span class="material-symbols-outlined">add</span>
            Afegir exercici
          </button>
        }

      </div>
    }
  `,
  styles: [`
    /* ──────────────────────────────────────────────────────────────
       WorkoutEditorComponent styles  (prefixed "we-" to avoid collisions)
    ────────────────────────────────────────────────────────────── */

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
    }

    .we-entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 8px 6px 14px;
    }

    /* ── Drag handle ── */
    .we-drag-handle {
      font-size: 20px;
      color: #ccc;
      cursor: grab;
      padding: 4px 4px 4px 0;
      flex-shrink: 0;
      user-select: none;
      &:active { cursor: grabbing; }
    }

    /* ── CDK drag states ── */
    .we-entry-card.cdk-drag-preview {
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
      border-radius: 14px;
      opacity: 0.95;
    }
    .we-drag-placeholder {
      height: 60px;
      border: 2px dashed #d0e8ea;
      border-radius: 14px;
      background: rgba(0,104,116,0.04);
    }
    .cdk-drag-animating .we-entry-card { transition: transform 200ms ease; }

    .we-entry-title { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .we-entry-name  { font-size: 16px; font-weight: 600; color: #1a1a1a; }

    .we-entry-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

    .we-category-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      width: fit-content;
    }

    .we-subcategory-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 500;
      color: #666;
      background: #f0f0f0;
      width: fit-content;
    }

    .we-remove-btn { color: #bbb; flex-shrink: 0; }

    /* ── Entry feeling row ── */
    .we-entry-feeling-row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 14px 8px;
      min-height: 36px;

      &.edit {
        padding: 4px 14px 6px;
        border-bottom: 1px solid #f0f0f0;
      }
    }

    .we-feeling-label {
      font-size: 11px;
      font-weight: 600;
      color: #aaa;
      margin-right: 4px;
      white-space: nowrap;
    }

    .we-entry-feeling-badge {
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 18px;
      small { font-size: 11px; color: #888; }
    }

    /* ── Feeling buttons (shared for entry-level feeling) ── */
    .we-feeling-btn {
      font-size: 22px; width: 44px; height: 44px;
      border: 2px solid transparent; border-radius: 50%;
      background: #f0f0f0; cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center; line-height: 1;

      &:hover   { transform: scale(1.1); }
      &.selected {
        border-color: #006874;
        background: rgba(0,104,116,0.1);
        transform: scale(1.15);
      }

      &.sm { font-size: 20px; width: 36px; height: 36px; }
    }

    .we-no-sets-hint {
      margin: 0;
      padding: 4px 14px 12px;
      font-size: 13px;
      color: #bbb;
      font-style: italic;
    }

    /* ── Sets table ── */
    .we-sets-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;

      th {
        padding: 4px 10px;
        font-size: 11px;
        color: #aaa;
        font-weight: 500;
        text-align: left;
        border-bottom: 1px solid #f0f0f0;
      }
      td {
        padding: 8px 10px;
        border-bottom: 1px solid #fafafa;
      }

      .we-set-num    { color: #aaa; font-size: 12px; width: 24px; }
      .we-set-weight { font-weight: 600; small { font-size: 10px; color: #aaa; margin-left: 2px; } }
      .we-set-reps   { small { font-size: 10px; color: #aaa; margin-left: 2px; } }
    }

    /* ── Set action buttons ── */
    .we-icon-btn-sm {
      background: #f5f5f5;
      border: 1px solid #e8e8e8;
      border-radius: 8px;
      cursor: pointer;
      color: #999;
      padding: 7px 10px;
      display: flex;
      align-items: center;
      min-width: 40px;
      min-height: 36px;
      justify-content: center;

      .material-symbols-outlined { font-size: 18px; }
      &:hover        { background: #eee; color: #666; }
      &.danger       { background: rgba(239,83,80,0.08); border-color: rgba(239,83,80,0.2); color: #ef5350; }
      &.danger:hover { background: rgba(239,83,80,0.16); }
    }

    .we-set-actions { display: flex; gap: 2px; align-items: center; }

    /* ── Inline set-edit form ── */
    .we-edit-set-row td { padding: 0; background: #f0f9fa; }

    .we-inline-edit {
      padding: 10px 10px 8px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .we-inline-inputs {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      flex-wrap: wrap;
    }

    .we-inline-group {
      display: flex;
      flex-direction: column;
      gap: 3px;
      label { font-size: 11px; color: #555; font-weight: 600; }
    }

    .we-number-input.compact {
      button { width: 26px; height: 30px; font-size: 15px; }
      input  { font-size: 13px; font-weight: 600; padding: 4px 0; min-width: 48px; }
    }

    .we-inline-actions { display: flex; justify-content: flex-end; gap: 6px; }

    /* ── Add-sets form ── */
    .we-set-form {
      padding: 12px 14px;
      background: #fafafa;
      border-top: 1px solid #f0f0f0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .we-set-inputs { display: flex; gap: 10px; }

    .we-input-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;
      label { font-size: 12px; color: #666; font-weight: 500; }
    }

    .we-number-input {
      display: flex;
      align-items: center;
      border: 1.5px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      background: white;

      button {
        width: 30px; height: 38px;
        border: none; background: #f5f5f5;
        font-size: 18px; cursor: pointer; color: #333;
        &:hover  { background: #e8e8e8; }
        &:active { background: #ddd; }
      }
      input {
        flex: 1; border: none; text-align: center;
        font-size: 15px; font-weight: 600; outline: none;
        width: 0; min-width: 0; padding: 8px 0; background: white;
      }
    }

    .we-set-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

    /* ── Add-set button ── */
    .we-add-set-btn {
      display: flex; align-items: center; gap: 6px;
      width: 100%; padding: 12px 14px;
      border: none; background: transparent;
      color: #006874; font-size: 14px; font-weight: 500;
      cursor: pointer; border-top: 1px solid #f0f0f0;
      &:hover { background: rgba(0,104,116,0.05); }
    }

    /* ── Add-exercise button ── */
    .we-add-exercise-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 14px;
      border: 2px dashed #d0d0d0; border-radius: 14px;
      background: transparent; color: #888;
      font-size: 15px; font-weight: 500; cursor: pointer;
      margin-top: 4px; transition: all 0.2s;
      .material-symbols-outlined { font-size: 20px; line-height: 1; vertical-align: middle; }
      &:hover { border-color: #006874; color: #006874; background: rgba(0,104,116,0.04); }
    }
  `],
})
export class WorkoutEditorComponent {
  private workoutService  = inject(WorkoutService);
  private exerciseService = inject(ExerciseService);
  private snackBar        = inject(MatSnackBar);
  private fb              = inject(FormBuilder);

  // ── Signal inputs ─────────────────────────────────────────────
  readonly workout  = input<Workout | null>(null);
  readonly editMode = input<boolean>(false);

  // ── Output ────────────────────────────────────────────────────
  readonly requestAddExercise = output<void>();

  // ── Internal state ────────────────────────────────────────────
  readonly addingFor  = signal<string | null>(null);
  readonly editingSet = signal<{ exerciseId: string; index: number } | null>(null);
  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  // ── Add-sets form (4 sèries per defecte, sense feeling) ─────
  readonly setForm = this.fb.group({
    weight: [0, [Validators.required, Validators.min(0)]],
    reps:   [8, [Validators.required, Validators.min(1)]],
    series: [4, [Validators.required, Validators.min(1)]],
  });

  // ── Edit-single-set form (sense feeling) ────────────────────
  readonly editSetForm = this.fb.group({
    weight: [0, [Validators.required, Validators.min(0)]],
    reps:   [8, [Validators.required, Validators.min(1)]],
  });

  get addSetsLabel(): string {
    const n = this.setForm.value.series ?? 4;
    return `Afegir ${n} ${n === 1 ? 'sèrie' : 'sèries'}`;
  }

  // ── Public reset (called by parent via ViewChild) ─────────────
  reset(): void { this._resetForm(); }

  private _resetForm(): void {
    this.addingFor.set(null);
    this.editingSet.set(null);
    this.setForm.reset({ weight: 0, reps: 8, series: 4 });
  }

  // ── Helpers ───────────────────────────────────────────────────
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

  // ── Form adjusters (add-sets) ─────────────────────────────────
  adjustWeight(delta: number): void {
    const v = (this.setForm.value.weight ?? 0) + delta;
    this.setForm.patchValue({ weight: Math.max(0, Math.round(v * 4) / 4) });
  }
  adjustReps(delta: number): void {
    const v = (this.setForm.value.reps ?? 1) + delta;
    this.setForm.patchValue({ reps: Math.max(1, v) });
  }
  adjustSeries(delta: number): void {
    const v = (this.setForm.value.series ?? 1) + delta;
    this.setForm.patchValue({ series: Math.max(1, v) });
  }

  // ── Form adjusters (edit-set) ─────────────────────────────────
  adjustEditWeight(delta: number): void {
    const v = (this.editSetForm.value.weight ?? 0) + delta;
    this.editSetForm.patchValue({ weight: Math.max(0, Math.round(v * 4) / 4) });
  }
  adjustEditReps(delta: number): void {
    const v = (this.editSetForm.value.reps ?? 1) + delta;
    this.editSetForm.patchValue({ reps: Math.max(1, v) });
  }

  // ── Entry-level feeling ───────────────────────────────────────
  async setEntryFeeling(entry: WorkoutEntry, level: FeelingLevel): Promise<void> {
    const w = this.workout();
    if (!w) return;
    // Toggle: clicking the active level clears it
    const newFeeling = entry.feeling === level ? undefined : level;
    try {
      await this.workoutService.updateEntryFeeling(w.id, entry.exerciseId, newFeeling);
    } catch {
      this.snackBar.open('Error en actualitzar la sensació', '', { duration: 2000 });
    }
  }

  // ── Set actions ───────────────────────────────────────────────
  /** Opens the add-sets form for a given entry. Also callable from parent via ViewChild. */
  startAddSet(entry: WorkoutEntry): void {
    this.editingSet.set(null);
    this.addingFor.set(entry.exerciseId);
    const last = entry.sets.at(-1);
    if (last) this.setForm.patchValue({ weight: last.weight, reps: last.reps });
  }

  cancelSet(): void { this._resetForm(); }

  // ── Edit individual set ───────────────────────────────────────
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

  async submitSets(exerciseId: string): Promise<void> {
    if (this.setForm.invalid) return;
    const { weight, reps, series } = this.setForm.value;
    const w = this.workout();
    if (!w) return;

    const sets = Array.from({ length: series! }, () => ({
      weight: weight!, reps: reps!,
    }));

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
