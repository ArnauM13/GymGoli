import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory, LoadType } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout, setVolume } from '../../core/models/workout.model';
import { DifficultyScale } from '../../core/models/user-settings.model';
import { Sport } from '../../core/models/sport.model';
import { workoutCategories } from './calendar-utils';

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

export function workoutSetsCount(w: Workout): number {
  return w.entries.reduce((sum, e) => sum + e.sets.filter(s => !s.warmup).length, 0);
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
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  })();
  if (date === yesterday) return 'Ahir';
  const label = new Date(date + 'T12:00:00')
    .toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
