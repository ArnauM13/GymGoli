import { ExerciseCategory } from './exercise.model';

export interface TemplateEntry {
  exerciseId: string;
  exerciseName: string;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  category: ExerciseCategory | 'mixed';
  entries: TemplateEntry[];
  createdAt: string;
  useCount?: number;
  lastUsed?: string;
}

export interface BuiltInTemplate {
  id: string;
  name: string;
  category: ExerciseCategory;
  exerciseNames: string[];
}

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    id: 'builtin-push-a',
    name: 'Push A',
    category: 'push',
    exerciseNames: ['Press banca', 'Press militar', 'Elevacions laterals', 'Extensió tríceps politja'],
  },
  {
    id: 'builtin-push-b',
    name: 'Push B',
    category: 'push',
    exerciseNames: ['Press inclinat amb mancuernes', 'Creuaments en politja', 'Extensió tríceps politja'],
  },
  {
    id: 'builtin-pull-a',
    name: 'Pull A',
    category: 'pull',
    exerciseNames: ['Dominades', 'Rem amb barra', 'Curl bíceps amb barra'],
  },
  {
    id: 'builtin-pull-b',
    name: 'Pull B',
    category: 'pull',
    exerciseNames: ['Rem amb mancuernes', 'Curl bíceps amb mancuernes'],
  },
  {
    id: 'builtin-legs-a',
    name: 'Cames A',
    category: 'legs',
    exerciseNames: ['Sentadilla', 'Pes mort romanès', 'Premsa de cames', 'Elevació de bessons dempeus'],
  },
  {
    id: 'builtin-legs-b',
    name: 'Cames B',
    category: 'legs',
    exerciseNames: ['Hip thrust', 'Pes mort romanès', 'Premsa de cames'],
  },
];
