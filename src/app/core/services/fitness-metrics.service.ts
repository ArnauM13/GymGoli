import { Injectable, computed, inject } from '@angular/core';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../models/exercise.model';
import { FitnessInsight, INSIGHT_LEVEL } from '../models/insight.model';
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
import { daysBetween, offsetDate, toDateStr } from '../../shared/utils/date.utils';
import {
  dateRange,
  fmt1,
  fmtKg,
  fmtWeight,
  itemBars,
  longDate,
  outOfTen,
  plural,
  rollingWeekBars,
  shortDate,
  weekBars,
  weeklyChangePhrase,
} from '../../shared/utils/insight-copy.utils';

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
 *
 * La forma que tenen (tipus, nivells, detall) viu a `models/insight.model.ts`.
 */
// ── Utilitats de calendari ───────────────────────────────────────────────────

function mondayOfWeek(dateStr: string): string {
  const d   = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return toDateStr(d);
}

function dayOfWeek(dateStr: string): number {
  return new Date(dateStr + 'T12:00:00').getDay();
}

const DAY_NAMES = ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'];
/** Els mateixos dies quan només hi caben dues lletres (sota una barra). */
const DAY_SHORT = ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'];

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

/**
 * `3/4` o `gym 1/2 · esport 0/1`, segons el mode. Sense dir de quina setmana:
 * el període el posa la frase que l'envolta, que és qui sap si parla de la
 * setmana en curs o d'una altra.
 */
function goalProgressStr(w: WeekStat, g: GoalCfg): string {
  if (g.mode === 'separate') {
    const parts: string[] = [];
    if (g.gym   !== null) parts.push(`gym ${w.gym}/${g.gym}`);
    if (g.sport !== null) parts.push(`esport ${w.sport}/${g.sport}`);
    return parts.join(' · ');
  }
  return `${w.total}/${g.combined}`;
}

/**
 * Com de gran és un canvi, per ordenar candidats. És un tant per cent, i per
 * això es queda **dins**: a la interfície els canvis es diuen amb les dues
 * xifres reals, mai amb un percentatge.
 */
