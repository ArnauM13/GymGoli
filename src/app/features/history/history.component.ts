import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Exercise } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout } from '../../core/models/workout.model';
import { WorkoutService } from '../../core/services/workout.service';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { ExercisePickerDialogComponent } from '../today/components/exercise-picker-dialog.component';

// ── Calendar day cell ─────────────────────────────────────────────────────────
interface CalDay {
  date:       string;
  day:        number;
  hasWorkout: boolean;
  isToday:    boolean;
  isFuture:   boolean;
  isSelected: boolean;
}

const MONTHS_CA = [
  'Gener','Febrer','Març','Abril','Maig','Juny',
  'Juliol','Agost','Setembre','Octubre','Novembre','Desembre',
];

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [MatButtonModule, WorkoutEditorComponent],
  template: `
    <div class="page">

      <!-- ── Page header ── -->
      <header class="page-header">
        <h1>Historial</h1>
        <span class="count">{{ allWorkouts().length }} entrenaments</span>
      </header>

      <!-- ═══════════════════════════════════
           CALENDAR
      ════════════════════════════════════ -->
      <div class="calendar-card">

        <!-- Month navigation -->
        <div class="cal-header">
          <button class="cal-nav-btn" (click)="navigateCal(-1)" aria-label="Mes anterior">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <span class="cal-month-label">{{ calMonthLabel() }}</span>
          <button class="cal-nav-btn" (click)="navigateCal(1)"
            [disabled]="!canNavForward()" aria-label="Mes següent">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <!-- Day-of-week headers -->
        <div class="cal-grid">
          @for (dow of dayNames; track dow) {
            <div class="cal-dow">{{ dow }}</div>
          }

          <!-- Day cells -->
          @for (cell of calDays(); track $index) {
            @if (cell === null) {
              <div></div>
            } @else {
              <button
                class="cal-day"
                [class.has-workout]="cell.hasWorkout"
                [class.is-today]="cell.isToday"
                [class.is-selected]="cell.isSelected"
                [class.is-future]="cell.isFuture"
                [disabled]="cell.isFuture"
                (click)="selectDate(cell.date)"
                [attr.aria-label]="cell.day"
              >
                <span class="day-num">{{ cell.day }}</span>
                @if (cell.hasWorkout) {
                  <span class="workout-dot"></span>
                }
              </button>
            }
          }
        </div>
      </div>

      <!-- ═══════════════════════════════════
           SELECTED DATE DETAIL
      ════════════════════════════════════ -->
      @if (selectedDate()) {
        <div class="detail-section">

          <div class="detail-header">
            <h2 class="detail-title">{{ selectedDateLabel() }}</h2>
            <div class="detail-actions">
              @if (selectedWorkout() && !editMode()) {
                <button class="action-btn edit-btn" (click)="toggleEditMode()" aria-label="Editar">
                  <span class="material-symbols-outlined">edit</span>
                </button>
              }
              @if (editMode()) {
                <button class="action-btn delete-btn" (click)="deleteSelectedWorkout()" aria-label="Eliminar">
                  <span class="material-symbols-outlined">delete</span>
                </button>
                <button class="action-btn done-btn" (click)="toggleEditMode()" aria-label="Finalitzar edició">
                  <span class="material-symbols-outlined">check_circle</span>
                </button>
              }
            </div>
          </div>

          <!-- No workout for this day -->
          @if (!selectedWorkout()) {
            <div class="detail-empty">
              <span class="material-symbols-outlined empty-icon">fitness_center</span>
              <p>Cap entrenament registrat</p>
              <button mat-flat-button class="add-btn" (click)="openPicker()">
                <span class="material-symbols-outlined">add</span>
                Afegir exercici
              </button>
            </div>
          }

          <!-- Shared workout editor -->
          @if (selectedWorkout()) {
            <app-workout-editor
              #editor
              [workout]="selectedWorkout()"
              [editMode]="editMode()"
              (requestAddExercise)="openPicker()"
            />
          }

        </div>
      }

      <!-- ═══════════════════════════════════
           WORKOUT LIST
      ════════════════════════════════════ -->
      @if (allWorkouts().length > 0) {
        <div class="list-section">
          <h2 class="list-title">Tots els entrenaments</h2>

          <div class="workout-list">
            @for (workout of allWorkouts(); track workout.id) {
              <div class="workout-card" [class.expanded]="expandedId() === workout.id">

                <button class="workout-header" (click)="toggleExpanded(workout.id)">
                  <div class="workout-date-block">
                    <span class="day">{{ getDay(workout.date) }}</span>
                    <span class="month-year">{{ getMonthYear(workout.date) }}</span>
                  </div>
                  <div class="workout-summary">
                    <span class="exercise-count">
                      {{ workout.entries.length }} exercici{{ workout.entries.length !== 1 ? 's' : '' }}
                    </span>
                    <span class="set-count">{{ totalSets(workout) }} sèries</span>
                  </div>
                  <span class="material-symbols-outlined chevron">
                    {{ expandedId() === workout.id ? 'expand_less' : 'expand_more' }}
                  </span>
                </button>

                @if (expandedId() === workout.id) {
                  <div class="workout-detail">
                    @for (entry of workout.entries; track entry.exerciseId) {
                      <div class="entry-row">
                        <div class="entry-name-row">{{ entry.exerciseName }}</div>
                        @if (entry.sets.length > 0) {
                          <div class="sets-list">
                            @for (set of entry.sets; track $index) {
                              <div class="set-pill">
                                <span class="set-weight">{{ set.weight }}kg</span>
                                <span class="set-reps">× {{ set.reps }}</span>
                              </div>
                            }
                            @if (entry.feeling) {
                              <div class="set-pill feeling-pill">
                                {{ getFeelingEmoji(entry.feeling) }}
                              </div>
                            }
                          </div>
                        } @else {
                          <span class="no-sets">Cap sèrie registrada</span>
                        }
                      </div>
                    }
                    <div class="detail-footer">
                      <button mat-button class="edit-from-list-btn" (click)="selectDateFromList(workout.date)">
                        <span class="material-symbols-outlined">edit_calendar</span>
                        Editar
                      </button>
                    </div>
                  </div>
                }

              </div>
            }
          </div>
        </div>
      } @else {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">calendar_month</span>
          <h2>Cap entrenament</h2>
          <p>Selecciona un dia al calendari per afegir un entrenament</p>
        </div>
      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 100px; }

    /* ── Page header ── */
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px 12px;
      h1 { margin: 0; font-size: 22px; font-weight: 700; }
      .count { font-size: 13px; color: #888; }
    }

    /* ════════════════════════════════
       CALENDAR
    ════════════════════════════════ */
    .calendar-card {
      margin: 0 16px 12px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    .cal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 8px 8px;
    }

    .cal-month-label { font-size: 16px; font-weight: 700; color: #1a1a1a; }

    .cal-nav-btn {
      width: 36px; height: 36px; border: none; background: transparent;
      border-radius: 50%; cursor: pointer; color: #555;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      &:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
      &:disabled { color: #ccc; cursor: default; }
      .material-symbols-outlined { font-size: 22px; }
    }

    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      padding: 0 8px 12px;
    }

    .cal-dow {
      text-align: center; font-size: 11px; font-weight: 600;
      color: #aaa; padding: 4px 0; text-transform: uppercase;
    }

    .cal-day {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 3px;
      min-height: 40px; width: 100%;
      border: none; border-radius: 10px; background: transparent;
      font-size: 14px; font-weight: 500; color: #333;
      cursor: pointer; transition: background 0.15s;
      padding: 4px 0;

      &:hover:not(:disabled):not(.is-selected) { background: rgba(0,104,116,0.08); }
      &:disabled { cursor: default; }

      &.is-today:not(.is-selected) {
        outline: 2px solid #006874; outline-offset: -2px;
        color: #006874; font-weight: 700;
      }
      &.is-selected {
        background: #006874 !important; color: white; font-weight: 700;
      }
      &.is-future { color: #ccc; }
      &.has-workout.is-future { color: #ddd; }
    }

    .day-num { line-height: 1; }

    .workout-dot {
      width: 5px; height: 5px; border-radius: 50%; background: #006874; flex-shrink: 0;
    }
    .is-selected .workout-dot { background: rgba(255,255,255,0.75); }
    .is-today:not(.is-selected) .workout-dot { background: #006874; }

    /* ════════════════════════════════
       SELECTED DATE DETAIL
    ════════════════════════════════ */
    .detail-section {
      margin: 0 16px 12px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      overflow: hidden;
      padding-bottom: 4px;
    }

    .detail-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 10px 10px 16px;
      border-bottom: 1px solid #f5f5f5;
    }

    .detail-title {
      margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;
      text-transform: capitalize;
    }

    .detail-actions { display: flex; align-items: center; gap: 4px; }

    .action-btn {
      width: 38px; height: 38px; border: none; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 20px; }
    }
    .edit-btn   { background: rgba(0,104,116,0.1);  color: #006874; &:hover { background: rgba(0,104,116,0.18); } }
    .done-btn   { background: rgba(0,150,80,0.12);  color: #00966e; &:hover { background: rgba(0,150,80,0.2);   } }
    .delete-btn { background: transparent; color: #ccc; &:hover { background: rgba(239,83,80,0.1); color: #ef5350; } }

    .detail-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 28px 24px; text-align: center;
      .empty-icon { font-size: 40px; color: #ddd; }
      p { margin: 0; font-size: 14px; color: #aaa; }
    }

    .add-btn {
      background: #006874; color: white; border-radius: 20px;
      padding: 0 20px; height: 40px; font-size: 14px;
      display: flex; align-items: center; gap: 4px;
    }

    /* Spacing for the shared editor inside detail-section */
    app-workout-editor { display: block; padding: 8px 0 8px; }

    /* ════════════════════════════════
       WORKOUT LIST
    ════════════════════════════════ */
    .list-section { padding: 0 16px; }

    .list-title {
      margin: 0 0 10px; font-size: 15px; font-weight: 700; color: #555;
      padding: 4px 0; letter-spacing: 0.3px;
    }

    .workout-list { display: flex; flex-direction: column; gap: 8px; }

    .workout-card {
      background: white; border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.07); overflow: hidden;
      transition: box-shadow 0.2s;
      &.expanded { box-shadow: 0 4px 16px rgba(0,0,0,0.11); }
    }

    .workout-header {
      display: flex; align-items: center; gap: 12px; width: 100%;
      padding: 12px 12px 12px 14px; border: none; background: transparent;
      cursor: pointer; text-align: left;
      &:hover { background: rgba(0,0,0,0.02); }
    }

    .workout-date-block {
      display: flex; flex-direction: column; align-items: center;
      min-width: 38px; background: #f5f5f5; border-radius: 8px; padding: 5px 7px;
      .day { font-size: 20px; font-weight: 700; color: #1a1a1a; line-height: 1; }
      .month-year { font-size: 10px; color: #888; text-transform: uppercase; margin-top: 2px; }
    }

    .workout-summary {
      flex: 1; display: flex; flex-direction: column; gap: 3px;
      .exercise-count { font-size: 14px; font-weight: 600; color: #1a1a1a; }
      .set-count { font-size: 12px; color: #888; }
    }

    .chevron { color: #bbb; font-size: 20px; flex-shrink: 0; }

    .workout-detail {
      border-top: 1px solid #f0f0f0; padding: 10px 14px 4px;
      display: flex; flex-direction: column; gap: 8px;
    }

    .entry-row { display: flex; flex-direction: column; gap: 4px; }
    .entry-name-row { font-size: 13px; font-weight: 600; color: #444; }
    .sets-list { display: flex; flex-wrap: wrap; gap: 5px; }

    .set-pill {
      display: flex; align-items: center; gap: 3px;
      padding: 3px 9px; background: #f5f5f5; border-radius: 16px; font-size: 12px;
      .set-weight { font-weight: 600; color: #333; }
      .set-reps { color: #666; }
    }
    .feeling-pill { font-size: 16px; padding: 2px 7px; }

    .no-sets { font-size: 12px; color: #bbb; font-style: italic; }
    .detail-footer { display: flex; justify-content: flex-end; padding: 2px 0 6px; }
    .edit-from-list-btn { color: #006874 !important; font-size: 13px !important; }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 40px 24px; text-align: center;
      .empty-icon { font-size: 56px; color: #ddd; }
      h2 { margin: 0; font-size: 18px; font-weight: 600; color: #444; }
      p { margin: 0; font-size: 14px; color: #888; }
    }
  `],
})
export class HistoryComponent {
  private workoutService = inject(WorkoutService);
  private dialog         = inject(MatDialog);
  private snackBar       = inject(MatSnackBar);

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  // ── Calendar state ────────────────────────────────────────────
  readonly calYear      = signal(new Date().getFullYear());
  readonly calMonth     = signal(new Date().getMonth()); // 0-indexed
  readonly selectedDate = signal<string | null>(null);

