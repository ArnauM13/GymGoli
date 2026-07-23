import { WorkoutSet, effectiveRepWeight, setVolume } from './workout.model';

describe('bodyweight-aware load', () => {
  const set = (weight: number, reps: number): WorkoutSet => ({ weight, reps });

  describe('effectiveRepWeight', () => {
    it('uses the logged weight for plain weighted exercises', () => {
      expect(effectiveRepWeight(60, { loadType: 'weighted', bodyweightKg: 75 })).toBe(60);
      expect(effectiveRepWeight(60)).toBe(60);
    });

    it('adds bodyweight for bodyweight exercises (logged = added weight)', () => {
      expect(effectiveRepWeight(0,  { loadType: 'bodyweight', bodyweightKg: 75 })).toBe(75);
      expect(effectiveRepWeight(10, { loadType: 'bodyweight', bodyweightKg: 75 })).toBe(85);
    });

    it('subtracts assistance for assisted exercises', () => {
      expect(effectiveRepWeight(20, { loadType: 'assisted', bodyweightKg: 75 })).toBe(55);
      // Assistance never drives the load below zero.
      expect(effectiveRepWeight(200, { loadType: 'assisted', bodyweightKg: 75 })).toBe(0);
    });

    it('falls back to the logged weight when bodyweight is unknown', () => {
      expect(effectiveRepWeight(0,  { loadType: 'bodyweight' })).toBe(0);
      expect(effectiveRepWeight(10, { loadType: 'bodyweight', bodyweightKg: null })).toBe(10);
    });

    it('scales the bodyweight by the exercise factor', () => {
      // Push-ups move ~65% of a 80kg bodyweight.
      expect(effectiveRepWeight(0, { loadType: 'bodyweight', bodyweightKg: 80, bodyweightFactor: 0.65 })).toBe(52);
      // Missing factor → whole bodyweight.
      expect(effectiveRepWeight(0, { loadType: 'bodyweight', bodyweightKg: 80 })).toBe(80);
    });
  });

  describe('setVolume', () => {
    it('counts pure bodyweight reps once a bodyweight is set', () => {
      // 8 pull-ups at 75kg bodyweight → 600, vs 0 without context.
      expect(setVolume(set(0, 8))).toBe(0);
      expect(setVolume(set(0, 8), { loadType: 'bodyweight', bodyweightKg: 75 })).toBe(600);
    });

    it('adds belt weight on top of bodyweight', () => {
      expect(setVolume(set(10, 5), { loadType: 'bodyweight', bodyweightKg: 75 })).toBe(425);
    });
  });
});
