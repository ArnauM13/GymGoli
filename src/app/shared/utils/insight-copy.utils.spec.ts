import {
  fmt1,
  fmtKg,
  fmtWeight,
  itemBars,
  livedWeeks,
  longDate,
  outOfTen,
  plural,
  rollingWeekBars,
  shortDate,
  weekBars,
  weeklyChangePhrase,
} from './insight-copy.utils';

const TODAY = '2025-04-23'; // dimecres

describe('insight-copy.utils', () => {

  // ── Xifres ───────────────────────────────────────────────────────────────

  describe('fmt1()', () => {
    it('escriu els decimals amb coma', () => {
      expect(fmt1(3.25)).toBe('3,3');
      expect(fmt1(2)).toBe('2,0');
    });
  });

  describe('fmtKg()', () => {
    it('passa a tones a partir del miler, que és on els quilos deixen de dir res', () => {
      expect(fmtKg(940)).toBe('940 kg');
      expect(fmtKg(1240)).toBe('1,2 t');
    });
  });

  describe('fmtWeight()', () => {
    it('no escriu decimals si no n\'hi ha', () => {
      expect(fmtWeight(70)).toBe('70');
      expect(fmtWeight(72.5)).toBe('72,5');
    });
  });

  describe('plural()', () => {
    it('concorda el nom amb el número', () => {
      expect(plural(1, 'activitat', 'activitats')).toBe('1 activitat');
      expect(plural(3, 'activitat', 'activitats')).toBe('3 activitats');
      expect(plural(0, 'activitat', 'activitats')).toBe('0 activitats');
    });
  });

  // ── El llenguatge pla ────────────────────────────────────────────────────

  describe('outOfTen()', () => {
    it('diu una proporció com la diria una persona', () => {
      expect(outOfTen(0.68)).toBe('7 de cada 10');
      expect(outOfTen(0.5)).toBe('5 de cada 10');
    });

    it('no diu mai «0 de cada 10» ni passa de 10', () => {
      expect(outOfTen(0.01)).toBe('1 de cada 10');
      expect(outOfTen(1.4)).toBe('10 de cada 10');
    });
  });

  describe('weeklyChangePhrase()', () => {
    it('compta activitats i no percentatges', () => {
      // El cas que ho va motivar: 1 → 3 sortia com «un 200% més».
      expect(weeklyChangePhrase(3, 1)).toBe('2 activitats més cada setmana.');
      expect(weeklyChangePhrase(1, 3)).toBe('2 activitats menys cada setmana.');
    });

    it('no posa número a una diferència que no es nota', () => {
      expect(weeklyChangePhrase(3.3, 2.9)).toBe('Una mica més cada setmana.');
      expect(weeklyChangePhrase(2.9, 3.3)).toBe('Una mica menys cada setmana.');
    });

    it('concorda el singular', () => {
      expect(weeklyChangePhrase(3, 2)).toBe('1 activitat més cada setmana.');
    });
  });

  // ── Dates ────────────────────────────────────────────────────────────────

  describe('shortDate() i longDate()', () => {
    it('donen la data curta per sota una barra i la llarga per a una frase', () => {
      expect(shortDate('2025-03-03')).toBe('3/3');
      expect(longDate('2025-03-03')).toBe('3 de març');
    });
  });

  // ── Barres ───────────────────────────────────────────────────────────────

  describe('weekBars()', () => {
    const weeks = [
      { monday: '2025-04-21', total: 4 }, // la setmana en curs
      { monday: '2025-04-14', total: 2 },
      { monday: '2025-04-07', total: 0 },
    ];

    it('les gira: al gràfic el temps va d\'esquerra a dreta', () => {
      expect(weekBars(weeks).map(b => b.value)).toEqual([0, 2, 4]);
    });

    it('anomena «ara» la setmana que encara no ha acabat', () => {
      expect(weekBars(weeks, { lastIsCurrent: true }).map(b => b.label))
        .toEqual(['7/4', '14/4', 'ara']);
    });

    it('deixa marcar les barres per contingut i per posició', () => {
      const marked = weekBars(weeks, {
        highlight: (w, i, n) => i === n - 1,
        muted: w => w.total === 0,
      });

      expect(marked.map(b => !!b.highlight)).toEqual([false, false, true]);
      expect(marked.map(b => !!b.muted)).toEqual([true, false, false]);
    });
  });

  describe('rollingWeekBars()', () => {
    it('compta finestres de 7 dies acabades avui', () => {
      const dates = ['2025-04-22', '2025-04-21', '2025-04-10'];
      const bars  = rollingWeekBars(TODAY, dates, 3);

      // Del 10 al 16 d'abril hi ha una activitat (la del 10); els dos últims
      // dies en tenen dues, i la finestra més vella es queda buida.
      expect(bars.length).toBe(3);
      expect(bars.map(b => b.value)).toEqual([0, 1, 2]);
      expect(bars[2].label).toBe('ara');
    });

    it('no compta cap activitat dues vegades', () => {
      const dates = Array.from({ length: 20 }, (_, i) => {
        const d = new Date(TODAY + 'T12:00:00');
        d.setDate(d.getDate() - i);
        return d.toISOString().split('T')[0];
      });

      const total = rollingWeekBars(TODAY, dates, 4).reduce((sum, b) => sum + b.value, 0);
      expect(total).toBe(20);
    });
  });

  describe('itemBars()', () => {
    it('construeix una barra per element i les sap marcar', () => {
      const bars = itemBars(
        [60, 65, 70],
        kg => ({ label: `${kg}`, value: kg, display: `${kg} kg` }),
        { highlight: (_kg, i, n) => i === n - 1 },
      );

      expect(bars.map(b => b.display)).toEqual(['60 kg', '65 kg', '70 kg']);
      expect(bars[2].highlight).toBe(true);
      expect(bars[0].highlight).toBeUndefined();
    });
  });

  describe('livedWeeks()', () => {
    it('no compta setmanes anteriors a la primera activitat', () => {
      expect(livedWeeks(TODAY, '2025-04-02', 8)).toBe(3);
      expect(livedWeeks(TODAY, '2024-01-01', 8)).toBe(8);
      expect(livedWeeks(TODAY, null, 8)).toBe(0);
    });
  });
});
