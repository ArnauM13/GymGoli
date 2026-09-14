import { Injectable, computed, effect, inject } from '@angular/core';

import { ExerciseCategory } from '../models/exercise.model';
import { ActivityCadence, ActivityCadenceService } from './activity-cadence.service';
import { AuthService } from './auth.service';
import { UserSettingsService } from './user-settings.service';
import { SportService } from './sport.service';
import { TrainingTypeService } from './training-type.service';
import { WorkoutService } from './workout.service';
import { workoutCategories } from '../../shared/utils/calendar-utils';
import { todayStr } from '../../shared/utils/date.utils';

const TODAY = (): string => todayStr();

/** El valor de «no consta»: ni a la finestra recent ni a l'historial. */
export const NEVER_DAYS = 99;

/** Un salt més llarg que això no és la teva cadència, és una aturada. */
const MAX_GAP_DAYS = 14;

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000
  );
}

/**
 * Com et portes amb una activitat: un tipus d'entrenament o un esport. La
 * forma és la mateixa per als dos perquè la pregunta és la mateixa —«et toca?»,
 * «fa temps que no hi tornes?»— i respondre-la de dues maneres era el que feia
 * que l'esport anés coix: vegeu `train-suggestion.util.ts`.
 */
export interface ActivityProfile {
  /** Dies des de l'última. `NEVER_DAYS` si no en consta cap. */
  daysSinceLast: number;
  /** Cada quant la fas, en dies. */
  typicalGapDays: number;
  /** daysSinceLast / typicalGapDays. >1 = et toca, >1.5 = fa dies que et toca. */
  overdueScore: number;
  /** L'has fet alguna vegada. Ho diu l'historial sencer (migració 038), no la
   *  finestra recent: sense això, el pàdel de fa mig any i un esport que no has
   *  tocat mai es llegeixen igual. */
  everDone: boolean;
  /** Quantes n'has fet de sempre, si el servidor ho ha pogut dir. */
  sessions: number;
}

export interface WorkoutProfile {
  /** Per tipus d'entrenament (inclosos els que s'ha fet l'usuari: una classe
   *  del gimnàs és un tipus com qualsevol altre). */
  gym:           Record<ExerciseCategory, ActivityProfile>;
  /** Per id d'esport. */
  sport:         Record<string, ActivityProfile>;
  /** Minimum days that must pass before the same activity is suggested again. */
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
  private cadenceService  = inject(ActivityCadenceService);
  private auth            = inject(AuthService);

