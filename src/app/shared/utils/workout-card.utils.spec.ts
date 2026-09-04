import { Workout, WorkoutEntry } from '../../core/models/workout.model';
import { METRIC_CATALOGUE, Sport } from '../../core/models/sport.model';
import {
  feedDayLabel, getExerciseNames, isWorkoutPlanned, sportCardStats, workoutCardColor,
  workoutPrimaryIcon, workoutSetsCount, workoutVolumeFmt, workoutWarmupSetsCount,
} from './workout-card.utils';

function makeSport(metricKeys: string[]): Sport {
  return {
    id: 's1', name: 'Esport', icon: 'sports', color: '#000', subtypes: [],
    metricDefs: metricKeys.map(k => METRIC_CATALOGUE.find(m => m.key === k)!),
    createdAt: new Date(),
  };
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: '2024-01-01', entries: [], createdAt: new Date(), ...overrides };
}

describe('workout-card.utils', () => {
  describe('isWorkoutPlanned()', () => {
    it('is true for a workout with status "planned"', () => {
      expect(isWorkoutPlanned(makeWorkout({ status: 'planned' }))).toBeTrue();
    });

    it('is false for a done workout (or one without a status)', () => {
      expect(isWorkoutPlanned(makeWorkout())).toBeFalse();
    });
  });

  describe('workoutSetsCount()', () => {
    it('returns 0 when there are no entries', () => {
      expect(workoutSetsCount(makeWorkout())).toBe(0);
    });

    it('sums sets across all entries', () => {
      const w = makeWorkout({
        entries: [
          { exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 8 }] },
          { exerciseId: 'b', exerciseName: 'B', sets: [{ weight: 80, reps: 5 }] },
        ],
      });
      expect(workoutSetsCount(w)).toBe(3);
    });

    it('excludes warm-up sets from the working count', () => {
      const w = makeWorkout({
        entries: [
          { exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 20, reps: 10, warmup: true }, { weight: 60, reps: 8 }] },
        ],
      });
      expect(workoutSetsCount(w)).toBe(1);
    });
  });

  describe('workoutWarmupSetsCount()', () => {
    it('returns 0 when there are no warm-up sets', () => {
      const w = makeWorkout({
        entries: [{ exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 60, reps: 8 }] }],
      });
      expect(workoutWarmupSetsCount(w)).toBe(0);
    });

    it('counts only the warm-up sets across all entries', () => {
      const w = makeWorkout({
        entries: [
          { exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 20, reps: 10, warmup: true }, { weight: 60, reps: 8 }] },
          { exerciseId: 'b', exerciseName: 'B', sets: [{ weight: 30, reps: 12, warmup: true }] },
        ],
      });
      expect(workoutWarmupSetsCount(w)).toBe(2);
    });
  });

  describe('workoutCardColor()', () => {
    it('returns the default teal when no categories', () => {
      expect(workoutCardColor(makeWorkout())).toBe('#006874');
    });

    it('returns the category color for a single category', () => {
      expect(workoutCardColor(makeWorkout({ categories: ['push'] }))).toBe('#e57373');
    });

    it('returns a linear-gradient for multiple categories', () => {
      const result = workoutCardColor(makeWorkout({ categories: ['push', 'legs'] }));
      expect(result).toContain('linear-gradient');
      expect(result).toContain('#e57373');
      expect(result).toContain('#81c784');
    });
  });

  describe('workoutVolumeFmt()', () => {
    it('returns an empty string when there is no volume', () => {
      expect(workoutVolumeFmt(makeWorkout())).toBe('');
    });

    it('formats kilograms below 1000', () => {
      const entry: WorkoutEntry = { exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 60, reps: 10 }] };
      expect(workoutVolumeFmt(makeWorkout({ entries: [entry] }))).toBe('600kg');
    });

    it('formats tonnes above 1000kg', () => {
      const entry: WorkoutEntry = { exerciseId: 'a', exerciseName: 'A', sets: [{ weight: 200, reps: 10 }] };
      expect(workoutVolumeFmt(makeWorkout({ entries: [entry] }))).toBe('2.0t');
    });

    it('excludes warm-up sets from the volume', () => {
      const entry: WorkoutEntry = {
        exerciseId: 'a', exerciseName: 'A',
        sets: [{ weight: 20, reps: 10, warmup: true }, { weight: 60, reps: 10 }],
      };
      expect(workoutVolumeFmt(makeWorkout({ entries: [entry] }))).toBe('600kg');
    });
  });

  describe('getExerciseNames()', () => {
    it('returns an em dash when there are no entries', () => {
      expect(getExerciseNames(makeWorkout())).toBe('—');
    });

    it('joins up to 3 names with a middle dot', () => {
      const w = makeWorkout({
        entries: [
          { exerciseId: 'a', exerciseName: 'Press banca', sets: [] },
          { exerciseId: 'b', exerciseName: 'Press militar', sets: [] },
        ],
      });
      expect(getExerciseNames(w)).toBe('Press banca · Press militar');
    });

    it('truncates beyond 3 names with a "+N" suffix', () => {
      const w = makeWorkout({
        entries: [1, 2, 3, 4].map(i => ({ exerciseId: `e${i}`, exerciseName: `Ex${i}`, sets: [] })),
      });
      expect(getExerciseNames(w)).toBe('Ex1 · Ex2 · Ex3 +1');
    });
  });

  describe('feedDayLabel()', () => {
    it('returns "Avui" for today', () => {
      expect(feedDayLabel('2024-03-10', '2024-03-10')).toBe('Avui');
    });

    it('returns "Ahir" for yesterday', () => {
      expect(feedDayLabel('2024-03-09', '2024-03-10')).toBe('Ahir');
    });

    it('returns a formatted date for anything older', () => {
      const result = feedDayLabel('2024-03-01', '2024-03-10');
      expect(result).not.toBe('Avui');
      expect(result).not.toBe('Ahir');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // La icona li posa cara a la targeta del feed, amb el gos a sobre.
  describe('workoutPrimaryIcon()', () => {
    it('takes the icon of the first training type', () => {
      expect(workoutPrimaryIcon(makeWorkout({ categories: ['legs'] }))).toBe('directions_run');
    });

    it('with several types it follows the first, like the primary colour does', () => {
      expect(workoutPrimaryIcon(makeWorkout({ categories: ['push', 'legs'] }))).toBe('fitness_center');
    });

    it('falls back to a gym icon when the workout has no type at all', () => {
      expect(workoutPrimaryIcon(makeWorkout())).toBe('fitness_center');
    });

    it('falls back too for a custom type that no longer exists', () => {
      expect(workoutPrimaryIcon(makeWorkout({ categories: ['un-tipus-esborrat'] }))).toBe('fitness_center');
    });
  });
});

describe('sportCardStats()', () => {
  it('keeps the duration and the most relevant metric, and no more', () => {
    // Pàdel: el que identifica el partit és el resultat, no el tipus.
    const sport = makeSport(['match_type', 'result', 'sets_won']);
    const stats = sportCardStats(
      { duration: 60, metrics: { match_type: 'partida', result: 'guanyat', sets_won: 2 } },
      sport,
    );
    expect(stats.length).toBe(2);
    expect(stats[0].text).toBe('60min');
    expect(stats[1].text).toBe('Guanyat 🏆');
  });

  it('shows the distance when running, not the terrain', () => {
    const sport = makeSport(['distance_km', 'pace', 'terrain']);
    const stats = sportCardStats(
      { duration: 30, metrics: { distance_km: 5, pace: 'moderat', terrain: 'muntanya' } },
      sport,
    );
    expect(stats.map(s => s.text)).toEqual(['30min', '5km']);
  });

  it('fills both slots with metrics when there is no duration', () => {
    const sport = makeSport(['distance_km', 'pace']);
    const stats = sportCardStats({ metrics: { distance_km: 5, pace: 'lent' } }, sport);
    expect(stats.map(s => s.text)).toEqual(['5km', 'Lent']);
  });

  it('leaves out metrics with no value', () => {
    const sport = makeSport(['distance_km', 'pace']);
    expect(sportCardStats({ duration: 20, metrics: {} }, sport).map(s => s.text)).toEqual(['20min']);
  });
});
