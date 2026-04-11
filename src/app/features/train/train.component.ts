import { Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';

import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, Exercise, ExerciseCategory,
} from '../../core/models/exercise.model';
import { SPORT_CONFIG, SPORT_TYPES, SportType } from '../../core/models/sport.model';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';

const TODAY = (): string => new Date().toISOString().split('T')[0];

const WORKOUT_TYPES: { value: ExerciseCategory; label: string; icon: string; color: string }[] = [
  { value: 'push', label: CATEGORY_LABELS.push, icon: CATEGORY_ICONS.push, color: CATEGORY_COLORS.push },
  { value: 'pull', label: CATEGORY_LABELS.pull, icon: CATEGORY_ICONS.pull, color: CATEGORY_COLORS.pull },
  { value: 'legs', label: CATEGORY_LABELS.legs, icon: CATEGORY_ICONS.legs, color: CATEGORY_COLORS.legs },
];

const SPORT_LIST = SPORT_TYPES.map(type => ({ type, ...SPORT_CONFIG[type] }));

@Component({
  selector: 'app-train',
  standalone: true,
  imports: [WorkoutEditorComponent],
  template: `
    <div class="page">

      <!-- ── Workout type badges ── -->
      @if (selectedWorkout() && workoutCategories().length > 0) {
        <div class="type-badges">
          @for (cat of workoutCategoryItems(); track cat.value) {
            <span class="type-badge" [style.background]="cat.color">{{ cat.label }}</span>
          }
          @if (workoutCategories().length > 1) {
            <span class="hybrid-badge">Híbrid</span>
          }
        </div>
      }

      <!-- ── Loading ── -->
      @if (workoutService.isLoading() && !selectedWorkout()) {
        <div class="loading-state">
          <span class="material-symbols-outlined spin">sync</span>
        </div>
      }

      <!-- ── Empty state ── -->
      @if (!selectedWorkout() && !workoutService.isLoading()) {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">fitness_center</span>
          <h2>{{ emptyTitle() }}</h2>
          <p>Quin tipus d'entrenament?</p>
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
      @if (selectedWorkout()) {
        <app-workout-editor
          #editor
          [workout]="selectedWorkout()"
          [editMode]="editMode()"
          [alwaysEditable]="true"
          (requestAddExercise)="openPicker()"
        />

        <!-- ── Finalize bar (only for today's draft) ── -->
        @if (isToday()) {
          <div class="finalize-bar">
            @if (pendingSync()) {
              <button class="btn-finalize" (click)="finalize()" [disabled]="finalizing()">
                @if (finalizing()) {
                  <span class="material-symbols-outlined spin">sync</span>
                  Sincronitzant...
                } @else {
                  <span class="material-symbols-outlined">cloud_done</span>
                  Guardar entrenament
                }
              </button>
              <div class="finalize-footer">
                <p class="finalize-hint">Les dades es guardaran al núvol quan finalitzis</p>
                <button class="btn-recover" (click)="recoverFromCloud()" [disabled]="finalizing()">
                  <span class="material-symbols-outlined">cloud_download</span>
                  Recuperar
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
      }

      <!-- ══ Secció Esports (sempre visible) ══ -->
      <div class="sports-section">
        <div class="sports-header">
          <span class="material-symbols-outlined sports-header-icon">sports_soccer</span>
          <h2 class="sports-title">Esports</h2>
        </div>
        <div class="sports-grid">
          @for (sport of sportList; track sport.type) {
            <button
              class="sport-btn"
              [class.active]="isSportDone(sport.type)"
              [style.--sport-color]="sport.color"
              (click)="toggleSport(sport.type)"
              [disabled]="sportToggling()"
            >
              @if (isSportDone(sport.type)) {
                <span class="sport-check material-symbols-outlined">check_circle</span>
              }
              <span class="material-symbols-outlined sport-icon">{{ sport.icon }}</span>
              <span class="sport-name">{{ sport.label }}</span>
            </button>
          }
        </div>
      </div>

    </div>

    <!-- ── Bottom bar: data + accions en un sol contenidor ── -->
    <div class="bottom-bar">

      <!-- Navegació de data -->
      <div class="bar-date">
        <button class="arrow-btn" (click)="navigateDate(-1)">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
        <button class="date-btn" (click)="openCalendar()">
          <span class="date-text">{{ dateLabel() }}</span>
          <span class="material-symbols-outlined date-edit-icon">edit_calendar</span>
        </button>
        <button class="arrow-btn" [class.invisible]="isToday()" (click)="navigateDate(1)">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <!-- Botons d'acció -->
      @if (selectedWorkout()) {
        @if (editMode()) {
          <div class="bar-actions">
            <button class="bar-icon-btn bar-danger" (click)="deleteWorkout()" title="Eliminar entrenament">
              <span class="material-symbols-outlined">delete</span>
            </button>
            <button class="bar-primary-btn" (click)="toggleEditMode()">
              <span class="material-symbols-outlined">check</span>
              Fet
            </button>
          </div>
        } @else {
          <div class="bar-actions">
            <button class="bar-icon-btn" (click)="toggleEditMode()" title="Reordenar / eliminar exercicis">
              <span class="material-symbols-outlined">tune</span>
            </button>
            <button class="bar-primary-btn" (click)="openPicker()">
              <span class="material-symbols-outlined">add</span>
              Exercici
            </button>
          </div>
        }
      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 160px; min-height: 100dvh; }

    /* ── Bottom bar: contenidor únic per data + accions ── */
    .bottom-bar {
      position: fixed;
      bottom: calc(64px + env(safe-area-inset-bottom) + 12px);
      left: 12px; right: 12px;
      z-index: 90;
      display: flex; align-items: center; gap: 4px;
      background: white;
      border-radius: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08);
      padding: 4px;
    }

    .bar-date {
      flex: 1; min-width: 0;
      display: flex; align-items: center;
    }

    .arrow-btn {
      width: 38px; height: 38px; border-radius: 50%; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: #999; transition: color 0.15s, background 0.15s;
      touch-action: manipulation; flex-shrink: 0;
      .material-symbols-outlined { font-size: 22px; }
      &:hover { color: #333; background: rgba(0,0,0,0.06); }
      &.invisible { visibility: hidden; pointer-events: none; }
    }

    .date-btn {
      flex: 1; min-width: 0;
      display: flex; align-items: center; gap: 5px;
      padding: 8px 6px; border-radius: 14px; border: none; background: transparent;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover { background: rgba(0,0,0,0.05); }
    }
    .date-text {
      flex: 1; min-width: 0;
      font-size: 13px; font-weight: 600; color: #333; text-transform: capitalize;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .date-edit-icon { font-size: 14px; color: #bbb; flex-shrink: 0; }

    .bar-actions {
      display: flex; align-items: center; gap: 4px;
      flex-shrink: 0; padding-right: 2px;
    }

    .bar-icon-btn {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      background: transparent; color: #777;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(0,0,0,0.06); color: #333; }
      &.bar-danger:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
    }

    .bar-primary-btn {
      display: flex; align-items: center; gap: 5px;
      height: 38px; padding: 0 16px; border-radius: 19px; border: none;
      background: #006874; color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      touch-action: manipulation; transition: background 0.15s; white-space: nowrap;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: #005a63; }
    }


    /* ── Type badges ── */
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

    /* ── Loading ── */
    .loading-state {
      display: flex; justify-content: center; padding: 48px;
      .material-symbols-outlined { font-size: 32px; color: #ccc; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 32px 24px 24px; text-align: center;
      .empty-icon { font-size: 48px; color: #ddd; }
      h2 { margin: 0; font-size: 18px; font-weight: 600; color: #444; }
      p  { margin: 0; color: #888; font-size: 14px; }
    }
    .type-grid {
      display: flex; gap: 12px; margin-top: 8px; width: 100%; max-width: 340px;
    }
    .type-btn {
      flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 8px;
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
      width: 100%; padding: 14px; border: none; border-radius: 14px;
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

    /* ── Secció Esports ── */
    .sports-section {
      margin: 24px 16px 0;
      padding: 14px 14px 16px;
      background: white;
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    }

    .sports-header {
      display: flex; align-items: center; gap: 7px;
      margin-bottom: 14px;
    }
    .sports-header-icon {
      font-size: 18px; color: #888;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .sports-title {
      margin: 0; font-size: 14px; font-weight: 700;
      color: #555; letter-spacing: 0.2px;
    }

    .sports-grid {
      display: flex; gap: 10px;
    }

    .sport-btn {
      position: relative;
      flex: 1;
      display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 16px 4px 14px;
      border: 1.5px solid color-mix(in srgb, var(--sport-color) 30%, #e8e8e8);
      border-radius: 16px;
      background: white;
      color: color-mix(in srgb, var(--sport-color) 65%, #444);
      cursor: pointer; touch-action: manipulation;
      transition: all 0.18s ease;

      &:hover:not(:disabled) {
        border-color: var(--sport-color);
        background: color-mix(in srgb, var(--sport-color) 6%, white);
        transform: translateY(-1px);
      }
      &:active:not(:disabled) { transform: scale(0.97); }

      &.active {
        border-color: var(--sport-color);
        background: color-mix(in srgb, var(--sport-color) 10%, white);
      }
      &:disabled { opacity: 0.65; cursor: default; }
    }

    .sport-icon {
      font-size: 28px;
      font-variation-settings: 'FILL' 0, 'wght' 300;
      transition: font-variation-settings 0.15s;
      .active & { font-variation-settings: 'FILL' 1, 'wght' 400; }
    }

    .sport-name {
      font-size: 11px; font-weight: 700; letter-spacing: 0.2px;
      text-align: center; line-height: 1.1;
    }

    .sport-check {
      position: absolute; top: 6px; right: 6px;
      font-size: 15px;
      color: var(--sport-color);
      font-variation-settings: 'FILL' 1, 'wght' 500;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spin { animation: spin 1s linear infinite; }
  `],
})
export class TrainComponent {
  readonly workoutService = inject(WorkoutService);
  private sportService    = inject(SportService);
  private dialog          = inject(MatDialog);
  private snackBar        = inject(MatSnackBar);

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  readonly selectedDate   = signal<string>(TODAY());
  readonly editMode       = signal(false);
  readonly finalizing     = signal(false);
  readonly sportToggling  = signal(false);
  readonly workoutTypes   = WORKOUT_TYPES;
  readonly sportList      = SPORT_LIST;

