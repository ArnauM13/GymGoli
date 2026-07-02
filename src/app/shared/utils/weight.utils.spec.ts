import { displayToKg, kgToDisplay, weightStep } from './weight.utils';

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

  describe('round-trip', () => {
    it('kg -> lb -> kg stays close to the original value', () => {
      const original = 100;
      const lb = kgToDisplay(original, 'lb');
      const back = displayToKg(lb, 'lb');
      expect(Math.abs(back - original)).toBeLessThan(0.5);
    });
  });
});
