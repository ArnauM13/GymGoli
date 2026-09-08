import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, ExerciseCategory, LoadType } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout, hasFullEntries, setVolume } from '../../core/models/workout.model';
import { DifficultyScale } from '../../core/models/user-settings.model';
import { CARD_METRIC_PRIORITY, Sport, SportMetricDef } from '../../core/models/sport.model';
import { workoutCategories } from './calendar-utils';
import { toDateStr } from './date.utils';

export function getBrandColor(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--c-brand').trim() || '#006874';
}

export function isWorkoutPlanned(w: Workout): boolean {
  return (w.status ?? 'done') === 'planned';
}

export function workoutCategoryList(w: Workout): ExerciseCategory[] {
  return workoutCategories(w) as ExerciseCategory[];
}

export function getCatLabel(cat: string): string {
  return CATEGORY_LABELS[cat as ExerciseCategory] ?? cat;
}

export function getExerciseNames(w: Workout): string {
  const names = w.entries.map(e => e.exerciseName);
  if (names.length === 0) return '—';
  if (names.length <= 3) return names.join(' · ');
  return names.slice(0, 3).join(' · ') + ` +${names.length - 3}`;
}

/**
 * El nom del tipus d'entrenament ("Empenta", "Empenta · Tracció").
 *
 * És el que identifica una sessió d'un cop d'ull, així que mana com a títol
 * de la targeta: abans el tipus anava en una xapa tota sola i el títol era la
 * llista d'exercicis retallada, que no deia gaire.
 */
export function workoutTypeLabel(w: Workout): string {
  const cats = workoutCategories(w);
  if (!cats.length) return 'Entrenament';
  return cats.map(c => getCatLabel(c)).join(' · ');
}

/** Una xifra d'una targeta d'activitat: el glif i el valor curt. */
export interface ActivityStat { icon: string; text: string; }

/** Les xifres d'una sessió d'esport: durada i mètriques, com les sèries i el
 *  volum ho són per a un entrenament. */
export function sportStatParts(
  session: { duration?: number; metrics?: Record<string, string | number> },
  sport: Sport,
): ActivityStat[] {
  const stats: ActivityStat[] = [];
  if (session.duration) stats.push({ icon: 'timer', text: `${session.duration}min` });
  const metrics = session.metrics ?? {};
  for (const def of sport.metricDefs ?? []) {
    const stat = _metricStat(def, metrics[def.key]);
    if (stat) stats.push(stat);
  }
  return stats;
}

/**
 * Les xifres que caben a la previsualització de la targeta: dues, comptant-hi
 * la durada.
 *
 * Un esport pot tenir-ne mitja dotzena i totes juntes converteixen la targeta
 * en una fitxa tècnica. Es queden la durada i la mètrica més rellevant de
 * l'esport (`CARD_METRIC_PRIORITY`): el resultat a pàdel o futbol, la
 * distància a córrer o nedar. La resta surten en obrir la sessió.
 */
export function sportCardStats(
  session: { duration?: number; metrics?: Record<string, string | number> },
  sport: Sport,
  max = 2,
): ActivityStat[] {
  const stats: ActivityStat[] = [];
  if (session.duration) stats.push({ icon: 'timer', text: `${session.duration}min` });

  const metrics = session.metrics ?? {};
  const byRelevance = [...(sport.metricDefs ?? [])].sort((a, b) => _metricRank(a.key) - _metricRank(b.key));
  for (const def of byRelevance) {
    if (stats.length >= max) break;
    const stat = _metricStat(def, metrics[def.key]);
    if (stat) stats.push(stat);
  }
  return stats.slice(0, max);
}

/** Fora de la llista de prioritats es va al final, sense desempatar entre elles
 *  (l'ordre del propi esport mana). */
function _metricRank(key: string): number {
  const i = CARD_METRIC_PRIORITY.indexOf(key);
  return i === -1 ? CARD_METRIC_PRIORITY.length : i;
}

/**
 * El valor d'una mètrica tal com es llegeix («Guanyat 🏆», «5km»).
 *
 * Una mètrica sense valor no existeix: retorna `null` i qui la demana la
 * salta, tant a la xifra de la targeta com al detall de la sessió.
 */
export function sportMetricValue(def: SportMetricDef, v: string | number | undefined | null): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (def.type === 'select') {
    const opt = (def.options ?? []).find(o => o.value === v);
    return opt?.label ?? String(v);
  }
  return `${v}${def.unit ?? ''}`;
}

/** La icona que acompanya una mètrica: una tria és una etiqueta, un número
 *  és una dada. */
export function sportMetricIcon(def: SportMetricDef): string {
  return def.type === 'select' ? 'label' : 'insights';
}

/** Una mètrica amb valor es converteix en xifra; sense valor, no hi és. */
function _metricStat(def: SportMetricDef, v: string | number | undefined): ActivityStat | null {
  const text = sportMetricValue(def, v);
  return text === null ? null : { icon: sportMetricIcon(def), text };
}

