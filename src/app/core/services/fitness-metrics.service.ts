import { Injectable, computed, inject } from '@angular/core';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../models/exercise.model';
import { Mascot } from '../models/mascot.model';
import { pickVariant } from '../models/mascot.voice';
import { Sport, SportSession } from '../models/sport.model';
import { FEELING_LABEL, FeelingLevel, Workout, setMaxWeight } from '../models/workout.model';
import { ExerciseService } from './exercise.service';
import { SportService } from './sport.service';
import { TodayService } from './today.service';
import { TrainingTypeService } from './training-type.service';
import { UserSettingsService } from './user-settings.service';
import { WorkoutService } from './workout.service';
import { workoutVolume } from '../../shared/utils/workout-card.utils';
import { toDateStr } from '../../shared/utils/date.utils';

/**
 * Els insights d'Inici són **tendències**, no consells del dia.
 *
 * El "què faig avui" ja el diu el suggeriment d'`train` (mateixa font:
 * `WorkoutProfileService`) i el "com va la setmana", les barres de
 * `weekly-summary`. Aquí només hi cap el que no es veu enlloc més: el que
 * passa al llarg de setmanes i mesos i que l'usuari no notaria si no li ho
 * expliquéssim.
 *
 * Per això cap insight mira "avui" — l'única excepció és `ratxa_en_joc`, que
 * és deliberada: és el que empeny quan hi ha una ratxa a punt de trencar-se.
 */
export type InsightType =
  // Objectiu — el que hi ha en joc més enllà de la setmana en curs
  | 'ratxa_en_joc'
  | 'objectiu_a_l_alca'
  | 'objectiu_desajustat'
  | 'compliment_objectiu'
  // Ruptura — un canvi prou gran per voler saber-lo ara
  | 'sense_activitat'
  | 'carrega_alta'
  // Progrés — millores mesurables que no es veuen des d'una targeta
  | 'progres'
  | 'volum_gym'
  // Tendència — cap on va el ritme
  | 'tendencia_volum'
  | 'esforc_creixent'
  // Patró — com és realment la teva rutina
  | 'patro_setmanal'
  | 'equilibri_gym';

/** Nivells de prioritat. Guanya sempre el nivell més baix. */
export const INSIGHT_LEVEL = {
  objectiu:  1,
  ruptura:   2,
  progres:   3,
  tendencia: 4,
  patro:     5,
} as const;

export interface FitnessInsight {
  type: InsightType;
  /** Qui ho diu. L'emoji continua sent com se sent — veure `mascot.model.ts`. */
  mascot: Mascot;
  emoji: string;
  title: string;
  /** La línia de xifres. És el que fa que l'insight aporti per si sol. */
  stat: string;
  message: string;
  color: string;
  /** 1–5, veure `INSIGHT_LEVEL`. Ordena abans que res. */
  level: number;
  /** Desempat dins d'un nivell: com de fort és el senyal en aquestes dades. */
  strength: number;
  /**
   * Dies que ha d'esperar per tornar a sortir un cop mostrat. Els estats lents
   * (un patró de 12 setmanes) no canvien d'un dia per l'altre i cansarien;
   * els esdeveniments (una ratxa en joc) poden sortir cada dia, que per això
   * es poden tancar.
   */
  cooldownDays: number;
}

// ── Utilitats de calendari ───────────────────────────────────────────────────

function mondayOfWeek(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toDateStr(d);
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000
  );
}

function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay();
}

const DAY_NAMES = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];

// ── Format ───────────────────────────────────────────────────────────────────

