import { Component, ViewChild, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Exercise, ExerciseCategory, CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS } from '../../core/models/exercise.model';
import { WorkoutService } from '../../core/services/workout.service';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';

const WORKOUT_TYPES: { value: ExerciseCategory; label: string; icon: string; color: string }[] = [
  { value: 'push', label: CATEGORY_LABELS.push, icon: CATEGORY_ICONS.push, color: CATEGORY_COLORS.push },
  { value: 'pull', label: CATEGORY_LABELS.pull, icon: CATEGORY_ICONS.pull, color: CATEGORY_COLORS.pull },
  { value: 'legs', label: CATEGORY_LABELS.legs, icon: CATEGORY_ICONS.legs, color: CATEGORY_COLORS.legs },
];

@Component({
  selector: 'app-today',
  standalone: true,
  imports: [MatButtonModule, WorkoutEditorComponent],
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

      <!-- ── Empty state: choose workout type ── -->
      @if (!workout()) {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">fitness_center</span>
          <h2>Cap entrenament avui</h2>
          <p>Quin tipus d'entrenament fas avui?</p>
          <div class="type-grid">
            @for (cat of workoutTypes; track cat.value) {
              <button class="type-btn" [style.--cat-color]="cat.color" (click)="selectType(cat.value)">
                <span class="material-symbols-outlined type-icon">{{ cat.icon }}</span>
                <span class="type-label">{{ cat.label }}</span>
              </button>
            }
          </div>
        </div>
      }

      <!-- ── Workout editor (shared component) ── -->
      @if (workout()) {
        <app-workout-editor
          #editor
          [workout]="workout()"
          [editMode]="editMode()"
          (requestAddExercise)="openPicker()"
        />
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
      gap: 12px; padding: 48px 24px 24px; text-align: center;
      .empty-icon { font-size: 56px; color: #ddd; }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: #444; }
      p  { margin: 0; color: #888; font-size: 14px; }
    }

    .type-grid {
      display: flex;
      gap: 12px;
      margin-top: 8px;
      width: 100%;
      max-width: 340px;
    }

    .type-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      padding: 18px 8px;
      border: 2px solid var(--cat-color);
      border-radius: 16px;
      background: white;
      cursor: pointer;
      color: var(--cat-color);
      transition: all 0.18s;

      &:hover {
        background: color-mix(in srgb, var(--cat-color) 10%, white);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      }

      .type-icon { font-size: 28px; }
      .type-label { font-size: 13px; font-weight: 600; }
    }
  `],
})
export class TodayComponent {
  private workoutService = inject(WorkoutService);
  private dialog         = inject(MatDialog);
  private snackBar       = inject(MatSnackBar);

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  readonly workout      = this.workoutService.todayWorkout;
  readonly editMode     = signal(false);
  readonly workoutTypes = WORKOUT_TYPES;

  readonly todayLabel = new Date().toLocaleDateString('ca-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  toggleEditMode(): void {
    const next = !this.editMode();
    this.editMode.set(next);
    if (!next) this.editor?.reset();
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

  /** Called from the empty-state type selector buttons */
  selectType(category: ExerciseCategory): void {
    this.openPicker(category);
  }

  openPicker(newCategory?: ExerciseCategory): void {
    const w          = this.workout();
    const excludeIds = w?.entries.map(e => e.exerciseId) ?? [];
    // For new workouts: use the just-selected category. For existing: use stored category.
    const filterCategory = (newCategory ?? w?.category) as ExerciseCategory | undefined;

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds, filterCategory }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = w?.id;
        if (!workoutId) workoutId = await this.workoutService.createTodayWorkout(filterCategory);

        await this.workoutService.addExerciseToWorkout(workoutId, {
          exerciseId: exercise.id, exerciseName: exercise.name, sets: [],
        });

        this.editMode.set(true);

        setTimeout(() => {
          this.editor?.startAddSet({ exerciseId: exercise.id, exerciseName: exercise.name, sets: [] });
        }, 0);
      } catch {
        this.snackBar.open('Error en afegir l\'exercici', '', { duration: 3000 });
      }
    });
  }
}
