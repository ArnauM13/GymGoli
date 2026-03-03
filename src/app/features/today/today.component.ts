import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Exercise, CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
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
      <!-- Header -->
      <header class="page-header">
        <div>
          <h1>Avui</h1>
          <p class="date">{{ todayLabel }}</p>
        </div>
        @if (workout()) {
          <button mat-icon-button (click)="deleteWorkout()" class="delete-btn" aria-label="Eliminar entrenament">
            <span class="material-symbols-outlined">delete</span>
          </button>
        }
      </header>

      <!-- Empty state -->
      @if (!workout()) {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">directions_run</span>
          <h2>Cap entrenament avui</h2>
          <p>Comença afegint el primer exercici</p>
          <button mat-flat-button class="start-btn" (click)="openPicker()">
            <span class="material-symbols-outlined">add</span>
            Afegir exercici
          </button>
        </div>
      }

      <!-- Workout entries -->
      @if (workout()) {
        <div class="entries">
          @for (entry of workout()!.entries; track entry.exerciseId) {
            <div class="entry-card">
              <!-- Exercise header -->
              <div class="entry-header">
                <div class="entry-title">
                  <span
                    class="category-badge"
                    [style.background]="getCatColor(entry)"
                  >{{ getCatLabel(entry) }}</span>
                  <span class="entry-name">{{ entry.exerciseName }}</span>
                </div>
                <button
                  mat-icon-button
                  class="remove-btn"
                  (click)="removeEntry(entry.exerciseId)"
                  aria-label="Eliminar exercici"
                >
                  <span class="material-symbols-outlined">close</span>
                </button>
              </div>

              <!-- Sets table -->
              @if (entry.sets.length > 0) {
                <table class="sets-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Pes</th>
                      <th>Reps</th>
                      <th>Estat</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (set of entry.sets; track $index) {
                      <tr>
                        <td class="set-num">{{ $index + 1 }}</td>
                        <td class="set-weight">{{ set.weight }}<small>kg</small></td>
                        <td class="set-reps">{{ set.reps }}<small>r</small></td>
                        <td class="set-feeling">{{ getFeelingEmoji(set.feeling) }}</td>
                        <td>
                          <button
                            class="icon-btn-sm"
                            (click)="removeSet(entry.exerciseId, $index)"
                            aria-label="Eliminar sèrie"
                          >
                            <span class="material-symbols-outlined">close</span>
                          </button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              }

              <!-- Add set form -->
              @if (addingFor() === entry.exerciseId) {
                <form [formGroup]="setForm" (ngSubmit)="submitSet(entry.exerciseId)" class="set-form">
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
                  </div>
                  <div class="feeling-selector">
                    @for (level of feelingLevels; track level) {
                      <button
                        type="button"
                        class="feeling-btn"
                        [class.selected]="setForm.value.feeling === level"
                        [title]="getFeelingLabel(level)"
                        (click)="setFeeling(level)"
                      >{{ getFeelingEmoji(level) }}</button>
                    }
                  </div>
                  <div class="set-form-actions">
                    <button type="button" mat-button (click)="cancelSet()">Cancel·lar</button>
                    <button type="submit" mat-flat-button [disabled]="setForm.invalid">
                      Afegir sèrie
                    </button>
                  </div>
                </form>
              } @else {
                <button class="add-set-btn" (click)="startAddSet(entry.exerciseId)">
                  <span class="material-symbols-outlined">add</span>
                  Afegir sèrie
                </button>
              }
            </div>
          }

          <!-- Add exercise button -->
          <button class="add-exercise-btn" (click)="openPicker()">
            <span class="material-symbols-outlined">add</span>
            Afegir exercici
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 0 0 80px; }

    .page-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding: 16px 16px 12px;

      h1 { margin: 0; font-size: 22px; font-weight: 600; }
      .date { margin: 2px 0 0; font-size: 13px; color: #888; }
      .delete-btn { color: #ef5350; }
    }

    /* Empty state */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 60px 24px;
      text-align: center;

      .empty-icon { font-size: 64px; color: #ddd; }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: #444; }
      p { margin: 0; color: #888; }
    }

    .start-btn {
      margin-top: 8px;
      background: #006874;
      color: white;
      border-radius: 24px;
      padding: 0 24px;
      height: 48px;
      font-size: 15px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* Entry cards */
    .entries { padding: 0 16px; display: flex; flex-direction: column; gap: 12px; }

    .entry-card {
      background: white;
      border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    .entry-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 8px 8px 14px;
    }

    .entry-title { display: flex; flex-direction: column; gap: 4px; }
    .entry-name { font-size: 16px; font-weight: 600; color: #1a1a1a; }
    .category-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      width: fit-content;
    }
    .remove-btn { color: #bbb; }

    /* Sets table */
    .sets-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;

      th { padding: 4px 10px; font-size: 11px; color: #aaa; font-weight: 500; text-align: left; border-bottom: 1px solid #f0f0f0; }
      td { padding: 8px 10px; border-bottom: 1px solid #fafafa; }

      .set-num { color: #aaa; font-size: 12px; width: 24px; }
      .set-weight { font-weight: 600; small { font-size: 10px; color: #aaa; margin-left: 2px; } }
      .set-reps { small { font-size: 10px; color: #aaa; margin-left: 2px; } }
      .set-feeling { font-size: 18px; }
    }

    .icon-btn-sm {
      background: none;
      border: none;
      cursor: pointer;
      color: #ccc;
      padding: 2px;
      display: flex;
      align-items: center;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { color: #ef5350; }
    }

    /* Set form */
    .set-form {
      padding: 12px 14px;
      background: #fafafa;
      border-top: 1px solid #f0f0f0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .set-inputs { display: flex; gap: 16px; }

    .input-group {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      label { font-size: 12px; color: #666; font-weight: 500; }
    }

    .number-input {
      display: flex;
      align-items: center;
      border: 1.5px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      background: white;

      button {
        width: 36px;
        height: 40px;
        border: none;
        background: #f5f5f5;
        font-size: 18px;
        cursor: pointer;
        color: #333;
        &:hover { background: #e8e8e8; }
        &:active { background: #ddd; }
      }

      input {
        flex: 1;
        border: none;
        text-align: center;
        font-size: 16px;
        font-weight: 600;
        outline: none;
        width: 0;
        min-width: 0;
        padding: 8px 0;
        background: white;
      }
    }

    .feeling-selector {
      display: flex;
      gap: 6px;
      justify-content: center;
    }

    .feeling-btn {
      font-size: 22px;
      width: 44px;
      height: 44px;
      border: 2px solid transparent;
      border-radius: 50%;
      background: #f0f0f0;
      cursor: pointer;
      transition: all 0.15s;
      display: flex;
      align-items: center;
      justify-content: center;
      line-height: 1;

      &:hover { transform: scale(1.1); }
      &.selected { border-color: #006874; background: rgba(0,104,116,0.1); transform: scale(1.15); }
    }

    .set-form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .add-set-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 12px 14px;
      border: none;
      background: transparent;
      color: #006874;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      border-top: 1px solid #f0f0f0;
      &:hover { background: rgba(0,104,116,0.05); }
    }

    .add-exercise-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px;
      border: 2px dashed #d0d0d0;
      border-radius: 14px;
      background: transparent;
      color: #888;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 4px;
      transition: all 0.2s;

      &:hover { border-color: #006874; color: #006874; background: rgba(0,104,116,0.04); }
    }
  `],
})
export class TodayComponent {
  private workoutService = inject(WorkoutService);
  private exerciseService = inject(ExerciseService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  readonly workout = this.workoutService.todayWorkout;
  readonly addingFor = signal<string | null>(null);

  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  readonly setForm = this.fb.group({
    weight: [0, [Validators.required, Validators.min(0)]],
    reps: [8, [Validators.required, Validators.min(1)]],
    feeling: [3 as FeelingLevel, Validators.required],
  });

  readonly todayLabel = new Date().toLocaleDateString('ca-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

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

  adjustWeight(delta: number): void {
    const val = (this.setForm.value.weight ?? 0) + delta;
    this.setForm.patchValue({ weight: Math.max(0, Math.round(val * 4) / 4) });
  }

  adjustReps(delta: number): void {
    const val = (this.setForm.value.reps ?? 1) + delta;
    this.setForm.patchValue({ reps: Math.max(1, val) });
  }

  setFeeling(level: FeelingLevel): void {
    this.setForm.patchValue({ feeling: level });
  }

  startAddSet(exerciseId: string): void {
    this.addingFor.set(exerciseId);
    // Pre-fill weight with last set weight if available
    const workout = this.workout();
    if (workout) {
      const entry = workout.entries.find(e => e.exerciseId === exerciseId);
      const lastSet = entry?.sets.at(-1);
      if (lastSet) {
        this.setForm.patchValue({ weight: lastSet.weight, reps: lastSet.reps });
      }
    }
  }

  cancelSet(): void {
    this.addingFor.set(null);
    this.setForm.reset({ weight: 0, reps: 8, feeling: 3 });
  }

  async submitSet(exerciseId: string): Promise<void> {
    if (this.setForm.invalid) return;
    const { weight, reps, feeling } = this.setForm.value;
    const workout = this.workout();
    if (!workout) return;

    try {
      await this.workoutService.addSetToEntry(workout.id, exerciseId, {
        weight: weight!,
        reps: reps!,
        feeling: feeling as FeelingLevel,
      });
      this.cancelSet();
    } catch {
      this.snackBar.open('Error en afegir la sèrie', '', { duration: 3000 });
    }
  }

  async removeSet(exerciseId: string, index: number): Promise<void> {
    const workout = this.workout();
    if (!workout) return;
    try {
      await this.workoutService.removeSetFromEntry(workout.id, exerciseId, index);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async removeEntry(exerciseId: string): Promise<void> {
    const workout = this.workout();
    if (!workout) return;
    try {
      await this.workoutService.removeEntryFromWorkout(workout.id, exerciseId);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async deleteWorkout(): Promise<void> {
    if (!confirm('Eliminar tot l\'entrenament d\'avui?')) return;
    const workout = this.workout();
    if (!workout) return;
    try {
      await this.workoutService.deleteWorkout(workout.id);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  openPicker(): void {
    const workout = this.workout();
    const excludeIds = workout?.entries.map(e => e.exerciseId) ?? [];

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds },
      width: '420px',
      maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = workout?.id;
        if (!workoutId) {
          workoutId = await this.workoutService.createTodayWorkout();
        }
        await this.workoutService.addExerciseToWorkout(workoutId, {
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          sets: [],
        });
        this.startAddSet(exercise.id);
      } catch {
        this.snackBar.open('Error en afegir l\'exercici', '', { duration: 3000 });
      }
    });
  }
}