export function workoutCardColor(w: Workout): string {
  const cats = workoutCategories(w);
  if (!cats.length) return getBrandColor();
  if (cats.length === 1) return CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? getBrandColor();
  const fallback = getBrandColor();
  const colors = cats.map(c => CATEGORY_COLORS[c as ExerciseCategory] ?? fallback);
  const step = 100 / colors.length;
  return `linear-gradient(180deg, ${colors.map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`).join(', ')})`;
}

export function workoutPrimaryColor(w: Workout): string {
  const cats  = workoutCategories(w);
  const brand = getBrandColor();
  return cats.length ? (CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? brand) : brand;
}

/**
 * La icona del primer tipus d'entrenament, per posar-li cara a la targeta.
 *
 * Un entrenament pot tenir més d'un tipus i la barra de color ja els mostra
 * tots; la icona es queda amb el primer, igual que `workoutPrimaryColor`.
 */
export function workoutPrimaryIcon(w: Workout): string {
  const cats = workoutCategories(w);
  return (cats.length && CATEGORY_ICONS[cats[0] as ExerciseCategory]) || 'fitness_center';
}

/**
 * Quants exercicis té la sessió.
 *
 * Quan les sèries hi són es compten les de debò —són les que l'usuari acaba de
 * tocar i potser encara no ha pujat—; quan la sessió només s'ha demanat en
 * mode targeta, val el que n'ha comptat el servidor.
 *
 * Aquest parell de camins és el que fa que una targeta plegada es pugui pintar
 * sencera sense baixar-se cap sèrie. Abans, per ensenyar «6 exerc · 21 sèr ·
 * 4.2t» calia el `jsonb` complet de la sessió, i per això l'app es baixava
 * tres mesos d'entrenaments per acabar ensenyant-ne tres números.
 */
export function workoutExerciseCount(w: Workout): number {
  if (!hasFullEntries(w)) return w.exerciseCount ?? 0;
  return w.entries.length;
}

export function workoutSetsCount(w: Workout): number {
  if (!hasFullEntries(w)) return w.setCount ?? 0;
  return w.entries.reduce((sum, e) => sum + e.sets.filter(s => !s.warmup).length, 0);
}

/** Warm-up sets across the whole workout — counted separately so they can be
 *  surfaced ("3 sèr + 1 esc") without inflating the working-set total. */
export function workoutWarmupSetsCount(w: Workout): number {
  if (!hasFullEntries(w)) return w.warmupCount ?? 0;
  return w.entries.reduce((sum, e) => sum + e.sets.filter(s => s.warmup).length, 0);
}

/** Optional bodyweight context so bodyweight/assisted exercises count their
 *  real load. Omitted → every exercise is treated as plain weighted (as before). */
export interface WorkoutVolumeContext {
  bodyweightKg?: number | null;
  /** Load type of an exercise by id; undefined → 'weighted'. */
  loadTypeOf?: (exerciseId: string) => LoadType | undefined;
  /** Bodyweight factor of an exercise by id; undefined → 1. */
  bodyweightFactorOf?: (exerciseId: string) => number | undefined;
}

export function workoutVolume(w: Workout, ctx?: WorkoutVolumeContext): number {
  // Sense les sèries, el número el porta el servidor: `activity_feed` fa la
  // mateixa matemàtica que hi ha aquí sota (pes corporal i tipus de càrrega
  // inclosos) i la migració 031 la documenta al costat.
  if (!hasFullEntries(w)) return w.volume ?? 0;
  return w.entries.reduce((sum, e) => {
    const setCtx = {
      bodyweightKg: ctx?.bodyweightKg,
      loadType: ctx?.loadTypeOf?.(e.exerciseId),
      bodyweightFactor: ctx?.bodyweightFactorOf?.(e.exerciseId),
    };
    return sum + e.sets.reduce((s2, set) => set.warmup ? s2 : s2 + setVolume(set, setCtx), 0);
  }, 0);
}

export function workoutVolumeFmt(w: Workout, ctx?: WorkoutVolumeContext): string {
  const vol = workoutVolume(w, ctx);
  if (vol <= 0) return '';
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}t`;
  return `${Math.round(vol)}kg`;
}

export function emojiOf(level: FeelingLevel): string {
  return FEELING_EMOJI[level];
}

/** Same underlying 1-5 feeling value, shown either as an emoji or mapped
 *  onto a 1-10 numeric scale (×2), depending on the user's preference. */
export function formatFeeling(level: FeelingLevel, scale: DifficultyScale): string {
  return scale === 'numeric' ? String(level * 2) : FEELING_EMOJI[level];
}

export function sportSessionSummary(
  sub: { duration?: number; feeling?: FeelingLevel; subtypeId?: string },
  sport: Sport,
  scale: DifficultyScale = 'emoji',
): string {
  const parts: string[] = [];
  if (sub.subtypeId) {
    const sub2 = sport.subtypes.find(s => s.id === sub.subtypeId);
    if (sub2) parts.push(sub2.name);
  }
  if (sub.duration) parts.push(`${sub.duration}min`);
  if (sub.feeling)  parts.push(formatFeeling(sub.feeling, scale));
  return parts.join(' · ');
}

/** "Avui" / "Ahir" / a formatted Catalan date, relative to `today`. */
export function feedDayLabel(date: string, today: string): string {
  if (date === today) return 'Avui';
  const yesterday = (() => {
    // Noon (not midnight) so toISOString() can't roll the date back a day in
    // timezones ahead of UTC — otherwise "ahir" resolves to two days ago.
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    return toDateStr(d);
  })();
  if (date === yesterday) return 'Ahir';
  const label = new Date(date + 'T12:00:00')
    .toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
