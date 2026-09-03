import { pickVariant } from './mascot.voice';

describe('pickVariant', () => {
  const variants = ['Tu diràs.', 'Quan vulguis.', 'Ja saps on soc.'];

  it('always returns one of the given variants', () => {
    for (let i = 0; i < 50; i++) {
      expect(variants).toContain(pickVariant(variants, `2025-04-${i}`));
    }
  });

  it('is stable for the same seed', () => {
    const first = pickVariant(variants, '2025-04-23prova_gym');
    for (let i = 0; i < 10; i++) {
      expect(pickVariant(variants, '2025-04-23prova_gym')).toBe(first);
    }
  });

  it('spreads across every variant over consecutive days', () => {
    const seen = new Set<string>();
    for (let day = 1; day <= 60; day++) {
      seen.add(pickVariant(variants, `2025-04-${day}prova_gym`));
    }
    expect(seen.size).toBe(variants.length);
  });

  it('does not put two insights of the same day on the same index by construction', () => {
    // Different insight types on the same date use different seeds, so they
    // are free to land on different variants.
    const a = pickVariant(variants, '2025-04-23prova_gym');
    const b = pickVariant(variants, '2025-04-23descansa');
    expect([a, b].every(v => variants.includes(v))).toBe(true);
  });

  it('returns the only variant when there is just one', () => {
    expect(pickVariant(['Sortim!'], 'qualsevol')).toBe('Sortim!');
  });

  it('returns an empty string for an empty list instead of undefined', () => {
    expect(pickVariant([], 'qualsevol')).toBe('');
  });
});
