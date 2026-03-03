import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Exercise, CATEGORY_COLORS, CATEGORY_LABELS } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FEELING_LABEL, FeelingLevel, WorkoutEntry } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { WorkoutService } from '../../core/services/workout.service';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';

@Component({
  selector: 'app-today',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule],
  template: `
    <div class="page">

      <!-- ── Header ── -->
      <header class="page-header">
        <div class="date-info">
          <h1>Avui</h1>
          <p class="date-sub">{{ todayLabel }}</p>
        </div>
        <div class="header-actions">
          @if (workout() && !editMode()) {
            <button class="action-btn edit-btn" (click)="toggleEditMode()" aria-label="Editar">
              <span class="material-symbols-outlined">edit</span>
            </button>
          }
          @if (editMode()) {
            <button class="action-btn delete-btn" (click)="deleteWorkout()" aria-label="Eliminar">
              <span class="material-symbols-outlined">delete</span>
            </button>
            <button class="action-btn done-btn" (click)="toggleEditMode()" aria-label="Acabar edició">
              <span class="material-symbols-outlined">check_circle</span>
            </button>
          }
        </div>
      </header>

      <!-- ── Empty state ── -->
      @if (!workout()) {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">fitness_center</span>
          <h2>Cap entrenament avui</h2>
          <p>Comença afegint el primer exercici</p>
          <button mat-flat-button class="start-btn" (click)="openPicker()">
            <span class="material-symbols-outlined">add</span>
            Afegir exercici
          </button>
        </div>
      }

      <!-- ── Workout entries ── -->
      @if (workout(); as w) {
        <div class="entries">
          @for (entry of w.entries; track entry.exerciseId) {
            <div class="entry-card">

              <div class="entry-header">
                <div class="entry-title">
                  <span class="category-badge" [style.background]="getCatColor(entry)">
                    {{ getCatLabel(entry) }}
                  </span>
                  <span class="entry-name">{{ entry.exerciseName }}</span>
                </div>
                @if (editMode()) {
                  <button mat-icon-button class="remove-btn" (click)="removeEntry(entry.exerciseId)">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                }
              </div>

              @if (entry.sets.length > 0) {
                <table class="sets-table">
                  <thead><tr>
                    <th>#</th><th>Pes</th><th>Reps</th><th>Estat</th>
                    @if (editMode()) { <th></th> }
                  </tr></thead>
                  <tbody>
                    @for (set of entry.sets; track $index) {
                      <tr>
                        <td class="set-num">{{ $index + 1 }}</td>
                        <td class="set-weight">{{ set.weight }}<small>kg</small></td>
                        <td class="set-reps">{{ set.reps }}<small>r</small></td>
                        <td class="set-feeling">{{ getFeelingEmoji(set.feeling) }}</td>
                        @if (editMode()) {
                          <td>
                            <button class="icon-btn-sm" (click)="removeSet(entry.exerciseId, $index)">
                              <span class="material-symbols-outlined">close</span>
                            </button>
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              } @else if (!editMode()) {
                <p class="no-sets-hint">Sense sèries registrades</p>
              }

              @if (editMode()) {
                @if (addingFor() === entry.exerciseId) {
                  <form [formGroup]="setForm" (ngSubmit)="submitSets(entry.exerciseId)" class="set-form">
                    <div class="set-inputs">
                      <div class="input-group">
                        <label>Pes (kg)</label>
                        <div class="number-input">
                          <button type="button" (click)="adjustWeight(-2.5)">−</button>
                          <input type="number" formControlName="weight" min="0" step="2.5">
                          <button type="button" (click)="adjustWeight(2.5)">+</button>
                        </div>
                      </div>
                      <div class="input-group">
                        <label>Repeticions</label>
                        <div class="number-input">
                          <button type="button" (click)="adjustReps(-1)">−</button>
                          <input type="number" formControlName="reps" min="1" step="1">
                          <button type="button" (click)="adjustReps(1)">+</button>
                        </div>
                      </div>
                      <div class="input-group">
                        <label>Sèries</label>
                        <div class="number-input">
                          <button type="button" (click)="adjustSeries(-1)">−</button>
                          <input type="number" formControlName="series" min="1" step="1">
                          <button type="button" (click)="adjustSeries(1)">+</button>
                        </div>
                      </div>
                    </div>
                    <div class="feeling-selector">
                      @for (level of feelingLevels; track level) {
                        <button type="button" class="feeling-btn"
                          [class.selected]="setForm.value.feeling === level"
                          [title]="getFeelingLabel(level)"
                          (click)="setFeeling(level)"
                        >{{ getFeelingEmoji(level) }}</button>
                      }
                    </div>
                    <div class="set-form-actions">
                      <button type="button" mat-button (click)="cancelSet()">Cancel·lar</button>
                      <button type="submit" mat-flat-button [disabled]="setForm.invalid">
                        {{ addSetsLabel }}
                      </button>
                    </div>
                  </form>
                } @else {
                  <button class="add-set-btn" (click)="startAddSet(entry)">
                    <span class="material-symbols-outlined">add</span>
                    Afegir sèries
                  </button>
                }
              }

            </div>
          }

          @if (editMode()) {
            <button class="add-exercise-btn" (click)="openPicker()">
              <span class="material-symbols-outlined">add</span>
              Afegir exercici
            </button>
          }
        </div>
      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 80px; }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 12px 12px;

      h1 { margin: 0; font-size: 24px; font-weight: 700; }
      .date-sub { margin: 2px 0 0; font-size: 13px; color: #888; text-transform: capitalize; }
    }

    .header-actions { display: flex; align-items: center; gap: 4px; }

    .action-btn {
      width: 40px; height: 40px;
      border: none; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 22px; }
    }
    .edit-btn   { background: rgba(0,104,116,0.1);  color: #006874; &:hover { background: rgba(0,104,116,0.18); } }
    .done-btn   { background: rgba(0,150,80,0.12);  color: #00966e; &:hover { background: rgba(0,150,80,0.2);   } }
    .delete-btn { background: transparent; color: #bbb; &:hover { background: rgba(239,83,80,0.1); color: #ef5350; } }

    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 60px 24px; text-align: center;
      .empty-icon { font-size: 64px; color: #ddd; }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: #444; }
      p  { margin: 0; color: #888; }
    }

    .start-btn {
      margin-top: 8px; background: #006874; color: white;
      border-radius: 24px; padding: 0 24px; height: 48px;
      font-size: 15px; display: flex; align-items: center; gap: 6px;
    }

    .entries { padding: 0 16px; display: flex; flex-direction: column; gap: 12px; }

    .entry-card {
      background: white; border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08); overflow: hidden;
    }

    .entry-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 8px 8px 14px;
    }

    .entry-title { display: flex; flex-direction: column; gap: 4px; }
    .entry-name { font-size: 16px; font-weight: 600; color: #1a1a1a; }

    .category-badge {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600; color: white; width: fit-content;
    }
    .remove-btn { color: #bbb; }

    .no-sets-hint {
      margin: 0; padding: 6px 14px 12px;
      font-size: 13px; color: #bbb; font-style: italic;
    }

    .sets-table {
      width: 100%; border-collapse: collapse; font-size: 14px;
      th { padding: 4px 10px; font-size: 11px; color: #aaa; font-weight: 500; text-align: left; border-bottom: 1px solid #f0f0f0; }
      td { padding: 8px 10px; border-bottom: 1px solid #fafafa; }
      .set-num    { color: #aaa; font-size: 12px; width: 24px; }
      .set-weight { font-weight: 600; small { font-size: 10px; color: #aaa; margin-left: 2px; } }
      .set-reps   { small { font-size: 10px; color: #aaa; margin-left: 2px; } }
      .set-feeling { font-size: 18px; }
    }

    .icon-btn-sm {
      background: none; border: none; cursor: pointer; color: #ccc; padding: 2px;
      display: flex; align-items: center;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { color: #ef5350; }
    }

    .set-form {
      padding: 12px 14px; background: #fafafa; border-top: 1px solid #f0f0f0;
      display: flex; flex-direction: column; gap: 12px;
    }

    .set-inputs { display: flex; gap: 10px; }

    .input-group {
      flex: 1; display: flex; flex-direction: column; gap: 4px;
      label { font-size: 12px; color: #666; font-weight: 500; }
    }

    .number-input {
      display: flex; align-items: center;
      border: 1.5px solid #e0e0e0; border-radius: 8px; overflow: hidden; background: white;
      button { width: 30px; height: 38px; border: none; background: #f5f5f5; font-size: 18px; cursor: pointer; color: #333; &:hover { background: #e8e8e8; } &:active { background: #ddd; } }
      input { flex: 1; border: none; text-align: center; font-size: 15px; font-weight: 600; outline: none; width: 0; min-width: 0; padding: 8px 0; background: white; }
    }

    .feeling-selector { display: flex; gap: 6px; justify-content: center; }

    .feeling-btn {
      font-size: 22px; width: 44px; height: 44px; border: 2px solid transparent;
      border-radius: 50%; background: #f0f0f0; cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center; line-height: 1;
      &:hover { transform: scale(1.1); }
      &.selected { border-color: #006874; background: rgba(0,104,116,0.1); transform: scale(1.15); }
    }

    .set-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

    .add-set-btn {
      display: flex; align-items: center; gap: 6px; width: 100%; padding: 12px 14px;
      border: none; background: transparent; color: #006874; font-size: 14px;
      font-weight: 500; cursor: pointer; border-top: 1px solid #f0f0f0;
      &:hover { background: rgba(0,104,116,0.05); }
    }

    .add-exercise-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 14px; border: 2px dashed #d0d0d0; border-radius: 14px;
      background: transparent; color: #888; font-size: 15px; font-weight: 500;
      cursor: pointer; margin-top: 4px; transition: all 0.2s;
      &:hover { border-color: #006874; color: #006874; background: rgba(0,104,116,0.04); }
    }
  `],
})
export class TodayComponent {
  private workoutService = inject(WorkoutService);
  private exerciseService = inject(ExerciseService);
  private dialog         = inject(MatDialog);
  private snackBar       = inject(MatSnackBar);
  private fb             = inject(FormBuilder);