  readonly isToday = computed(() => this.selectedDate() === TODAY());

  readonly dateLabel = computed(() => {
    const d = new Date(this.selectedDate() + 'T12:00:00');
    const formatted = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    return this.isToday() ? `Avui · ${formatted}` : formatted;
  });

  readonly selectedWorkout = computed(() => {
    if (this.isToday()) return this.workoutService.todayWorkout();
    return this.workoutService.getWorkoutForDate(this.selectedDate());
  });

  readonly pendingSync = computed(() =>
    this.isToday() && this.workoutService.pendingSync()
  );

  readonly emptyTitle = computed(() =>
    this.isToday() ? 'Cap entrenament avui' : 'Cap entrenament aquest dia'
  );

  readonly workoutCategories = computed((): string[] => {
    const w = this.selectedWorkout();
    if (!w) return [];
    return w.categories?.length ? w.categories : (w.category ? [w.category] : []);
  });

  readonly workoutCategoryItems = computed(() =>
    this.workoutCategories()
      .map(c => WORKOUT_TYPES.find(t => t.value === c))
      .filter((t): t is typeof WORKOUT_TYPES[0] => !!t)
  );

  constructor() {
    effect(() => {
      const date = this.selectedDate();
      const [yearStr, monthStr] = date.split('-');
      const year  = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      this.workoutService.ensureMonthLoaded(year, month);
      this.sportService.ensureMonthLoaded(year, month);
    });
  }

