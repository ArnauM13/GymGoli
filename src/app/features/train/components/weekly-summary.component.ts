import { Component, OnChanges, computed, inject, input, signal } from '@angular/core';

import { GoalSnapshot, UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { addDays, mondayOf } from '../../../shared/utils/calendar-utils';

const TODAY = (): string => new Date().toISOString().split('T')[0];

@Component({
  selector: 'app-weekly-summary',
  standalone: true,
  template: `
    @if (show() && weekBars().length > 0) {
      <div class="ws-strip">
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
  `],
})
export class WeeklySummaryComponent implements OnChanges {
  /** A date within the week to display. Defaults to today's week when omitted. */
  readonly weekDate = input<string>();

  private readonly workoutService  = inject(WorkoutService);
  private readonly sportService    = inject(SportService);
  private readonly settingsService = inject(UserSettingsService);

  readonly show = computed(() => this.settingsService.metricsEnabled() && this.settingsService.loaded());

  private readonly _goals = signal<GoalSnapshot | null>(null);

  private _lastMonday = '';

  ngOnChanges(): void {
    const monday = mondayOf(this.weekDate() ?? TODAY());
    if (monday !== this._lastMonday) {
      this._lastMonday = monday;
      this._loadGoals(monday);
    }
  }

  private async _loadGoals(monday: string): Promise<void> {
    const snapshot = await this.settingsService.getGoalsForWeek(monday);
    this._goals.set(snapshot);
  }

  private readonly _weekDates = computed((): string[] => {
    const monday = mondayOf(this.weekDate() ?? TODAY());
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  });

  readonly weekBars = computed(() => {
    const g = this._goals();
    if (!g) {
      // fallback to current settings while loading
      const s = this.settingsService.settings();
      return this._computeBars({
        goalMode:           s.goalMode ?? 'combined',
        weeklyActivityGoal: s.weeklyActivityGoal ?? null,
        weeklyGymGoal:      s.weeklyGymGoal ?? null,
        weeklySportGoal:    s.weeklySportGoal ?? null,
      });
    }
    return this._computeBars(g);
  });

  private _computeBars(g: GoalSnapshot): Array<{ icon: string; done: number; target: number; pct: number }> {
    const days    = this._weekDates();
    const today   = TODAY();
    const doneDays = days.filter(d => d <= today);

    const mk = (icon: string, done: number, target: number) => ({
      icon, done, target: Math.max(1, target),
      pct: Math.min(100, Math.round(done / Math.max(1, target) * 100)),
    });

    if (g.goalMode === 'combined' || !g.goalMode) {
      const total = g.weeklyActivityGoal;
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

    const gymDone = doneDays.reduce((acc, d) => acc + this.workoutService.getDoneWorkoutsForDate(d).length, 0);
    const spDone  = doneDays.reduce((acc, d) => acc + this.sportService.getSportSessionsForDate(d).length, 0);
    const bars = [];
    if (g.weeklyGymGoal)   bars.push(mk('fitness_center', gymDone, g.weeklyGymGoal));
    if (g.weeklySportGoal) bars.push(mk('sports_soccer',  spDone,  g.weeklySportGoal));
    return bars;
  }
}
