import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';
import {
  activityTime, countSessions, dateOf, groupDayFeed, sessionKey,
  sessionMascot, splitLine, unifiedLine,
} from './session-group.utils';

const DAY = '2025-04-21';
/** Una hora d'aquell dia, per poder dir «això va ser abans que allò». */
const at = (hhmm: string): Date => new Date(`${DAY}T${hhmm}:00`);

function w(id: string, sessionGroupId?: string, extra: Partial<Workout> = {}): Workout {
  return { id, date: DAY, entries: [], createdAt: at('12:00'), sessionGroupId, ...extra };
}

const SPORT = { id: 'sp1', name: 'Córrer', icon: 'directions_run', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() } as Sport;

function s(
  id: string, sessionGroupId?: string, extra: Partial<SportSession> = {},
): { sport: Sport; session: SportSession } {
  const session: SportSession = {
    id, date: DAY, sportId: 'sp1', createdAt: at('12:00'), sessionGroupId, ...extra,
  };
  return { sport: SPORT, session };
}

describe('session-group.utils', () => {
  describe('sessionKey()', () => {
    it('una activitat sense grup és la seva pròpia sessió', () => {
      expect(sessionKey(w('a'))).toBe('a');
    });

    it('amb grup, la sessió és el grup', () => {
      expect(sessionKey(w('a', 'g1'))).toBe('g1');
    });
  });

  describe('countSessions()', () => {
    it('compta cada activitat solta com una sessió — com abans dels grups', () => {
      expect(countSessions([w('a'), w('b'), s('c').session])).toBe(3);
    });

    it('el que s\'ha fet d\'una tirada compta un cop', () => {
      // Al gimnàs i, en acabar, vint minuts de cinta.
      expect(countSessions([w('a', 'g1'), s('b', 'g1').session])).toBe(1);
    });

    it('dues anades el mateix dia continuen sent dues', () => {
      // Gimnàs al matí, futbol a la tarda.
      expect(countSessions([w('a', 'g1'), s('b', 'g1').session, s('c').session])).toBe(2);
    });

    it('sense activitat no hi ha cap sessió', () => {
      expect(countSessions([])).toBe(0);
    });
  });

  describe('groupDayFeed()', () => {
    it('deixa les activitats soltes com estaven, i sense caixa', () => {
      const groups = groupDayFeed([w('a')], [s('b')]);
      expect(groups.length).toBe(2);
      expect(groups.map(g => g.grouped)).toEqual([false, false]);
      expect(groups[0].items.map(i => i.kind)).toEqual(['workout']);
      expect(groups[1].items.map(i => i.kind)).toEqual(['sport']);
    });

    it('ajunta les que comparteixen sessió', () => {
      const groups = groupDayFeed([w('a', 'g1')], [s('b', 'g1')]);
      expect(groups.length).toBe(1);
      expect(groups[0].grouped).toBeTrue();
      expect(groups[0].key).toBe('g1');
      expect(groups[0].items.map(i => i.kind)).toEqual(['workout', 'sport']);
      expect(groups[0].items.map(dateOf)).toEqual([DAY, DAY]);
    });

    it('un grup amb una sola activitat es pinta com si no en tingués', () => {
      const groups = groupDayFeed([w('a', 'g1')], []);
      expect(groups[0].grouped).toBeFalse();
    });

    it('sense res, cap grup', () => {
      expect(groupDayFeed([], [])).toEqual([]);
    });

    // ── L'ordre del dia ────────────────────────────────────────────────────
    it('el que s\'ha fet abans surt abans, sigui de la mena que sigui', () => {
      // Cursa a les vuit, gimnàs a les deu: el dia es llegeix com es va viure.
      const groups = groupDayFeed([w('gym', undefined, { createdAt: at('10:00') })],
                                  [s('run', undefined, { createdAt: at('08:00') })]);
      expect(groups.map(g => g.key)).toEqual(['run', 'gym']);
    });

    it('dins d\'una sessió unida, també', () => {
      const groups = groupDayFeed([w('gym', 'g1', { createdAt: at('10:00') })],
                                  [s('run', 'g1', { createdAt: at('08:00') })]);
      expect(groups[0].items.map(i => i.kind)).toEqual(['sport', 'workout']);
    });

    it('un pla va sempre al davant: encara no ha passat', () => {
      const groups = groupDayFeed(
        [w('pla', undefined, { status: 'planned', createdAt: at('23:00') })],
        [s('fet', undefined, { createdAt: at('08:00') })],
      );
      expect(groups.map(g => g.key)).toEqual(['pla', 'fet']);
    });

    it('un pla fet s\'ordena per quan s\'ha fet, no per quan es va apuntar', () => {
      // Apuntat fa dies i fet a la tarda: va després de la cursa del matí.
      const planFet = w('pla', undefined, {
        status: 'done',
        createdAt: new Date('2025-04-14T09:00:00'),
        startedAt: at('18:00'),
      });
      const groups = groupDayFeed([planFet], [s('run', undefined, { createdAt: at('09:00') })]);
      expect(groups.map(g => g.key)).toEqual(['run', 'pla']);
    });
  });

  describe('activityTime()', () => {
    it('sense hora de començament, l\'alta de la fila ja és l\'hora bona', () => {
      expect(activityTime({ kind: 'workout', workout: w('a') })).toBe(at('12:00').getTime());
    });

    it('amb hora de començament, mana ella', () => {
      const workout = w('a', undefined, { startedAt: at('18:00') });
      expect(activityTime({ kind: 'workout', workout })).toBe(at('18:00').getTime());
    });
  });

  describe('la veu', () => {
    const gym   = () => groupDayFeed([w('a')], [])[0];
    const sport = () => groupDayFeed([], [s('b')])[0];
    const mixed = () => groupDayFeed([w('a', 'g1')], [s('b', 'g1')])[0];

    it('parla el gos de la mena d\'activitat', () => {
      expect(sessionMascot(gym())).toBe('marley');
      expect(sessionMascot(sport())).toBe('xoco');
    });

    it('barrejant gimnàs i esport hi són tots dos', () => {
      expect(sessionMascot(mixed())).toBe('both');
      expect(sessionMascot(gym(), sport())).toBe('both');
    });

    it('unir-les ho diu qui toca, i curt', () => {
      expect(unifiedLine(gym())).toEqual({ mascot: 'marley', message: 'Tot en una sessió.' });
      expect(unifiedLine(sport())).toEqual({ mascot: 'xoco', message: 'Tot d\'una tirada!' });
      // Transversal: menys gos i més dada, com mana MASCOTES.md.
      expect(unifiedLine(gym(), sport())).toEqual({ mascot: 'both', message: 'Una sola sessió.' });
    });

    it('separar la sessió ho diu el gos del que hi havia dins', () => {
      expect(splitLine(gym()).mascot).toBe('marley');
      expect(splitLine(sport()).mascot).toBe('xoco');
      expect(splitLine(mixed())).toEqual({ mascot: 'both', message: 'Cada activitat, la seva sessió.' });
    });
  });
});
