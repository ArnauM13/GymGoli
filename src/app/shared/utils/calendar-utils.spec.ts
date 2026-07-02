import { Workout } from '../../core/models/workout.model';
import {
  addDays, catDotBackground, mondayOf, sportDotBackground, workoutCategories,
} from './calendar-utils';

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: '2024-03-06', entries: [], createdAt: new Date(), ...overrides };
}

describe('calendar-utils', () => {
  describe('mondayOf()', () => {
    it('returns the same date when it is already a Monday', () => {
      expect(mondayOf('2024-03-04')).toBe('2024-03-04'); // a Monday
    });

    it('returns the previous Monday for a mid-week date', () => {
      expect(mondayOf('2024-03-06')).toBe('2024-03-04'); // Wednesday
    });

    it('rolls Sunday back to the Monday of the same week (not the next one)', () => {
      expect(mondayOf('2024-03-10')).toBe('2024-03-04'); // Sunday
    });

    it('handles month boundaries', () => {
      expect(mondayOf('2024-03-01')).toBe('2024-02-26'); // Friday, prior month Monday
    });
  });

  describe('addDays()', () => {
    it('adds positive days', () => {
      expect(addDays('2024-03-04', 3)).toBe('2024-03-07');
    });

    it('subtracts with negative days', () => {
      expect(addDays('2024-03-04', -1)).toBe('2024-03-03');
    });

    it('rolls over into the next month', () => {
      expect(addDays('2024-03-30', 3)).toBe('2024-04-02');
    });

    it('rolls over a leap-year February', () => {
      expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
      expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    });

    it('is a no-op for 0 days', () => {
      expect(addDays('2024-03-04', 0)).toBe('2024-03-04');
    });
  });

  describe('workoutCategories()', () => {
    it('prefers the categories array when present', () => {
      const w = makeWorkout({ categories: ['push', 'legs'], category: 'push' });
      expect(workoutCategories(w)).toEqual(['push', 'legs']);
    });

    it('falls back to the single category field when categories is empty', () => {
      const w = makeWorkout({ categories: [], category: 'pull' });
      expect(workoutCategories(w)).toEqual(['pull']);
    });

    it('returns an empty array when neither is set', () => {
      const w = makeWorkout({ categories: undefined, category: undefined });
      expect(workoutCategories(w)).toEqual([]);
    });
  });

  describe('catDotBackground()', () => {
    it('falls back to the brand color when there are no categories', () => {
      expect(catDotBackground([])).toBe('#006874');
    });

    it('returns the category color directly for a single category', () => {
      expect(catDotBackground(['push'])).toBe('#e57373');
    });

    it('returns a conic-gradient covering all categories for multiple categories', () => {
      const result = catDotBackground(['push', 'legs']);
      expect(result).toContain('conic-gradient');
      expect(result).toContain('#e57373');
      expect(result).toContain('#81c784');
    });

    it('falls back to gray for an unknown category', () => {
      const result = catDotBackground(['push', 'unknown']);
      expect(result).toContain('#bbb');
    });
  });

  describe('sportDotBackground()', () => {
    it('falls back to the default orange when there are no colors', () => {
      expect(sportDotBackground([])).toBe('#FB8C00');
    });

    it('returns the color directly for a single sport', () => {
      expect(sportDotBackground(['#1E88E5'])).toBe('#1E88E5');
    });

    it('returns a conic-gradient covering all sports for multiple sports', () => {
      const result = sportDotBackground(['#1E88E5', '#43A047']);
      expect(result).toContain('conic-gradient');
      expect(result).toContain('#1E88E5');
      expect(result).toContain('#43A047');
    });
  });
});
