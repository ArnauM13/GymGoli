import { Component, computed, inject } from '@angular/core';

import { CATEGORY_COLORS, CATEGORY_ICONS, ExerciseCategory } from '../../../core/models/exercise.model';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { addDays, mondayOf, workoutCategories } from '../../../shared/utils/calendar-utils';

const TODAY = (): string => new Date().toISOString().split('T')[0];

@Component({
  selector: 'app-weekly-summary',
  standalone: true,
  template: `
    @if (show()) {
      <div class="ws-strip">

        <div class="ws-header">
          <span class="ws-title">Aquesta setmana</span>
          @if (weekBars().length > 0) {
            <div class="ws-count-badge" [class.ws-count-badge--done]="allMet()">
              <span class="ws-count-num">{{ totalActive() }}</span>
              <span class="ws-count-sep">/</span>
              <span class="ws-count-goal">{{ totalGoal() }}</span>
              <span class="ws-count-icon material-symbols-outlined">
                {{ allMet() ? 'check_circle' : 'directions_run' }}
              </span>
            </div>
          }
        </div>

        @if (weekBars().length > 0) {
          <div class="ws-bars">
            @for (bar of weekBars(); track bar.icon) {
              <div class="ws-bar-track">
                <div class="ws-bar-fill" [style.width.%]="bar.pct"
                     [class.ws-bar-fill--done]="bar.pct >= 100"></div>
              </div>
            }
          </div>
        }

        <div class="ws-days">
          @for (day of weekDays(); track day.date) {
            <div class="ws-day" [class.ws-day--today]="day.isToday" [class.ws-day--future]="day.isFuture">
              <span class="ws-day-label">{{ day.dow }}</span>
              <div class="ws-day-pips">
                @for (cat of day.gymCats; track cat) {
                  <span class="ws-pip" [style.background]="catColor(cat)"></span>
                }
                @for (icon of day.sportIcons.slice(0, 2); track icon; let i = $index) {
                  <span class="ws-sport-icon material-symbols-outlined"
                        [style.color]="day.sportColors[i]">{{ icon }}</span>
                }
                @if (!day.gymCats.length && !day.sportIcons.length && !day.isFuture) {
                  <span class="ws-pip ws-pip--empty"></span>
                }
              </div>
            </div>
          }
        </div>

        @if (message()) {
          <div class="ws-message">{{ message() }}</div>
        }

      </div>
    }
  `,
  styles: [`
    .ws-strip {
      padding: 10px 14px 12px;
      border-top: 1px solid var(--c-border-2);
      background: var(--c-card);
    }

    .ws-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
    }
    .ws-title { font-size: 13px; font-weight: 700; color: var(--c-text-2); }

    .ws-count-badge {
      display: flex; align-items: center; gap: 3px;
      padding: 3px 8px; border-radius: 20px;
      background: var(--c-subtle); border: 1.5px solid var(--c-border);
    }
    .ws-count-num  { font-size: 15px; font-weight: 800; color: var(--c-text); line-height: 1; }
    .ws-count-sep  { font-size: 11px; color: var(--c-text-3); }
    .ws-count-goal { font-size: 11px; color: var(--c-text-3); font-weight: 600; }
    .ws-count-icon {
      font-size: 13px; color: var(--c-text-3); margin-left: 2px;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .ws-count-badge--done {
      background: rgba(0,104,116,0.08); border-color: rgba(0,104,116,0.3);
      .ws-count-num  { color: var(--c-brand); }
      .ws-count-icon { color: var(--c-brand); font-variation-settings: 'FILL' 1, 'wght' 400; }
    }

    .ws-bars {
      display: flex; gap: 4px; margin-bottom: 10px;
    }
    .ws-bar-track {
      flex: 1; height: 4px; background: var(--c-border); border-radius: 3px;
      overflow: hidden;
    }
    .ws-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--c-brand) 0%, color-mix(in srgb, var(--c-brand) 75%, white) 100%);
      border-radius: 3px; transition: width 0.4s ease; max-width: 100%;
      &.ws-bar-fill--done { background: #43a047; }
    }

    .ws-days {
      display: flex; gap: 4px; justify-content: space-between;
    }
    .ws-day {
      flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
    }
    .ws-day-label {
      font-size: 10px; font-weight: 600; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px;
    }
    .ws-day--today .ws-day-label { color: var(--c-brand); }
    .ws-day--future { opacity: 0.4; }
    .ws-day-pips { display: flex; flex-wrap: wrap; gap: 3px; justify-content: center; min-height: 14px; }

    .ws-pip {
      width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0;
      &.ws-pip--empty { background: var(--c-border); border-radius: 50%; opacity: 0.5; }
    }
    .ws-sport-icon {
      font-size: 11px; line-height: 1;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }

    .ws-message {
      margin-top: 8px; padding: 7px 10px;
      background: rgba(0,104,116,0.06); border-radius: 8px;
      font-size: 11px; color: var(--c-text-2); line-height: 1.4;
      border: 1px solid rgba(0,104,116,0.12);
    }
  `],
})
export class WeeklySummaryComponent {
  private readonly workoutService  = inject(WorkoutService);
  private readonly sportService    = inject(SportService);
  private readonly settingsService = inject(UserSettingsService);

  readonly show = computed(() => this.settingsService.metricsEnabled() && this.settingsService.loaded());

  private readonly _monday = computed(() => mondayOf(TODAY()));

  private readonly _weekDates = computed((): string[] =>
    Array.from({ length: 7 }, (_, i) => addDays(this._monday(), i))
  );

  readonly weekBars = computed(() => {
    const s     = this.settingsService.settings();
    const days  = this._weekDates();
    const today = TODAY();
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

  readonly totalActive = computed(() => this.weekBars().reduce((s, b) => s + b.done, 0));
  readonly totalGoal   = computed(() => this.weekBars().reduce((s, b) => s + b.target, 0));
  readonly allMet      = computed(() => this.weekBars().length > 0 && this.weekBars().every(b => b.pct >= 100));

  readonly weekDays = computed(() => {
    const dates  = this._weekDates();
    const today  = TODAY();
    const DOW_CA = ['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'];
    return dates.map((date, i) => {
      const workouts      = this.workoutService.getDoneWorkoutsForDate(date);
      const sessionSports = this.sportService.getSportsForDate(date);
      return {
        date,
        dow:         DOW_CA[i],
        isToday:     date === today,
        isFuture:    date > today,
        gymCats:     [...new Set(workouts.flatMap(w => workoutCategories(w)))],
        sportIcons:  sessionSports.map(s => s.icon),
        sportColors: sessionSports.map(s => s.color),
      };
    });
  });

  readonly message = computed(() => {
    const bars     = this.weekBars();
    if (!bars.length) return null;
    const daysLeft = this.weekDays().filter(d => d.isFuture).length;
    if (this.allMet()) return '🎯 Objectiu setmanal assolit!';
    const remaining = bars.reduce((s, b) => s + Math.max(0, b.target - b.done), 0);
    if (remaining > 0 && daysLeft > 0 && remaining <= daysLeft)
      return `${remaining} activitat${remaining === 1 ? '' : 's'} més per arribar a l'objectiu.`;
    if (bars[0].done === 0 && daysLeft <= 4) return 'Encara no has entrenat aquesta setmana. Endavant!';
    return null;
  });

  catColor(cat: string): string {
    return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#006874';
  }
}
