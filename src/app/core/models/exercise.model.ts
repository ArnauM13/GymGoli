export type ExerciseCategory = 'push' | 'pull' | 'legs';

export type ExerciseSubcategory =
  | 'chest' | 'shoulders' | 'triceps'       // push
  | 'back' | 'biceps' | 'forearms'          // pull
  | 'quads' | 'hamstrings' | 'glutes' | 'calves'; // legs

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  push: 'Empenta',
  pull: 'Tracció',
  legs: 'Cames',
};

export const CATEGORY_ICONS: Record<ExerciseCategory, string> = {
  push: 'fitness_center',
  pull: 'sports_gymnastics',
  legs: 'directions_run',
};

export const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  push: '#e57373',
  pull: '#64b5f6',
  legs: '#81c784',
};

export const SUBCATEGORY_OPTIONS: Record<ExerciseCategory, { value: ExerciseSubcategory; label: string }[]> = {
  push: [
    { value: 'chest', label: 'Pit' },
    { value: 'shoulders', label: 'Espatlles' },
    { value: 'triceps', label: 'Tríceps' },
  ],
  pull: [
    { value: 'back', label: 'Esquena' },
    { value: 'biceps', label: 'Bíceps' },
    { value: 'forearms', label: 'Avantbraços' },
  ],
  legs: [
    { value: 'quads', label: 'Quàdriceps' },
    { value: 'hamstrings', label: 'Isquiotibials' },
    { value: 'glutes', label: 'Glutis' },
    { value: 'calves', label: 'Bessons' },
  ],
};

export const SUBCATEGORY_LABELS: Partial<Record<ExerciseSubcategory, string>> = {
  chest: 'Pit',
  shoulders: 'Espatlles',
  triceps: 'Tríceps',
  back: 'Esquena',
  biceps: 'Bíceps',
  forearms: 'Avantbraços',
  quads: 'Quàdriceps',
  hamstrings: 'Isquiotibials',
  glutes: 'Glutis',
  calves: 'Bessons',
};

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  subcategory?: ExerciseSubcategory;
  notes?: string;
  createdAt: Date;
}

export const DEFAULT_EXERCISES: Omit<Exercise, 'id' | 'createdAt'>[] = [
  { name: 'Press banca', category: 'push', subcategory: 'chest' },
  { name: 'Press inclinat amb mancuernes', category: 'push', subcategory: 'chest' },
  { name: 'Creuaments en politja', category: 'push', subcategory: 'chest' },
  { name: 'Press militar', category: 'push', subcategory: 'shoulders' },
  { name: 'Elevacions laterals', category: 'push', subcategory: 'shoulders' },
  { name: 'Extensió tríceps politja', category: 'push', subcategory: 'triceps' },
  { name: 'Dominades', category: 'pull', subcategory: 'back' },
  { name: 'Rem amb barra', category: 'pull', subcategory: 'back' },
  { name: 'Rem amb mancuernes', category: 'pull', subcategory: 'back' },
  { name: 'Curl bíceps amb barra', category: 'pull', subcategory: 'biceps' },
  { name: 'Curl bíceps amb mancuernes', category: 'pull', subcategory: 'biceps' },
  { name: 'Sentadilla', category: 'legs', subcategory: 'quads' },
  { name: 'Premsa de cames', category: 'legs', subcategory: 'quads' },
  { name: 'Pes mort romanès', category: 'legs', subcategory: 'hamstrings' },
  { name: 'Hip thrust', category: 'legs', subcategory: 'glutes' },
  { name: 'Elevació de bessons dempeus', category: 'legs', subcategory: 'calves' },
];
