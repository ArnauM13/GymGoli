import { Component, computed, inject, input } from '@angular/core';

import { MASCOTS, Mascot, MascotMeta } from '../../../core/models/mascot.model';
import { FitnessMetricsService } from '../../../core/services/fitness-metrics.service';
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
            <span class="ws-dogs" aria-hidden="true">
              @for (m of dogsOf(bar.mascot); track m.name) {
                <img class="ws-dog" [src]="m.avatar" alt="">
              }
            </span>
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

        <!-- ── Ratxa: setmanes seguides assolint l'objectiu ── -->
        @if (streak(); as n) {
          <div class="ws-streak">
            <span class="ws-dogs" aria-hidden="true">
              <img class="ws-dog" [src]="marley.avatar" alt="">
              <img class="ws-dog" [src]="xoco.avatar" alt="">
            </span>
            <span class="ws-streak-text">
              <strong>{{ n }} setmanes</strong> seguides
            </span>
            <span class="material-symbols-outlined ws-streak-icon" aria-hidden="true">local_fire_department</span>
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

    /* Els gossos van a l'esquerra i la icona d'activitat es queda on era:
     * ells diuen qui t'acompanya, la icona segueix dient de què és la barra. */
    .ws-dogs { display: flex; align-items: center; flex-shrink: 0; }

    .ws-dog {
      width: 20px; height: 20px; border-radius: 50%;
      object-fit: cover; display: block;
      border: 1.5px solid var(--c-card);
      &:not(:first-child) { margin-left: -8px; }
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

    /* La ratxa és l'únic lloc fix on surten tots dos: és el missatge més
     * transversal que hi ha. Comparteix la mateixa alçada que una barra. */
    .ws-streak {
      display: flex; align-items: center; gap: 8px;
      padding-top: 2px;
    }

    .ws-streak-text {
      flex: 1; min-width: 0;
      font-size: 11px; font-weight: 500; color: var(--c-text-3);
      strong { font-weight: 800; color: var(--c-text-2); }
    }

    .ws-streak-icon {
      font-size: 14px; color: #e65100; flex-shrink: 0;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
  `],
})
export class WeeklySummaryComponent {
  private readonly workoutService  = inject(WorkoutService);
  private readonly sportService    = inject(SportService);
  private readonly settingsService = inject(UserSettingsService);
  private readonly metricsService  = inject(FitnessMetricsService);

  readonly marley = MASCOTS.marley;
  readonly xoco   = MASCOTS.xoco;

  /** `both` es pinta com els dos avatars encavalcats. */
  dogsOf(mascot: Mascot): MascotMeta[] {
    return mascot === 'both' ? [MASCOTS.marley, MASCOTS.xoco] : [MASCOTS[mascot]];
  }

  /** The date whose week should be shown. Defaults to today. */
  readonly weekDate = input<string | null>(null);

  /**
   * Setmanes seguides assolint l'objectiu, o `null` si no n'hi ha prou per
   * cantar-ho. Amb 1 setmana encara no hi ha ratxa, i mirant una setmana
   * passada la ratxa d'avui no vol dir res, així que només surt a l'actual.
   */
  readonly streak = computed((): number | null => {
    const viewed = mondayOf(this.weekDate() ?? TODAY());
    if (viewed !== mondayOf(TODAY())) return null;

    const n = this.metricsService.goalStreak();
    return n >= 2 ? n : null;
  });

  // The weekly-goal progress strip is tied to having a goal, not to the
  // personalised-insights toggle — the two are separate features.
  readonly show = computed(() => this.settingsService.hasWeeklyGoal() && this.settingsService.loaded());

  private readonly _weekDates = computed((): string[] => {
    const monday = mondayOf(this.weekDate() ?? TODAY());
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  });

  readonly weekBars = computed(() => {
    const s        = this.settingsService.settings();
    const days     = this._weekDates();
    const today    = TODAY();
    const doneDays = days.filter(d => d <= today);

    const mk = (icon: string, done: number, target: number, mascot: Mascot) => ({
      icon, done, target: Math.max(1, target), mascot,
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
      // Objectiu combinat: la barra compta gym i esport alhora, així que hi
      // van tots dos.
      return [mk(icon, activeDays, total, 'both')];
    }

    const gymGoal   = s.weeklyGymGoal;
    const sportGoal = s.weeklySportGoal;
    const gymDone   = doneDays.reduce((acc, d) => acc + this.workoutService.getDoneWorkoutsForDate(d).length, 0);
    const spDone    = doneDays.reduce((acc, d) => acc + this.sportService.getSportSessionsForDate(d).length, 0);
    const bars = [];
    if (gymGoal)   bars.push(mk('fitness_center', gymDone, gymGoal, 'marley'));
    if (sportGoal) bars.push(mk('sports_soccer',  spDone,  sportGoal, 'xoco'));
    return bars;
  });
}
