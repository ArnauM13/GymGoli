import { Component, computed, inject } from '@angular/core';

import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, ExerciseCategory } from '../../../core/models/exercise.model';
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
      <div class="ws-card">

        <!-- Header: progrés general -->
        <div class="ws-header">
          <div class="ws-header-left">
            <span class="ws-title">Aquesta setmana</span>
            <span class="ws-sub">{{ weekRangeLabel() }}</span>
          </div>
          <div class="ws-count-badge" [class.ws-count-badge--done]="goalMet()">
            <span class="ws-count-num">{{ totalDone() }}</span>
            @if (goal()) {
              <span class="ws-count-sep">/</span>
              <span class="ws-count-goal">{{ goal() }}</span>
            }
            <span class="ws-count-icon material-symbols-outlined">
              {{ goalMet() ? 'check_circle' : 'directions_run' }}
            </span>
          </div>
        </div>

        <!-- Barra de progrés -->
        @if (goal()) {
          <div class="ws-bar-track">
            <div class="ws-bar-fill" [style.width.%]="barPct()"></div>
          </div>
        }

        <!-- Desglossat: dies i categories -->
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

        <!-- Missatge motivacional -->
        @if (message()) {
          <div class="ws-message">{{ message() }}</div>
        }

      </div>
    }
  `,
  styles: [`
    .ws-card {
      margin: 0 16px 0;
      padding: 14px 14px 12px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    }

    .ws-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;
    }
    .ws-header-left { display: flex; flex-direction: column; gap: 2px; }
    .ws-title { font-size: 14px; font-weight: 700; color: var(--c-text); }
    .ws-sub   { font-size: 11px; color: var(--c-text-3); }

    .ws-count-badge {
      display: flex; align-items: center; gap: 3px;
      padding: 5px 10px; border-radius: 20px;
      background: var(--c-subtle); border: 1.5px solid var(--c-border);
    }
    .ws-count-num  { font-size: 18px; font-weight: 800; color: var(--c-text); line-height: 1; }
    .ws-count-sep  { font-size: 13px; color: var(--c-text-3); }
    .ws-count-goal { font-size: 13px; color: var(--c-text-3); font-weight: 600; }
    .ws-count-icon { font-size: 16px; color: var(--c-text-3); margin-left: 2px;
                     font-variation-settings: 'FILL' 0, 'wght' 300; }
    .ws-count-badge--done {
      background: rgba(0,104,116,0.08); border-color: rgba(0,104,116,0.3);
      .ws-count-num  { color: var(--c-brand); }
      .ws-count-icon { color: var(--c-brand); font-variation-settings: 'FILL' 1, 'wght' 400; }
    }

    .ws-bar-track {
      height: 5px; background: var(--c-border); border-radius: 3px;
      overflow: hidden; margin-bottom: 12px;
    }
    .ws-bar-fill {
      height: 100%; background: var(--c-brand); border-radius: 3px;
      transition: width 0.4s ease;
      max-width: 100%;
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
      margin-top: 10px; padding: 8px 10px;
      background: rgba(0,104,116,0.06); border-radius: 10px;
      font-size: 12px; color: var(--c-text-2); line-height: 1.4;
      border: 1px solid rgba(0,104,116,0.12);
    }
  `],
})
export class WeeklySummaryComponent {
  private workoutService  = inject(WorkoutService);
  private sportService    = inject(SportService);
  private settingsService = inject(UserSettingsService);

  readonly show = computed(() => this.settingsService.metricsEnabled() && this.settingsService.loaded());
  readonly goal = computed(() => this.settingsService.weeklyActivityGoal());

  private readonly _weekDates = computed((): string[] => {
    const monday = mondayOf(TODAY());
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  });

  readonly weekDays = computed(() => {
    const dates   = this._weekDates();
    const today   = TODAY();
    const sports  = this.sportService.sports();
    const DOW_CA  = ['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'];

    return dates.map((date, i) => {
      const workouts    = this.workoutService.getWorkoutsForDate(date);
      const sessionSports = this.sportService.getSportsForDate(date);
      const gymCats     = [...new Set(workouts.flatMap(w => workoutCategories(w)))];

      return {
        date,
        dow:         DOW_CA[i],
        isToday:     date === today,
        isFuture:    date > today,
        gymCats,
        sportIcons:  sessionSports.map(s => s.icon),
        sportColors: sessionSports.map(s => s.color),
      };
    });
  });

  readonly totalDone = computed(() =>
    this.weekDays().filter(d => !d.isFuture && (d.gymCats.length > 0 || d.sportIcons.length > 0)).length
  );

  readonly goalMet = computed(() => {
    const g = this.goal();
    return g !== null && this.totalDone() >= g;
  });

  readonly barPct = computed(() => {
    const g = this.goal();
    if (!g) return 0;
    return Math.min(100, Math.round((this.totalDone() / g) * 100));
  });

  readonly weekRangeLabel = computed(() => {
    const dates = this._weekDates();
    const fmt = (d: string) => {
      const dt = new Date(d + 'T12:00:00');
      return `${dt.getDate()}/${dt.getMonth() + 1}`;
    };
    return `${fmt(dates[0])} – ${fmt(dates[6])}`;
  });

  readonly message = computed(() => {
    const done = this.totalDone();
    const goal = this.goal();
    const days = this.weekDays();
    const daysLeft = days.filter(d => d.isFuture).length;

    if (goal !== null && done >= goal) return '🎯 Objectiu setmanal assolit!';
    if (done === 0 && daysLeft <= 4) return 'Encara no has entrenat aquesta setmana. Endavant!';
    if (goal !== null && daysLeft > 0 && (goal - done) <= daysLeft) return `${goal - done} activitat${goal - done === 1 ? '' : 's'} més per arribar a l'objectiu.`;
    return null;
  });

  catColor(cat: string): string {
    return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#006874';
  }
}
