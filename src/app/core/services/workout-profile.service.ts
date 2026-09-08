import { Injectable, computed, effect, inject } from '@angular/core';

import { ExerciseCategory } from '../models/exercise.model';
import { Sport } from '../models/sport.model';
import { AuthService } from './auth.service';
import { UserSettingsService } from './user-settings.service';
import { SportService } from './sport.service';
import { TrainingTypeService } from './training-type.service';
import { WorkoutService } from './workout.service';
import { workoutCategories } from '../../shared/utils/calendar-utils';
import { toDateStr, todayStr } from '../../shared/utils/date.utils';

const TODAY = (): string => todayStr();

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000
  );
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
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
  private auth            = inject(AuthService);

  constructor() {
    // «Dies des de l'últim <tipus>» necessita mirar enrere, i abans això volia
    // dir **tot l'historial**: el resum de cada entrenament de tota la vida de
    // l'usuari, més totes les sessions d'esport senceres, demanat en entrar i
    // per a tothom, l'hagués de mirar o no. Era la petició més cara de
    // l'arrencada, i a més deixava `allSessionsLoaded` encès, cosa que feia
    // que cada tornada a l'app en tornés a baixar una còpia.
    //
    // Amb la finestra recent n'hi ha prou, i és la que ja hi és per als altres
    // motius: aquest perfil no distingeix entre «fa 95 dies» i «no ho has fet
    // mai» —les dues coses es tallen a 99 i donen la mateixa suggerència— i
    // tres mesos de sessions són de sobres per calcular la cadència d'algú que
    // entrena. Qui entrena menys d'un cop cada tres mesos ja surt com a
    // «encara no l'has entrenat», que és exactament el que vol dir.
    //
    // Es mira `uid()` i no la llista d'entrenaments: llegint la llista, cada
    // fila que arribava tornava a disparar l'efecte.
    effect(() => {
      if (!this.auth.uid()) return;
      void this.workoutService.ensureRecentWindow();
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
