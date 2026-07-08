export interface ExerciseCategoryDef {
  id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  muscles?: string;
  sortOrder: number;
  createdAt: Date;
}

/** Chip shape shared by every UI that renders a row of category buttons —
 *  train.component's type-grid, FilterBarComponent, calendar-page's
 *  day-planner chips — decoupled from the full ExerciseCategoryDef. */
export interface CategoryChip {
  value: string;
  label: string;
  icon: string;
  color: string;
}

/** Structural shape of CategoryService's read-side — lets pure utility
 *  functions (workout-card.utils, calendar-utils) resolve live category
 *  data without depending on Angular DI directly. */
export interface CategoryLookup {
  label(cat: string): string;
  color(cat: string): string;
}

/** Selectable Material Symbol icons for categories. */
export const CATEGORY_ICON_OPTIONS: string[] = [
  'fitness_center', 'sports_gymnastics', 'directions_run', 'self_improvement',
  'sports_martial_arts', 'monitor_heart', 'accessibility_new', 'sports_kabaddi',
  'sports_handball', 'exercise', 'sprint', 'sports_mma',
];

/** Preset colours for categories. */
export const CATEGORY_COLOR_OPTIONS: string[] = [
  '#e57373', '#64b5f6', '#81c784', '#ffb74d', '#ba68c8', '#4db6ac',
  '#f06292', '#9575cd', '#a1887f', '#90a4ae', '#dce775', '#4dd0e1',
];

/** Default categories seeded on first login — same labels/colors/icons as
 *  the previous hardcoded push/pull/legs, so existing users see zero
 *  visual change on migration day. */
export const DEFAULT_CATEGORIES: Pick<ExerciseCategoryDef, 'key' | 'name' | 'icon' | 'color' | 'muscles' | 'sortOrder'>[] = [
  { key: 'push', name: 'Empenta', icon: 'fitness_center',    color: '#e57373', muscles: 'Pit · Espatlles · Tríceps',          sortOrder: 0 },
  { key: 'pull', name: 'Tracció', icon: 'sports_gymnastics', color: '#64b5f6', muscles: 'Esquena · Bíceps · Avantbraços',     sortOrder: 1 },
  { key: 'legs', name: 'Cames',   icon: 'directions_run',    color: '#81c784', muscles: 'Quàdriceps · Isquiotibials · Glutis', sortOrder: 2 },
];
