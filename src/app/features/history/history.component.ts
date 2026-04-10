import { Component, ViewChild, computed, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Exercise, ExerciseCategory, CATEGORY_LABELS, CATEGORY_ICONS, CATEGORY_COLORS } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout } from '../../core/models/workout.model';
import { WorkoutService } from '../../core/services/workout.service';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { ExercisePickerDialogComponent } from '../today/components/exercise-picker-dialog.component';

// ── Calendar day cell ─────────────────────────────────────────────────────────
interface CalDay {
  date:              string;
  day:               number;
  hasWorkout:        boolean;
  workoutCategory:   string | undefined;
  workoutCategories: string[]; // all categories (length > 1 = hybrid)
  isToday:           boolean;
  isFuture:          boolean;
  isSelected:        boolean;
}

const MONTHS_CA = [
  'Gener','Febrer','Març','Abril','Maig','Juny',
  'Juliol','Agost','Setembre','Octubre','Novembre','Desembre',
];

const WORKOUT_TYPES: { value: ExerciseCategory; label: string; icon: string; color: string }[] = [
  { value: 'push', label: CATEGORY_LABELS.push, icon: CATEGORY_ICONS.push, color: CATEGORY_COLORS.push },
  { value: 'pull', label: CATEGORY_LABELS.pull, icon: CATEGORY_ICONS.pull, color: CATEGORY_COLORS.pull },
  { value: 'legs', label: CATEGORY_LABELS.legs, icon: CATEGORY_ICONS.legs, color: CATEGORY_COLORS.legs },
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

        <!-- Loading indicator -->
        @if (isLoading()) {
          <div class="cal-loading">
            <span class="cal-loading-bar"></span>
          </div>
        }

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
                  <span class="workout-dot" [style.background]="getCatDotBackground(cell.workoutCategories)"></span>
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
                <button class="btn-edit" (click)="toggleEditMode()">
                  <span class="material-symbols-outlined">edit</span>
                  Editar
                </button>
              }
              @if (editMode()) {
                <button class="btn-delete" (click)="deleteSelectedWorkout()" aria-label="Eliminar entrenament">
                  <span class="material-symbols-outlined">delete</span>
                </button>
                <button class="btn-done" (click)="toggleEditMode()">
                  <span class="material-symbols-outlined">check</span>
                  Fet
                </button>
              }
            </div>
          </div>

          <!-- No workout for this day: choose type first -->
          @if (!selectedWorkout()) {
            <div class="detail-empty">
              <span class="material-symbols-outlined empty-icon">fitness_center</span>
              <p>Cap entrenament registrat</p>
              <p class="type-hint">Selecciona el tipus:</p>
              <div class="type-grid-sm">
                @for (cat of workoutTypes; track cat.value) {
                  <button class="type-chip-btn" [style.--cat-color]="cat.color" (click)="selectType(cat.value)">
                    <span class="material-symbols-outlined">{{ cat.icon }}</span>
                    {{ cat.label }}
                  </button>
                }
              </div>
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
                    @if ((workout.categories ?? (workout.category ? [workout.category] : [])).length > 0) {
                      <div class="workout-badges-row">
                        @for (cat of (workout.categories ?? (workout.category ? [workout.category] : [])); track cat) {
                          <span class="workout-type-badge" [style.background]="getCatColor(cat)">{{ getCatLabel(cat) }}</span>
                        }
                        @if ((workout.categories ?? []).length > 1) {
                          <span class="workout-type-badge workout-hybrid-badge">Híbrid</span>
                        }
                      </div>
                    }
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
                        <div class="entry-name-row">
                          <span class="entry-name">{{ entry.exerciseName }}</span>
                          @if (entry.feeling) {
                            <span class="entry-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
                          }
                        </div>
                        @if (entry.sets.length > 0) {
                          <div class="sets-list">
                            @for (set of entry.sets; track $index) {
                              <div class="set-pill">
                                <span class="set-weight">{{ set.weight }}kg</span>
                                <span class="set-reps">× {{ set.reps }}</span>
                              </div>
                            }
                          </div>
                        } @else {
                          <span class="no-sets">Cap sèrie registrada</span>
                        }
                      </div>
                    }
                    <div class="detail-footer">
                      <button class="edit-from-list-btn" (click)="editFromList(workout.date)">
                        <span class="material-symbols-outlined">edit</span>
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

    /* Loading bar */
    .cal-loading {
      height: 3px; margin: 0 8px 6px; border-radius: 2px;
      background: rgba(0,104,116,0.1); overflow: hidden;
    }
    .cal-loading-bar {
      display: block; height: 100%; width: 40%;
      background: #006874; border-radius: 2px;
      animation: cal-slide 1.2s ease-in-out infinite;
    }
    @keyframes cal-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
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
      width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
      /* background set inline via [style.background]=getCatDotColor() */
    }
    .is-selected .workout-dot { background: rgba(255,255,255,0.85) !important; }

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

    .detail-actions { display: flex; align-items: center; gap: 8px; }

    .btn-edit {
      display: flex; align-items: center; gap: 5px;
      padding: 7px 14px;
      border: 1.5px solid rgba(0,104,116,0.35); border-radius: 20px;
      background: rgba(0,104,116,0.08); color: #006874;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: rgba(0,104,116,0.14); }
    }

    .btn-done {
      display: flex; align-items: center; gap: 5px;
      padding: 7px 16px;
      border: none; border-radius: 20px;
      background: #006874; color: white;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: #005a63; }
    }

    .btn-delete {
      width: 36px; height: 36px;
      border: none; border-radius: 50%;
      background: transparent; color: #ccc;
      cursor: pointer; transition: background 0.15s, color 0.15s;
      display: flex; align-items: center; justify-content: center;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(239,83,80,0.1); color: #ef5350; }
    }

    .detail-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 28px 24px; text-align: center;
      .empty-icon { font-size: 40px; color: #ddd; }
      p { margin: 0; font-size: 14px; color: #aaa; }
    }

    .type-hint { font-size: 12px; color: #bbb; margin-top: 4px; }

    .type-grid-sm {
      display: flex;
      gap: 8px;
      width: 100%;
      max-width: 300px;
    }

    .type-chip-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
      padding: 12px 6px;
      border: 1.5px solid var(--cat-color);
      border-radius: 12px;
      background: white;
      cursor: pointer;
      color: var(--cat-color);
      font-size: 11px;
      font-weight: 600;
      transition: all 0.15s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: color-mix(in srgb, var(--cat-color) 10%, white); }
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
      flex: 1; display: flex; flex-direction: column; gap: 4px;
      .exercise-count { font-size: 14px; font-weight: 600; color: #1a1a1a; }
      .set-count { font-size: 12px; color: #888; }
    }

    .workout-badges-row { display: flex; flex-wrap: wrap; gap: 4px; }

    .workout-type-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      color: white;
      width: fit-content;
    }

    .workout-hybrid-badge {
      background: linear-gradient(90deg, #ef5350 0%, #9c27b0 50%, #2196f3 100%) !important;
    }

    .chevron { color: #bbb; font-size: 20px; flex-shrink: 0; }

    .workout-detail {
      border-top: 1px solid #f0f0f0; padding: 12px 14px 4px;
      display: flex; flex-direction: column; gap: 14px;
    }

    .entry-row {
      display: flex; flex-direction: column; gap: 6px;
      padding-bottom: 14px;
      border-bottom: 1px solid #f5f5f5;
      &:last-child { border-bottom: none; padding-bottom: 0; }
    }
    .entry-name-row { display: flex; align-items: center; gap: 7px; }
    .entry-name { font-size: 13px; font-weight: 600; color: #333; }
    .entry-feeling { font-size: 17px; line-height: 1; }
    .sets-list { display: flex; flex-wrap: wrap; gap: 5px; }

    .set-pill {
      display: flex; align-items: center; gap: 3px;
      padding: 3px 9px; background: #f5f5f5; border-radius: 16px; font-size: 12px;
      .set-weight { font-weight: 600; color: #333; }
      .set-reps { color: #666; }
    }
    .no-sets { font-size: 12px; color: #bbb; font-style: italic; }
    .detail-footer { display: flex; justify-content: flex-end; padding: 4px 0 8px; }

    .edit-from-list-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 8px 18px;
      border: 1.5px solid #006874;
      border-radius: 20px;
      background: transparent;
      color: #006874;
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: rgba(0,104,116,0.08); }
    }

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

  readonly workoutTypes = WORKOUT_TYPES;

  // ── Calendar state ────────────────────────────────────────────
  readonly calYear      = signal(new Date().getFullYear());
  readonly calMonth     = signal(new Date().getMonth()); // 0-indexed
  readonly selectedDate = signal<string | null>(null);

  // ── Edit state ────────────────────────────────────────────────
  readonly editMode   = signal(false);
  readonly expandedId = signal<string | null>(null);

  readonly dayNames = ['dl', 'dm', 'dc', 'dj', 'dv', 'ds', 'dg'];

  // ── Loading indicator from service ────────────────────────────
  readonly isLoading = this.workoutService.isLoading;

  constructor() {
    // Lazy-load workouts whenever the displayed calendar month changes
    effect(() => {
      const year  = this.calYear();
      const month = this.calMonth();
      this.workoutService.ensureMonthLoaded(year, month);
    });
  }

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
    const workoutByDate = new Map(this.allWorkouts().map(w => [w.date, w]));

    const firstDay    = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    // Monday-first: getDay() → 0=Sun→6, 1=Mon→0, …
    const startPad = (firstDay.getDay() + 6) % 7;

    const cells: (CalDay | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const w = workoutByDate.get(dateStr);
      cells.push({
        date: dateStr, day: d,
        hasWorkout:        !!w,
        workoutCategory:   w?.category,
        workoutCategories: w?.categories ?? (w?.category ? [w.category] : []),
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

  getCatColor(cat: string): string {
    return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#bbb';
  }
  getCatLabel(cat: string): string {
    return CATEGORY_LABELS[cat as ExerciseCategory] ?? cat;
  }
  getCatDotBackground(cats: string[]): string {
    if (!cats || cats.length === 0) return '#006874';
    if (cats.length === 1) return CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? '#006874';
    const colors = cats.map(c => CATEGORY_COLORS[c as ExerciseCategory] ?? '#bbb');
    const step = 100 / colors.length;
    const stops = colors.map((c, i) => `${c} ${Math.round(i * step)}% ${Math.round((i + 1) * step)}%`).join(', ');
    return `conic-gradient(${stops})`;
  }

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

  /** Called from the workout list "Editar" button — enters edit mode directly */
  editFromList(date: string): void {
    const d = new Date(date + 'T00:00:00');
    this.calYear.set(d.getFullYear());
    this.calMonth.set(d.getMonth());
    this.selectedDate.set(date);
    this.editMode.set(true);
    setTimeout(() => document.querySelector('.detail-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
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

  /** Called from the detail-empty type selector buttons */
  selectType(category: ExerciseCategory): void {
    this.openPicker(category);
  }

  // ── Exercise picker ───────────────────────────────────────────
  openPicker(newCategory?: ExerciseCategory): void {
    const workout         = this.selectedWorkout();
    const date            = this.selectedDate()!;
    const excludeIds      = workout?.entries.map(e => e.exerciseId) ?? [];
    const defaultCategory = (newCategory ?? workout?.category) as ExerciseCategory | undefined;

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds, defaultCategory }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = workout?.id;
        if (!workoutId) workoutId = await this.workoutService.createWorkoutForDate(date, defaultCategory);

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
