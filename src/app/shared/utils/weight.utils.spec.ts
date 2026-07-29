import { displayToKg, effectiveWeightStep, kgToDisplay, weightStep } from './weight.utils';

describe('weight.utils', () => {
  describe('kgToDisplay()', () => {
    it('returns the value unchanged for kg', () => {
      expect(kgToDisplay(80, 'kg')).toBe(80);
    });

    it('converts kg to lb, rounded to 1 decimal', () => {
      expect(kgToDisplay(80, 'lb')).toBe(176.4);
    });

    it('handles zero', () => {
      expect(kgToDisplay(0, 'lb')).toBe(0);
      expect(kgToDisplay(0, 'kg')).toBe(0);
    });
  });

  describe('displayToKg()', () => {
    it('returns the value unchanged for kg', () => {
      expect(displayToKg(80, 'kg')).toBe(80);
    });

    it('converts lb to kg, rounded to the nearest quarter', () => {
      expect(displayToKg(176, 'lb')).toBe(79.75);
    });
  });

  describe('weightStep()', () => {
    it('is 2.5 for kg', () => {
      expect(weightStep('kg')).toBe(2.5);
    });

    it('is 5 for lb', () => {
      expect(weightStep('lb')).toBe(5);
    });
  });

  describe('effectiveWeightStep()', () => {
    it('falls back to the unit default when no custom step is set', () => {
      expect(effectiveWeightStep(null, 'kg')).toBe(2.5);
      expect(effectiveWeightStep(undefined, 'lb')).toBe(5);
      expect(effectiveWeightStep(0, 'kg')).toBe(2.5);
    });

    it('uses the configured kg step for kg', () => {
      expect(effectiveWeightStep(1.25, 'kg')).toBe(1.25);
      expect(effectiveWeightStep(5, 'kg')).toBe(5);
    });

    it('converts the configured kg step to lb', () => {
      expect(effectiveWeightStep(2.5, 'lb')).toBe(kgToDisplay(2.5, 'lb'));
    });
  });

  describe('round-trip', () => {
    it('kg -> lb -> kg stays close to the original value', () => {
      const original = 100;
      const lb = kgToDisplay(original, 'lb');
      const back = displayToKg(lb, 'lb');
      expect(Math.abs(back - original)).toBeLessThan(0.5);
    });
  });
});
