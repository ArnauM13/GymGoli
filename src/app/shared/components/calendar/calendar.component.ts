import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import {
  MONTHS_CA, MONTHS_SHORT, CalDay,
  mondayOf, addDays, catDotBackground, sportDotBackground,
} from '../../utils/calendar-utils';

@Component({
  selector: 'app-calendar',
  standalone: true,
  template: `
    <div class="calendar-card">

      <!-- ── Header: navigation + utility icons ── -->
      <div class="cal-header">
        <button class="cal-nav-btn" (click)="navigateBack()" aria-label="Anterior">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>

        <span class="cal-period-label">{{ periodLabel() }}</span>

        <button class="cal-nav-btn" (click)="navigateForward()"
                [disabled]="!canNavForward()" aria-label="Següent">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>

        <div class="cal-util-group">
          <!-- View toggle -->
          <div class="cal-icon-wrap">
            <button class="cal-util-btn"
                    [class.active]="false"
                    (click)="handleViewClick()"
                    (mousedown)="startLongPress('view')" (mouseup)="endLongPress()" (mouseleave)="endLongPress()"
                    (touchstart)="startLongPress('view')" (touchend)="endLongPress()" (touchcancel)="endLongPress()" (touchmove)="cancelLongPress()">
              <span class="material-symbols-outlined">
                {{ view() === 'week' ? 'calendar_view_month' : 'calendar_view_week' }}
              </span>
            </button>
            @if (tooltip() === 'view') {
              <div class="cal-tooltip">
                {{ view() === 'week' ? 'Vista setmanal · toca per canviar a mensual' : 'Vista mensual · toca per canviar a setmanal' }}
              </div>
            }
          </div>
          <!-- Go to today -->
          @if (!isShowingCurrent()) {
            <div class="cal-icon-wrap">
              <button class="cal-util-btn"
                      (click)="handleTodayClick()"
                      (mousedown)="startLongPress('today')" (mouseup)="endLongPress()" (mouseleave)="endLongPress()"
                      (touchstart)="startLongPress('today')" (touchend)="endLongPress()" (touchcancel)="endLongPress()" (touchmove)="cancelLongPress()">
                <span class="material-symbols-outlined">today</span>
              </button>
              @if (tooltip() === 'today') {
                <div class="cal-tooltip">Torna al període actual</div>
              }
            </div>
          }
        </div>
      </div>

      @if (isLoading()) {
        <div class="cal-loading"><span class="cal-loading-bar"></span></div>
      }

      <!-- ══ VISTA SETMANAL ══ -->
      @if (view() === 'week') {
        <div class="cal-week-grid">
          @for (cell of weekDays(); track cell.date) {
            <button
              class="cal-week-day"
              [class.is-today]="cell.isToday"
              [class.is-selected]="cell.isSelected"
              [class.is-future]="cell.isFuture"
              [disabled]="cell.isFuture"
              (click)="selectDay(cell.date)">
              <span class="week-dow">{{ getDow(cell.date) }}</span>
              <span class="week-num">{{ cell.day }}</span>
              @if (cell.hasWorkout || cell.hasSport) {
                <div class="dots-row">
                  @if (cell.hasWorkout) {
                    <span class="workout-dot"
                          [style.background]="getCatDotBackground(cell.workoutCategories)"></span>
                  }
                  @if (cell.hasSport) {
                    <span class="sport-dot"
                          [style.background]="getSportDotBackground(cell.sportColors)"></span>
                  }
                </div>
              }
            </button>
          }
        </div>
      }

      <!-- ══ VISTA MENSUAL ══ -->
      @if (view() === 'month') {
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
                [attr.aria-label]="cell.day">
                <span class="day-num">{{ cell.day }}</span>
                @if (cell.hasWorkout || cell.hasSport) {
                  <div class="dots-row">
                    @if (cell.hasWorkout) {
                      <span class="workout-dot"
                            [style.background]="getCatDotBackground(cell.workoutCategories)"></span>
                    }
                    @if (cell.hasSport) {
                      <span class="sport-dot"
                            [style.background]="getSportDotBackground(cell.sportColors)"></span>
                    }
                  </div>
                }
              </button>
            }
          }
        </div>
      }

      <!-- ── Footer ── -->
      @if (isDialog) {
        <div class="cal-footer">
          <button class="cal-select-today" (click)="selectDay(todayStr)">Avui</button>
        </div>
      }

    </div>
  `,
  styles: [`
    .calendar-card {
      background: var(--c-card);
      border-radius: 16px;
      overflow: hidden;
    }

    /* ── Header ── */
    .cal-header {
      display: flex; align-items: center;
      padding: 10px 8px 8px; gap: 2px;
    }

    .cal-period-label {
      flex: 1; text-align: center;
      font-size: 15px; font-weight: 700; color: var(--c-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    .cal-nav-btn {
      width: 34px; height: 34px; border: none; background: transparent;
      border-radius: 50%; cursor: pointer; color: var(--c-text-2); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      &:hover:not(:disabled) { background: var(--c-hover); }
      &:disabled { color: var(--c-border); cursor: default; }
      .material-symbols-outlined { font-size: 22px; }
    }

    /* ── Utility icon group (right side of header) ── */
    .cal-util-group {
      display: flex; align-items: center; gap: 0;
      margin-left: 4px; flex-shrink: 0;
    }
    .cal-icon-wrap { position: relative; }
    .cal-util-btn {
      width: 34px; height: 34px; border: none; background: transparent;
      border-radius: 50%; cursor: pointer; color: var(--c-text-2); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; touch-action: manipulation;
      -webkit-user-select: none; user-select: none;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-hover); color: var(--c-brand); }
      &:active { background: var(--c-hover); }
    }
    .cal-tooltip {
      position: absolute; top: calc(100% + 6px); right: 0;
      background: rgba(30,30,30,0.88); color: white; backdrop-filter: blur(4px);
      font-size: 12px; font-weight: 500; white-space: nowrap;
      padding: 6px 12px; border-radius: 10px;
      pointer-events: none; z-index: 20;
      animation: tooltip-in 0.15s ease;
    }
    @keyframes tooltip-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Loading bar ── */
    .cal-loading {
      height: 3px; margin: 0 8px 6px; border-radius: 2px;
      background: rgba(var(--c-brand-rgb), 0.1); overflow: hidden;
    }
    .cal-loading-bar {
      display: block; height: 100%; width: 40%;
      background: var(--c-brand); border-radius: 2px;
      animation: cal-slide 1.2s ease-in-out infinite;
    }
    @keyframes cal-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }

    /* ══ SETMANAL ══ */
    .cal-week-grid {
      display: grid; grid-template-columns: repeat(7, 1fr);
      gap: 4px; padding: 4px 8px 12px;
    }

    .cal-week-day {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 4px;
      padding: 10px 2px; border: none; border-radius: 12px;
      background: transparent; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;

      &:hover:not(:disabled):not(.is-selected) { background: rgba(var(--c-brand-rgb), 0.08); }
      &:disabled { cursor: default; }

      &.is-today:not(.is-selected) {
        outline: 2px solid var(--c-brand); outline-offset: -2px;
        color: var(--c-brand);
      }
      &.is-selected {
        background: var(--c-brand) !important; color: white;
      }
      &.is-future { color: var(--c-border); }
    }

    .week-dow {
      font-size: 10px; font-weight: 600; color: var(--c-text-3);
      text-transform: uppercase; line-height: 1;
    }
    .is-today .week-dow  { color: var(--c-brand); }
    .is-selected .week-dow { color: rgba(255,255,255,0.75); }
    .is-future .week-dow { color: var(--c-border); }

    .week-num {
      font-size: 16px; font-weight: 700; color: var(--c-text); line-height: 1;
    }
    .is-today .week-num    { color: var(--c-brand); }
    .is-selected .week-num { color: white; }
    .is-future .week-num   { color: var(--c-border); }

    /* ══ MENSUAL ══ */
    .cal-grid {
      display: grid; grid-template-columns: repeat(7, 1fr);
      gap: 2px; padding: 0 8px 12px;
    }

    .cal-dow {
      text-align: center; font-size: 11px; font-weight: 600;
      color: var(--c-text-3); padding: 4px 0; text-transform: uppercase;
    }

    .cal-day {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 3px;
      min-height: 40px; width: 100%;
      border: none; border-radius: 10px; background: transparent;
      font-size: 14px; font-weight: 500; color: var(--c-text);
      cursor: pointer; transition: background 0.15s; padding: 4px 0;

      &:hover:not(:disabled):not(.is-selected) { background: rgba(var(--c-brand-rgb), 0.08); }
      &:disabled { cursor: default; }

      &.is-today:not(.is-selected) {
        outline: 2px solid var(--c-brand); outline-offset: -2px;
        color: var(--c-brand); font-weight: 700;
      }
      &.is-selected {
        background: var(--c-brand) !important; color: white; font-weight: 700;
      }
      &.is-future { color: var(--c-border); }
      &.has-workout.is-future { color: var(--c-border-2); }
    }

    .day-num { line-height: 1; }

    /* ── Dots (shared) ── */
    .dots-row {
      display: flex; align-items: center; justify-content: center; gap: 3px;
    }
    .workout-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
    .sport-dot   { width: 5px; height: 5px; border-radius: 2px; flex-shrink: 0; }
    .is-selected .workout-dot,
    .is-selected .sport-dot { background: rgba(255,255,255,0.85) !important; }

    /* ── Footer ── */
    .cal-footer {
      display: flex; align-items: center; justify-content: flex-end;
      padding: 2px 12px 12px;
    }
    .cal-select-today {
      padding: 8px 18px; border-radius: 16px;
      border: none; background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
    }
  `],
})
export class CalendarComponent {
  private workoutService = inject(WorkoutService);
  private sportService   = inject(SportService);
  private dialogRef      = inject(MatDialogRef<CalendarComponent>, { optional: true });
  private dialogData     = inject<{ selectedDate?: string; initialView?: 'week' | 'month' }>(MAT_DIALOG_DATA, { optional: true });

