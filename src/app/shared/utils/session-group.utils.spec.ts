import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';
import { countSessions, dateOf, groupDayFeed, itemsOf, sessionKey } from './session-group.utils';

function w(id: string, sessionGroupId?: string): Workout {
  return { id, date: '2025-04-21', entries: [], createdAt: new Date(), sessionGroupId };
}

const SPORT = { id: 'sp1', name: 'Córrer', icon: 'directions_run', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() } as Sport;

function s(id: string, sessionGroupId?: string): { sport: Sport; session: SportSession } {
  const session: SportSession = { id, date: '2025-04-21', sportId: 'sp1', createdAt: new Date(), sessionGroupId };
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
      expect(groups[0].workouts.map(x => x.id)).toEqual(['a']);
      expect(groups[1].sports.map(x => x.session.id)).toEqual(['b']);
    });

    it('ajunta les que comparteixen sessió', () => {
      const groups = groupDayFeed([w('a', 'g1')], [s('b', 'g1')]);
      expect(groups.length).toBe(1);
      expect(groups[0].grouped).toBeTrue();
      expect(groups[0].key).toBe('g1');
      expect(groups[0].workouts.map(x => x.id)).toEqual(['a']);
      expect(groups[0].sports.map(x => x.session.id)).toEqual(['b']);
    });

    it('la sessió es col·loca on hi ha la seva primera activitat', () => {
      const groups = groupDayFeed([w('a'), w('b', 'g1')], [s('c', 'g1')]);
      expect(groups.map(g => g.key)).toEqual(['a', 'g1']);
    });

    it('un grup amb una sola activitat es pinta com si no en tingués', () => {
      // Passa en obrir «afegeix-hi activitat» i no acabar-ho: no hi ha res a
      // netejar, la targeta es llegeix igual.
      const groups = groupDayFeed([w('a', 'g1')], []);
      expect(groups[0].grouped).toBeFalse();
    });

    it('sense res, cap grup', () => {
      expect(groupDayFeed([], [])).toEqual([]);
    });
  });

  describe('itemsOf()', () => {
    it('torna les activitats de la sessió, entrenaments primer', () => {
      const [group] = groupDayFeed([w('a', 'g1')], [s('b', 'g1')]);
      expect(itemsOf(group).map(i => i.kind)).toEqual(['workout', 'sport']);
      expect(itemsOf(group).map(dateOf)).toEqual(['2025-04-21', '2025-04-21']);
    });

    it('una activitat solta és una sessió d\'un element', () => {
      const [group] = groupDayFeed([w('a')], []);
      expect(itemsOf(group)).toEqual([{ kind: 'workout', workout: w('a') }]);
    });
  });
});
