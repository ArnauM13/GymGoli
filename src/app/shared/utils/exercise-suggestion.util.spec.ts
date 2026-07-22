import { Exercise, ExerciseCategory, ExerciseSubcategory } from '../../core/models/exercise.model';
import {
  SuggestionSource, suggestNextExercises,
} from './exercise-suggestion.util';

// ── Tiny catalog helpers ────────────────────────────────────────────────────
function ex(id: string, category: ExerciseCategory, subcategory?: ExerciseSubcategory): Exercise {
  return { id, name: id, category, subcategory, createdAt: new Date() };
}

// A pull-day catalog: two back, two biceps.
const CATALOG = new Map<string, Exercise>([
  ['back1', ex('back1', 'pull', 'back')],
  ['back2', ex('back2', 'pull', 'back')],
  ['bi1',   ex('bi1',   'pull', 'biceps')],
  ['bi2',   ex('bi2',   'pull', 'biceps')],
  ['chest', ex('chest', 'push', 'chest')],
]);

function src(ids: string[], weight = 1): SuggestionSource {
  return { exerciseIds: ids, weight };
}

describe('suggestNextExercises', () => {
  it('returns nothing when there are no sources', () => {
    const out = suggestNextExercises({
      category: 'pull', currentEntryIds: [], sources: [], exerciseById: CATALOG,
    });
    expect(out).toEqual([]);
  });

  it('never suggests an exercise already in the workout', () => {
    const sources = [src(['back1', 'bi1']), src(['back1', 'bi1'])];
    const out = suggestNextExercises({
      category: 'pull', currentEntryIds: ['back1'], sources, exerciseById: CATALOG,
    });
    expect(out.map(s => s.exerciseId)).not.toContain('back1');
  });

  it('only suggests exercises of the workout category', () => {
    const sources = [src(['back1', 'bi1', 'chest']), src(['back1', 'bi1'])];
    const out = suggestNextExercises({
      category: 'pull', currentEntryIds: [], sources, exerciseById: CATALOG,
    });
    expect(out.map(s => s.exerciseId)).not.toContain('chest');
  });

  it('learns muscle balance: after the usual 2 biceps, prefers back', () => {
    // The user's pull day is consistently: back → biceps → biceps.
    const sources = [
      src(['back1', 'bi1', 'bi2']),
      src(['back1', 'bi1', 'bi2']),
      src(['back2', 'bi1', 'bi2']),
    ];
    // Today they've already done their 2 biceps but no back yet.
    const out = suggestNextExercises({
      category: 'pull', currentEntryIds: ['bi1', 'bi2'], sources, exerciseById: CATALOG,
    });
    // A back exercise should top the list, not another biceps.
    expect(out.length).toBeGreaterThan(0);
    expect(CATALOG.get(out[0].exerciseId)?.subcategory).toBe('back');
  });

  it('respects order: predicts the exercise that usually comes next', () => {
    // Consistent sequence back1 → bi1.
    const sources = [
      src(['back1', 'bi1']),
      src(['back1', 'bi1']),
      src(['back1', 'bi1']),
    ];
    const out = suggestNextExercises({
      category: 'pull', currentEntryIds: ['back1'], sources, exerciseById: CATALOG,
    });
    expect(out[0].exerciseId).toBe('bi1');
  });

  it('predicts the usual opener when the workout is empty', () => {
    const sources = [
      src(['back1', 'bi1']),
      src(['back1', 'bi2']),
      src(['back1', 'bi1']),
    ];
    const out = suggestNextExercises({
      category: 'pull', currentEntryIds: [], sources, exerciseById: CATALOG,
    });
    expect(out[0].exerciseId).toBe('back1');
  });

  it('honours the limit', () => {
    const sources = [src(['back1', 'back2', 'bi1', 'bi2']), src(['back1', 'bi1'])];
    const out = suggestNextExercises({
      category: 'pull', currentEntryIds: [], sources, exerciseById: CATALOG, limit: 2,
    });
    expect(out.length).toBeLessThanOrEqual(2);
  });

  it('attaches a human-readable reason to each suggestion', () => {
    const sources = [src(['back1', 'bi1']), src(['back1', 'bi1'])];
    const out = suggestNextExercises({
      category: 'pull', currentEntryIds: ['back1'], sources, exerciseById: CATALOG,
    });
    expect(out[0].reason).toBeTruthy();
    expect(typeof out[0].reason).toBe('string');
  });
});