  readonly selectedDate = input<string | null>(null);
  readonly dateSelected = output<string>();

  // ── View ──────────────────────────────────────────────────────────────────
  readonly view    = signal<'week' | 'month'>('week');
  readonly tooltip = signal<'view' | 'today' | null>(null);
  private _lpTimer: ReturnType<typeof setTimeout> | null = null;
  private _lpFired = false;

  // ── Month state ───────────────────────────────────────────────────────────
  readonly calYear  = signal(new Date().getFullYear());
  readonly calMonth = signal(new Date().getMonth());

  // ── Week state ────────────────────────────────────────────────────────────
  readonly weekStart = signal<string>(mondayOf(new Date().toISOString().split('T')[0]));

  readonly dayNames = ['dl', 'dm', 'dc', 'dj', 'dv', 'ds', 'dg'];
  readonly isLoading = this.workoutService.isLoading;
  readonly isDialog  = !!this.dialogRef;
  readonly todayStr  = new Date().toISOString().split('T')[0];

  constructor() {
    const initialView = this.dialogData?.initialView;
    if (initialView) this.view.set(initialView);

    // Navigate to the relevant period when selectedDate input changes
    effect(() => {
      const date = this.selectedDate() ?? this.dialogData?.selectedDate ?? null;
      if (date) {
        const [y, m] = date.split('-').map(Number);
        this.calYear.set(y);
        this.calMonth.set(m - 1);
        this.weekStart.set(mondayOf(date));
      }
    }, { allowSignalWrites: true });

    // Ensure data loaded for visible period
    effect(() => {
      if (this.view() === 'month') {
        this.workoutService.ensureMonthLoaded(this.calYear(), this.calMonth());
        this.sportService.ensureMonthLoaded(this.calYear(), this.calMonth());
      } else {
        const monday = this.weekStart();
        const sunday = addDays(monday, 6);
        const [my, mm] = monday.split('-').map(Number);
        const [sy, sm] = sunday.split('-').map(Number);
        this.workoutService.ensureMonthLoaded(my, mm - 1);
        this.sportService.ensureMonthLoaded(my, mm - 1);
        if (my !== sy || mm !== sm) {
          this.workoutService.ensureMonthLoaded(sy, sm - 1);
          this.sportService.ensureMonthLoaded(sy, sm - 1);
        }
      }
    });
  }

