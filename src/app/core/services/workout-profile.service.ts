import { Injectable, computed, effect, inject } from '@angular/core';

import { ExerciseCategory } from '../models/exercise.model';
import { Sport } from '../models/sport.model';
import { UserSettingsService } from './user-settings.service';
import { SportService } from './sport.service';
import { TrainingTypeService } from './training-type.service';
import { WorkoutService } from './workout.service';
import { workoutCategories } from '../../shared/utils/calendar-utils';

const TODAY = (): string => new Date().toISOString().split('T')[0];

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000
  );
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export interface CategoryProfile {
  /** Days since the last session of this category. 99 if never done. */
  daysSinceLast: number;
  /** User's computed average gap between consecutive sessions (days). */
  typicalGapDays: number;
  /** daysSinceLast / typicalGapDays. >1 = overdue, >1.5 = significantly overdue. */
  overdueScore: number;
}

export interface WorkoutProfile {
  gym:           Record<ExerciseCategory, CategoryProfile>;
  /** Sport the user has done most in the last 30 days. */
  favoriteSport: Sport | null;
  /** Sport from the most recent session ever. */
  recentSport:   Sport | null;
  /** Minimum days that must pass before the same category is suggested again. */
  minRecovery:   number;
}

// Goal-based defaults when history is insufficient
const GOAL_DEFAULT_GAP: Record<string, number> = {
  strength: 4, fitness: 3, weight: 3, sport: 5,
};
const GOAL_MIN_RECOVERY: Record<string, number> = {
  strength: 2, fitness: 1, weight: 1, sport: 1,
};

@Injectable({ providedIn: 'root' })
export class WorkoutProfileService {
  private workoutService  = inject(WorkoutService);
  private sportService    = inject(SportService);
  private settingsService = inject(UserSettingsService);
  private trainingTypeService = inject(TrainingTypeService);

  constructor() {
    // "Days since last <category>" is only right if the *whole* history is
    // loaded. Otherwise a category last trained in an earlier month (not yet
    // in the lazy month cache) looks like it was never trained. `workouts()`
    // is read so this re-runs after a login clears the cache; loadAllWorkouts
    // is guarded so it runs a single query per session.
    effect(() => {
      this.workoutService.workouts();
      this.workoutService.loadAllWorkouts();
    });
    // Same reasoning for the "recent sport" recency: without the full history
    // the last sport session may live in an unloaded month.
    effect(() => {
      this.sportService.sessions();
      this.sportService.loadAllSessions();
    });
  }

  readonly profile = computed((): WorkoutProfile => {
    const today       = TODAY();
    const workouts    = this.workoutService.doneWorkouts();
    const sessions    = this.sportService.sessions();
    const sports      = this.sportService.sports();
    const goal        = this.settingsService.fitnessGoal() ?? 'strength';
    const defaultGap  = GOAL_DEFAULT_GAP[goal] ?? 4;
    const minRecovery = GOAL_MIN_RECOVERY[goal] ?? 2;

    const gym = {} as Record<ExerciseCategory, CategoryProfile>;

    // Reads the types signal so the profile recomputes when the user adds,
    // edits or removes a training type.
    const gymCats = this.trainingTypeService.types().map(t => t.id);
    for (const cat of gymCats) {
      // All past dates when this category was trained, sorted newest first
      const catDates = workouts
        .filter(w => workoutCategories(w).includes(cat))
        .map(w => w.date)
        .sort((a, b) => b.localeCompare(a));

      const daysSinceLast = catDates.length > 0
        ? daysBetween(catDates[0], today)
        : 99;

      // Derive the user's typical training gap from up to 10 consecutive sessions.
      // Gaps > 14 days are ignored (likely training breaks, not the real cycle).
      let typicalGapDays = defaultGap;
      if (catDates.length >= 2) {
        const gaps: number[] = [];
        for (let i = 0; i < Math.min(catDates.length - 1, 10); i++) {
          const gap = daysBetween(catDates[i + 1], catDates[i]);
          if (gap > 0 && gap <= 14) gaps.push(gap);
        }
        if (gaps.length >= 1) {
          typicalGapDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
        }
      }

      typicalGapDays = Math.max(typicalGapDays, minRecovery);
      gym[cat] = {
        daysSinceLast,
        typicalGapDays,
        overdueScore: daysSinceLast / Math.max(typicalGapDays, 1),
      };
    }

    // Favorite sport = most sessions in the last 30 days
    const last30 = offsetDate(today, -30);
    const recentSessions = sessions.filter(s => s.date >= last30 && s.date <= today);
    const sportCounts = new Map<string, number>();
    for (const s of recentSessions) {
      sportCounts.set(s.sportId, (sportCounts.get(s.sportId) ?? 0) + 1);
    }
    let favId = '', favCount = 0;
    for (const [id, count] of sportCounts) {
      if (count > favCount) { favCount = count; favId = id; }
    }
    const favoriteSport = sports.find(s => s.id === favId) ?? sports[0] ?? null;

    // Recent sport = the sport from the last session ever
    const lastSession = [...sessions].sort((a, b) => b.date.localeCompare(a.date))[0];
    const recentSport = lastSession
      ? (sports.find(s => s.id === lastSession.sportId) ?? null)
      : null;

    return { gym, favoriteSport, recentSport, minRecovery };
  });
}
