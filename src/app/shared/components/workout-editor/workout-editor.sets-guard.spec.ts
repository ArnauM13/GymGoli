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
import { Workout } from '../../../core/models/workout.model';
import { Exercise } from '../../../core/models/exercise.model';

const TODAY = new Date().toISOString().split('T')[0];

function render(workout: Workout) {
  const exBy = new Map([['e1', { id: 'e1', name: 'e1', category: 'push', subcategory: 'pit', createdAt: new Date() } as unknown as Exercise]]);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkoutEditorComponent, ReactiveFormsModule],
    providers: [
      { provide: WorkoutService, useValue: { workouts: signal([workout]), doneWorkouts: signal([workout]), getAllTimeMaxWeight: () => 0, getLastSessionInfo: () => null, getLastSessionEntry: () => null } },
      { provide: ExerciseService, useValue: { exercises: signal([...exBy.values()]), isLoaded: signal(true), ensureLoaded: () => Promise.resolve(), getById: (id: string) => exBy.get(id), loadTypeOf: () => undefined, bodyweightFactorOf: () => undefined } },
      { provide: UserSettingsService, useValue: { weightUnit: signal<'kg' | 'lb'>('kg'), difficultyScale: signal('emoji'), restTimerSeconds: signal(90), bodyweightKg: signal(null), dropsetsEnabled: signal(false), rirEnabled: signal(false), manualRestEnabled: signal(false), supersetsEnabled: signal(false) } },
      { provide: OfflineService, useValue: { isOffline: signal(false) } },
      { provide: FeedbackService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: MatDialog, useValue: { open: () => {} } },
    ],
  }).overrideComponent(WorkoutEditorComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } });
  const fixture = TestBed.createComponent(WorkoutEditorComponent);
  fixture.componentRef.setInput('workout', workout);
  fixture.componentRef.setInput('alwaysEditable', true);
  return fixture;
}

describe('WorkoutEditor — missing set arrays', () => {
  // Confirms the crash vector: an entry whose `sets` is missing makes the render
  // (`entry.sets.length`, `@for (set of entry.sets)`) throw. Workouts reaching
  // the editor are normalised at deserialization so this never happens in the
  // real app — this test documents *why* that normalisation matters.
  it('a raw entry with no sets array crashes the render', () => {
    const bad = {
      id: 'w1', date: TODAY, status: 'done', category: 'push', categories: ['push'],
      entries: [{ exerciseId: 'e1', exerciseName: 'e1' }], // no `sets`
      createdAt: new Date(),
    } as unknown as Workout;
    expect(() => render(bad).detectChanges()).toThrow();
  });

  it('renders fine once entries carry a (possibly empty) sets array', () => {
    const good = {
      id: 'w1', date: TODAY, status: 'done', category: 'push', categories: ['push'],
      entries: [{ exerciseId: 'e1', exerciseName: 'e1', sets: [] }],
      createdAt: new Date(),
    } as unknown as Workout;
    expect(() => render(good).detectChanges()).not.toThrow();
  });
});
