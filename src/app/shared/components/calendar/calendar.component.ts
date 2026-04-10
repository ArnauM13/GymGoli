import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { CATEGORY_COLORS, ExerciseCategory } from '../../../core/models/exercise.model';
import { WorkoutService } from '../../../core/services/workout.service';

const MONTHS_CA = [
  'Gener','Febrer','Març','Abril','Maig','Juny',
  'Juliol','Agost','Setembre','Octubre','Novembre','Desembre',
];

interface CalDay {
  date: string; day: number;
  hasWorkout: boolean;
  workoutCategories: string[];
  isToday: boolean; isFuture: boolean; isSelected: boolean;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  template: `
    <div class="calendar-card">

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

      @if (isLoading()) {
        <div class="cal-loading">
          <span class="cal-loading-bar"></span>
        </div>
      }

      <div class="cal-grid">
        @for (dow of dayNames; track dow) {
          <div class="cal-dow">{{ dow }}</div>
        }
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
              (click)="selectDay(cell.date)"
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

      <div class="cal-footer">
        @if (!isShowingCurrentMonth()) {
          <button class="goto-today-btn" (click)="goToToday()">
            <span class="material-symbols-outlined">arrow_forward</span>
            Avui
          </button>
        }
        @if (isDialog) {
          <button class="today-shortcut-btn" (click)="selectDay(todayStr)">
            <span class="material-symbols-outlined">today</span>
            Seleccionar avui
          </button>
        }
      </div>

    </div>
  `,
  styles: [`
    .calendar-card {
      background: white;
      border-radius: 16px;
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
    }
    .is-selected .workout-dot { background: rgba(255,255,255,0.85) !important; }

    .cal-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 8px;
      padding: 4px 12px 14px;
    }

    .goto-today-btn, .today-shortcut-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 18px; border-radius: 12px; border: none;
      font-size: 14px; font-weight: 600; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
    }

    .goto-today-btn {
      background: rgba(0,104,116,0.08); color: #006874;
      &:hover { background: rgba(0,104,116,0.16); }
    }

    .today-shortcut-btn {
      background: #006874; color: white;
      &:hover { background: #005a63; }
    }
  `],
})
export class CalendarComponent {
  private workoutService = inject(WorkoutService);
  private dialogRef      = inject(MatDialogRef<CalendarComponent>, { optional: true });
  private dialogData     = inject<{ selectedDate?: string }>(MAT_DIALOG_DATA, { optional: true });

  // When used inline (history): pass selectedDate as input
  // When used as a dialog (train): pass via MAT_DIALOG_DATA
  readonly selectedDate = input<string | null>(null);
  readonly dateSelected = output<string>();

  readonly calYear  = signal(new Date().getFullYear());
  readonly calMonth = signal(new Date().getMonth());

  readonly dayNames  = ['dl', 'dm', 'dc', 'dj', 'dv', 'ds', 'dg'];
  readonly isLoading = this.workoutService.isLoading;
  readonly isDialog  = !!this.dialogRef;
  readonly todayStr  = new Date().toISOString().split('T')[0];

  constructor() {
    // Navigate to the relevant month when selectedDate input changes
    effect(() => {
      const date = this.selectedDate() ?? this.dialogData?.selectedDate ?? null;
      if (date) {
        const [y, m] = date.split('-').map(Number);
        this.calYear.set(y);
        this.calMonth.set(m - 1);
      }
    }, { allowSignalWrites: true });

    // Ensure workout data is loaded for the displayed month
    effect(() => {
      this.workoutService.ensureMonthLoaded(this.calYear(), this.calMonth());
    });
  }

  readonly calMonthLabel = computed(() =>
    `${MONTHS_CA[this.calMonth()]} ${this.calYear()}`
  );

  readonly canNavForward = computed(() => {
    const now = new Date();
    return this.calYear() < now.getFullYear() ||
      (this.calYear() === now.getFullYear() && this.calMonth() < now.getMonth());
  });

  readonly isShowingCurrentMonth = computed(() => {
    const now = new Date();
    return this.calYear() === now.getFullYear() && this.calMonth() === now.getMonth();
  });

  readonly calDays = computed((): (CalDay | null)[] => {
    const y   = this.calYear();
    const m   = this.calMonth();
    const today = this.workoutService.todayDateString();
    const sel   = this.selectedDate() ?? this.dialogData?.selectedDate ?? null;
    const workoutByDate = new Map(this.workoutService.workouts().map(w => [w.date, w]));

    const firstDay    = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startPad    = (firstDay.getDay() + 6) % 7; // Monday-first

    const cells: (CalDay | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const w = workoutByDate.get(dateStr);
      cells.push({
        date: dateStr, day: d,
        hasWorkout:        !!w,
        workoutCategories: w?.categories ?? (w?.category ? [w.category] : []),
        isToday:    dateStr === today,
        isFuture:   dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return cells;
  });

  goToToday(): void {
    const now = new Date();
    this.calYear.set(now.getFullYear());
    this.calMonth.set(now.getMonth());
  }

  navigateCal(delta: number): void {
    let m = this.calMonth() + delta;
    let y = this.calYear();
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    this.calMonth.set(m);
    this.calYear.set(y);
  }

  selectDay(date: string): void {
    this.dateSelected.emit(date);
    this.dialogRef?.close(date);
  }

  getCatDotBackground(cats: string[]): string {
    if (!cats || cats.length === 0) return '#006874';
    if (cats.length === 1) return CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? '#006874';
    const colors = cats.map(c => CATEGORY_COLORS[c as ExerciseCategory] ?? '#bbb');
    const step   = 100 / colors.length;
    const stops  = colors.map((c, i) => `${c} ${Math.round(i * step)}% ${Math.round((i + 1) * step)}%`).join(', ');
    return `conic-gradient(${stops})`;
  }
}