  constructor() {
    // «Dies des de l'últim <tipus>» necessita mirar enrere, i abans això volia
    // dir **tot l'historial**: el resum de cada entrenament de tota la vida de
    // l'usuari, més totes les sessions d'esport senceres, demanat en entrar i
    // per a tothom, l'hagués de mirar o no. Era la petició més cara de
    // l'arrencada, i a més deixava l'app en mode «ja ho tinc tot», cosa que
    // feia que cada tornada a l'app en tornés a baixar una còpia.
    //
    // Amb la finestra recent n'hi ha prou per a la cadència de qui entrena
    // ara, i el que queda fora —què vas deixar de fer, i quan— es demana
    // agregat: una fila per activitat (`ActivityCadenceService`), no un tros
    // més d'historial.
    //
    // Es mira `uid()` i no la llista d'entrenaments: llegint la llista, cada
    // fila que arribava tornava a disparar l'efecte.
    effect(() => {
      if (!this.auth.uid()) return;
      void this.workoutService.ensureRecentWindow();
      void this.cadenceService.ensureLoaded();
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
    const cadence     = this.cadenceService.byKey();

    const gym = {} as Record<ExerciseCategory, ActivityProfile>;

    // Reads the types signal so the profile recomputes when the user adds,
    // edits or removes a training type.
    const gymCats = this.trainingTypeService.types().map(t => t.id);
    for (const cat of gymCats) {
      // All past dates when this category was trained, sorted newest first
      const catDates = workouts
        .filter(w => workoutCategories(w).includes(cat))
        .map(w => w.date)
        .sort((a, b) => b.localeCompare(a));

      gym[cat] = this._activityProfile(
        catDates, cadence.get(`gym:${cat}`), today, defaultGap, minRecovery,
      );
    }

    // El mateix per a cada esport. Abans aquí només hi havia «l'últim que vas
    // fer» i «el que més repeteixes»: dues dades que no diuen si et toca.
    const doneSessions  = sessions.filter(s => (s.status ?? 'done') !== 'planned');
    const datesBySport  = new Map<string, string[]>();
    for (const s of doneSessions) {
      const bucket = datesBySport.get(s.sportId);
      if (bucket) bucket.push(s.date);
      else datesBySport.set(s.sportId, [s.date]);
    }

    const sport: Record<string, ActivityProfile> = {};
    for (const s of sports) {
      const dates = (datesBySport.get(s.id) ?? []).sort((a, b) => b.localeCompare(a));
      sport[s.id] = this._activityProfile(
        dates, cadence.get(`sport:${s.id}`), today, defaultGap, minRecovery,
      );
    }

    // Aquí hi havia «l'esport que més fas» i «l'últim que vas fer», que era
    // com es triava l'esport a proposar. Ja no: el perfil de cada esport diu
    // el mateix i molt més —si et toca, si fa temps que no hi vas— i dues
    // maneres de contestar la mateixa pregunta són una de sobrera.
    return { gym, sport, minRecovery };
  });

  /**
   * La cadència d'una activitat, amb el que es tingui a mà.
   *
   * Les dates de la finestra recent manen —són les de debò— i el resum del
   * servidor omple el que hi falta: quan va ser l'última vegada si va ser
   * abans de la finestra, i cada quant la feies si dins de la finestra no hi
   * ha prou sessions per dir-ho.
   */
  private _activityProfile(
    recentDates: string[],
    cadence: ActivityCadence | undefined,
    today: string,
    defaultGap: number,
    minRecovery: number,
  ): ActivityProfile {
    const lastDate = recentDates[0]
      ?? (cadence?.lastDate && cadence.lastDate <= today ? cadence.lastDate : null);

    const daysSinceLast = lastDate ? daysBetween(lastDate, today) : NEVER_DAYS;

    // Derive the user's typical training gap from up to 10 consecutive sessions.
    // Gaps > MAX_GAP_DAYS are ignored (likely training breaks, not the real cycle).
    let typicalGapDays = defaultGap;
    if (recentDates.length >= 2) {
      const gaps: number[] = [];
      for (let i = 0; i < Math.min(recentDates.length - 1, 10); i++) {
        const gap = daysBetween(recentDates[i + 1], recentDates[i]);
        if (gap > 0 && gap <= MAX_GAP_DAYS) gaps.push(gap);
      }
      if (gaps.length >= 1) {
        typicalGapDays = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      }
    } else if (cadence && cadence.sessions >= 2 && cadence.firstDate && cadence.lastDate) {
      // Sense sessions recents, la cadència de tota la vida: l'interval mitjà
      // entre la primera i l'última. Es reté igual que els salts —per sobre de
      // dues setmanes ja no és una cadència— perquè si no, qui va fer quatre
      // sessions en dos anys sortiria amb un cicle de mig any i no li tocaria
      // mai res.
      const span = daysBetween(cadence.firstDate, cadence.lastDate);
      const avg  = Math.round(span / (cadence.sessions - 1));
      if (avg > 0) typicalGapDays = Math.min(avg, MAX_GAP_DAYS);
    }

    typicalGapDays = Math.max(typicalGapDays, minRecovery);

    return {
      daysSinceLast,
      typicalGapDays,
      overdueScore: daysSinceLast / Math.max(typicalGapDays, 1),
      everDone: !!lastDate,
      sessions: cadence?.sessions ?? recentDates.length,
    };
  }
}
