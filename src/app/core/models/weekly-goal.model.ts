import { mondayOf } from '../../shared/utils/calendar-utils';
import type { GoalMode } from './user-settings.model';

/**
 * L'objectiu setmanal és **d'una setmana**, no de l'app.
 *
 * Abans només hi havia una xifra: si al gener feies 3 activitats per setmana i
 * al març l'apujaves a 4, el gener passava a tenir un objectiu de 4 i les
 * setmanes que havies complert deixaven de comptar. Els insights, que es
 * mesuren contra l'objectiu, s'inventaven un passat que no havia existit.
 *
 * Ara cada canvi deixa una **fita** (`GoalSnapshot`) amb el dilluns a partir
 * del qual mana. L'objectiu d'una setmana és la fita més nova que no li és
 * posterior, i com que només s'escriu al dilluns d'avui, **el passat no es pot
 * tocar**: canviar l'objectiu val per la setmana en curs i les següents.
 *
 * Els paràmetres vius (`weeklyActivityGoal` i companyia) continuen sent
 * l'objectiu d'ara —el que s'edita a Perfil, el que veu l'entrenador— i són
 * els que manen per a la setmana en curs i les futures. La història només
 * contesta pel passat.
 */

/** Els quatre camps que formen un objectiu setmanal. */
export interface GoalValues {
  goalMode:           GoalMode;
  weeklyActivityGoal: number | null;
  weeklyGymGoal:      number | null;
  weeklySportGoal:    number | null;
}

/** Un objectiu i el dilluns de la primera setmana que el fa servir. */
export interface GoalSnapshot extends GoalValues {
  effectiveFrom: string;
}

/** L'objectiu d'una setmana, ja resolt. */
export interface WeeklyGoal extends GoalValues {
  /** Si aquella setmana hi havia cap objectiu marcat. */
  has: boolean;
  /** Activitats/setmana que representa, sigui quin sigui el mode. */
  total: number;
}

/** El mínim per resoldre un objectiu: els paràmetres vius i la història. */
export interface GoalState extends Partial<GoalValues> {
  goalHistory?: GoalSnapshot[] | null;
}

/**
 * El dilluns des del qual val la fita que se sembra el primer cop que algú
 * canvia l'objectiu. Diu «això era així des de sempre»: qui ja tenia un
 * objectiu abans que existís la història conserva el passat que li tocava.
 */
export const GOAL_EPOCH = '1970-01-05';

/**
 * Quantes fites es guarden. Són canvis d'objectiu, no setmanes: 120 són anys
 * de tocar-lo sovint, i cap pantalla mira més enllà d'un any enrere.
 */
export const MAX_GOAL_HISTORY = 120;

/** Els camps dels paràmetres que formen l'objectiu. */
export const GOAL_FIELDS = [
  'goalMode', 'weeklyActivityGoal', 'weeklyGymGoal', 'weeklySportGoal',
] as const;

/** Cert si un canvi de paràmetres toca l'objectiu i, per tant, deixa fita. */
export function touchesGoal(patch: Record<string, unknown>): boolean {
  return GOAL_FIELDS.some(f => f in patch);
}

/** Els quatre camps, normalitzats: el que no hi és és «cap objectiu». */
export function goalValuesOf(s: GoalState): GoalValues {
  return {
    goalMode:           s.goalMode === 'separate' ? 'separate' : 'combined',
    weeklyActivityGoal: s.weeklyActivityGoal ?? null,
    weeklyGymGoal:      s.weeklyGymGoal      ?? null,
    weeklySportGoal:    s.weeklySportGoal    ?? null,
  };
}

/** Hi afegeix el que se'n deriva: si n'hi ha i quantes activitats són. */
export function resolveGoal(v: GoalValues): WeeklyGoal {
  const has = v.goalMode === 'combined'
    ? v.weeklyActivityGoal !== null
    : v.weeklyGymGoal !== null || v.weeklySportGoal !== null;
  const total = v.goalMode === 'combined'
    ? (v.weeklyActivityGoal ?? 0)
    : (v.weeklyGymGoal ?? 0) + (v.weeklySportGoal ?? 0);
  return { ...v, has, total };
}

/** Un objectiu buit: cap xifra marcada. */
export const NO_WEEKLY_GOAL: WeeklyGoal = resolveGoal({
  goalMode: 'combined', weeklyActivityGoal: null, weeklyGymGoal: null, weeklySportGoal: null,
});

/** L'objectiu d'ara: el que s'edita a Perfil i el que mana d'avui endavant. */
export function currentGoal(s: GoalState): WeeklyGoal {
  return resolveGoal(goalValuesOf(s));
}

/**
 * L'objectiu que manava la setmana d'una data.
 *
 * La setmana en curs i les futures porten el d'ara: mentre la setmana és
 * oberta, l'objectiu encara es pot ajustar. Les tancades van a buscar la fita
 * que els toca.
 *
 * Sense cap fita es contesta amb el d'ara, que és el que feia l'app abans
 * d'existir la història: qui no l'ha canviat mai no té cap passat diferent a
 * recordar.
 */
export function goalForWeek(s: GoalState, date: string, today: string): WeeklyGoal {
  const week = mondayOf(date);
  if (week >= mondayOf(today)) return currentGoal(s);

  const snap = (s.goalHistory ?? [])
    .filter(h => h.effectiveFrom <= week)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .pop();
  return snap ? resolveGoal(goalValuesOf(snap)) : currentGoal(s);
}

/**
 * La història després d'un canvi d'objectiu, amb la fita d'aquesta setmana
 * posada al dia.
 *
 * Només escriu al dilluns d'avui: les fites anteriors no es toquen mai, que és
 * el que fa que una setmana tancada conservi el seu objectiu. Si encara no hi
 * ha història, primer hi deixa el que hi havia fins ara des del principi dels
 * temps — si no, les setmanes velles heretarien el canvi que s'acaba de fer,
 * que és exactament el que passava abans.
 */
export function stampWeeklyGoal(
  history: GoalSnapshot[] | null | undefined,
  previous: GoalState,
  next: GoalState,
  today: string,
): GoalSnapshot[] {
  const monday = mondayOf(today);
  const past   = (history ?? []).filter(h => h.effectiveFrom < monday);

  const seeded = past.length
    ? past
    : [{ effectiveFrom: GOAL_EPOCH, ...goalValuesOf(previous) }];

  const out = [...seeded, { effectiveFrom: monday, ...goalValuesOf(next) }]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  return out.length > MAX_GOAL_HISTORY ? out.slice(out.length - MAX_GOAL_HISTORY) : out;
}
