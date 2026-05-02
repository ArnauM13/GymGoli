import { Component, computed, effect, inject, input, linkedSignal, output, signal } from '@angular/core';
import { CATEGORY_COLORS, ExerciseCategory } from '../../../core/models/exercise.model';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import {
  MONTHS_CA, CalDay,
  mondayOf, addDays, catDotBackground, sportDotBackground,
} from '../../utils/calendar-utils';

@Component({
  selector: 'app-inline-date-picker',
  standalone: true,
  host: { class: 'idp-host' },
  template: `
    <div class="idp">

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

      <div class="idp-dow-row">
        @for (name of DAY_NAMES; track name) {
          <div class="idp-dow">{{ name }}</div>
        }
      </div>

      <div class="idp-grid-wrap"
           (touchstart)="onSwipeStart($event)"
           (touchend)="onSwipeEnd($event)">

        @if (!expanded()) {
          <div class="idp-week-grid">
            @for (cell of weekDays(); track cell.date) {
              <button class="idp-day"
                      [class.is-today]="cell.isToday"
                      [class.is-selected]="cell.isSelected"
                      [class.is-future]="cell.isFuture"
                      [disabled]="cell.isFuture"
                      (click)="selectDay(cell.date)">
                <span class="idp-day-num">{{ cell.day }}</span>
                @if (cell.hasWorkout || cell.hasSport) {
                  <div class="idp-dots">
                    @for (cat of cell.workoutCategories.slice(0, 2); track cat) {
                      <span class="idp-pip" [style.background]="catColor(cat)"></span>
                    }
                    @for (icon of cell.sportIcons.slice(0, 1); track icon; let i = $index) {
                      <span class="idp-sport-icon material-symbols-outlined"
                            [style.color]="cell.sportColors[i]">{{ icon }}</span>
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
                <button class="idp-day"
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
                              [style.background]="catDotBg(cell.workoutCategories)"></span>
                      }
                      @if (cell.hasSport) {
                        <span class="idp-dot idp-dot--sport"
                              [style.background]="sportDotBg(cell.sportColors)"></span>
                      }
                    </div>
                  }
                </button>
              }
            }
          </div>
        }

      </div>

      @if (weeklyGoal() && isShowingCurrent() && settingsSvc.loaded()) {
        <div class="idp-goal">
          <div class="idp-goal-track">
            <div class="idp-goal-fill" [style.width.%]="weeklyBarPct()"></div>
          </div>
          <span class="idp-goal-badge" [class.done]="weeklyGoalMet()">
            {{ weeklyDone() }}/{{ weeklyGoal() }}
            <span class="material-symbols-outlined">{{ weeklyGoalMet() ? 'check_circle' : 'directions_run' }}</span>
          </span>
        </div>
      }

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
      background: var(--c-card);
      border-bottom: 1.5px solid var(--c-border-2);
    }

    .idp { background: var(--c-card); padding: 4px 0 0; }

    .idp-header {
      display: flex; align-items: center;
      padding: 6px 6px 2px; gap: 0;
    }

    .idp-nav {
      width: 36px; height: 36px; border: none; background: transparent;
      border-radius: 50%; cursor: pointer; color: var(--c-text-3); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 22px; }
      &:hover:not(:disabled) { background: var(--c-hover); }
      &:disabled { color: var(--c-border-2); cursor: default; }
    }

    .idp-period {
      flex: 1; border: none; background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center; gap: 2px;
      padding: 5px 8px; border-radius: 10px;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-hover); }
      &:active { background: var(--c-shadow); }
    }
    .idp-period-text {
      font-size: 14px; font-weight: 700; color: var(--c-text); letter-spacing: 0.01em;
    }
    .idp-chevron {
      font-size: 18px; color: var(--c-text-3);
      transition: transform 0.22s cubic-bezier(0.4, 0, 0.2, 1);
      &.flipped { transform: rotate(180deg); }
    }

    .idp-today-btn {
      width: 36px; height: 36px; border: none; background: transparent;
      border-radius: 50%; cursor: pointer; color: var(--c-border); flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(var(--c-brand-rgb), 0.08); color: var(--c-brand); }
    }

    .idp-dow-row {
      display: grid; grid-template-columns: repeat(7, 1fr);
      padding: 0 8px;
    }
    .idp-dow {
      text-align: center; font-size: 10px; font-weight: 700;
      color: var(--c-border); padding: 2px 0 4px; text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .idp-grid-wrap {
      padding: 2px 8px 8px;
      touch-action: pan-y;
    }

    .idp-week-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px;
    }

    .idp-month-grid {
      display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;
      animation: idp-expand 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes idp-expand {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .idp-day {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 3px;
      min-height: 46px; padding: 6px 2px;
      border: none; border-radius: 12px;
      background: transparent; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;

      &:hover:not(:disabled):not(.is-selected) { background: rgba(var(--c-brand-rgb), 0.07); }
      &:active:not(:disabled):not(.is-selected) { background: rgba(var(--c-brand-rgb), 0.13); }
      &:disabled { cursor: default; }

      &.is-today:not(.is-selected) { outline: 2px solid var(--c-brand); outline-offset: -2px; }
      &.is-selected { background: var(--c-brand) !important; }
      &.is-future { opacity: 0.28; }
    }

    .idp-day-num {
      font-size: 15px; font-weight: 600; color: var(--c-text); line-height: 1;
    }
    .is-today:not(.is-selected) .idp-day-num { color: var(--c-brand); font-weight: 800; }
    .is-selected .idp-day-num { color: var(--c-card); font-weight: 700; }

    .idp-dots {
      display: flex; align-items: center; justify-content: center; gap: 2px;
    }
    .idp-dot {
      flex-shrink: 0;
      &--workout { width: 5px; height: 5px; border-radius: 50%; }
      &--sport   { width: 4px; height: 4px; border-radius: 1.5px; }
    }
    .idp-pip { width: 6px; height: 6px; border-radius: 2px; flex-shrink: 0; }
    .idp-sport-icon {
      font-size: 10px; line-height: 1;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .is-selected .idp-dot       { background: rgba(255,255,255,0.75) !important; }
    .is-selected .idp-pip       { background: rgba(255,255,255,0.75) !important; }
    .is-selected .idp-sport-icon { color: rgba(255,255,255,0.75) !important; }

    .idp-goal {
      display: flex; align-items: center; gap: 8px; padding: 0 12px 8px;
    }
    .idp-goal-track {
      flex: 1; height: 3px; background: var(--c-border); border-radius: 2px; overflow: hidden;
    }
    .idp-goal-fill {
      height: 100%; background: var(--c-brand); border-radius: 2px;
      transition: width 0.4s ease; max-width: 100%;
    }
    .idp-goal-badge {
      display: flex; align-items: center; gap: 2px;
      font-size: 11px; font-weight: 700; color: var(--c-text-3); white-space: nowrap;
      .material-symbols-outlined { font-size: 12px; font-variation-settings: 'FILL' 0, 'wght' 300; }
      &.done { color: var(--c-brand);
        .material-symbols-outlined { font-variation-settings: 'FILL' 1, 'wght' 400; }
      }
    }

    .idp-loading {
      height: 2px; margin: 2px 8px 0; border-radius: 2px;
      background: rgba(var(--c-brand-rgb), 0.1); overflow: hidden;
    }
    .idp-loading-bar {
      display: block; height: 100%; width: 40%;
      background: var(--c-brand); border-radius: 2px;
      animation: idp-slide 1.2s ease-in-out infinite;
    }
    @keyframes idp-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
  `],
})
export class InlineDatePickerComponent {
  readonly workoutSvc  = inject(WorkoutService);
  private sportSvc     = inject(SportService);
  readonly settingsSvc = inject(UserSettingsService);

