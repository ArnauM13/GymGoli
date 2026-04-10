import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, Exercise, ExerciseCategory,
} from '../../core/models/exercise.model';
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
          @if (pendingSync()) {
            <span class="sync-badge pending" title="Pendent de sincronitzar">
              <span class="material-symbols-outlined">cloud_upload</span>
            </span>
          }
          @if (workout()) {
            @if (editMode()) {
              <button class="btn-icon-danger" (click)="deleteWorkout()" title="Eliminar entrenament">
                <span class="material-symbols-outlined">delete</span>
              </button>
              <button class="btn-done" (click)="toggleEditMode()">
                <span class="material-symbols-outlined">check</span>
                Fet
              </button>
            } @else {
              <button class="btn-icon-secondary" (click)="toggleEditMode()" title="Reordenar / eliminar exercicis">
                <span class="material-symbols-outlined">tune</span>
              </button>
            }
          }
        </div>
      </header>

      <!-- ── Workout type badges ── -->
      @if (workout() && workoutCategories().length > 0) {
        <div class="type-badges">
          @for (cat of workoutCategoryItems(); track cat.value) {
            <span class="type-badge" [style.background]="cat.color">{{ cat.label }}</span>
          }
          @if (workoutCategories().length > 1) {
            <span class="hybrid-badge">Híbrid</span>
          }
        </div>
      }

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

      <!-- ── Workout editor ── -->
      @if (workout()) {
        <app-workout-editor
          #editor
          [workout]="workout()"
          [editMode]="editMode()"
          [alwaysEditable]="true"
          (requestAddExercise)="openPicker()"
        />

        <!-- ── Finalize bar ── -->
        <div class="finalize-bar">
          @if (pendingSync()) {
            <button class="btn-finalize" (click)="finalize()" [disabled]="finalizing()">
              @if (finalizing()) {
                <span class="material-symbols-outlined spin">sync</span>
                Sincronitzant...
              } @else {
                <span class="material-symbols-outlined">cloud_done</span>
                Finalitzar entrenament
              }
            </button>
            <div class="finalize-footer">
              <p class="finalize-hint">Les dades es guardaran al núvol quan finalitzis</p>
              <button class="btn-recover" (click)="recoverFromCloud()" [disabled]="finalizing()">
                <span class="material-symbols-outlined">cloud_download</span>
                Recuperar del núvol
              </button>
            </div>
          } @else {
            <div class="synced-badge">
              <span class="material-symbols-outlined">cloud_done</span>
              Entrenament sincronitzat
            </div>
          }
        </div>
      }

    </div>

    <!-- ── FAB: add exercise ── -->
    @if (workout()) {
      <button class="fab" (click)="openPicker()" title="Afegir exercici"
              [class.fab-edit-mode]="editMode()">
        <span class="material-symbols-outlined">add</span>
      </button>
    }
  `,
  styles: [`
    .page { padding: 0 0 140px; }

    /* ── Header ── */
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 12px 8px;
      h1 { margin: 0; font-size: 24px; font-weight: 700; }
      .date-sub { margin: 2px 0 0; font-size: 13px; color: #888; text-transform: capitalize; }
    }

    .header-actions { display: flex; align-items: center; gap: 8px; }

    .sync-badge {
      display: flex; align-items: center; justify-content: center;
      width: 34px; height: 34px; border-radius: 50%;
      .material-symbols-outlined { font-size: 18px; }
      &.pending { background: rgba(255,152,0,0.12); color: #ff9800; }
    }

    /* Icon-only secondary button (tune) */
    .btn-icon-secondary {
      width: 36px; height: 36px; border-radius: 50%;
      border: 1.5px solid #e0e0e0; background: white; color: #888;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { border-color: #006874; color: #006874; background: rgba(0,104,116,0.06); }
    }

    /* Danger icon (delete) */
    .btn-icon-danger {
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: transparent; color: #ccc;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(239,83,80,0.1); color: #ef5350; }
    }

    /* Done button */
    .btn-done {
      display: flex; align-items: center; gap: 5px;
      padding: 7px 16px; border: none; border-radius: 20px;
      background: #006874; color: white;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: #005a63; }
    }

    /* ── Workout type badges ── */
    .type-badges {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
      padding: 0 16px 10px;
    }
    .type-badge {
      padding: 3px 10px; border-radius: 10px;
      font-size: 12px; font-weight: 600; color: white;
    }
    .hybrid-badge {
      padding: 3px 10px; border-radius: 10px;
      font-size: 11px; font-weight: 700;
      background: linear-gradient(90deg, #ef5350 0%, #9c27b0 50%, #2196f3 100%);
      color: white; letter-spacing: 0.3px;
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 48px 24px 24px; text-align: center;
      .empty-icon { font-size: 56px; color: #ddd; }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: #444; }
      p  { margin: 0; color: #888; font-size: 14px; }
    }

    .type-grid {
      display: flex; gap: 12px;
      margin-top: 8px; width: 100%; max-width: 340px;
    }

    .type-btn {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; gap: 8px; padding: 18px 8px;
      border: 2px solid var(--cat-color); border-radius: 16px;
      background: white; cursor: pointer; color: var(--cat-color);
      transition: all 0.18s; touch-action: manipulation;
      &:hover {
        background: color-mix(in srgb, var(--cat-color) 10%, white);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      }
      .type-icon { font-size: 28px; }
      .type-label { font-size: 13px; font-weight: 600; }
    }

    /* ── Finalize bar ── */
    .finalize-bar {
      margin: 16px 16px 0;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
    }

    .btn-finalize {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 14px;
      border: none; border-radius: 14px;
      background: #006874; color: white;
      font-size: 15px; font-weight: 700; cursor: pointer;
      transition: background 0.2s, opacity 0.2s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover:not(:disabled) { background: #005a63; }
      &:disabled { opacity: 0.6; cursor: default; }
    }

    .finalize-footer {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; gap: 8px;
    }
    .finalize-hint { margin: 0; font-size: 12px; color: #aaa; flex: 1; }

    .btn-recover {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 10px; border-radius: 20px; cursor: pointer;
      border: 1px solid rgba(0,0,0,0.1); background: transparent;
      color: #888; font-size: 11px; font-weight: 600; white-space: nowrap;
      touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 14px; }
      &:hover:not(:disabled) { border-color: #006874; color: #006874; background: rgba(0,104,116,0.05); }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    .synced-badge {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 16px; border-radius: 12px;
      background: rgba(76,175,80,0.08); color: #4caf50;
      font-size: 13px; font-weight: 600;
      .material-symbols-outlined { font-size: 18px; }
    }

    /* ── FAB ── */
    .fab {
      position: fixed;
      bottom: calc(64px + env(safe-area-inset-bottom) + 16px);
      right: 16px;
      z-index: 100;
      width: 56px; height: 56px;
      border-radius: 50%; border: none;
      background: #006874; color: white;
      box-shadow: 0 4px 16px rgba(0,104,116,0.4);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
      .material-symbols-outlined { font-size: 28px; }

      &:hover { transform: scale(1.06); box-shadow: 0 6px 24px rgba(0,104,116,0.5); }
      &:active { transform: scale(0.94); }

      &.fab-edit-mode {
        background: #555;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
      }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spin { animation: spin 1s linear infinite; }
  `],
})
export class TodayComponent {
  private workoutService = inject(WorkoutService);
  private dialog         = inject(MatDialog);
  private snackBar       = inject(MatSnackBar);

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  readonly workout      = this.workoutService.todayWorkout;
  readonly pendingSync  = this.workoutService.pendingSync;
  readonly editMode     = signal(false);
  readonly finalizing   = signal(false);
  readonly workoutTypes = WORKOUT_TYPES;

  readonly todayLabel = new Date().toLocaleDateString('ca-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  readonly workoutCategories = computed((): string[] => {
    const w = this.workout();
    if (!w) return [];
    return w.categories?.length ? w.categories : (w.category ? [w.category] : []);
  });

  readonly workoutCategoryItems = computed(() =>
    this.workoutCategories()
      .map(c => WORKOUT_TYPES.find(t => t.value === c))
      .filter((t): t is typeof WORKOUT_TYPES[0] => !!t)
  );

  toggleEditMode(): void {
    const next = !this.editMode();
    this.editMode.set(next);
    if (!next) this.editor?.reset();
  }

  async finalize(): Promise<void> {
    this.finalizing.set(true);
    try {
      await this.workoutService.finalizeToday();
      this.snackBar.open('Entrenament guardat!', '', { duration: 2500 });
    } catch {
      this.snackBar.open(
        navigator.onLine
          ? 'Error en guardar'
          : 'Sense connexió — es guardarà automàticament quan tornis a estar en línia',
        '', { duration: 4000 }
      );
    } finally {
      this.finalizing.set(false);
    }
  }

  recoverFromCloud(): void {
    if (!confirm('Sobreescriure els canvis locals amb les dades del núvol?\n\nEls canvis no finalitzats es perdran.')) return;
    this.workoutService.resetDraftFromCloud();
    this.editMode.set(false);
    this.editor?.reset();
    this.snackBar.open('Dades restaurades del núvol', '', { duration: 2500 });
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

  selectType(category: ExerciseCategory): void {
    this.openPicker(category);
  }

  openPicker(newCategory?: ExerciseCategory): void {
    const w             = this.workout();
    const excludeIds    = w?.entries.map(e => e.exerciseId) ?? [];
    const defaultCategory = (newCategory ?? w?.category) as ExerciseCategory | undefined;

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds, defaultCategory }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = w?.id;
        if (!workoutId) workoutId = await this.workoutService.createTodayWorkout(defaultCategory);

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
}
