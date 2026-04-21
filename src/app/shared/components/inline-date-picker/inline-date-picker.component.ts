import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { CATEGORY_COLORS, ExerciseCategory } from '../../../core/models/exercise.model';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';

const MONTHS_CA = [
  'Gener','Febrer','Març','Abril','Maig','Juny',
  'Juliol','Agost','Setembre','Octubre','Novembre','Desembre',
];

interface CalDay {
  date: string; day: number;
  hasWorkout: boolean; workoutCategories: string[];
  hasSport: boolean; sportColors: string[];
  isToday: boolean; isFuture: boolean; isSelected: boolean;
}

@Component({
  selector: 'app-inline-date-picker',
  standalone: true,
  host: { class: 'idp-host' },
  template: `
    <div class="idp">

      <!-- ── Header: arrows + tappable period label + today icon ── -->
      <div class="idp-header">
        <button class="idp-nav" (click)="navBack()" aria-label="Període anterior">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>

        <button class="idp-period" (click)="toggleExpanded()" [attr.aria-expanded]="expanded()">
          <span class="idp-period-text">{{ periodLabel() }}</span>
          <span class="material-symbols-outlined idp-chevron" [class.flipped]="expanded()">expand_more</span>
        </button>

        <button class="idp-nav" [disabled]="!canNavForward()" (click)="navForward()" aria-label="Període següent">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>

        @if (!isShowingCurrent()) {
          <button class="idp-today-btn" (click)="goToToday()" title="Anar a avui">
            <span class="material-symbols-outlined">today</span>
          </button>
        }
      </div>

      <!-- ── Day-of-week labels ── -->
      <div class="idp-dow-row">
        @for (name of dayNames; track name) {
          <div class="idp-dow">{{ name }}</div>
        }
      </div>

      <!-- ── Grid: week strip (default) or full month (expanded) ── -->
      <div class="idp-grid-wrap"
           (touchstart)="onSwipeStart($event)"
           (touchend)="onSwipeEnd($event)">

        @if (!expanded()) {
          <div class="idp-week-grid">
            @for (cell of weekDays(); track cell.date) {
              <button
                class="idp-day"
                [class.is-today]="cell.isToday"
                [class.is-selected]="cell.isSelected"
                [class.is-future]="cell.isFuture"
                [disabled]="cell.isFuture"
                (click)="selectDay(cell.date)">
                <span class="idp-day-num">{{ cell.day }}</span>
                @if (cell.hasWorkout || cell.hasSport) {
                  <div class="idp-dots">
                    @if (cell.hasWorkout) {
                      <span class="idp-dot idp-dot--workout"
                            [style.background]="getCatDotBackground(cell.workoutCategories)"></span>
                    }
                    @if (cell.hasSport) {
                      <span class="idp-dot idp-dot--sport"
                            [style.background]="getSportDotBackground(cell.sportColors)"></span>
                    }
                  </div>
                }
              </button>
            }
          </div>
        }

        @if (expanded()) {
          <div class="idp-month-grid">
            @for (cell of calDays(); track $index) {
              @if (cell === null) {
                <div></div>
              } @else {
                <button
                  class="idp-day"
                  [class.is-today]="cell.isToday"
                  [class.is-selected]="cell.isSelected"
                  [class.is-future]="cell.isFuture"
                  [disabled]="cell.isFuture"
                  (click)="selectDay(cell.date)">
                  <span class="idp-day-num">{{ cell.day }}</span>
                  @if (cell.hasWorkout || cell.hasSport) {
                    <div class="idp-dots">
                      @if (cell.hasWorkout) {
                        <span class="idp-dot idp-dot--workout"
                              [style.background]="getCatDotBackground(cell.workoutCategories)"></span>
                      }
                      @if (cell.hasSport) {
                        <span class="idp-dot idp-dot--sport"
                              [style.background]="getSportDotBackground(cell.sportColors)"></span>
                      }
                    </div>
                  }
                </button>
              }
            }
          </div>
        }

      </div>

      <!-- ── Loading bar ── -->
      @if (workoutSvc.isLoading()) {
        <div class="idp-loading"><span class="idp-loading-bar"></span></div>
      }

    </div>
  `,
  styles: [`
    :host.idp-host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 10;
      background: white;
      border-bottom: 1.5px solid #f0f0f0;
    }

    .idp { background: white; padding: 4px 0 0; }

    /* ── Header ── */
    .idp-header {
      display: flex; align-items: center;
      padding: 6px 6px 2px; gap: 0;
    }

    .idp-nav {
      width: 36px; height: 36px; border: none; background: transparent;
      border-radius: 50%; cursor: pointer; color: #666; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 22px; }
      &:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
      &:disabled { color: #d0d0d0; cursor: default; }
    }

    .idp-period {
      flex: 1; border: none; background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 2px;
      padding: 5px 8px; border-radius: 10px;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: rgba(0,0,0,0.05); }
      &:active { background: rgba(0,0,0,0.08); }
    }
    .idp-period-text {
      font-size: 14px; font-weight: 700; color: #1a1a1a; letter-spacing: 0.01em;
    }
    .idp-chevron {
      font-size: 18px; color: #aaa;
      transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      &.flipped { transform: rotate(180deg); }
    }

    .idp-today-btn {
      width: 36px; height: 36px; border: none; background: transparent;
      border-radius: 50%; cursor: pointer; color: #999; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(0,104,116,0.08); color: #006874; }
    }

    /* ── Day-of-week row ── */
    .idp-dow-row {
      display: grid; grid-template-columns: repeat(7, 1fr);
      padding: 0 8px;
    }
    .idp-dow {
      text-align: center; font-size: 10px; font-weight: 700;
      color: #c0c0c0; padding: 2px 0 4px; text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    /* ── Grid wrapper (swipe target) ── */
    .idp-grid-wrap {
      padding: 2px 8px 8px;
      touch-action: pan-y;
    }

    /* ── Week grid ── */
    .idp-week-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;
    }

    /* ── Month grid ── */
    .idp-month-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
      animation: idp-expand 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes idp-expand {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Day cell ── */
    .idp-day {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 3px;
      min-height: 46px; padding: 6px 2px;
      border: none; border-radius: 12px;
      background: transparent; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;

      &:hover:not(:disabled):not(.is-selected) { background: rgba(0,104,116,0.07); }
      &:active:not(:disabled):not(.is-selected) { background: rgba(0,104,116,0.13); }
      &:disabled { cursor: default; }

      &.is-today:not(.is-selected) {
        outline: 2px solid #006874; outline-offset: -2px;
      }
      &.is-selected {
        background: #006874 !important;
      }
      &.is-future { opacity: 0.28; }
    }

    .idp-day-num {
      font-size: 15px; font-weight: 600; color: #1a1a1a; line-height: 1;
    }
    .is-today:not(.is-selected) .idp-day-num { color: #006874; font-weight: 800; }
    .is-selected .idp-day-num { color: white; font-weight: 700; }

    /* ── Activity dots ── */
    .idp-dots {
      display: flex; align-items: center; justify-content: center; gap: 2px;
    }
    .idp-dot {
      flex-shrink: 0;
      &--workout { width: 5px; height: 5px; border-radius: 50%; }
      &--sport   { width: 4px; height: 4px; border-radius: 1.5px; }
    }
    .is-selected .idp-dot { background: rgba(255,255,255,0.75) !important; }

    /* ── Loading bar ── */
    .idp-loading {
      height: 2px; margin: 2px 8px 0; border-radius: 2px;
      background: rgba(0,104,116,0.1); overflow: hidden;
    }
    .idp-loading-bar {
      display: block; height: 100%; width: 40%;
      background: #006874; border-radius: 2px;
      animation: idp-slide 1.2s ease-in-out infinite;
    }
    @keyframes idp-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
  `],
})
export class InlineDatePickerComponent {
  readonly workoutSvc = inject(WorkoutService);
  private sportSvc    = inject(SportService);