  readonly selectedDate = input<string | null>(null);
  readonly dateSelected = output<string>();

  readonly DAY_NAMES = ['dl', 'dm', 'dc', 'dj', 'dv', 'ds', 'dg'];
  readonly todayStr  = new Date().toISOString().split('T')[0];
  readonly expanded  = signal(false);

  // Writable signals that auto-reset when selectedDate changes (linkedSignal)
  readonly weekStart = linkedSignal<string>(() => {
    const d = this.selectedDate();
    return d ? mondayOf(d) : mondayOf(this.todayStr);
  });
  readonly calYear = linkedSignal<number>(() => {
    const d = this.selectedDate();
    return d ? parseInt(d.split('-')[0]) : new Date().getFullYear();
  });
  readonly calMonth = linkedSignal<number>(() => {
    const d = this.selectedDate();
    return d ? parseInt(d.split('-')[1]) - 1 : new Date().getMonth();
  });

  private _swipeStartX = 0;
  private _swipeStartY = 0;

  constructor() {
    // Single effect: preload data for visible week + expanded month (deduped)
    effect(() => {
      const loaded = new Set<string>();
      const load = (y: number, m: number) => {
        const key = `${y}-${m}`;
        if (loaded.has(key)) return;
        loaded.add(key);
        this.workoutSvc.ensureMonthLoaded(y, m);
        this.sportSvc.ensureMonthLoaded(y, m);
      };

      const monday = this.weekStart();
      const sunday = addDays(monday, 6);
      const [my, mm] = monday.split('-').map(Number);
      const [sy, sm] = sunday.split('-').map(Number);
      load(my, mm - 1);
      if (my !== sy || mm !== sm) load(sy, sm - 1);

      if (this.expanded()) load(this.calYear(), this.calMonth());
    });
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  readonly periodLabel = computed(() => {
    if (this.expanded()) return `${MONTHS_CA[this.calMonth()]} ${this.calYear()}`;
    const d = new Date(this.weekStart() + 'T12:00:00');
    return `${MONTHS_CA[d.getMonth()]} ${d.getFullYear()}`;
  });

  readonly canNavForward = computed(() => {
    if (this.expanded()) {
      const now = new Date();
      return this.calYear() < now.getFullYear() ||
        (this.calYear() === now.getFullYear() && this.calMonth() < now.getMonth());
    }
    return addDays(this.weekStart(), 6) < this.todayStr;
  });

  readonly isShowingCurrent = computed(() => {
    if (this.expanded()) {
      const now = new Date();
      return this.calYear() === now.getFullYear() && this.calMonth() === now.getMonth();
    }
    const sunday = addDays(this.weekStart(), 6);
    return this.weekStart() <= this.todayStr && this.todayStr <= sunday;
  });

  // Shared map to avoid rebuilding it in both weekDays and calDays
  private readonly workoutsByDate = computed(() =>
    new Map(this.workoutSvc.workouts().map(w => [w.date, w]))
  );

  readonly weekDays = computed((): CalDay[] => {
    const monday  = this.weekStart();
    const today   = this.workoutSvc.todayDateString();
    const sel     = this.selectedDate() ?? null;
    const byDate  = this.workoutsByDate();
    const days: CalDay[] = [];
    for (let i = 0; i < 7; i++) {
      const dateStr = addDays(monday, i);
      const d = new Date(dateStr + 'T12:00:00');
      const w = byDate.get(dateStr);
      const sports = this.sportSvc.getSportsForDate(dateStr);
      days.push({
        date: dateStr, day: d.getDate(),
        hasWorkout: !!w,
        workoutCategories: w?.categories ?? (w?.category ? [w.category] : []),
        hasSport: sports.length > 0,
        sportColors: sports.map(s => s.color),
        sportIcons:  sports.map(s => s.icon),
        isToday:    dateStr === today,
        isFuture:   dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return days;
  });

  readonly calDays = computed((): (CalDay | null)[] => {
    const y      = this.calYear(), m = this.calMonth();
    const today  = this.workoutSvc.todayDateString();
    const sel    = this.selectedDate() ?? null;
    const byDate = this.workoutsByDate();

    const firstDay    = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const startPad    = (firstDay.getDay() + 6) % 7;

    const cells: (CalDay | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const w = byDate.get(dateStr);
      const sports = this.sportSvc.getSportsForDate(dateStr);
      cells.push({
        date: dateStr, day,
        hasWorkout: !!w,
        workoutCategories: w?.categories ?? (w?.category ? [w.category] : []),
        hasSport: sports.length > 0,
        sportColors: sports.map(s => s.color),
        sportIcons:  sports.map(s => s.icon),
        isToday:    dateStr === today,
        isFuture:   dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return cells;
  });

  // ── Navigation ────────────────────────────────────────────────────────────

  navBack(): void {
    if (this.expanded()) {
      let m = this.calMonth() - 1, y = this.calYear();
      if (m < 0) { m = 11; y--; }
      this.calMonth.set(m); this.calYear.set(y);
    } else {
      this.weekStart.set(addDays(this.weekStart(), -7));
    }
  }

  navForward(): void {
    if (this.expanded()) {
      let m = this.calMonth() + 1, y = this.calYear();
      if (m > 11) { m = 0; y++; }
      this.calMonth.set(m); this.calYear.set(y);
    } else {
      this.weekStart.set(addDays(this.weekStart(), 7));
    }
  }

  goToToday(): void {
    const now = new Date();
    this.weekStart.set(mondayOf(this.todayStr));
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

  selectDay(date: string): void {
    this.dateSelected.emit(date);
    if (this.expanded()) {
      this.weekStart.set(mondayOf(date));
      this.expanded.set(false);
    }
  }

  // ── Swipe to navigate weeks ───────────────────────────────────────────────

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

  // ── Weekly goal progress ──────────────────────────────────────────────────

  readonly weeklyGoal = computed(() =>
    this.settingsSvc.metricsEnabled() ? this.settingsSvc.weeklyActivityGoal() : null
  );
  readonly weeklyDone = computed(() =>
    this.weekDays().filter(d => !d.isFuture && (d.hasWorkout || d.hasSport)).length
  );
  readonly weeklyGoalMet = computed(() => {
    const g = this.weeklyGoal();
    return g !== null && this.weeklyDone() >= g;
  });
  readonly weeklyBarPct = computed(() => {
    const g = this.weeklyGoal();
    if (!g) return 0;
    return Math.min(100, Math.round((this.weeklyDone() / g) * 100));
  });

  // ── Dot helpers (delegate to shared utils) ────────────────────────────────

  readonly catDotBg   = catDotBackground;
  readonly sportDotBg = sportDotBackground;

  catColor(cat: string): string {
    return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#006874';
  }
}