  // ── State ────────────────────────────────────────────────────
  readonly workout       = this.workoutService.todayWorkout;
  readonly editMode      = signal(false);
  readonly addingFor     = signal<string | null>(null);
  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  readonly todayLabel = new Date().toLocaleDateString('ca-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  // ── Form (4 sèries per defecte) ──────────────────────────────
  readonly setForm = this.fb.group({
    weight:  [0,              [Validators.required, Validators.min(0)]],
    reps:    [8,              [Validators.required, Validators.min(1)]],
    series:  [4,              [Validators.required, Validators.min(1)]],
    feeling: [3 as FeelingLevel, Validators.required],
  });

  get addSetsLabel(): string {
    const n = this.setForm.value.series ?? 4;
    return `Afegir ${n} ${n === 1 ? 'sèrie' : 'sèries'}`;
  }

  // ── Edit mode ────────────────────────────────────────────────
  toggleEditMode(): void {
    const next = !this.editMode();
    this.editMode.set(next);
    if (!next) this._resetForm();
  }

  private _resetForm(): void {
    this.addingFor.set(null);
    this.setForm.reset({ weight: 0, reps: 8, series: 4, feeling: 3 });
  }

  // ── Helpers ──────────────────────────────────────────────────
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

  // ── Form adjusters ───────────────────────────────────────────
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

  // ── Set actions ──────────────────────────────────────────────
  startAddSet(entry: WorkoutEntry): void {
    this.addingFor.set(entry.exerciseId);
    const last = entry.sets.at(-1);
    if (last) this.setForm.patchValue({ weight: last.weight, reps: last.reps });
  }

  cancelSet(): void { this._resetForm(); }

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

  async deleteWorkout(): Promise<void> {
    if (!confirm('Eliminar l\'entrenament d\'avui?')) return;
    const w = this.workout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.editMode.set(false);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  // ── Exercise picker ──────────────────────────────────────────
  openPicker(): void {
    const w          = this.workout();
    const excludeIds = w?.entries.map(e => e.exerciseId) ?? [];

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = w?.id;
        if (!workoutId) workoutId = await this.workoutService.createTodayWorkout();
        await this.workoutService.addExerciseToWorkout(workoutId, {
          exerciseId: exercise.id, exerciseName: exercise.name, sets: [],
        });
        this.editMode.set(true);
        this.startAddSet({ exerciseId: exercise.id, exerciseName: exercise.name, sets: [] });
      } catch {
        this.snackBar.open('Error en afegir l\'exercici', '', { duration: 3000 });
      }
    });
  }
}