  // ── Sport helpers ──────────────────────────────────────────────────────────

  isSportDone(sport: SportType): boolean {
    return this.sportService.hasSportOnDate(this.selectedDate(), sport);
  }

  async toggleSport(sport: SportType): Promise<void> {
    this.sportToggling.set(true);
    try {
      await this.sportService.toggleSport(this.selectedDate(), sport);
    } catch {
      this.snackBar.open('Error en guardar l\'esport', '', { duration: 2500 });
    } finally {
      this.sportToggling.set(false);
    }
  }

  navigateDate(days: number): void {
    const d = new Date(this.selectedDate() + 'T12:00:00');
    d.setDate(d.getDate() + days);
    this.selectedDate.set(d.toISOString().split('T')[0]);
    this.editMode.set(false);
  }

  openCalendar(): void {
    const ref = this.dialog.open(CalendarComponent, {
      data: { selectedDate: this.selectedDate() },
      panelClass: 'cal-dialog',
      width: '360px',
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe((date: string | undefined) => {
      if (date) {
        this.selectedDate.set(date);
        this.editMode.set(false);
      }
    });
  }

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
        navigator.onLine ? 'Error en guardar' : 'Sense connexió — es guardarà automàticament',
        '', { duration: 4000 }
      );
    } finally {
      this.finalizing.set(false);
    }
  }

  recoverFromCloud(): void {
    if (!this.isToday()) return;
    if (!confirm('Sobreescriure els canvis locals amb les dades del núvol?\n\nEls canvis no finalitzats es perdran.')) return;
    this.workoutService.resetDraftFromCloud();
    this.editMode.set(false);
    this.editor?.reset();
    this.snackBar.open('Dades restaurades del núvol', '', { duration: 2500 });
  }

  async deleteWorkout(): Promise<void> {
    if (!confirm('Eliminar l\'entrenament?')) return;
    const w = this.selectedWorkout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.editMode.set(false);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async selectType(category: ExerciseCategory): Promise<void> {
    try {
      const date = this.selectedDate();
      if (this.isToday()) {
        await this.workoutService.createTodayWorkout(category);
      } else {
        await this.workoutService.createWorkoutForDate(date, category);
      }
    } catch {
      this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
    }
  }

  openPicker(newCategory?: ExerciseCategory): void {
    const w               = this.selectedWorkout();
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
          const date = this.selectedDate();
          workoutId = this.isToday()
            ? await this.workoutService.createTodayWorkout(defaultCategory)
            : await this.workoutService.createWorkoutForDate(date, defaultCategory);
        }

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
