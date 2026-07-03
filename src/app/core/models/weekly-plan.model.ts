import { ExerciseCategory } from './exercise.model';
import { TemplateEntry } from './template.model';

export type WeeklyPlanItem =
  // `entries` (a custom, one-off exercise list) and `templateId` (reuse a
  // saved template) are mutually exclusive — setting one clears the other.
  | { type: 'gym'; category: ExerciseCategory; templateId?: string; entries?: TemplateEntry[] }
  | { type: 'sport'; sportId: string; subtypeId?: string; duration?: number };

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
