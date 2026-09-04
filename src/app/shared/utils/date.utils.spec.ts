import { nextMidnight, toDateStr, todayStr } from './date.utils';

describe('date.utils', () => {
  describe('toDateStr()', () => {
    it('formats a date with its local calendar day', () => {
      expect(toDateStr(new Date(2026, 8, 3, 15, 30))).toBe('2026-09-03');
    });

    it('pads month and day', () => {
      expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
    });

    it('keeps the local day just after midnight, where toISOString() can roll back', () => {
      // 00:30 local. In any timezone ahead of UTC, toISOString() still reports
      // the previous day — that's what made the app change day hours late.
      expect(toDateStr(new Date(2026, 8, 3, 0, 30))).toBe('2026-09-03');
    });

    it('keeps the local day just before midnight', () => {
      expect(toDateStr(new Date(2026, 8, 3, 23, 45))).toBe('2026-09-03');
    });
  });

  describe('todayStr()', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('is the user\'s local day, even at half past midnight', () => {
      jasmine.clock().mockDate(new Date(2026, 8, 3, 0, 30));
      expect(todayStr()).toBe('2026-09-03');
    });

    it('is the user\'s local day late at night', () => {
      jasmine.clock().mockDate(new Date(2026, 8, 3, 23, 59));
      expect(todayStr()).toBe('2026-09-03');
    });
  });

  describe('nextMidnight()', () => {
    it('is the next local midnight, not 24h from now', () => {
      const from = new Date(2026, 8, 3, 22, 10, 5);
      const next = nextMidnight(from);
      expect(toDateStr(next)).toBe('2026-09-04');
      expect(next.getHours()).toBe(0);
      expect(next.getMinutes()).toBe(0);
    });
  });
});
