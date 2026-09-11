import {
  GOAL_EPOCH, GoalSnapshot, MAX_GOAL_HISTORY,
  currentGoal, goalForWeek, resolveGoal, stampWeeklyGoal, touchesGoal,
} from './weekly-goal.model';
import { toDateStr } from '../../shared/utils/date.utils';

/** Dimecres fix: la setmana en curs va del 21 al 27 d'abril de 2025. */
const TODAY  = '2025-04-23';
const MONDAY = '2025-04-21';

function snap(effectiveFrom: string, activity: number | null): GoalSnapshot {
  return {
    effectiveFrom, goalMode: 'combined',
    weeklyActivityGoal: activity, weeklyGymGoal: null, weeklySportGoal: null,
  };
}

describe('weekly-goal.model', () => {
  describe('resolveGoal()', () => {
    it('combinat: hi ha objectiu quan hi ha xifra, i el total és aquella xifra', () => {
      const g = resolveGoal({
        goalMode: 'combined', weeklyActivityGoal: 3, weeklyGymGoal: null, weeklySportGoal: null,
      });
      expect(g.has).toBeTrue();
      expect(g.total).toBe(3);
    });

    it('separat: en té prou amb un dels dos, i el total els suma', () => {
      const g = resolveGoal({
        goalMode: 'separate', weeklyActivityGoal: null, weeklyGymGoal: 2, weeklySportGoal: 1,
      });
      expect(g.has).toBeTrue();
      expect(g.total).toBe(3);
    });

    it('sense cap xifra no hi ha objectiu', () => {
      const g = resolveGoal({
        goalMode: 'combined', weeklyActivityGoal: null, weeklyGymGoal: null, weeklySportGoal: null,
      });
      expect(g.has).toBeFalse();
      expect(g.total).toBe(0);
    });
  });

  describe('touchesGoal()', () => {
    it('reconeix els camps de l\'objectiu', () => {
      expect(touchesGoal({ weeklyActivityGoal: 3 })).toBeTrue();
      expect(touchesGoal({ goalMode: 'separate' })).toBeTrue();
      expect(touchesGoal({ weeklyGymGoal: null })).toBeTrue();
    });

    it('deixa passar la resta de paràmetres', () => {
      expect(touchesGoal({ themeMode: 'dark' })).toBeFalse();
    });
  });

  describe('goalForWeek()', () => {
    const state = {
      goalMode: 'combined' as const, weeklyActivityGoal: 4,
      weeklyGymGoal: null, weeklySportGoal: null,
      goalHistory: [snap(GOAL_EPOCH, 2), snap(MONDAY, 4)],
    };

    it('la setmana en curs porta l\'objectiu d\'ara', () => {
      expect(goalForWeek(state, TODAY, TODAY).total).toBe(4);
    });

    it('una setmana futura també: encara es pot ajustar', () => {
      expect(goalForWeek(state, '2025-05-06', TODAY).total).toBe(4);
    });

    it('una setmana tancada conserva el que es demanava llavors', () => {
      expect(goalForWeek(state, '2025-04-16', TODAY).total).toBe(2);
    });

    it('qualsevol dia de la setmana dona el mateix objectiu', () => {
      const days = ['2025-04-14', '2025-04-17', '2025-04-20'];
      expect(days.map(d => goalForWeek(state, d, TODAY).total)).toEqual([2, 2, 2]);
    });

    it('sense història, el passat llegeix l\'objectiu d\'ara', () => {
      const noHistory = { ...state, goalHistory: [] };
      expect(goalForWeek(noHistory, '2024-01-10', TODAY).total).toBe(4);
    });

    it('una setmana d\'abans de tenir objectiu no en té cap', () => {
      const started = {
        ...state,
        goalHistory: [snap(GOAL_EPOCH, null), snap(MONDAY, 4)],
      };
      expect(goalForWeek(started, '2025-04-16', TODAY).has).toBeFalse();
    });
  });

  describe('stampWeeklyGoal()', () => {
    const before = { goalMode: 'combined' as const, weeklyActivityGoal: 3, weeklyGymGoal: null, weeklySportGoal: null };
    const after  = { ...before, weeklyActivityGoal: 4 };

    it('el primer canvi sembra el que hi havia des del principi dels temps', () => {
      const out = stampWeeklyGoal([], before, after, TODAY);
      expect(out).toEqual([
        jasmine.objectContaining({ effectiveFrom: GOAL_EPOCH, weeklyActivityGoal: 3 }),
        jasmine.objectContaining({ effectiveFrom: MONDAY,     weeklyActivityGoal: 4 }),
      ]);
    });

    it('escriu al dilluns d\'aquesta setmana, mai a un altre', () => {
      const out = stampWeeklyGoal([], before, after, TODAY);
      expect(out[out.length - 1].effectiveFrom).toBe(MONDAY);
    });

    it('no toca cap fita anterior', () => {
      const old = [snap(GOAL_EPOCH, 1), snap('2025-03-03', 3)];
      const out = stampWeeklyGoal(old, before, after, TODAY);
      expect(out.slice(0, 2)).toEqual(old);
      expect(out.length).toBe(3);
    });

    it('tornar a tocar-lo la mateixa setmana no hi afegeix una segona fita', () => {
      const once  = stampWeeklyGoal([], before, after, TODAY);
      const twice = stampWeeklyGoal(once, after, { ...after, weeklyActivityGoal: 5 }, TODAY);
      expect(twice.length).toBe(2);
      expect(twice[1]).toEqual(jasmine.objectContaining({ effectiveFrom: MONDAY, weeklyActivityGoal: 5 }));
    });

    it('guarda el mode, no només la xifra', () => {
      const out = stampWeeklyGoal([], before, {
        goalMode: 'separate', weeklyActivityGoal: null, weeklyGymGoal: 2, weeklySportGoal: 1,
      }, TODAY);
      expect(out[1]).toEqual(jasmine.objectContaining({
        goalMode: 'separate', weeklyGymGoal: 2, weeklySportGoal: 1,
      }));
    });

    it('es queda amb les fites més noves quan n\'hi ha massa', () => {
      // Un canvi per setmana, molt abans d'avui: més fites que les que caben.
      const history: GoalSnapshot[] = [];
      for (let i = 0; i < MAX_GOAL_HISTORY + 20; i++) {
        const d = new Date('2020-01-06T12:00:00');
        d.setDate(d.getDate() + i * 7);
        history.push(snap(toDateStr(d), i));
      }
      const out = stampWeeklyGoal(history, before, after, TODAY);
      expect(out.length).toBe(MAX_GOAL_HISTORY);
      expect(out[out.length - 1].effectiveFrom).toBe(MONDAY);
    });
  });

  describe('currentGoal()', () => {
    it('mira els camps vius, no la història', () => {
      const g = currentGoal({
        goalMode: 'combined', weeklyActivityGoal: 5, weeklyGymGoal: null, weeklySportGoal: null,
        goalHistory: [snap(GOAL_EPOCH, 1)],
      });
      expect(g.total).toBe(5);
    });
  });
});