  readonly selectedDate = input<string | null>(null);
  readonly dateSelected = output<string>();

  readonly expanded  = signal(false);
  readonly weekStart = signal<string>(this._mondayOf(new Date().toISOString().split('T')[0]));
  readonly calYear   = signal(new Date().getFullYear());
  readonly calMonth  = signal(new Date().getMonth());

  readonly dayNames = ['dl', 'dm', 'dc', 'dj', 'dv', 'ds', 'dg'];
  readonly todayStr = new Date().toISOString().split('T')[0];

  private _swipeStartX = 0;
  private _swipeStartY = 0;

  constructor() {
    // Sync view to follow external selectedDate changes
    effect(() => {
      const date = this.selectedDate();
      if (date) {
        const [y, m] = date.split('-').map(Number);
        this.weekStart.set(this._mondayOf(date));
        this.calYear.set(y);
        this.calMonth.set(m - 1);
      }
    }, { allowSignalWrites: true });

    // Preload data for visible week
    effect(() => {
      const monday = this.weekStart();
      const sunday = this._addDays(monday, 6);
      const [my, mm] = monday.split('-').map(Number);
      const [sy, sm] = sunday.split('-').map(Number);
      this.workoutSvc.ensureMonthLoaded(my, mm - 1);
      this.sportSvc.ensureMonthLoaded(my, mm - 1);
      if (my !== sy || mm !== sm) {
        this.workoutSvc.ensureMonthLoaded(sy, sm - 1);
        this.sportSvc.ensureMonthLoaded(sy, sm - 1);
      }
    });

    // Preload data for expanded month view
    effect(() => {
      if (this.expanded()) {
        this.workoutSvc.ensureMonthLoaded(this.calYear(), this.calMonth());
        this.sportSvc.ensureMonthLoaded(this.calYear(), this.calMonth());
      }
    });
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  readonly periodLabel = computed(() => {
    if (this.expanded()) {
      return `${MONTHS_CA[this.calMonth()]} ${this.calYear()}`;
    }
    const d = new Date(this.weekStart() + 'T12:00:00');
    return `${MONTHS_CA[d.getMonth()]} ${d.getFullYear()}`;
  });

  readonly canNavForward = computed(() => {
    if (this.expanded()) {
      const now = new Date();
      return this.calYear() < now.getFullYear() ||
        (this.calYear() === now.getFullYear() && this.calMonth() < now.getMonth());
    }
    return this._addDays(this.weekStart(), 6) < this.todayStr;
  });

  readonly isShowingCurrent = computed(() => {
    if (this.expanded()) {
      const now = new Date();
      return this.calYear() === now.getFullYear() && this.calMonth() === now.getMonth();
    }
    const sunday = this._addDays(this.weekStart(), 6);
    return this.weekStart() <= this.todayStr && this.todayStr <= sunday;
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  navBack(): void {
    if (this.expanded()) {
      let m = this.calMonth() - 1, y = this.calYear();
      if (m < 0) { m = 11; y--; }
      this.calMonth.set(m); this.calYear.set(y);
    } else {
      this.weekStart.set(this._addDays(this.weekStart(), -7));
    }
  }

  navForward(): void {
    if (this.expanded()) {
      let m = this.calMonth() + 1, y = this.calYear();
      if (m > 11) { m = 0; y++; }
      this.calMonth.set(m); this.calYear.set(y);
    } else {
      this.weekStart.set(this._addDays(this.weekStart(), 7));
    }
  }

  goToToday(): void {
    const now = new Date();
    this.weekStart.set(this._mondayOf(this.todayStr));
    this.calYear.set(now.getFullYear());
    this.calMonth.set(now.getMonth());
  }

  toggleExpanded(): void {
    if (!this.expanded()) {
      const d = new Date(this.weekStart() + 'T12:00:00');
      this.calYear.set(d.getFullYear());
      this.calMonth.set(d.getMonth());
    }
    this.expanded.set(!this.expanded());
  }

  // ── Swipe to navigate weeks ────────────────────────────────────────────────

  onSwipeStart(e: TouchEvent): void {
    this._swipeStartX = e.touches[0].clientX;
    this._swipeStartY = e.touches[0].clientY;
  }

  onSwipeEnd(e: TouchEvent): void {
    const dx = e.changedTouches[0].clientX - this._swipeStartX;
    const dy = e.changedTouches[0].clientY - this._swipeStartY;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && this.canNavForward()) this.navForward();
      else if (dx > 0) this.navBack();
    }
  }

  // ── Week days ─────────────────────────────────────────────────────────────

  readonly weekDays = computed((): CalDay[] => {
    const monday = this.weekStart();
    const today  = this.workoutSvc.todayDateString();
    const sel    = this.selectedDate() ?? null;
    const byDate = new Map(this.workoutSvc.workouts().map(w => [w.date, w]));
    const _s = this.sportSvc.sessions();
    const days: CalDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = this._addDays(monday, i);
      const d = new Date(dateStr + 'T12:00:00');
      const w = byDate.get(dateStr);
      const sports = this.sportSvc.getSportsForDate(dateStr);
      days.push({
        date: dateStr, day: d.getDate(),
        hasWorkout: !!w,
        workoutCategories: w?.categories ?? (w?.category ? [w.category] : []),
        hasSport: sports.length > 0,
        sportColors: sports.map(s => s.color),
        isToday:    dateStr === today,
        isFuture:   dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return days;
  });

  // ── Month days ────────────────────────────────────────────────────────────

  readonly calDays = computed((): (CalDay | null)[] => {
    const y = this.calYear(), m = this.calMonth();
    const today  = this.workoutSvc.todayDateString();
    const sel    = this.selectedDate() ?? null;
    const byDate = new Map(this.workoutSvc.workouts().map(w => [w.date, w]));
    const _s = this.sportSvc.sessions();

    const firstDay    = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startPad    = (firstDay.getDay() + 6) % 7;

    const cells: (CalDay | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const w = byDate.get(dateStr);
      const sports = this.sportSvc.getSportsForDate(dateStr);
      cells.push({
        date: dateStr, day: d,
        hasWorkout: !!w,
        workoutCategories: w?.categories ?? (w?.category ? [w.category] : []),
        hasSport: sports.length > 0,
        sportColors: sports.map(s => s.color),
        isToday:    dateStr === today,
        isFuture:   dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return cells;
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  selectDay(date: string): void {
    this.dateSelected.emit(date);
    if (this.expanded()) {
      this.weekStart.set(this._mondayOf(date));
      this.expanded.set(false);
    }
  }

  // ── Dot helpers ───────────────────────────────────────────────────────────

  getCatDotBackground(cats: string[]): string {
    if (!cats?.length) return '#006874';
    if (cats.length === 1) return CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? '#006874';
    const colors = cats.map(c => CATEGORY_COLORS[c as ExerciseCategory] ?? '#bbb');
    const step   = 100 / colors.length;
    return `conic-gradient(${colors.map((c, i) => `${c} ${Math.round(i * step)}% ${Math.round((i + 1) * step)}%`).join(', ')})`;
  }

  getSportDotBackground(colors: string[]): string {
    if (!colors?.length) return '#FB8C00';
    if (colors.length === 1) return colors[0];
    const step = 100 / colors.length;
    return `conic-gradient(${colors.map((c, i) => `${c} ${Math.round(i * step)}% ${Math.round((i + 1) * step)}%`).join(', ')})`;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _mondayOf(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    const dow = d.getDay();
    d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
    return d.toISOString().split('T')[0];
  }

  private _addDays(dateStr: string, days: number): string {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  }
}
