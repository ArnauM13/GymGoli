import { Injectable, inject } from '@angular/core';

import { Exercise, ExerciseCategory } from '../models/exercise.model';
import { workoutCategories } from '../../shared/utils/calendar-utils';
import {
  ExerciseSuggestion, SuggestionSource, suggestNextExercises,
} from '../../shared/utils/exercise-suggestion.util';
import { ExerciseService } from './exercise.service';
import { TemplateService } from './template.service';
import { WorkoutService } from './workout.service';

/** Recency half-life, in "sessions back": each older session of the category
 *  counts a little less, so the model tracks how the user trains *now*. */
const RECENCY_DECAY = 0.9;
/** A saved template is a deliberate plan — weighted like a fairly recent day. */
const TEMPLATE_WEIGHT = 0.8;
/** Below this many learnable days we stay quiet rather than guess blindly. */
const MIN_SOURCES = 2;

/**
 * Turns the user's own workout history and templates into "what should I do
 * next?" suggestions for the day they're currently building. Thin reactive
 * wrapper around the pure {@link suggestNextExercises} engine — read inside a
 * `computed()` and it re-derives whenever workouts, templates or the catalog
 * change.
 */
@Injectable({ providedIn: 'root' })
export class ExerciseSuggestionService {
  private workoutService  = inject(WorkoutService);
  private templateService = inject(TemplateService);
  private exerciseService = inject(ExerciseService);

  /**
   * Ranked next-exercise guesses for a workout of `category` that already
   * contains `currentEntryIds` (in order). Empty when there isn't enough of
   * the user's own history for a category to learn from.
   */
  suggest(
    category: ExerciseCategory,
    currentEntryIds: string[],
    limit = 5,
  ): ExerciseSuggestion[] {
    const exerciseById = new Map<string, Exercise>(
      this.exerciseService.exercises().map(e => [e.id, e]),
    );

    const sources = this.buildSources(category);
    if (sources.length < MIN_SOURCES) return [];

    // Stay quiet once the day already matches the user's typical size for this
    // kind of session: past that point we'd be nudging extra volume, not
    // helping fill out a normal workout.
    if (currentEntryIds.length >= this.typicalSessionSize(sources)) return [];

    return suggestNextExercises({
      category, currentEntryIds, sources, exerciseById, limit,
    });
  }

  /** Weighted-average number of exercises per day across the learnable sources
   *  — the user's "normal" session size for this category (at least 1). */
  private typicalSessionSize(sources: SuggestionSource[]): number {
    let lenSum = 0, weightSum = 0;
    for (const s of sources) {
      lenSum += s.exerciseIds.length * s.weight;
      weightSum += s.weight;
    }
    return weightSum > 0 ? Math.max(1, Math.round(lenSum / weightSum)) : 1;
  }

  /** Ordered training days the engine learns from: past workouts of this
   *  category (recency-weighted) plus saved templates for it. */
  private buildSources(category: ExerciseCategory): SuggestionSource[] {
    const sources: SuggestionSource[] = [];

    const catWorkouts = this.workoutService.doneWorkouts()
      .filter(w => workoutCategories(w).includes(category))
      .sort((a, b) => b.date.localeCompare(a.date));

    catWorkouts.forEach((w, rank) => {
      const ids = w.entries.map(e => e.exerciseId);
      if (ids.length) sources.push({ exerciseIds: ids, weight: Math.pow(RECENCY_DECAY, rank) });
    });

    for (const t of this.templateService.templates()) {
      if (t.category !== category && t.category !== 'mixed') continue;
      const ids = t.entries.map(e => e.exerciseId);
      if (ids.length) sources.push({ exerciseIds: ids, weight: TEMPLATE_WEIGHT });
    }

    return sources;
  }
}
