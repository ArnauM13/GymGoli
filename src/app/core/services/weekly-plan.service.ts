import { Injectable, inject } from '@angular/core';

import { AuthService } from './auth.service';
import { UserSettingsService } from './user-settings.service';
import { WorkoutService } from './workout.service';
import { SportService } from './sport.service';
import { addDays, mondayOf, workoutCategories } from '../../shared/utils/calendar-utils';
import { WeeklyPlan } from '../models/weekly-plan.model';

export const WEEKS_SINGLE    = 1;
export const WEEKS_RECURRING = 8;

const TODAY = (): string => new Date().toISOString().split('T')[0];

/**
 * Materializes a weekly plan template into real planned workouts / sport
 * sessions, using the exact same creation calls as the manual "plan a
 * future day" flow in TrainComponent — so entries show up on the calendar
 * indistinguishable from anything the user scheduled themselves.
 */
@Injectable({ providedIn: 'root' })
export class WeeklyPlanService {
  private auth            = inject(AuthService);
  private settingsService = inject(UserSettingsService);
  private workoutService  = inject(WorkoutService);
  private sportService    = inject(SportService);

  private _toppedUpForUid: string | null = null;

  async apply(plan: WeeklyPlan, weeks: number): Promise<void> {
    const hasAnyItem = plan.days.some(items => items.length > 0);
    if (!hasAnyItem) return;

    const today  = TODAY();
    const monday = mondayOf(today);

    const months = new Set<string>();
    for (let i = 0; i < weeks * 7; i++) months.add(addDays(monday, i).substring(0, 7));

    await Promise.allSettled([...months].flatMap(key => {
      const [year, month] = key.split('-').map(Number);
      return [
        this.workoutService.ensureMonthLoaded(year, month - 1),
        this.sportService.ensureMonthLoaded(year, month - 1),
      ];
    }));

    for (let w = 0; w < weeks; w++) {
      for (let dow = 0; dow < 7; dow++) {
        const date = addDays(monday, w * 7 + dow);
        if (date < today) continue;

        for (const item of plan.days[dow]) {
          try {
            if (item.type === 'gym') {
              const already =
                this.workoutService.getPlannedForDate(date).some(x => workoutCategories(x).includes(item.category)) ||
                this.workoutService.getDoneWorkoutsForDate(date).some(x => workoutCategories(x).includes(item.category));
              if (!already) await this.workoutService.createPlannedWorkout(date, item.category, []);
            } else {
              const existing = this.sportService.getSessionForDate(date, item.sportId);
              if (!existing) await this.sportService.logSession(date, item.sportId, {}, 'planned');
            }
          } catch {
            // One item's creation failing (e.g. transient network error) shouldn't
            // abort the rest of the plan — gym/sport creation are already local-first.
          }
        }
      }
    }
  }

  /**
   * Keeps a recurring plan's horizon topped up so the "fixed weekly
   * routine" keeps producing planned workouts without the user having to
   * revisit the planner. Safe to call repeatedly — creation is idempotent
   * and this only runs once per authenticated session.
   */
  async ensureRecurringApplied(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || this._toppedUpForUid === uid) return;
    const plan = this.settingsService.weeklyPlan();
    if (!plan.recurring) return;
    this._toppedUpForUid = uid;
    try {
      await this.apply(plan, WEEKS_RECURRING);
    } catch {
      this._toppedUpForUid = null;
    }
  }
}