  // ── Period label ──────────────────────────────────────────────────────────
  readonly periodLabel = computed(() => {
    if (this.view() === 'month') {
      return `${MONTHS_CA[this.calMonth()]} ${this.calYear()}`;
    }
    const monday = this.weekStart();
    const sunday = addDays(monday, 6);
    const mDate  = new Date(monday + 'T12:00:00');
    const sDate  = new Date(sunday  + 'T12:00:00');
    const mDay   = mDate.getDate();
    const sDay   = sDate.getDate();
    const sMonth = MONTHS_SHORT[sDate.getMonth()];
    const year   = sDate.getFullYear();
    if (mDate.getMonth() === sDate.getMonth()) {
      return `${mDay} – ${sDay} ${sMonth} ${year}`;
    }
    return `${mDay} ${MONTHS_SHORT[mDate.getMonth()]} – ${sDay} ${sMonth} ${year}`;
  });

  // ── Navigation ────────────────────────────────────────────────────────────
  readonly canNavForward = computed(() => {
    if (this.view() === 'month') {
      const now = new Date();
      return this.calYear() < now.getFullYear() ||
        (this.calYear() === now.getFullYear() && this.calMonth() < now.getMonth());
    }
    return addDays(this.weekStart(), 6) < this.todayStr;
  });

