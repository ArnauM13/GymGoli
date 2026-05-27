import { Component, computed, inject, input } from '@angular/core';

import { UserSettingsService } from '../../../core/services/user-settings.service';
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
export class WeeklySummaryComponent {
  private readonly workoutService  = inject(WorkoutService);
  private readonly sportService    = inject(SportService);
  private readonly settingsService = inject(UserSettingsService);

  /** The date whose week should be shown. Defaults to today. */
  readonly weekDate = input<string | null>(null);

  readonly show = computed(() => this.settingsService.metricsEnabled() && this.settingsService.loaded());

  private readonly _weekDates = computed((): string[] => {
    const monday = mondayOf(this.weekDate() ?? TODAY());
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  });

  readonly weekBars = computed(() => {
    const s        = this.settingsService.settings();
    const days     = this._weekDates();
    const today    = TODAY();
    const doneDays = days.filter(d => d <= today);

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
}
