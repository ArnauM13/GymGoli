import { Component, computed, inject, input } from '@angular/core';

import { UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { addDays, mondayOf } from '../../../shared/utils/calendar-utils';

const TODAY = (): string => new Date().toISOString().split('T')[0];

const MONTHS_CA = ['gen', 'feb', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'des'];

@Component({
  selector: 'app-weekly-summary',
  standalone: true,
  template: `
    @if (show() && (weekBars().length > 0 || isFutureWeek())) {
      <div class="ws-strip">
        <div class="ws-header">
          <span class="ws-label">{{ weekLabel() }}</span>
        </div>
        @if (!isFutureWeek()) {
          @for (bar of weekBars(); track bar.icon) {
            <div class="ws-row" [class.ws-row--done]="bar.pct >= 100">
              <span class="material-symbols-outlined ws-icon">{{ bar.icon }}</span>
              <div class="ws-track">
                <div class="ws-fill" [style.width.%]="bar.pct"
                     [class.ws-fill--done]="bar.pct >= 100"></div>
              </div>
              <span class="ws-badge" [class.ws-badge--done]="bar.pct >= 100">
                {{ bar.done }}/{{ bar.target }}
              </span>
            </div>
          }
        } @else {
          <div class="ws-future">
            <span class="material-symbols-outlined ws-future-icon">calendar_month</span>
            <span>Objectiu: {{ totalGoal() }} activitat{{ totalGoal() === 1 ? '' : 's' }}</span>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .ws-strip {
      padding: 10px 14px;
      border-top: 1px solid var(--c-border-2);
      background: var(--c-card);
      display: flex; flex-direction: column; gap: 8px;
    }

    .ws-header {
      display: flex; align-items: center;
    }
    .ws-label {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.4px;
    }

    .ws-row {
      display: flex; align-items: center; gap: 8px;
    }

    .ws-icon {
      font-size: 14px; color: var(--c-text-3); flex-shrink: 0;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .ws-row--done .ws-icon {
      color: #43a047;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }

    .ws-track {
      flex: 1; height: 5px; background: var(--c-border); border-radius: 3px; overflow: hidden;
    }
    .ws-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--c-brand) 0%, color-mix(in srgb, var(--c-brand) 75%, white) 100%);
      border-radius: 3px; transition: width 0.4s ease; max-width: 100%;
      &.ws-fill--done { background: #43a047; }
    }

    .ws-badge {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      flex-shrink: 0; min-width: 28px; text-align: right;
    }
    .ws-badge--done { color: #43a047; }

    .ws-future {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--c-text-3);
    }
    .ws-future-icon { font-size: 14px; font-variation-settings: 'FILL' 0, 'wght' 300; }
  `],
})
export class WeeklySummaryComponent {
  /** Any date within the week to display. Defaults to today (current week). */
  readonly weekDate = input<string>(TODAY());

  private readonly workoutService  = inject(WorkoutService);
  private readonly sportService    = inject(SportService);
  private readonly settingsService = inject(UserSettingsService);

  readonly show = computed(() => this.settingsService.metricsEnabled() && this.settingsService.loaded());

  private readonly _today         = computed(() => TODAY());
  private readonly _monday        = computed(() => mondayOf(this.weekDate()));
  private readonly _currentMonday = computed(() => mondayOf(this._today()));

  readonly isCurrentWeek = computed(() => this._monday() === this._currentMonday());
  readonly isPastWeek    = computed(() => this._monday() < this._currentMonday());
  readonly isFutureWeek  = computed(() => this._monday() > this._currentMonday());

  private readonly _weekDates = computed((): string[] =>
    Array.from({ length: 7 }, (_, i) => addDays(this._monday(), i))
  );

  readonly weekLabel = computed(() => {
    if (this.isCurrentWeek()) return 'Aquesta setmana';
    const monday = this._monday();
    const sunday = addDays(monday, 6);
    const d1 = new Date(monday + 'T00:00:00');
    const d2 = new Date(sunday + 'T00:00:00');
    const d1Day = d1.getDate();
    const d2Day = d2.getDate();
    const d1Mon = MONTHS_CA[d1.getMonth()];
    const d2Mon = MONTHS_CA[d2.getMonth()];
    if (d1.getMonth() === d2.getMonth()) return `${d1Day}–${d2Day} ${d2Mon}`;
    return `${d1Day} ${d1Mon} – ${d2Day} ${d2Mon}`;
  });

  readonly weekBars = computed(() => {
    const s     = this.settingsService.settings();
    const days  = this._weekDates();
    const today = this._today();

    // Past weeks: count all 7 days; current: up to today; future: nothing yet
    const doneDays = this.isPastWeek()   ? days
                   : this.isFutureWeek() ? []
                   : days.filter(d => d <= today);

    const mk = (icon: string, done: number, target: number) => ({
      icon, done, target: Math.max(1, target),
      pct: Math.min(100, Math.round(done / Math.max(1, target) * 100)),
    });

    if (s.goalMode === 'combined' || !s.goalMode) {
      const total = s.weeklyActivityGoal;
      if (!total) return [];
      const activeDays = doneDays.filter(d =>
        this.workoutService.getDoneWorkoutsForDate(d).length > 0 ||
        this.sportService.getSportSessionsForDate(d).length > 0
      ).length;
      const fitnessGoal = this.settingsService.fitnessGoal();
      const iconMap: Record<string, string> = {
        strength: 'fitness_center', fitness: 'directions_run',
        weight: 'monitor_weight',   sport: 'sports_soccer',
      };
      const icon = fitnessGoal ? (iconMap[fitnessGoal] ?? 'directions_run') : 'directions_run';
      return [mk(icon, activeDays, total)];
    }

    const gymGoal   = s.weeklyGymGoal;
    const sportGoal = s.weeklySportGoal;
    const gymDone   = doneDays.reduce((acc, d) => acc + this.workoutService.getDoneWorkoutsForDate(d).length, 0);
    const spDone    = doneDays.reduce((acc, d) => acc + this.sportService.getSportSessionsForDate(d).length, 0);
    const bars = [];
    if (gymGoal)   bars.push(mk('fitness_center', gymDone, gymGoal));
    if (sportGoal) bars.push(mk('sports_soccer',  spDone,  sportGoal));
    return bars;
  });

  readonly totalGoal = computed(() => this.weekBars().reduce((s, b) => s + b.target, 0));
}
