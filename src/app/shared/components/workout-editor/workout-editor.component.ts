import { Component, ViewEncapsulation, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CATEGORY_COLORS, CATEGORY_LABELS } from '../../../core/models/exercise.model';
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
  imports: [ReactiveFormsModule, MatButtonModule],
  encapsulation: ViewEncapsulation.None,
  template: `
    @if (workout(); as w) {
      <div class="we-entries">

        @for (entry of w.entries; track entry.exerciseId) {
          <div class="we-entry-card">

            <!-- Entry header -->
            <div class="we-entry-header">
              <div class="we-entry-title">
                <span class="we-category-badge" [style.background]="getCatColor(entry)">
                  {{ getCatLabel(entry) }}
                </span>
                <span class="we-entry-name">{{ entry.exerciseName }}</span>
              </div>
              @if (editMode()) {
                <button mat-icon-button class="we-remove-btn" (click)="removeEntry(entry.exerciseId)">
                  <span class="material-symbols-outlined">close</span>
                </button>
              }
            </div>

            <!-- Sets table -->
            @if (entry.sets.length > 0) {
              <table class="we-sets-table">
                <thead><tr>
                  <th>#</th><th>Pes</th><th>Reps</th><th>Estat</th>
                  @if (editMode()) { <th></th> }
                </tr></thead>
                <tbody>
                  @for (set of entry.sets; track $index) {
                    @if (isEditingSet(entry.exerciseId, $index)) {
                      <!-- Inline edit row -->
                      <tr class="we-edit-set-row">
                        <td class="we-set-num">{{ $index + 1 }}</td>
                        <td colspan="4">
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
                              <div class="we-feeling-selector compact">
                                @for (level of feelingLevels; track level) {
                                  <button type="button" class="we-feeling-btn sm"
                                    [class.selected]="editSetForm.value.feeling === level"
                                    [title]="getFeelingLabel(level)"
                                    (click)="setEditFeeling(level)"
                                  >{{ getFeelingEmoji(level) }}</button>
                                }
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
                        <td class="we-set-feeling">{{ getFeelingEmoji(set.feeling) }}</td>
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
                  <div class="we-feeling-selector">
                    @for (level of feelingLevels; track level) {
                      <button type="button" class="we-feeling-btn"
                        [class.selected]="setForm.value.feeling === level"
                        [title]="getFeelingLabel(level)"
                        (click)="setFeeling(level)"
                      >{{ getFeelingEmoji(level) }}</button>
                    }
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
      padding: 12px 8px 8px 14px;
    }

    .we-entry-title { display: flex; flex-direction: column; gap: 4px; }
    .we-entry-name  { font-size: 16px; font-weight: 600; color: #1a1a1a; }

    .we-category-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      width: fit-content;
    }

    .we-remove-btn { color: #bbb; }

    .we-no-sets-hint {
      margin: 0;
      padding: 6px 14px 12px;
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

      .we-set-num     { color: #aaa; font-size: 12px; width: 24px; }
      .we-set-weight  { font-weight: 600; small { font-size: 10px; color: #aaa; margin-left: 2px; } }
      .we-set-reps    { small { font-size: 10px; color: #aaa; margin-left: 2px; } }
      .we-set-feeling { font-size: 18px; }
    }

    /* ── Set action buttons ── */
    .we-icon-btn-sm {
      background: none;
      border: none;
      cursor: pointer;
      color: #ccc;
      padding: 2px;
      display: flex;
      align-items: center;

      .material-symbols-outlined { font-size: 16px; }
      &:hover       { color: #aaa; }
      &.danger:hover { color: #ef5350; }
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
      input  { font-size: 13px; font-weight: 600; padding: 4px 0; }
    }

    .we-feeling-selector.compact {
      display: flex;
      gap: 4px;
      align-self: flex-end;
      padding-bottom: 2px;
    }
    .we-feeling-btn.sm { font-size: 18px; width: 32px; height: 32px; }

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

    .we-feeling-selector { display: flex; gap: 6px; justify-content: center; }

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

  // ── Add-sets form (4 sèries per defecte) ────────────────────
  readonly setForm = this.fb.group({
    weight:  [0,                 [Validators.required, Validators.min(0)]],
    reps:    [8,                 [Validators.required, Validators.min(1)]],
    series:  [4,                 [Validators.required, Validators.min(1)]],
    feeling: [3 as FeelingLevel, Validators.required],
  });

  // ── Edit-single-set form ─────────────────────────────────────
  readonly editSetForm = this.fb.group({
    weight:  [0, [Validators.required, Validators.min(0)]],
    reps:    [8, [Validators.required, Validators.min(1)]],
    feeling: [3 as FeelingLevel, Validators.required],
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
    this.setForm.reset({ weight: 0, reps: 8, series: 4, feeling: 3 });
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
  setFeeling(level: FeelingLevel): void {
    this.setForm.patchValue({ feeling: level });
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
  setEditFeeling(level: FeelingLevel): void {
    this.editSetForm.patchValue({ feeling: level });
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
    this.editSetForm.setValue({ weight: set.weight, reps: set.reps, feeling: set.feeling });
  }

  cancelEditSet(): void { this.editingSet.set(null); }

  async saveEditSet(): Promise<void> {
    if (this.editSetForm.invalid) return;
    const es = this.editingSet();
    if (!es) return;
    const { weight, reps, feeling } = this.editSetForm.value;
    const w = this.workout();
    if (!w) return;
    try {
      await this.workoutService.updateSetInEntry(w.id, es.exerciseId, es.index, {
        weight: weight!, reps: reps!, feeling: feeling as FeelingLevel,
      });
      this.cancelEditSet();
    } catch {
      this.snackBar.open('Error en actualitzar la sèrie', '', { duration: 3000 });
    }
  }

  async submitSets(exerciseId: string): Promise<void> {
    if (this.setForm.invalid) return;
    const { weight, reps, series, feeling } = this.setForm.value;
    const w = this.workout();
    if (!w) return;

    const sets = Array.from({ length: series! }, () => ({
      weight: weight!, reps: reps!, feeling: feeling as FeelingLevel,
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