function changeScore(now: number, before: number): number {
  return before > 0 ? Math.round(Math.abs(now - before) / before * 100) : 0;
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

// ── Història de l'usuari ─────────────────────────────────────────────────────

/**
 * Quant passat té l'usuari perquè el puguem comparar amb ell mateix.
 *
 * L'ancoratge és la **primera activitat registrada**, no la data d'alta: qui
 * importa tres mesos d'històric el primer dia ja té passat, i qui es va
 * registrar fa un any però comença avui, no.
 */
interface History {
  /** Primera activitat registrada, o `null` si encara no n'hi ha cap. */
  first: string | null;
  /** Dies des d'aquella primera activitat. 0 si no n'hi ha cap. */
  days: number;
}

/**
 * Per sota d'això no hi ha res contra què comparar: algú que acaba d'arribar
 * no té "el ritme d'abans" ni "la seva mitjana", i qualsevol xifra que en
 * surti ve de dividir per setmanes que no ha viscut.
 */
const MIN_HISTORY_DAYS = 28;

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
   *
   * Cap candidat pot comparar l'usuari amb setmanes en què encara no hi era:
   * la `History` diu des de quan hi ha passat i cada família s'hi mesura
   * abans de parlar. Veure `History` i `MIN_HISTORY_DAYS`.
   */
  readonly insights = computed((): FitnessInsight[] => {
    const today = this.todayService.today();

    const workouts = this.workoutService.doneWorkouts();
    const sessions = this.sportService.sessions();
    const sports   = this.sportService.sports();
    const goal     = this._goalCfg();

    const weeks = this._weekStats(today, workouts, sessions, 14);

    const hist = this._history(today, workouts, sessions);

    const candidates: FitnessInsight[] = [
      ...this._goalInsights(today, weeks, goal, hist),
      ...this._breakInsights(today, workouts, sessions, weeks, hist),
      ...this._progressInsights(today, workouts, sessions, sports),
      ...this._trendInsights(today, workouts, sessions, sports, hist),
      ...this._patternInsights(today, workouts, sessions, hist),
    ];

    return candidates.sort((a, b) => a.level - b.level || b.strength - a.strength);
  });

  /**
   * Setmanes seguides assolint l'objectiu, comptant la setmana en curs.
   *
   * Cap pantalla la porta penjada: la ratxa es diu el dia que creix
   * (`ratxa_assolida`) i prou. Es queda aquí com a xifra del domini, que és
   * d'on surt tot el que se'n digui.
   */
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

  /**
   * Les setmanes **ja tancades** que formen la ratxa d'ara, de la més nova a
   * la més vella. La setmana en curs no hi és: encara li queden dies i podria
   * acabar de qualsevol manera.
   */
  private readonly _closedStreakWeeks = computed((): WeekStat[] => {
    const g = this._goalCfg();
    if (!g.has) return [];

    const today = this.todayService.today();
    const weeks = this._weekStats(today, this.workoutService.doneWorkouts(), this.sportService.sessions(), 53);

    const out: WeekStat[] = [];
    for (const w of weeks.slice(1)) {
      if (!goalMet(w, g)) break;
      out.push(w);
    }
    return out;
  });

  /** Igual que `goalStreak` però només amb setmanes ja tancades. */
  private readonly _closedStreak = computed((): number => this._closedStreakWeeks().length);

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

  /** Des de quan hi ha alguna cosa a mirar. Veure `History`. */
  private _history(today: string, workouts: Workout[], sessions: SportSession[]): History {
    const dates = [...workouts.map(w => w.date), ...sessions.map(s => s.date)]
      .filter(d => d <= today);
    const first = dates.length ? dates.reduce((min, d) => (d < min ? d : min)) : null;
    return { first, days: first ? daysBetween(first, today) : 0 };
  }

  /**
   * La ratlla de l'objectiu al gràfic. Sense objectiu no hi ha ratlla: una
   * línia sense nom seria una decoració que l'usuari hauria d'endevinar.
   */
  private _goalLine(g: GoalCfg): { value: number; label: string } | undefined {
    return g.total > 0 ? { value: g.total, label: `objectiu ${g.total}` } : undefined;
  }

  // ── Nivell 1 · Objectiu ────────────────────────────────────────────────────

  private _goalInsights(
    today: string, weeks: WeekStat[], g: GoalCfg, hist: History,
  ): FitnessInsight[] {
    if (!g.has || !hist.first) return [];

    // Sense prou història no es pot parlar de 6 ni de 12 setmanes: els buckets
    // existeixen sempre, però les setmanes anteriors a la primera activitat no
    // són setmanes fluixes, és que l'usuari encara no hi era.
    const has6Weeks  = hist.days >= 42;
    const has12Weeks = hist.days >= 84;

    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.objectiu;
    const dow   = dayOfWeek(today);
    // De dijous a diumenge: abans encara queda massa setmana per parlar-ne.
    const lateWeek = dow === 0 || dow >= 4;

    const closedStreak = this._closedStreak();
    const closed       = weeks.slice(1);

    // ── Ratxa assolida ───────────────────────────────────────────────────────
    // La felicitació, i l'únic lloc on es parla de la ratxa quan va bé: ni el
    // resum de setmana ni el perfil la porten penjada. Una xifra sempre a la
    // vista es converteix en una cosa que pots perdre; dita el dia que passa,
    // és el que és — una alegria.
    //
    // `once` la lliga a la setmana que la fa créixer: es diu una vegada i no
    // torna mai més per aquella setmana. La següent ja és una altra fita.
    const streakWeeks = this._closedStreakWeeks();
    if (closedStreak >= 2) {
      const lastWeek  = streakWeeks[0];
      const firstWeek = streakWeeks[streakWeeks.length - 1];
      const span      = dateRange(firstWeek.monday, lastWeek.end);
      const totalAct  = streakWeeks.reduce((sum, w) => sum + w.total, 0);
      const avg       = totalAct / streakWeeks.length;
      out.push({
        type: 'ratxa_assolida',
        once: `ratxa_assolida:${lastWeek.monday}`,
        mascot: 'both',
        emoji: '🎉',
        title: `${closedStreak} setmanes seguides`,
        stat: `${plural(totalAct, 'activitat', 'activitats')} en aquestes setmanes`,
        message: pickVariant([
          'Ben fet.',
          'Això és constància.',
          'Seguim.',
        ], lastWeek.monday + 'ratxa_assolida'),
        color: '#e65100',
        level,
        // Per sobre de qualsevol altre candidat del seu nivell: es diu el dia
        // que toca o no es diu mai.
        strength: 95 + closedStreak,
        cooldownDays: 0,
        detail: {
          headline: `Has arribat a l'objectiu ${closedStreak} setmanes seguides, sense fallar-ne cap.`,
          chart: {
            caption: 'Activitats per setmana',
            range: dateRange(closed[7].monday, closed[0].end),
            bars: weekBars(closed.slice(0, 8), { highlight: w => goalMet(w, g) }),
            reference: this._goalLine(g),
          },
          facts: [
            { label: 'Setmanes seguides', value: plural(closedStreak, 'setmana', 'setmanes'), note: span },
            { label: 'Activitats en total', value: plural(totalAct, 'activitat', 'activitats'), note: span },
            { label: 'De mitjana', value: `${fmt1(avg)} activitats per setmana`, note: span },
            { label: 'Objectiu', value: `${g.total} per setmana` },
          ],
          meaning: 'La ratxa són les setmanes seguides en què has arribat a l\'objectiu. Aquesta felicitació surt una sola vegada, el dia que la ratxa creix, i després desapareix: no és cap marcador que hagis de mantenir.',
        },
      });
    }

    // ── Ratxa en joc ─────────────────────────────────────────────────────────
    // L'únic insight que mira la setmana en curs, i és a propòsit: una ratxa
    // que es pot mantenir avui és el que empeny de debò.
    if (lateWeek && closedStreak >= 2 && !goalMet(weeks[0], g)) {
      const missing = goalMissing(weeks[0], g);
      // La ratxa pot ser més llarga que les setmanes que tenim a mà.
      const streakFrom = weeks[Math.min(closedStreak, weeks.length - 1)];
      out.push({
        type: 'ratxa_en_joc',
        mascot: 'both',
        emoji: '🔥',
        title: `${closedStreak} setmanes seguides`,
        stat: `Aquesta setmana, ${goalProgressStr(weeks[0], g)}`,
        message: missing === 1
          ? `Amb una més la mantens. ${pickVariant(['Hi som a temps.', 'Encara hi ets.', 'Tu diràs.'], today + 'ratxa_en_joc')}`
          : `Amb ${missing} més la mantens. Queden dies.`,
        color: '#e65100',
        level,
        strength: 70 + closedStreak * 4 - missing * 3,
        cooldownDays: 0,
        detail: {
          headline: `Has arribat a l'objectiu ${closedStreak} setmanes seguides. Aquesta encara és oberta.`,
          chart: {
            caption: 'Activitats per setmana',
            range: dateRange(weeks[7].monday, today),
            bars: weekBars(weeks.slice(0, 8), { lastIsCurrent: true, highlight: (_w, i, n) => i === n - 1 }),
            reference: this._goalLine(g),
          },
          facts: [
            {
              label: 'Setmanes seguides', value: plural(closedStreak, 'setmana', 'setmanes'),
              note: dateRange(streakFrom.monday, weeks[1].end),
            },
            {
              label: 'Aquesta setmana', value: goalProgressStr(weeks[0], g),
              note: dateRange(weeks[0].monday, today),
            },
            { label: 'Per mantenir-la', value: plural(missing, 'activitat', 'activitats') },
          ],
          meaning: 'La ratxa són les setmanes seguides en què has arribat a l\'objectiu. La d\'ara encara té dies per davant, i si no surt, la següent comença de zero sense més.',
        },
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
        stat: `Les últimes 4 setmanes, ${fmt1(avg4)} activitats per setmana`,
        message: `L'objectiu és ${g.total}. L'apugem a ${suggested}?`,
        color: '#43a047',
        level,
        strength: 45 + Math.round((avg4 - g.total) * 8),
        cooldownDays: 7,
        detail: {
          headline: `Les últimes 4 setmanes has passat de l'objectiu cada vegada.`,
          chart: {
            caption: 'Activitats per setmana',
            range: dateRange(closed[7].monday, closed[0].end),
            bars: weekBars(closed.slice(0, 8), { highlight: (_w, i, n) => i >= n - 4 }),
            reference: this._goalLine(g),
          },
          facts: [
            {
              label: 'Les últimes 4 setmanes', value: `${fmt1(avg4)} activitats de mitjana`,
              note: dateRange(last4[3].monday, last4[0].end),
            },
            { label: 'Objectiu actual', value: `${g.total} per setmana` },
            { label: 'Proposta',        value: `${suggested} per setmana` },
          ],
          meaning: 'Un objectiu que no costa deixa de dir res. Pujar-lo el torna a fer una fita, i sempre el pots tornar a baixar des d\'Ajustos.',
        },
      });
    }

    // ── Objectiu desajustat ──────────────────────────────────────────────────
    // Un objectiu que no es toca gairebé mai no motiva ningú. Millor un de
    // més petit que sí es compleixi: la proposta és baixar-lo, no entrenar més.
    const last6   = closed.slice(0, 6);
    const met6    = last6.filter(w => goalMet(w, g)).length;
    const avg6    = mean(last6.map(w => w.total));
    const suggest = Math.max(1, Math.round(avg6));
    const sixWeeks = last6.length ? dateRange(last6[last6.length - 1].monday, last6[0].end) : '';
    if (has6Weeks && met6 <= 2 && avg6 > 0 && g.total > 0 && suggest < g.total) {
      out.push({
        type: 'objectiu_desajustat',
        mascot: 'both',
        emoji: '🎯',
        title: 'Un objectiu més teu',
        stat: `Assolit ${met6} de les últimes 6 setmanes`,
        message: `Amb ${suggest} en comptes de ${g.total} el faries gairebé cada setmana.`,
        color: '#0288d1',
        level,
        strength: 35 + Math.round((g.total - avg6) * 4),
        cooldownDays: 14,
        detail: {
          headline: met6 === 0
            ? 'De les últimes 6 setmanes, l\'objectiu no ha sortit cap vegada.'
            : `De les últimes 6 setmanes, l'objectiu ha sortit ${met6 === 1 ? 'una vegada' : `${met6} vegades`}.`,
          chart: {
            caption: 'Activitats per setmana',
            range: sixWeeks,
            // Aquí la història és la ratlla, no cap setmana: la marcada és
            // l'última, perquè el número escrit sigui el més recent.
            bars: weekBars(last6, { highlight: (_w, i, n) => i === n - 1 }),
            reference: this._goalLine(g),
          },
          facts: [
            { label: 'Setmanes assolides', value: `${met6} de 6`, note: sixWeeks },
            { label: 'El que fas', value: `${fmt1(avg6)} activitats per setmana`, note: sixWeeks },
            { label: 'Objectiu actual', value: `${g.total} per setmana` },
            { label: 'Proposta',        value: `${suggest} per setmana` },
          ],
          meaning: 'Un objectiu que gairebé mai es toca acaba sent soroll. Un de més petit que compleixis de debò empeny més que un de gran sempre a mitges.',
        },
      });
    }

    // ── Compliment a llarg termini ───────────────────────────────────────────
    // 12 setmanes és prou lluny perquè l'usuari ja no ho recordi.
    const last12 = closed.slice(0, 12);
    const met12  = last12.filter(w => goalMet(w, g)).length;
    const recent6 = met6;
    const older6  = closed.slice(6, 12).filter(w => goalMet(w, g)).length;
    const twelveWeeks = last12.length ? dateRange(last12[last12.length - 1].monday, last12[0].end) : '';
    if (has12Weeks && met12 > 0 && met12 < 12) {
      const improving = recent6 > older6;
      out.push({
        type: 'compliment_objectiu',
        mascot: 'both',
        emoji: '📊',
        title: improving ? 'Cada cop més regular' : `${met12} de 12 setmanes`,
        stat: `Les últimes 6 setmanes, ${recent6} assolides`,
        message: improving
          ? `Les 6 anteriors, ${older6}. La regularitat és el que acaba comptant.`
          : `En total, ${met12} de les últimes 12 setmanes.`,
        color: '#006874',
        level,
        strength: 20 + Math.abs(recent6 - older6) * 3,
        cooldownDays: 14,
        detail: {
          headline: 'Les últimes 12 setmanes, una a una. Les de color són les que van arribar a l\'objectiu.',
          chart: {
            caption: 'Activitats per setmana',
            range: twelveWeeks,
            bars: weekBars(last12, { highlight: w => goalMet(w, g) }),
            reference: this._goalLine(g),
          },
          facts: [
            {
              label: 'Últimes 6 setmanes', value: `${recent6} assolides`,
              note: dateRange(closed[5].monday, closed[0].end),
            },
            {
              label: 'Les 6 anteriors', value: `${older6} assolides`,
              note: dateRange(closed[11].monday, closed[6].end),
            },
            { label: 'En total', value: `${met12} de 12`, note: twelveWeeks },
          ],
          meaning: improving
            ? 'Cada cop hi arribes més sovint. Tres mesos ensenyen el fons que una setmana sola amaga.'
            : 'Tres mesos ensenyen el fons: hi ha setmanes que surten i setmanes que no, i el conjunt diu més que qualsevol d\'elles.',
        },
      });
    }

    return out;
  }

  // ── Nivell 2 · Ruptura ─────────────────────────────────────────────────────

  private _breakInsights(
    today: string, workouts: Workout[], sessions: SportSession[], weeks: WeekStat[], hist: History,
  ): FitnessInsight[] {
    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.ruptura;

    // ── Sense activitat ──────────────────────────────────────────────────────
    const allDates = [...workouts.map(w => w.date), ...sessions.map(s => s.date)]
      .filter(d => d <= today);
    const lastDate = allDates.length ? allDates.reduce((max, d) => (d > max ? d : max)) : null;

    // Qui fa quatre dies que hi és no té cap absència: no ha deixat de fer res,
    // encara no ha començat. Dir-li "fa 20 dies que no véns" seria parlar-li
    // d'un hàbit que mai va arribar a tenir.
    if (lastDate && hist.days >= MIN_HISTORY_DAYS) {
      const gap = daysBetween(lastDate, today);
      if (gap >= 10) {
        // El ritme que portava abans de parar: si mai va tenir-ne, no hi ha
        // res a trobar a faltar. La finestra no pot ser més llarga que la seva
        // història (dividir per 8 setmanes qui només n'ha viscut 4 li rebaixa
        // a la meitat un ritme que sí que existia), ni tan curta que quatre
        // dies seguits semblin un hàbit.
        const active     = daysBetween(hist.first ?? lastDate, lastDate);
        const span       = Math.min(56, Math.max(MIN_HISTORY_DAYS, active));
        const from       = offsetDate(lastDate, -span);
        const priorCount = allDates.filter(d => d > from && d <= lastDate).length;
        const priorAvg   = priorCount / (span / 7);
        if (priorAvg >= 2) {
          out.push({
            type: 'sense_activitat',
            mascot: 'both',
            emoji: '🐾',
            title: 'Hi tornem quan vulguis',
            stat: `Fa ${gap} dies de l'última activitat`,
            message: pickVariant([
              'Quan vulguis.',
              'Ja saps on som.',
              'Tu diràs.',
            ], today + 'sense_activitat'),
            color: '#5e35b1',
            level,
            strength: 90 + Math.min(30, gap),
            cooldownDays: 0,
            detail: {
              headline: `L'última activitat que tens registrada és del ${longDate(lastDate)}.`,
              chart: {
                caption: 'Activitats cada 7 dies',
                range: dateRange(offsetDate(today, -55), today),
                bars: rollingWeekBars(today, allDates, 8),
              },
              facts: [
                { label: 'Última activitat',    value: longDate(lastDate) },
                { label: 'Dies des de llavors', value: plural(gap, 'dia', 'dies') },
                {
                  label: 'El ritme que portaves', value: `${fmt1(priorAvg)} activitats per setmana`,
                  note: dateRange(offsetDate(from, 1), lastDate),
                },
              ],
              meaning: 'Això no és cap avís: és el que hi ha apuntat, i prou. Quan hi tornis, la primera activitat ja compta com sempre.',
            },
          });
        }
      }
    }

    // ── Càrrega alta ─────────────────────────────────────────────────────────
    // La mitjana de referència només pot comptar setmanes senceres que
    // l'usuari hagi viscut. Si no, la primera setmana forta d'algú acabat
    // d'arribar sempre surt "molt per sobre de la seva mitjana", perquè la
    // mitjana la fan setmanes buides d'abans que existís.
    const weekAgo = offsetDate(today, -7);
    const last7   = allDates.filter(d => d > weekAgo && d <= today).length;
    const lived   = weeks.slice(1, 9).filter(w => hist.first !== null && w.monday >= hist.first);
    const avg8    = mean(lived.map(w => w.total));
    if (lived.length >= 4 && last7 >= 5 && avg8 >= 1 && last7 >= avg8 * 1.6) {
      out.push({
        type: 'carrega_alta',
        mascot: 'marley',
        emoji: '😴',
        title: 'T\'has guanyat el descans',
        stat: `${last7} sessions en els últims 7 dies`,
        message: pickVariant([
          'Avui toca sofà.',
          'Avui, sofà.',
          'Jo ja hi soc, al sofà.',
        ], today + 'carrega_alta'),
        color: '#5e35b1',
        level,
        strength: 50 + Math.round((last7 / avg8) * 10),
        cooldownDays: 3,
        detail: {
          headline: `Els últims 7 dies portes ${last7} sessions. El teu ritme habitual és ${fmt1(avg8)} per setmana.`,
          chart: {
            caption: 'Activitats cada 7 dies',
            range: dateRange(offsetDate(today, -(7 * (lived.length + 1)) + 1), today),
            bars: rollingWeekBars(today, allDates, lived.length + 1, { highlight: (_x, i, n) => i === n - 1 }),
            reference: { value: avg8, label: 'el teu ritme' },
          },
          facts: [
            {
              label: 'Últims 7 dies', value: plural(last7, 'sessió', 'sessions'),
              note: dateRange(offsetDate(today, -6), today),
            },
            {
              label: 'El teu ritme', value: `${fmt1(avg8)} per setmana`,
              note: dateRange(lived[lived.length - 1].monday, lived[0].end),
            },
            { label: 'Setmanes comptades', value: plural(lived.length, 'setmana', 'setmanes') },
          ],
          meaning: 'El descans no frena res: és quan el cos es queda el que has fet. No cal parar, però un dia tranquil hi cabria de sobres.',
        },
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

      const last  = points[points.length - 1];
      const shown = points.slice(-8);
      const weeks = Math.max(1, Math.round(daysBetween(points[0].date, last.date) / 7));
      best = {
        gain,
        insight: {
          type: 'progres',
          mascot: 'marley',
          emoji: '💪',
          title: `Puges al ${rec.name.toLowerCase()}`,
          stat: `De ${fmtWeight(baseline)} a ${fmtWeight(current)} kg en ${weeks} setmanes`,
          message: `${points.length} sessions registrades. ${pickVariant([
            'Bona jugada.',
            'Així m\'agrada.',
            'Ben fet.',
          ], points[0].date + 'progres_gym')}`,
          color: '#2e7d32',
          level: INSIGHT_LEVEL.progres,
          strength: 0,
          cooldownDays: 7,
          detail: {
            headline: `El pes que has aixecat al ${rec.name.toLowerCase()}, sessió per sessió.`,
            chart: {
              caption: 'Pes més alt de cada sessió',
              range: dateRange(shown[0].date, last.date),
              bars: itemBars(
                shown,
                p => ({ label: shortDate(p.date), value: p.kg, display: `${fmtWeight(p.kg)} kg` }),
                { highlight: (_p, i, n) => i === n - 1 },
              ),
            },
            facts: [
              { label: 'Al principi', value: `${fmtWeight(baseline)} kg`, note: longDate(points[0].date) },
              { label: 'Ara',         value: `${fmtWeight(current)} kg`,  note: longDate(last.date) },
              { label: 'Sessions',    value: plural(points.length, 'sessió', 'sessions'),
                note: dateRange(points[0].date, last.date) },
            ],
            meaning: 'Compta el pes més alt de cada sessió, sense els escalfaments. Pujar a poc a poc és exactament com ha d\'anar.',
          },
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

      const first  = mine[0].date;
      const lastDay = mine[mine.length - 1].date;
      const weeks   = Math.max(1, Math.round(daysBetween(first, lastDay) / 7));
      const shown   = mine.slice(-8);
      best = {
        gain,
        insight: {
          type: 'progres',
          mascot: 'xoco',
          emoji: '🏃',
          title: `Aguantes més al ${sport.name.toLowerCase()}`,
          stat: `De ${Math.round(oldAvg)} a ${Math.round(newAvg)} min per sessió en ${weeks} setmanes`,
          message: `${mine.length} sessions comparades. ${pickVariant([
            'Es nota!',
            'Quines ganes!',
            'Seguim!',
          ], mine[0].date + 'progres_esport')}`,
          color: sport.color,
          level: INSIGHT_LEVEL.progres,
          strength: 0,
          cooldownDays: 7,
          detail: {
            headline: `Cada sessió de ${sport.name.toLowerCase()} dels últims dos mesos, i el que va durar.`,
            chart: {
              caption: 'Minuts de cada sessió',
              range: dateRange(shown[0].date, lastDay),
              bars: itemBars(
                shown,
                x => ({ label: shortDate(x.date), value: x.duration as number, display: `${x.duration} min` }),
                { highlight: (_x, i, n) => i >= n - 2 },
              ),
            },
            facts: [
              {
                label: 'Les primeres sessions', value: `${Math.round(oldAvg)} min de mitjana`,
                note: dateRange(first, mine[half - 1].date),
              },
              {
                label: 'Les últimes', value: `${Math.round(newAvg)} min de mitjana`,
                note: dateRange(mine[mine.length - half].date, lastDay),
              },
              { label: 'Sessions comparades', value: plural(mine.length, 'sessió', 'sessions') },
            ],
            meaning: 'Aguantar més estona és la millora que abans es nota i la que menys es veu: no surt a cap marcador.',
          },
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

    const score     = changeScore(vNow, vPrev);
    const sameCount = Math.abs(now.length - prev.length) <= Math.max(1, prev.length * 0.15);
    const up        = delta > 0;

    // Vuit finestres de 7 dies acabades avui: les quatre últimes són "aquest
    // mes" i les altres quatre, "el passat". Així el gràfic suma exactament
    // les xifres del text.
    const weekly = [7, 6, 5, 4, 3, 2, 1, 0].map(i => ({
      i,
      start: offsetDate(today, -(7 * (i + 1))),
      end:   offsetDate(today, -(7 * i)),
    })).map(w => ({
      ...w,
      kg: workouts
        .filter(x => x.date > w.start && x.date <= w.end)
        .reduce((sum, x) => sum + workoutVolume(x, ctx), 0),
    }));

    return {
      type: 'volum_gym',
      mascot: 'marley',
      emoji: up ? '🏋️' : '🍃',
      title: up ? 'Estàs movent més pes' : 'Mes més suau al gym',
      stat: `${fmtKg(vNow)} aquest mes`,
      message: sameCount
        ? `Amb els mateixos entrenos que el mes passat. ${up ? 'Has pujat intensitat.' : 'Menys càrrega, més recuperació.'}`
        : `${now.length} entrenos, contra ${prev.length} el mes passat.`,
      color: '#00695c',
      level: INSIGHT_LEVEL.progres,
      strength: 30 + score,
      cooldownDays: 7,
      detail: {
        headline: `Aquest mes has mogut ${fmtKg(vNow)} en total; el mes passat, ${fmtKg(vPrev)}.`,
        chart: {
          caption: 'Pes mogut cada 7 dies',
          range: dateRange(offsetDate(from56, 1), today),
          bars: itemBars(
            weekly,
            w => ({
              label: w.i === 0 ? 'ara' : shortDate(offsetDate(w.start, 1)),
              value: w.kg,
              display: fmtKg(w.kg),
            }),
            { muted: w => w.i >= 4, highlight: (_w, i, n) => i === n - 1 },
          ),
        },
        facts: [
          { label: 'Aquest mes',    value: fmtKg(vNow), note: dateRange(offsetDate(from28, 1), today) },
          { label: 'El mes passat', value: fmtKg(vPrev), note: dateRange(offsetDate(from56, 1), from28) },
          { label: 'Entrenos',      value: `${now.length} contra ${prev.length}` },
        ],
        meaning: 'El pes mogut és la suma de totes les sèries: el pes de cada una multiplicat per les repeticions. Serveix per veure la feina total, que el nombre d\'entrenos sol no diu.',
      },
    };
  }

  // ── Nivell 4 · Tendència ───────────────────────────────────────────────────

  private _trendInsights(
    today: string, workouts: Workout[], sessions: SportSession[], sports: Sport[], hist: History,
  ): FitnessInsight[] {
    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.tendencia;

    // ── Ritme d'activitat: 4 setmanes contra les 4 anteriors ─────────────────
    const allDates = [...workouts.map(w => w.date), ...sessions.map(s => s.date)];
    const from28 = offsetDate(today, -28);
    const from56 = offsetDate(today, -56);
    const now    = allDates.filter(d => d > from28 && d <= today).length;
    const prev   = allDates.filter(d => d > from56 && d <= from28).length;

    // "Un 300% més que el mes passat" quan el mes passat encara no hi eres no
    // és una tendència: cal haver viscut els dos mesos que es comparen.
    if (hist.days >= 56 && now + prev >= 8 && prev > 0) {
      const delta = (now - prev) / prev;
      if (Math.abs(delta) >= 0.25) {
        const up  = delta > 0;
        out.push({
          type: 'tendencia_volum',
          mascot: 'both',
          emoji: up ? '📈' : '🌙',
          title: up ? 'Puges de ritme' : 'Mes més tranquil',
          stat: `Aquest mes, ${fmt1(now / 4)} activitats per setmana`,
          message: up
            ? `El mes passat en feies ${fmt1(prev / 4)}.`
            : `El mes passat en feies ${fmt1(prev / 4)}. Cap pressa.`,
          color: up ? '#0288d1' : '#78909c',
          level,
          strength: 30 + changeScore(now, prev),
          cooldownDays: 7,
          detail: {
            headline: `Aquest mes portes ${plural(now, 'activitat', 'activitats')}; el mes passat en vas fer ${prev}.`,
            chart: {
              caption: 'Activitats cada 7 dies',
              range: dateRange(offsetDate(from56, 1), today),
              bars: rollingWeekBars(today, allDates, 8, {
                muted: (_x, i) => i < 4,
                highlight: (_x, i, n) => i === n - 1,
              }),
            },
            facts: [
              {
                label: 'Aquest mes', value: plural(now, 'activitat', 'activitats'),
                note: dateRange(offsetDate(from28, 1), today),
              },
              {
                label: 'El mes passat', value: plural(prev, 'activitat', 'activitats'),
                note: dateRange(offsetDate(from56, 1), from28),
              },
              { label: 'Diferència', value: weeklyChangePhrase(now / 4, prev / 4) },
            ],
            meaning: up
              ? 'Compara els últims 28 dies amb els 28 d\'abans. Pujar de ritme va bé mentre el descans hi càpiga.'
              : 'Compara els últims 28 dies amb els 28 d\'abans. Un mes més tranquil no desfà res del que portes.',
          },
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

    type Point  = { date: string; feeling: FeelingLevel };
    type Series = { label: string | null; mascot: Mascot; color: string; points: Point[] };
    const series: Series[] = [];

    const gymPoints = workouts
      .filter(w => w.date > from8 && w.date <= today && w.feeling != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w): Point => ({ date: w.date, feeling: w.feeling as FeelingLevel }));
    series.push({ label: null, mascot: 'marley', color: '#006874', points: gymPoints });

    for (const sport of sports) {
      const points = sessions
        .filter(s => s.sportId === sport.id && s.date > from8 && s.date <= today && s.feeling != null)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((s): Point => ({ date: s.date, feeling: s.feeling as FeelingLevel }));
      series.push({ label: sport.name, mascot: 'xoco', color: sport.color, points });
    }

    let best: { delta: number; insight: FitnessInsight } | null = null;

    for (const s of series) {
      if (s.points.length < 4) continue;
      const recent4 = s.points.slice(-4);
      const shown   = s.points.slice(-8);
      const last4   = recent4.map(p => p.feeling);
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
          stat: `Les últimes 4 sessions: de ${from} a ${to}`,
          message: pickVariant([
            'Avui, tranquils.',
            'Sense presses.',
            'Jo m\'hi apunto igual.',
          ], today + 'esforc_creixent'),
          color: s.color,
          level: INSIGHT_LEVEL.tendencia,
          strength: 20 + Math.round(delta * 10),
          cooldownDays: 7,
          detail: {
            headline: `Com t'has trobat ${s.label ? `al ${s.label.toLowerCase()}` : 'als entrenos'}, sessió per sessió. Les últimes costen més que les d'abans.`,
            chart: {
              caption: 'Com t\'has trobat (com més alta, més dura)',
              range: dateRange(shown[0].date, shown[shown.length - 1].date),
              bars: itemBars(
                shown,
                p => ({
                  label: shortDate(p.date),
                  value: p.feeling,
                  display: FEELING_LABEL[p.feeling],
                }),
                { highlight: (_p, i, n) => i >= n - 2 },
              ),
            },
            facts: [
              {
                label: 'Les dues d\'abans', value: from,
                note: dateRange(recent4[0].date, recent4[1].date),
              },
              {
                label: 'Les dues últimes', value: to,
                note: dateRange(recent4[2].date, recent4[3].date),
              },
              { label: 'Sessions dibuixades', value: plural(shown.length, 'sessió', 'sessions') },
            ],
            meaning: 'És la sensació que apuntes tu en acabar, no cap mesura. Quan puja acostuma a ser son, feina o poc descans — no pas que hagis perdut forma.',
          },
        },
      };
    }

    return best?.insight ?? null;
  }

  // ── Nivell 5 · Patró ───────────────────────────────────────────────────────

  private _patternInsights(
    today: string, workouts: Workout[], sessions: SportSession[], hist: History,
  ): FitnessInsight[] {
    const out: FitnessInsight[] = [];
    const level = INSIGHT_LEVEL.patro;

    // ── Quins dies entrenes de debò ──────────────────────────────────────────
    // Parla de 12 setmanes, així que en calen 12: dues setmanes d'estrena no
    // són un patró, són com ha anat la setmana.
    const from12 = offsetDate(today, -84);
    const dates  = [...workouts.map(w => w.date), ...sessions.map(s => s.date)]
      .filter(d => d > from12 && d <= today);

    if (hist.days >= 84 && dates.length >= 12) {
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
          stat: `${outOfTen(share)} activitats, ${DAY_NAMES[top2[0].day]} i ${DAY_NAMES[top2[1].day]}`,
          message: weekend / dates.length <= 0.15
            ? `En 12 setmanes, els caps de setmana lliures: ${weekend} de ${dates.length}.`
            : `Sobre ${dates.length} activitats de les últimes 12 setmanes.`,
          color: '#455a64',
          level,
          strength: 10 + Math.round(share * 10),
          cooldownDays: 14,
          detail: {
            headline: `De les ${dates.length} activitats de les últimes 12 setmanes, ${top2[0].count + top2[1].count} van caure ${DAY_NAMES[top2[0].day]} o ${DAY_NAMES[top2[1].day]}.`,
            chart: {
              caption: 'Activitats per dia de la setmana',
              range: dateRange(offsetDate(from12, 1), today),
              bars: itemBars(
                [1, 2, 3, 4, 5, 6, 0],
                day => ({ label: DAY_SHORT[day], value: counts[day] }),
                { highlight: day => day === top2[0].day || day === top2[1].day },
              ),
            },
            facts: [
              { label: 'El teu dia fort', value: `${DAY_NAMES[top2[0].day]} · ${plural(top2[0].count, 'activitat', 'activitats')}` },
              { label: 'El segon',        value: `${DAY_NAMES[top2[1].day]} · ${plural(top2[1].count, 'activitat', 'activitats')}` },
              { label: 'Caps de setmana', value: `${weekend} de ${dates.length}` },
              { label: 'Activitats comptades', value: plural(dates.length, 'activitat', 'activitats') },
            ],
            meaning: 'No és cap consell: és el teu calendari de debò. Va bé saber quins dies pots comptar quan planifiquis la setmana.',
          },
        });
      }
    }

    // ── Equilibri entre tipus d'entrenament ──────────────────────────────────
    const from8   = offsetDate(today, -56);
    const recent  = workouts.filter(w => w.date > from8 && w.date <= today);
    const gymCats = this.trainingTypeService.types().map(t => t.id);

    // Aquí sí que hi cap aviat — són els seus entrenos, comptats — però no el
    // primer dia: amb menys d'un mes, el que sembla un desequilibri encara és
    // l'ordre en què ha començat.
    if (hist.days >= MIN_HISTORY_DAYS && recent.length >= 6 && gymCats.length >= 2) {
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
            stat: `${CATEGORY_LABELS[min]}: ${plural(counts[min], 'entreno', 'entrenos')} en 8 setmanes`,
            message: `${CATEGORY_LABELS[top]} en porta ${counts[top]}. ${pickVariant([
              'Ho equilibrem.',
              'Toca anivellar-ho.',
              'Ja ho arreglarem.',
            ], today + 'equilibri_gym')}`,
            color: CATEGORY_COLORS[min],
            level,
            strength: 10 + Math.min(20, Math.round(ratio * 3)),
            detail: {
              headline: `Els entrenos de gimnàs de les últimes 8 setmanes, repartits per tipus.`,
              chart: {
                caption: 'Entrenos per tipus',
                range: dateRange(offsetDate(from8, 1), today),
                bars: itemBars(
                  ranked,
                  c => ({
                    label: CATEGORY_LABELS[c],
                    value: counts[c],
                    color: CATEGORY_COLORS[c],
                  }),
                  { highlight: c => c === min },
                ),
              },
              facts: [
                { label: 'El que més fas', value: `${CATEGORY_LABELS[top]} · ${plural(counts[top], 'entreno', 'entrenos')}` },
                { label: 'El que menys',   value: `${CATEGORY_LABELS[min]} · ${plural(counts[min], 'entreno', 'entrenos')}` },
                { label: 'Repartiment',    value: breakdown },
                { label: 'Entrenos comptats', value: plural(recent.length, 'entreno', 'entrenos') },
              ],
              meaning: `Anivellar-ho no és cap norma: és el que evita arrossegar una part enrere mentre les altres pugen. ${CATEGORY_LABELS[min]} és la que fa més temps que espera.`,
            },
            cooldownDays: 7,
          });
        }
      }
    }

    return out;
  }
}
