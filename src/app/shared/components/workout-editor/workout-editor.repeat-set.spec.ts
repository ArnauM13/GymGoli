import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';

import { WorkoutEditorComponent } from './workout-editor.component';
import { WorkoutService } from '../../../core/services/workout.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { OfflineService } from '../../../core/services/offline.service';
import { FeedbackService } from '../../services/feedback.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { Workout, WorkoutSet } from '../../../core/models/workout.model';
import { Exercise } from '../../../core/models/exercise.model';

const TODAY = new Date().toISOString().split('T')[0];

function makeWorkout(sets: WorkoutSet[]): Workout {
  return {
    id: 'w1', date: TODAY, status: 'done', category: 'push', categories: ['push'],
    entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets }],
    createdAt: new Date(),
  } as unknown as Workout;
}

interface Harness {
  fixture:    ComponentFixture<WorkoutEditorComponent>;
  component:  WorkoutEditorComponent;
  el:         HTMLElement;
  addSets:    jasmine.Spy;
}

/** `dropsetsEnabled` is off on purpose: repeating a saved set must carry its
 *  dropset along even when the setting no longer offers new ones. */
function render(workout: Workout): Harness {
  const exercise = { id: 'e1', name: 'Press banca', category: 'push', subcategory: 'pit', createdAt: new Date() } as unknown as Exercise;
  const addSets  = jasmine.createSpy('addSetsToEntry').and.resolveTo(undefined);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkoutEditorComponent, ReactiveFormsModule],
    providers: [
      { provide: WorkoutService, useValue: {
        workouts: signal([workout]), doneWorkouts: signal([workout]),
        getAllTimeMaxWeight: () => 0, getLastSessionInfo: () => null,
        getLastSessionEntry: () => null,
        addSetsToEntry: addSets, replaceEntrySets: () => Promise.resolve(),
        removeEntryFromWorkout: () => Promise.resolve(),
      } },
      { provide: ExerciseService, useValue: { exercises: signal([exercise]), isLoaded: signal(true), ensureLoaded: () => Promise.resolve(), getById: (id: string) => (id === 'e1' ? exercise : undefined), loadTypeOf: () => undefined, bodyweightFactorOf: () => undefined } },
      { provide: UserSettingsService, useValue: { weightUnit: signal<'kg' | 'lb'>('kg'), difficultyScale: signal('emoji'), restTimerSeconds: signal(90), bodyweightKg: signal(null), dropsetsEnabled: signal(false), rirEnabled: signal(false), manualRestEnabled: signal(false), supersetsEnabled: signal(false) } },
      { provide: OfflineService, useValue: { isOffline: signal(false) } },
      { provide: FeedbackService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: ConfirmDialogService, useValue: { confirm: () => Promise.resolve(true), chooseAction: () => Promise.resolve(null) } },
      { provide: MatDialog, useValue: { open: () => {}, openDialogs: [] } },
    ],
  }).overrideComponent(WorkoutEditorComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } });

  const fixture = TestBed.createComponent(WorkoutEditorComponent);
  fixture.componentRef.setInput('workout', workout);
  fixture.componentRef.setInput('alwaysEditable', true);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement, addSets };
}

describe('WorkoutEditor — repetir una sèrie', () => {
  it('repeteix el dropset sencer, no només el tram principal', async () => {
    const workout = makeWorkout([{ weight: 60, reps: 8, drops: [{ weight: 45, reps: 6 }, { weight: 30, reps: 5 }] }]);
    const { component, addSets } = render(workout);

    await component.repeatLastSet(workout.entries[0]);

    const [, , sets] = addSets.calls.mostRecent().args as [string, string, WorkoutSet[]];
    expect(sets[0].weight).toBe(60);
    expect(sets[0].reps).toBe(8);
    expect(sets[0].drops).toEqual([{ weight: 45, reps: 6 }, { weight: 30, reps: 5 }]);
  });

  it('clona els trams, perquè editar-ne un no en toqui dos', async () => {
    const workout = makeWorkout([{ weight: 60, reps: 8, drops: [{ weight: 45, reps: 6 }] }]);
    const { component, addSets } = render(workout);

    await component.repeatLastSet(workout.entries[0]);

    const [, , sets] = addSets.calls.mostRecent().args as [string, string, WorkoutSet[]];
    expect(sets[0].drops).not.toBe(workout.entries[0].sets[0].drops);
    expect(sets[0].drops![0]).not.toBe(workout.entries[0].sets[0].drops![0]);
  });

  it('s\'emporta també RIR, descans, escalfament i els pesos per costat', async () => {
    const workout = makeWorkout([{
      weight: 40, reps: 10, weightLeft: 38, weightRight: 40,
      rir: 2, restSeconds: 120, warmup: true,
    }]);
    const { component, addSets } = render(workout);

    await component.repeatLastSet(workout.entries[0]);

    const [, , sets] = addSets.calls.mostRecent().args as [string, string, WorkoutSet[]];
    expect(sets[0]).toEqual(jasmine.objectContaining({
      weight: 40, reps: 10, weightLeft: 38, weightRight: 40,
      rir: 2, restSeconds: 120, warmup: true,
    }));
  });

  it('anuncia al botó els trams que s\'emportarà', () => {
    const workout = makeWorkout([{ weight: 60, reps: 8, drops: [{ weight: 45, reps: 6 }, { weight: 30, reps: 5 }] }]);
    const { component } = render(workout);

    expect(component.repeatLabel(workout.entries[0])).toBe('60kg × 8 +2 trams');
  });

  it('no diu res de trams quan la sèrie no en té', () => {
    const workout = makeWorkout([{ weight: 60, reps: 8 }]);
    const { component } = render(workout);

    expect(component.repeatLabel(workout.entries[0])).toBe('60kg × 8');
  });
});
