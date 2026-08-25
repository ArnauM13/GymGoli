import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';

import { WorkoutEditorComponent } from './workout-editor.component';
import { WorkoutService } from '../../../core/services/workout.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { OfflineService } from '../../../core/services/offline.service';
import { FeedbackService } from '../../services/feedback.service';
import { Workout, WorkoutSet } from '../../../core/models/workout.model';
import { Exercise } from '../../../core/models/exercise.model';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(sets: WorkoutSet[]): Workout {
  return {
    id: 'w1', date: TODAY, status: 'done', category: 'push', categories: ['push'],
    entries: [{ exerciseId: 'e1', exerciseName: 'e1', sets }],
    createdAt: new Date(),
  } as unknown as Workout;
}

/** `allTimeMax` is the heaviest this exercise has ever been lifted *before*
 *  today — 0 stands for "no previous session on record". */
function render(workout: Workout, allTimeMax = 0) {
  const exBy = new Map([['e1', { id: 'e1', name: 'e1', category: 'push', subcategory: 'pit', createdAt: new Date() } as unknown as Exercise]]);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkoutEditorComponent, ReactiveFormsModule],
    providers: [
      { provide: WorkoutService, useValue: {
        workouts: signal([workout]), doneWorkouts: signal([workout]),
        getAllTimeMaxWeight: () => allTimeMax,
        getLastSessionInfo: () => null, getLastSessionEntry: () => null,
      } },
      { provide: ExerciseService, useValue: { exercises: signal([...exBy.values()]), isLoaded: signal(true), ensureLoaded: () => Promise.resolve(), getById: (id: string) => exBy.get(id), loadTypeOf: () => undefined, bodyweightFactorOf: () => undefined } },
      { provide: UserSettingsService, useValue: { weightUnit: signal<'kg' | 'lb'>('kg'), difficultyScale: signal('emoji'), restTimerSeconds: signal(90), bodyweightKg: signal(null), dropsetsEnabled: signal(true), rirEnabled: signal(false), manualRestEnabled: signal(false), supersetsEnabled: signal(false) } },
      { provide: OfflineService, useValue: { isOffline: signal(false) } },
      { provide: FeedbackService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: MatDialog, useValue: { open: () => {} } },
    ],
  }).overrideComponent(WorkoutEditorComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } });
  const fixture = TestBed.createComponent(WorkoutEditorComponent);
  fixture.componentRef.setInput('workout', workout);
  fixture.componentRef.setInput('alwaysEditable', true);
  fixture.detectChanges();
  return fixture;
}

describe('WorkoutEditor — personal record', () => {
  it('marks the first-ever session as a PR: with no history, that weight is the record', () => {
    const fixture = render(makeWorkout([{ weight: 60, reps: 8 }]), 0);
    expect(fixture.componentInstance.prExerciseIds().has('e1')).toBe(true);
  });

  it('marks a session that beats the all-time max', () => {
    const fixture = render(makeWorkout([{ weight: 80, reps: 5 }]), 70);
    expect(fixture.componentInstance.prExerciseIds().has('e1')).toBe(true);
  });

  it('does not mark a session below the all-time max', () => {
    const fixture = render(makeWorkout([{ weight: 60, reps: 8 }]), 70);
    expect(fixture.componentInstance.prExerciseIds().has('e1')).toBe(false);
  });

  it('does not mark an entry whose only weight is zero', () => {
    const fixture = render(makeWorkout([{ weight: 0, reps: 12 }]), 0);
    expect(fixture.componentInstance.prExerciseIds().has('e1')).toBe(false);
  });

  it('ignores warm-ups when picking the record weight', () => {
    const fixture = render(makeWorkout([
      { weight: 100, reps: 3, warmup: true },
      { weight: 60, reps: 8 },
    ]), 70);
    expect(fixture.componentInstance.prExerciseIds().has('e1')).toBe(false);
  });

  describe('isPrSet', () => {
    it('flags the heaviest working set, not every set', () => {
      const sets: WorkoutSet[] = [{ weight: 60, reps: 8 }, { weight: 80, reps: 5 }];
      const fixture = render(makeWorkout(sets), 0);
      const entry = fixture.componentInstance.workout()!.entries[0];
      expect(fixture.componentInstance.isPrSet(entry, sets[0])).toBe(false);
      expect(fixture.componentInstance.isPrSet(entry, sets[1])).toBe(true);
    });

    it('never flags a warm-up, however heavy', () => {
      const sets: WorkoutSet[] = [{ weight: 100, reps: 2, warmup: true }, { weight: 80, reps: 5 }];
      const fixture = render(makeWorkout(sets), 0);
      const entry = fixture.componentInstance.workout()!.entries[0];
      expect(fixture.componentInstance.isPrSet(entry, sets[0])).toBe(false);
      expect(fixture.componentInstance.isPrSet(entry, sets[1])).toBe(true);
    });

    it('reads the top stage of a dropset, not just its logged weight', () => {
      // The dropset's opening stage (90) is the entry's heaviest lift.
      const sets: WorkoutSet[] = [
        { weight: 80, reps: 5 },
        { weight: 90, reps: 6, drops: [{ weight: 50, reps: 6 }] },
      ];
      const fixture = render(makeWorkout(sets), 0);
      const entry = fixture.componentInstance.workout()!.entries[0];
      expect(fixture.componentInstance.isPrSet(entry, sets[1])).toBe(true);
      expect(fixture.componentInstance.isPrSet(entry, sets[0])).toBe(false);
    });

    it('reads the heavier side of a unilateral set', () => {
      const sets: WorkoutSet[] = [
        { weight: 30, reps: 10 },
        { weight: 34, reps: 8, weightLeft: 32, weightRight: 34 },
      ];
      const fixture = render(makeWorkout(sets), 0);
      const entry = fixture.componentInstance.workout()!.entries[0];
      expect(fixture.componentInstance.isPrSet(entry, sets[1])).toBe(true);
    });
  });
});
