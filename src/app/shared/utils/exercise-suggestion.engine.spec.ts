import { suggestNextExercises, SuggestionInput } from './exercise-suggestion.util';
import { Exercise } from '../../core/models/exercise.model';

function ex(id: string, category: string, subcategory?: string): Exercise {
  return { id, name: id, category, subcategory, createdAt: new Date() } as unknown as Exercise;
}

describe('suggestNextExercises — full scoring path with edge-case data', () => {
  it('produces ranked suggestions without throwing', () => {
    const catalog = [
      ex('bench', 'push', 'pit'),
      ex('incline', 'push', 'pit'),
      ex('ohp', 'push', 'espatlles'),
      ex('lateral', 'push', 'espatlles'),
      ex('dips', 'push', undefined),            // no subcategory
      ex('foreign', '11111111-2222-3333-4444-555555555555', 'pit'), // custom-type exercise
    ];
    const exerciseById = new Map(catalog.map(e => [e.id, e]));

    const input: SuggestionInput = {
      category: 'push',
      currentEntryIds: ['bench'],               // small → engine runs full scoring
      sources: [
        { exerciseIds: ['bench', 'ohp', 'lateral'], weight: 1 },
        { exerciseIds: ['bench', 'incline', 'dips'], weight: 0.9 },
        { exerciseIds: ['ohp', 'lateral', 'bench'], weight: 0.8 },
        { exerciseIds: [], weight: 0.5 },        // empty source
        { exerciseIds: ['ghost-id', 'incline'], weight: 0.7 }, // id missing from catalog
      ],
      exerciseById,
      limit: 3,
    };

    let out;
    expect(() => { out = suggestNextExercises(input); }).not.toThrow();
    expect(out!.length).toBeGreaterThan(0);
    for (const s of out!) {
      expect(typeof s.exerciseName).toBe('string');
      expect(typeof s.reason).toBe('string');
    }
  });

  it('handles a custom (non push/pull/legs) category without throwing', () => {
    const cat = 'abcd1234-0000-0000-0000-000000000000';
    const catalog = [ex('a', cat, 'pit'), ex('b', cat, undefined), ex('c', cat, 'espatlles')];
    const input: SuggestionInput = {
      category: cat as never,
      currentEntryIds: ['a'],
      sources: [
        { exerciseIds: ['a', 'b', 'c'], weight: 1 },
        { exerciseIds: ['b', 'c', 'a'], weight: 0.9 },
      ],
      exerciseById: new Map(catalog.map(e => [e.id, e])),
      limit: 3,
    };
    expect(() => suggestNextExercises(input)).not.toThrow();
  });
});