/** Un decimal amb coma, com mana el català. */
function fmt1(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

/** Percentatge de diferència entre dos valors, sempre positiu. */
function pctDiff(now: number, before: number): number {
  return before > 0 ? Math.round(Math.abs(now - before) / before * 100) : 0;
}

function fmtKg(kg: number): string {
  return kg >= 1000 ? `${fmt1(kg / 1000)} t` : `${Math.round(kg)} kg`;
}

/** 70 i 72,5 kg, però mai 70,0. */
function fmtWeight(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : fmt1(kg);
}

// "Push day?" / "Pull day?" / "Leg day?" — gym-culture shorthand the user
// already uses. Custom types fall back to their own name.
const DAY_LABEL: Record<ExerciseCategory, string> = {
  push: 'Push day?',
  pull: 'Pull day?',
  legs: 'Leg day?',
};

function dayLabel(cat: ExerciseCategory): string {
  return DAY_LABEL[cat] ?? `Dia de ${CATEGORY_LABELS[cat]}?`;
}

// ── Setmanes ─────────────────────────────────────────────────────────────────

interface WeekStat {
  monday: string;
  end:    string;
  gym:    number;
  sport:  number;
  total:  number;
}

/** Objectiu setmanal normalitzat, sigui quin sigui el mode. */
interface GoalCfg {
  mode:     'combined' | 'separate';
  combined: number | null;
  gym:      number | null;
  sport:    number | null;
  has:      boolean;
  /** Activitats/setmana que representa l'objectiu, per comparar amb mitjanes. */
  total:    number;
}

function goalMet(w: WeekStat, g: GoalCfg): boolean {
  if (!g.has) return false;
  if (g.mode === 'separate') {
    return (g.gym === null || w.gym >= g.gym) && (g.sport === null || w.sport >= g.sport);
  }
  return g.combined !== null && w.total >= g.combined;
}

/** Quantes activitats falten aquesta setmana per assolir l'objectiu. */
function goalMissing(w: WeekStat, g: GoalCfg): number {
  if (g.mode === 'separate') {
    const gymMiss = g.gym   !== null ? Math.max(0, g.gym   - w.gym)   : 0;
    const spMiss  = g.sport !== null ? Math.max(0, g.sport - w.sport) : 0;
    return gymMiss + spMiss;
  }
  return g.combined !== null ? Math.max(0, g.combined - w.total) : 0;
}

/** `3/4 aquesta setmana` o `gym 1/2 · esport 0/1`, segons el mode. */
function goalProgressStr(w: WeekStat, g: GoalCfg): string {
  if (g.mode === 'separate') {
    const parts: string[] = [];
    if (g.gym   !== null) parts.push(`gym ${w.gym}/${g.gym}`);
    if (g.sport !== null) parts.push(`esport ${w.sport}/${g.sport}`);
    return parts.join(' · ');
  }
  return `${w.total}/${g.combined} aquesta setmana`;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

@Injectable({ providedIn: 'root' })
export class FitnessMetricsService {
  private workoutService      = inject(WorkoutService);
  private sportService        = inject(SportService);
  private settingsService     = inject(UserSettingsService);
  private trainingTypeService = inject(TrainingTypeService);
  private exerciseService     = inject(ExerciseService);
  private todayService        = inject(TodayService);

  /**
   * Tots els candidats que avui són certs, ordenats per prioritat: primer el
   * nivell, i dins d'un nivell la força del senyal — no un índex fix, que és
   * el que feia que sortissin sempre els mateixos dos.
   *
   * Qui decideix quin es veu és el component: només en pinta un, i ha de
   * saltar-se els que s'han tancat avui o encara són en període de descans.
   */
  readonly insights = computed((): FitnessInsight[] => {
    const today = this.todayService.today();

    const workouts = this.workoutService.doneWorkouts();
    const sessions = this.sportService.sessions();
    const sports   = this.sportService.sports();
    const goal     = this._goalCfg();

    const weeks = this._weekStats(today, workouts, sessions, 14);

    const first = this._firstActivity(workouts, sessions);

    const candidates: FitnessInsight[] = [
      ...this._goalInsights(today, weeks, goal, first),
      ...this._breakInsights(today, workouts, sessions, weeks),
      ...this._progressInsights(today, workouts, sessions, sports),
      ...this._trendInsights(today, workouts, sessions, sports),
      ...this._patternInsights(today, workouts, sessions),
    ];

    return candidates.sort((a, b) => a.level - b.level || b.strength - a.strength);
  });

  /** Setmanes seguides assolint l'objectiu, comptant la setmana en curs. */
  readonly goalStreak = computed((): number => {
    const g = this._goalCfg();
    if (!g.has) return 0;

    const today = this.todayService.today();
    const weeks = this._weekStats(today, this.workoutService.doneWorkouts(), this.sportService.sessions(), 53);

    let streak = 0;
    for (const w of weeks) {
      if (!goalMet(w, g)) break;
      streak++;
    }
    return streak;
  });

  /** Igual que `goalStreak` però només amb setmanes ja tancades. */
  private readonly _closedStreak = computed((): number => {
    const g = this._goalCfg();
    if (!g.has) return 0;

    const today = this.todayService.today();
    const weeks = this._weekStats(today, this.workoutService.doneWorkouts(), this.sportService.sessions(), 53);

    let streak = 0;
    for (const w of weeks.slice(1)) {
      if (!goalMet(w, g)) break;
      streak++;
    }
    return streak;
  });

  private readonly _goalCfg = computed((): GoalCfg => {
    const s        = this.settingsService.settings();
    const mode     = s.goalMode === 'separate' ? 'separate' : 'combined';
    const combined = s.weeklyActivityGoal ?? null;
    const gym      = s.weeklyGymGoal ?? null;
    const sport    = s.weeklySportGoal ?? null;
    const has      = mode === 'combined' ? combined !== null : gym !== null || sport !== null;
    const total    = mode === 'combined' ? (combined ?? 0) : (gym ?? 0) + (sport ?? 0);
    return { mode, combined, gym, sport, has, total };
  });

  /** Índex 0 = setmana en curs (dilluns → avui); la resta, setmanes tancades. */
  private _weekStats(today: string, workouts: Workout[], sessions: SportSession[], n: number): WeekStat[] {
    const out: WeekStat[] = [];
    for (let i = 0; i < n; i++) {
      const monday = mondayOfWeek(offsetDate(today, -(i * 7)));
      const end    = i === 0 ? today : offsetDate(monday, 6);
      const gym    = workouts.filter(w => w.date >= monday && w.date <= end).length;
      const sport  = sessions.filter(s => s.date >= monday && s.date <= end).length;
      out.push({ monday, end, gym, sport, total: gym + sport });
    }
    return out;
  }

  /** Data de la primera activitat registrada, o `null` si no n'hi ha cap. */
  private _firstActivity(workouts: Workout[], sessions: SportSession[]): string | null {
    const dates = [...workouts.map(w => w.date), ...sessions.map(s => s.date)];
    return dates.length ? dates.reduce((min, d) => (d < min ? d : min)) : null;
  }

  // ── Nivell 1 · Objectiu ────────────────────────────────────────────────────

  private _goalInsights(
    today: string, weeks: WeekStat[], g: GoalCfg, first: string | null,
  ): FitnessInsight[] {
    if (!g.has || !first) return [];

    // Sense prou història no es pot parlar de 6 ni de 12 setmanes: els buckets
    // existeixen sempre, però les setmanes anteriors a la primera activitat no
    // són setmanes fluixes, és que l'usuari encara no hi era.
    const has6Weeks  = first <= offsetDate(today, -42);
    const has12Weeks = first <= offsetDate(today, -84);

    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.objectiu;
    const dow   = dayOfWeek(today);
    // De dijous a diumenge: abans encara queda massa setmana per parlar-ne.
    const lateWeek = dow === 0 || dow >= 4;

    const closedStreak = this._closedStreak();
    const closed       = weeks.slice(1);

    // ── Ratxa en joc ─────────────────────────────────────────────────────────
    // L'únic insight que mira la setmana en curs, i és a propòsit: una ratxa
    // que es pot mantenir avui és el que empeny de debò.
    if (lateWeek && closedStreak >= 2 && !goalMet(weeks[0], g)) {
      const missing = goalMissing(weeks[0], g);
      out.push({
        type: 'ratxa_en_joc',
        mascot: 'both',
        emoji: '🔥',
        title: `${closedStreak} setmanes seguides`,
        stat: `${goalProgressStr(weeks[0], g)} · et ${missing === 1 ? 'falta 1' : `falten ${missing}`}`,
        message: missing === 1
          ? `Amb una més la mantens. ${pickVariant(['Hi som a temps.', 'Encara hi ets.', 'Tu diràs.'], today + 'ratxa_en_joc')}`
          : `Amb ${missing} més la mantens. Queden dies.`,
        color: '#e65100',
        level,
        strength: 70 + closedStreak * 4 - missing * 3,
        cooldownDays: 0,
      });
    }

    // ── Objectiu a l'alça ────────────────────────────────────────────────────
    const last4 = closed.slice(0, 4);
    const avg4  = mean(last4.map(w => w.total));
    if (closedStreak >= 3 && g.total > 0 && avg4 >= g.total + 1) {
      const suggested = Math.round(avg4);
      out.push({
        type: 'objectiu_a_l_alca',
        mascot: 'both',
        emoji: '🚀',
        title: `${closedStreak} setmanes complint`,
        stat: `${fmt1(avg4)} activitats/setmana de mitjana · objectiu ${g.total}`,
        message: `Et sobra marge. L'apugem a ${suggested}?`,
        color: '#43a047',
        level,
        strength: 45 + Math.round((avg4 - g.total) * 8),
        cooldownDays: 7,
      });
    }

    // ── Objectiu desajustat ──────────────────────────────────────────────────
    // Un objectiu que no es toca gairebé mai no motiva ningú. Millor un de
    // més petit que sí es compleixi: la proposta és baixar-lo, no entrenar més.
    const last6   = closed.slice(0, 6);
    const met6    = last6.filter(w => goalMet(w, g)).length;
    const avg6    = mean(last6.map(w => w.total));
    const suggest = Math.max(1, Math.round(avg6));
    if (has6Weeks && met6 <= 2 && avg6 > 0 && g.total > 0 && suggest < g.total) {
      out.push({
        type: 'objectiu_desajustat',
        mascot: 'both',
        emoji: '🎯',
        title: 'Un objectiu més teu',
        stat: `${met6} de les últimes 6 setmanes · ${fmt1(avg6)} activitats/setmana`,
        message: `Amb ${suggest} en comptes de ${g.total} el faries gairebé cada setmana.`,
        color: '#0288d1',
        level,
        strength: 35 + Math.round((g.total - avg6) * 4),
        cooldownDays: 14,
      });
    }

    // ── Compliment a llarg termini ───────────────────────────────────────────
    // 12 setmanes és prou lluny perquè l'usuari ja no ho recordi.
    const last12 = closed.slice(0, 12);
    const met12  = last12.filter(w => goalMet(w, g)).length;
    const recent6 = met6;
    const older6  = closed.slice(6, 12).filter(w => goalMet(w, g)).length;
    if (has12Weeks && met12 > 0 && met12 < 12) {
      const improving = recent6 > older6;
      out.push({
        type: 'compliment_objectiu',
        mascot: 'both',
        emoji: '📊',
        title: improving ? 'Cada cop més regular' : `${met12} de 12 setmanes`,
        stat: `${recent6} de 6 assolides · les 6 anteriors, ${older6}`,
        message: improving
          ? 'La regularitat és el que acaba comptant.'
          : `Un ${Math.round(met12 / 12 * 100)}% de compliment en tres mesos.`,
        color: '#006874',
        level,
        strength: 20 + Math.abs(recent6 - older6) * 3,
        cooldownDays: 14,
      });
    }

    return out;
  }

  // ── Nivell 2 · Ruptura ─────────────────────────────────────────────────────

  private _breakInsights(
    today: string, workouts: Workout[], sessions: SportSession[], weeks: WeekStat[],
  ): FitnessInsight[] {
    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.ruptura;

    // ── Sense activitat ──────────────────────────────────────────────────────
    const allDates = [...workouts.map(w => w.date), ...sessions.map(s => s.date)]
      .filter(d => d <= today);
    const lastDate = allDates.length ? allDates.reduce((max, d) => (d > max ? d : max)) : null;

    if (lastDate) {
      const gap = daysBetween(lastDate, today);
      if (gap >= 10) {
        // El ritme que portava abans de parar: si mai va tenir-ne, no hi ha
        // res a trobar a faltar.
        const from      = offsetDate(lastDate, -56);
        const priorCount = allDates.filter(d => d > from && d <= lastDate).length;
        const priorAvg   = priorCount / 8;
        if (priorAvg >= 2) {
          out.push({
            type: 'sense_activitat',
            mascot: 'both',
            emoji: '🐾',
            title: 'Hi tornem quan vulguis',
            stat: `${gap} dies des de l'última · abans ${fmt1(priorAvg)} per setmana`,
            message: pickVariant([
              'Quan vulguis.',
              'Ja saps on som.',
              'Tu diràs.',
            ], today + 'sense_activitat'),
            color: '#5e35b1',
            level,
            strength: 90 + Math.min(30, gap),
            cooldownDays: 0,
          });
        }
      }
    }

    // ── Càrrega alta ─────────────────────────────────────────────────────────
    const weekAgo = offsetDate(today, -7);
    const last7   = allDates.filter(d => d > weekAgo && d <= today).length;
    const avg8    = mean(weeks.slice(1, 9).map(w => w.total));
    if (last7 >= 5 && avg8 >= 1 && last7 >= avg8 * 1.6) {
      out.push({
        type: 'carrega_alta',
        mascot: 'marley',
        emoji: '😴',
        title: 'T\'has guanyat el descans',
        stat: `${last7} sessions en 7 dies · la teva mitjana és ${fmt1(avg8)}`,
        message: pickVariant([
          'Avui toca sofà.',
          'Avui, sofà.',
          'Jo ja hi soc, al sofà.',
        ], today + 'carrega_alta'),
        color: '#5e35b1',
        level,
        strength: 50 + Math.round((last7 / avg8) * 10),
        cooldownDays: 3,
      });
    }

    return out;
  }

  // ── Nivell 3 · Progrés ─────────────────────────────────────────────────────

  private _progressInsights(
    today: string, workouts: Workout[], sessions: SportSession[], sports: Sport[],
  ): FitnessInsight[] {
    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.progres;
    const from8 = offsetDate(today, -56);

    // ── Progrés en un exercici concret ───────────────────────────────────────
    const gym = this._exerciseProgress(workouts.filter(w => w.date > from8 && w.date <= today));
    // ── Progrés en un esport (durada mitjana) ────────────────────────────────
    const sport = this._sportProgress(sessions.filter(s => s.date > from8 && s.date <= today), sports);

    // Un de sol: el que ha millorat més en proporció.
    const best = gym && sport ? (gym.gain >= sport.gain ? gym : sport) : (gym ?? sport);
    if (best) out.push({ ...best.insight, level, strength: 40 + Math.round(best.gain * 100) });

    // ── Volum de gimnàs ──────────────────────────────────────────────────────
    const volume = this._volumeTrend(today, workouts);
    if (volume) out.push({ ...volume, level });

    return out;
  }

  /** El millor progrés de càrrega dels últims dos mesos, si n'hi ha cap. */
  private _exerciseProgress(recent: Workout[]): { gain: number; insight: FitnessInsight } | null {
    const bw = this.settingsService.bodyweightKg();
    const byExercise = new Map<string, { name: string; points: Map<string, number> }>();

    for (const w of recent) {
      for (const e of w.entries) {
        const setCtx = {
          bodyweightKg: bw,
          loadType: this.exerciseService.loadTypeOf(e.exerciseId),
          bodyweightFactor: this.exerciseService.bodyweightFactorOf(e.exerciseId),
        };
        const best = e.sets
          .filter(s => !s.warmup)
          .reduce((m, s) => Math.max(m, setMaxWeight(s, setCtx)), 0);
        if (best <= 0) continue;

        const rec = byExercise.get(e.exerciseId) ?? { name: e.exerciseName, points: new Map<string, number>() };
        rec.points.set(w.date, Math.max(rec.points.get(w.date) ?? 0, best));
        byExercise.set(e.exerciseId, rec);
      }
    }

    let best: { gain: number; insight: FitnessInsight } | null = null;

    for (const [, rec] of byExercise) {
      const points = [...rec.points.entries()]
        .map(([date, kg]) => ({ date, kg }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (points.length < 4) continue;

      const baseline = points[0].kg;
      // Les dues últimes: una sessió fluixa no ha d'amagar dos mesos de feina.
      const current  = Math.max(...points.slice(-2).map(p => p.kg));
      if (baseline <= 0) continue;

      const gain = (current - baseline) / baseline;
      if (gain < 0.05 || current - baseline < 1) continue;
      if (best && gain <= best.gain) continue;

      const weeks = Math.max(1, Math.round(daysBetween(points[0].date, points[points.length - 1].date) / 7));
      best = {
        gain,
        insight: {
          type: 'progres',
          mascot: 'marley',
          emoji: '💪',
          title: `Puges al ${rec.name.toLowerCase()}`,
          stat: `${fmtWeight(baseline)} → ${fmtWeight(current)} kg en ${weeks} setmanes (+${Math.round(gain * 100)}%)`,
          message: `${points.length} sessions registrades. ${pickVariant([
            'Bona jugada.',
            'Així m\'agrada.',
            'Ben fet.',
          ], points[0].date + 'progres_gym')}`,
          color: '#2e7d32',
          level: INSIGHT_LEVEL.progres,
          strength: 0,
          cooldownDays: 7,
        },
      };
    }

    return best;
  }

  /** Sessions d'esport que s'allarguen: el mateix progrés, en minuts. */
  private _sportProgress(recent: SportSession[], sports: Sport[]): { gain: number; insight: FitnessInsight } | null {
    let best: { gain: number; insight: FitnessInsight } | null = null;

    for (const sport of sports) {
      const mine = recent
        .filter(s => s.sportId === sport.id && (s.duration ?? 0) > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
      if (mine.length < 4) continue;

      const half   = Math.floor(mine.length / 2);
      const oldAvg = mean(mine.slice(0, half).map(s => s.duration as number));
      const newAvg = mean(mine.slice(-half).map(s => s.duration as number));
      if (oldAvg <= 0) continue;

      const gain = (newAvg - oldAvg) / oldAvg;
      if (gain < 0.15 || newAvg - oldAvg < 5) continue;
      if (best && gain <= best.gain) continue;

      best = {
        gain,
        insight: {
          type: 'progres',
          mascot: 'xoco',
          emoji: '🏃',
          title: `Aguantes més al ${sport.name.toLowerCase()}`,
          stat: `${Math.round(oldAvg)} → ${Math.round(newAvg)} min de mitjana (+${Math.round(gain * 100)}%)`,
          message: `${mine.length} sessions comparades. ${pickVariant([
            'Es nota!',
            'Quines ganes!',
            'Seguim!',
          ], mine[0].date + 'progres_esport')}`,
          color: sport.color,
          level: INSIGHT_LEVEL.progres,
          strength: 0,
          cooldownDays: 7,
        },
      };
    }

    return best;
  }

  /**
   * Tonatge mogut aquest mes contra l'anterior. El creuament amb el nombre
   * d'entrenos és el que ho fa útil: mateixos entrenos i més quilos vol dir
   * que has pujat intensitat, i això no es veu des de cap targeta.
   */
  private _volumeTrend(today: string, workouts: Workout[]): FitnessInsight | null {
    const ctx = {
      bodyweightKg: this.settingsService.bodyweightKg(),
      loadTypeOf: this.exerciseService.loadTypeOf,
      bodyweightFactorOf: this.exerciseService.bodyweightFactorOf,
    };
    const from28 = offsetDate(today, -28);
    const from56 = offsetDate(today, -56);

    const now  = workouts.filter(w => w.date > from28 && w.date <= today);
    const prev = workouts.filter(w => w.date > from56 && w.date <= from28);
    if (now.length < 6 || prev.length < 6) return null;

    const vNow  = now.reduce((sum, w) => sum + workoutVolume(w, ctx), 0);
    const vPrev = prev.reduce((sum, w) => sum + workoutVolume(w, ctx), 0);
    if (vPrev <= 0) return null;

    const delta = (vNow - vPrev) / vPrev;
    if (Math.abs(delta) < 0.15) return null;

    const pct       = pctDiff(vNow, vPrev);
    const sameCount = Math.abs(now.length - prev.length) <= Math.max(1, prev.length * 0.15);
    const up        = delta > 0;

    return {
      type: 'volum_gym',
      mascot: 'marley',
      emoji: up ? '🏋️' : '🍃',
      title: up ? 'Estàs movent més pes' : 'Mes més suau al gym',
      stat: `${fmtKg(vNow)} aquest mes · un ${pct}% ${up ? 'més' : 'menys'} que l'anterior`,
      message: sameCount
        ? `Amb els mateixos entrenos (${now.length} contra ${prev.length}). ${up ? 'Has pujat intensitat.' : 'Menys càrrega, més recuperació.'}`
        : `${now.length} entrenos contra ${prev.length} el mes anterior.`,
      color: '#00695c',
      level: INSIGHT_LEVEL.progres,
      strength: 30 + pct,
      cooldownDays: 7,
    };
  }

  // ── Nivell 4 · Tendència ───────────────────────────────────────────────────

  private _trendInsights(
    today: string, workouts: Workout[], sessions: SportSession[], sports: Sport[],
  ): FitnessInsight[] {
    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.tendencia;

    // ── Ritme d'activitat: 4 setmanes contra les 4 anteriors ─────────────────
    const allDates = [...workouts.map(w => w.date), ...sessions.map(s => s.date)];
    const from28 = offsetDate(today, -28);
    const from56 = offsetDate(today, -56);
    const now    = allDates.filter(d => d > from28 && d <= today).length;
    const prev   = allDates.filter(d => d > from56 && d <= from28).length;

    if (now + prev >= 8 && prev > 0) {
      const delta = (now - prev) / prev;
      if (Math.abs(delta) >= 0.25) {
        const up  = delta > 0;
        const pct = pctDiff(now, prev);
        out.push({
          type: 'tendencia_volum',
          mascot: 'both',
          emoji: up ? '📈' : '🌙',
          title: up ? 'Puges de ritme' : 'Mes més tranquil',
          stat: `${fmt1(now / 4)} activitats/setmana · abans ${fmt1(prev / 4)}`,
          message: up
            ? `Un ${pct}% més que el mes passat.`
            : `Un ${pct}% menys que el mes passat. Cap pressa.`,
          color: up ? '#0288d1' : '#78909c',
          level,
          strength: 30 + pct,
          cooldownDays: 7,
        });
      }
    }

    // ── L'esforç puja: les últimes sessions costen més ───────────────────────
    const effort = this._effortTrend(today, workouts, sessions, sports);
    if (effort) out.push({ ...effort, level });

    return out;
  }

  private _effortTrend(
    today: string, workouts: Workout[], sessions: SportSession[], sports: Sport[],
  ): FitnessInsight | null {
    const from8 = offsetDate(today, -56);

    type Series = { label: string | null; mascot: Mascot; color: string; feelings: FeelingLevel[] };
    const series: Series[] = [];

    const gymFeelings = workouts
      .filter(w => w.date > from8 && w.date <= today && w.feeling != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(w => w.feeling as FeelingLevel);
    series.push({ label: null, mascot: 'marley', color: '#006874', feelings: gymFeelings });

    for (const sport of sports) {
      const feelings = sessions
        .filter(s => s.sportId === sport.id && s.date > from8 && s.date <= today && s.feeling != null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(s => s.feeling as FeelingLevel);
      series.push({ label: sport.name, mascot: 'xoco', color: sport.color, feelings });
    }

    let best: { delta: number; insight: FitnessInsight } | null = null;

    for (const s of series) {
      if (s.feelings.length < 4) continue;
      const last4 = s.feelings.slice(-4);
      // Feeling alt = més fatigant, així que pujar vol dir que costa més.
      const older = mean(last4.slice(0, 2));
      const newer = mean(last4.slice(2));
      const delta = newer - older;
      if (delta < 1) continue;
      if (best && delta <= best.delta) continue;

      const from = FEELING_LABEL[Math.round(older) as FeelingLevel];
      const to   = FEELING_LABEL[Math.round(newer) as FeelingLevel];
      best = {
        delta,
        insight: {
          type: 'esforc_creixent',
          mascot: s.mascot,
          emoji: '📉',
          title: s.label ? `Anem amb calma al ${s.label.toLowerCase()}` : 'Anem amb calma',
          stat: `Les últimes 4 sessions: ${from} → ${to}`,
          message: pickVariant([
            'Avui, tranquils.',
            'Sense presses.',
            'Jo m\'hi apunto igual.',
          ], today + 'esforc_creixent'),
          color: s.color,
          level: INSIGHT_LEVEL.tendencia,
          strength: 20 + Math.round(delta * 10),
          cooldownDays: 7,
        },
      };
    }

    return best?.insight ?? null;
  }

  // ── Nivell 5 · Patró ───────────────────────────────────────────────────────

  private _patternInsights(today: string, workouts: Workout[], sessions: SportSession[]): FitnessInsight[] {
    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.patro;

    // ── Quins dies entrenes de debò ──────────────────────────────────────────
    const from12 = offsetDate(today, -84);
    const dates  = [...workouts.map(w => w.date), ...sessions.map(s => s.date)]
      .filter(d => d > from12 && d <= today);

    if (dates.length >= 12) {
      const counts = new Array(7).fill(0) as number[];
      for (const d of dates) counts[dayOfWeek(d)]++;

      const ranked = counts
        .map((count, day) => ({ count, day }))
        .sort((a, b) => b.count - a.count);
      const top2   = ranked.slice(0, 2);
      const share  = (top2[0].count + top2[1].count) / dates.length;

      if (share >= 0.55 && top2[1].count > 0) {
        const weekend = counts[6] + counts[0];
        out.push({
          type: 'patro_setmanal',
          mascot: 'both',
          emoji: '📅',
          title: 'El teu patró de setmana',
          stat: `${Math.round(share * 100)}% de l'activitat, ${DAY_NAMES[top2[0].day]} i ${DAY_NAMES[top2[1].day]}`,
          message: weekend / dates.length <= 0.15
            ? `Els caps de setmana te'ls deixes lliures: ${weekend} de ${dates.length}.`
            : `Sobre ${dates.length} activitats de les últimes 12 setmanes.`,
          color: '#455a64',
          level,
          strength: 10 + Math.round(share * 10),
          cooldownDays: 14,
        });
      }
    }

    // ── Equilibri entre tipus d'entrenament ──────────────────────────────────
    const from8   = offsetDate(today, -56);
    const recent  = workouts.filter(w => w.date > from8 && w.date <= today);
    const gymCats = this.trainingTypeService.types().map(t => t.id);

    if (recent.length >= 6 && gymCats.length >= 2) {
      const counts: Record<ExerciseCategory, number> = Object.fromEntries(gymCats.map(c => [c, 0]));
      for (const w of recent) {
        const cats = w.categories?.length ? w.categories : (w.category ? [w.category] : []);
        for (const c of cats) if (c in counts) counts[c]++;
      }

      const active = gymCats.filter(c => counts[c] > 0);
      if (active.length >= 2) {
        const ranked = gymCats.slice().sort((a, b) => counts[b] - counts[a]);
        const top    = ranked[0];
        const min    = ranked[ranked.length - 1];
        const ratio  = counts[min] > 0 ? counts[top] / counts[min] : Infinity;

        if (counts[top] - counts[min] >= 3 && ratio >= 2) {
          const breakdown = ranked
            .map(c => `${counts[c]} ${CATEGORY_LABELS[c].toLowerCase()}`)
            .join(' · ');
          out.push({
            type: 'equilibri_gym',
            mascot: 'marley',
            emoji: '⚖️',
            title: dayLabel(min),
            stat: `${breakdown} — 8 setmanes`,
            message: `${CATEGORY_LABELS[min]} es queda enrere. ${pickVariant([
              'Ho equilibrem.',
              'Toca anivellar-ho.',
              'Ja ho arreglarem.',
            ], today + 'equilibri_gym')}`,
            color: CATEGORY_COLORS[min],
            level,
            strength: 10 + Math.min(20, Math.round(ratio * 3)),
            cooldownDays: 7,
          });
        }
      }
    }

    return out;
  }
}