  readonly isShowingCurrent = computed(() => {
    if (this.view() === 'month') {
      const now = new Date();
      return this.calYear() === now.getFullYear() && this.calMonth() === now.getMonth();
    }
    const sunday = addDays(this.weekStart(), 6);
    return this.weekStart() <= this.todayStr && this.todayStr <= sunday;
  });

  navigateBack(): void {
    if (this.view() === 'month') {
      let m = this.calMonth() - 1, y = this.calYear();
      if (m < 0) { m = 11; y--; }
      this.calMonth.set(m); this.calYear.set(y);
    } else {
      this.weekStart.set(addDays(this.weekStart(), -7));
    }
  }

  navigateForward(): void {
    if (this.view() === 'month') {
      let m = this.calMonth() + 1, y = this.calYear();
      if (m > 11) { m = 0; y++; }
      this.calMonth.set(m); this.calYear.set(y);
    } else {
      this.weekStart.set(addDays(this.weekStart(), 7));
    }
  }

  goToToday(): void {
    const now = new Date();
    this.calYear.set(now.getFullYear());
    this.calMonth.set(now.getMonth());
    this.weekStart.set(mondayOf(this.todayStr));
  }

  toggleView(): void {
    this.view.set(this.view() === 'week' ? 'month' : 'week');
  }

  handleViewClick(): void {
    if (this._lpFired) { this._lpFired = false; return; }
    this.toggleView();
  }

  handleTodayClick(): void {
    if (this._lpFired) { this._lpFired = false; return; }
    this.goToToday();
  }

  startLongPress(which: 'view' | 'today'): void {
    this._lpFired = false;
    this._lpTimer = setTimeout(() => {
      this._lpFired = true;
      this.tooltip.set(which);
    }, 600);
  }

  endLongPress(): void {
    if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
    if (this.tooltip() !== null) {
      setTimeout(() => this.tooltip.set(null), 1800);
    }
  }

  cancelLongPress(): void {
    if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; }
    this.tooltip.set(null);
  }

  // ── Week days ─────────────────────────────────────────────────────────────
  readonly weekDays = computed((): CalDay[] => {
    const monday = this.weekStart();
    const today  = this.workoutService.todayDateString();
    const sel    = this.selectedDate() ?? this.dialogData?.selectedDate ?? null;
    const workoutByDate = new Map(this.workoutService.workouts().map(w => [w.date, w]));
    const _s = this.sportService.sessions();
    const _p = this.sportService.sports();

    const days: CalDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = addDays(monday, i);
      const d = new Date(dateStr + 'T12:00:00');
      const w = workoutByDate.get(dateStr);
      const sports = this.sportService.getSportsForDate(dateStr);
      days.push({
        date: dateStr, day: d.getDate(),
        hasWorkout: !!w,
        workoutCategories: w?.categories ?? (w?.category ? [w.category] : []),
        hasSport: sports.length > 0,
        sportColors: sports.map(s => s.color),
        isToday:   dateStr === today,
        isFuture:  dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return days;
  });

  // ── Month days ────────────────────────────────────────────────────────────
  readonly calDays = computed((): (CalDay | null)[] => {
    const y = this.calYear(), m = this.calMonth();
    const today = this.workoutService.todayDateString();
    const sel   = this.selectedDate() ?? this.dialogData?.selectedDate ?? null;
    const workoutByDate = new Map(this.workoutService.workouts().map(w => [w.date, w]));
    const _s = this.sportService.sessions();
    const _p = this.sportService.sports();

    const firstDay    = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startPad    = (firstDay.getDay() + 6) % 7;

    const cells: (CalDay | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const w = workoutByDate.get(dateStr);
      const sports = this.sportService.getSportsForDate(dateStr);
      cells.push({
        date: dateStr, day: d,
        hasWorkout: !!w,
        workoutCategories: w?.categories ?? (w?.category ? [w.category] : []),
        hasSport: sports.length > 0,
        sportColors: sports.map(s => s.color),
        isToday:   dateStr === today,
        isFuture:  dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return cells;
  });

  // ── Actions ───────────────────────────────────────────────────────────────
  selectDay(date: string): void {
    this.dateSelected.emit(date);
    this.dialogRef?.close(date);
  }

  getDow(dateStr: string): string {
    return this.dayNames[(new Date(dateStr + 'T12:00:00').getDay() + 6) % 7];
  }

  readonly getCatDotBackground  = catDotBackground;
  readonly getSportDotBackground = sportDotBackground;
}
