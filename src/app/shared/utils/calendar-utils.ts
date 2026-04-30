import { CATEGORY_COLORS, ExerciseCategory } from '../../core/models/exercise.model';
import { Workout } from '../../core/models/workout.model';

export const MONTHS_CA = [
  'Gener','Febrer','Març','Abril','Maig','Juny',
  'Juliol','Agost','Setembre','Octubre','Novembre','Desembre',
];
export const MONTHS_SHORT = [
  'gen','feb','mar','abr','mai','jun','jul','ago','set','oct','nov','des',
];

export interface CalDay {
  date: string; day: number;
  hasWorkout: boolean; workoutCategories: string[];
  hasSport: boolean; sportColors: string[]; sportIcons: string[];
  isToday: boolean; isFuture: boolean; isSelected: boolean;
}

export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().split('T')[0];
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function workoutCategories(w: Workout): string[] {
  return w.categories?.length ? w.categories : (w.category ? [w.category] : []);
}

export function catDotBackground(cats: string[]): string {
  const brand = getComputedStyle(document.documentElement).getPropertyValue('--c-brand').trim() || '#006874';
  if (!cats?.length) return brand;
  if (cats.length === 1) return CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? brand;
  const colors = cats.map(c => CATEGORY_COLORS[c as ExerciseCategory] ?? '#bbb');
  const step   = 100 / colors.length;
  return `conic-gradient(${colors.map((c, i) => `${c} ${Math.round(i * step)}% ${Math.round((i + 1) * step)}%`).join(', ')})`;
}

export function sportDotBackground(colors: string[]): string {
  if (!colors?.length) return '#FB8C00';
  if (colors.length === 1) return colors[0];
  const step = 100 / colors.length;
  return `conic-gradient(${colors.map((c, i) => `${c} ${Math.round(i * step)}% ${Math.round((i + 1) * step)}%`).join(', ')})`;
}
