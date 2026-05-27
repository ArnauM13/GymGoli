import { Injectable } from '@angular/core';
import { FitData, ImportedWorkout, ImportResult } from './fit-import.service';

// Apple Health activity types we handle
const STRENGTH_TYPES = new Set([
  'HKWorkoutActivityTypeTraditionalStrengthTraining',
  'HKWorkoutActivityTypeFunctionalStrengthTraining',
  'HKWorkoutActivityTypeCrossTraining',
]);

const SPORT_MAP: Record<string, FitData['sport']> = {
  HKWorkoutActivityTypeRunning:  'running',
  HKWorkoutActivityTypeCycling:  'cycling',
  HKWorkoutActivityTypeWalking:  'walking',
  HKWorkoutActivityTypeSwimming: 'swimming',
};

@Injectable({ providedIn: 'root' })
export class AppleHealthImportService {

  /**
   * Parses an Apple Health export XML file (export.xml from the Health app zip).
   * Returns the most recent workout that matches a known activity type.
   */
  async parse(file: File): Promise<ImportResult> {
    const text = await file.text();
    const doc  = new DOMParser().parseFromString(text, 'application/xml');

    const parseErr = doc.querySelector('parsererror');
    if (parseErr) throw new Error('El fitxer XML no és vàlid');

    const workouts = Array.from(doc.querySelectorAll('Workout'));
    if (workouts.length === 0) throw new Error('No s\'han trobat entrenaments al fitxer');

    // Sort by startDate descending (most recent first)
    const sorted = workouts
      .map(el => ({
        el,
        type:  el.getAttribute('workoutActivityType') ?? '',
        start: new Date(el.getAttribute('startDate') ?? '').getTime(),
      }))
      .filter(w => !isNaN(w.start) && (STRENGTH_TYPES.has(w.type) || w.type in SPORT_MAP))
      .sort((a, b) => b.start - a.start);

    if (sorted.length === 0) {
      throw new Error('No s\'han trobat entrenaments de gimnàs o esport compatibles');
    }

    const { el, type, start } = sorted[0];
    const date = new Date(start).toISOString().split('T')[0];

    const durationMin = parseFloat(el.getAttribute('duration') ?? '0');
    const durationSecs = durationMin > 0 ? durationMin * 60 : undefined;
    const calories = parseFloat(el.getAttribute('totalEnergyBurned') ?? '0') || undefined;

    // Extract heart rate from WorkoutStatistics
    let avgHR: number | undefined;
    let maxHR: number | undefined;
    el.querySelectorAll('WorkoutStatistics').forEach(stat => {
      if (stat.getAttribute('type') === 'HKQuantityTypeIdentifierHeartRate') {
        const avg = parseFloat(stat.getAttribute('average') ?? '');
        const max = parseFloat(stat.getAttribute('maximum') ?? '');
        if (!isNaN(avg)) avgHR = Math.round(avg);
        if (!isNaN(max)) maxHR = Math.round(max);
      }
    });

    if (STRENGTH_TYPES.has(type)) {
      const workout: ImportedWorkout = {
        date, durationSecs, calories, avgHR, maxHR,
        entries: [],   // Apple Health XML has no set-level data
        source: 'apple',
      };
      return { kind: 'workout', data: workout };
    }

    // Cardio: extract distance if available
    const distanceRaw = parseFloat(el.getAttribute('totalDistance') ?? '0');
    const distUnit    = el.getAttribute('totalDistanceUnit') ?? '';
    const distanceMeters = distanceRaw > 0
      ? (distUnit === 'km' ? distanceRaw * 1000 : distanceRaw)
      : undefined;

    const sportData: FitData = {
      durationSecs,
      distanceMeters,
      calories,
      avgHeartRate: avgHR,
      maxHeartRate: maxHR,
      sport: SPORT_MAP[type] ?? 'other',
    };
    return { kind: 'sport', data: sportData };
  }
}