  // ── Edit state ────────────────────────────────────────────────
  readonly editMode   = signal(false);
  readonly expandedId = signal<string | null>(null);

  readonly dayNames = ['dl', 'dm', 'dc', 'dj', 'dv', 'ds', 'dg'];

  // ── Computed ──────────────────────────────────────────────────
  readonly allWorkouts = this.workoutService.workouts;

  readonly calMonthLabel = computed(() =>
    `${MONTHS_CA[this.calMonth()]} ${this.calYear()}`
  );

  readonly canNavForward = computed(() => {
    const now = new Date();
    return this.calYear() < now.getFullYear() ||
      (this.calYear() === now.getFullYear() && this.calMonth() < now.getMonth());
  });

  /** Grid of calendar cells (null = padding) */
  readonly calDays = computed((): (CalDay | null)[] => {
    const y     = this.calYear();
    const m     = this.calMonth();
    const today = this.workoutService.todayDateString();
    const sel   = this.selectedDate();
    const workoutDates = new Set(this.allWorkouts().map(w => w.date));

    const firstDay    = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    // Monday-first: getDay() → 0=Sun→6, 1=Mon→0, …
    const startPad = (firstDay.getDay() + 6) % 7;

    const cells: (CalDay | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        date: dateStr, day: d,
        hasWorkout: workoutDates.has(dateStr),
        isToday:    dateStr === today,
        isFuture:   dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return cells;
  });

  readonly selectedWorkout = computed(() => {
    const d = this.selectedDate();
    return d ? this.workoutService.getWorkoutForDate(d) : null;
  });

  readonly selectedDateLabel = computed(() => {
    const sel = this.selectedDate();
    if (!sel) return '';
    const today = this.workoutService.todayDateString();
    if (sel === today) return 'Avui';
    const yesterday = (() => {
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    })();
    if (sel === yesterday) return 'Ahir';
    const d = new Date(sel + 'T00:00:00');
    const label = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  // ── Helpers ───────────────────────────────────────────────────
  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }

  getDay(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric' });
  }

  getMonthYear(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { month: 'short', year: '2-digit' });
  }

  totalSets(workout: Workout): number {
    return workout.entries.reduce((s, e) => s + e.sets.length, 0);
  }

  // ── Calendar navigation ───────────────────────────────────────
  navigateCal(delta: number): void {
    let m = this.calMonth() + delta;
    let y = this.calYear();
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    this.calMonth.set(m);
    this.calYear.set(y);
  }

  selectDate(date: string): void {
    this.selectedDate.set(this.selectedDate() === date ? null : date);
    this._resetEditState();
  }

  /** Called from the workout list "Editar" button */
  selectDateFromList(date: string): void {
    const d = new Date(date + 'T00:00:00');
    this.calYear.set(d.getFullYear());
    this.calMonth.set(d.getMonth());
    this.selectedDate.set(date);
    this._resetEditState();
    setTimeout(() => document.querySelector('.calendar-card')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  toggleExpanded(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // ── Edit mode ─────────────────────────────────────────────────
  toggleEditMode(): void {
    const next = !this.editMode();
    this.editMode.set(next);
    if (!next) this.editor?.reset();
  }

  private _resetEditState(): void {
    this.editMode.set(false);
    this.editor?.reset();
  }

  async deleteSelectedWorkout(): Promise<void> {
    const label = this.selectedDateLabel();
    if (!confirm(`Eliminar l'entrenament de ${label}?`)) return;
    const w = this.selectedWorkout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.editMode.set(false);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  // ── Exercise picker ───────────────────────────────────────────
  openPicker(): void {
    const workout    = this.selectedWorkout();
    const date       = this.selectedDate()!;
    const excludeIds = workout?.entries.map(e => e.exerciseId) ?? [];

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = workout?.id;
        if (!workoutId) workoutId = await this.workoutService.createWorkoutForDate(date);

        await this.workoutService.addExerciseToWorkout(workoutId, {
          exerciseId: exercise.id, exerciseName: exercise.name, sets: [],
        });

        this.editMode.set(true);

        // After Firestore write, let Angular re-render the editor then open add-sets form
        setTimeout(() => {
          this.editor?.startAddSet({ exerciseId: exercise.id, exerciseName: exercise.name, sets: [] });
        }, 0);
      } catch {
        this.snackBar.open('Error en afegir l\'exercici', '', { duration: 3000 });
      }
    });
  }
}
