import { ExerciseCategory } from './exercise.model';

export type WeeklyPlanItem =
  | { type: 'gym'; category: ExerciseCategory; templateId?: string }
  | { type: 'sport'; sportId: string };

export interface WeeklyPlan {
  recurring: boolean;
  /** index 0 = Dilluns … 6 = Diumenge */
  days: WeeklyPlanItem[][];
}

export const EMPTY_WEEKLY_PLAN: WeeklyPlan = {
  recurring: false,
  days: [[], [], [], [], [], [], []],
};

export const WEEKDAY_LABELS = [
  'Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte', 'Diumenge',
];
