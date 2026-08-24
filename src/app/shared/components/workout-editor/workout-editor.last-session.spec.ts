import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';

import { WorkoutEditorComponent } from './workout-editor.component';
import { WorkoutService, LastSessionEntry } from '../../../core/services/workout.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { OfflineService } from '../../../core/services/offline.service';
import { FeedbackService } from '../../services/feedback.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { Workout, WorkoutEntry, WorkoutSet } from '../../../core/models/workout.model';
import { Exercise } from '../../../core/models/exercise.model';

const TODAY = new Date().toISOString().split('T')[0];

const LAST_SETS: WorkoutSet[] = [
  { weight: 40, reps: 10, warmup: true },
  { weight: 60, reps: 8, drops: [{ weight: 40, reps: 5 }] },
  { weight: 60, reps: 6 },
];

const LAST_SESSION: LastSessionEntry = {
  date: '2024-03-01', maxWeight: 60, feeling: 3, notes: 'Bona sensació',
  sets: LAST_SETS, workingSets: 2, warmupSets: 1, totalReps: 14,
};

function makeWorkout(todaySets: WorkoutSet[]): Workout {
  return {
    id: 'w1', date: TODAY, status: 'done', category: 'push', categories: ['push'],
    entries: [{ exerciseId: 'e1', exerciseName: 'e1', sets: todaySets }],
    createdAt: new Date(),
  } as unknown as Workout;
}

interface Harness {
  fixture:   ComponentFixture<WorkoutEditorComponent>;
  component: WorkoutEditorComponent;
  entry:     WorkoutEntry;
  addSets:   jasmine.Spy;
  replace:   jasmine.Spy;
  confirm:   jasmine.Spy;
}

function render(workout: Workout, confirmResult = true): Harness {
  const exBy = new Map([['e1', { id: 'e1', name: 'e1', category: 'push', subcategory: 'pit', createdAt: new Date() } as unknown as Exercise]]);
  const addSets = jasmine.createSpy('addSetsToEntry').and.resolveTo(undefined);
  const replace = jasmine.createSpy('replaceEntrySets').and.resolveTo(undefined);
  const confirm = jasmine.createSpy('confirm').and.resolveTo(confirmResult);

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkoutEditorComponent, ReactiveFormsModule],
    providers: [
      { provide: WorkoutService, useValue: {
        workouts: signal([workout]), doneWorkouts: signal([workout]),
        getAllTimeMaxWeight: () => 0, getLastSessionInfo: () => null,
        getLastSessionEntry: (id: string) => (id === 'e1' ? LAST_SESSION : null),
        addSetsToEntry: addSets, replaceEntrySets: replace,
      } },
      { provide: ExerciseService, useValue: { exercises: signal([...exBy.values()]), isLoaded: signal(true), ensureLoaded: () => Promise.resolve(), getById: (id: string) => exBy.get(id), loadTypeOf: () => undefined, bodyweightFactorOf: () => undefined } },
      { provide: UserSettingsService, useValue: { weightUnit: signal<'kg' | 'lb'>('kg'), difficultyScale: signal('emoji'), restTimerSeconds: signal(90), bodyweightKg: signal(null), dropsetsEnabled: signal(false), rirEnabled: signal(false), manualRestEnabled: signal(false), supersetsEnabled: signal(false) } },
      { provide: OfflineService, useValue: { isOffline: signal(false) } },
      { provide: FeedbackService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: ConfirmDialogService, useValue: { confirm, chooseAction: () => Promise.resolve(null) } },
      { provide: MatDialog, useValue: { open: () => {} } },
    ],
  }).overrideComponent(WorkoutEditorComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } });

  const fixture = TestBed.createComponent(WorkoutEditorComponent);
  fixture.componentRef.setInput('workout', workout);
  fixture.componentRef.setInput('alwaysEditable', true);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, entry: workout.entries[0], addSets, replace, confirm };
}

describe('WorkoutEditor — last session consultation', () => {
  it('is a query, not a write: opening the panel logs nothing', () => {
    const h = render(makeWorkout([]));

    h.component.toggleLastSession('e1');
    h.fixture.detectChanges();

    expect(h.fixture.nativeElement.querySelector('.we-ls-panel')).toBeTruthy();
    expect(h.addSets).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
  });

  it('stays available once the exercise already has sets today', () => {
    const h = render(makeWorkout([{ weight: 70, reps: 5 }]));

    h.component.toggleLastSession('e1');
    h.fixture.detectChanges();

    expect(h.fixture.nativeElement.querySelector('.we-ls-panel')).toBeTruthy();
  });

  it('toggling again closes the panel', () => {
    const h = render(makeWorkout([]));

    h.component.toggleLastSession('e1');
    h.component.toggleLastSession('e1');
    h.fixture.detectChanges();

    expect(h.component.lastSessionPanelFor()).toBeNull();
    expect(h.fixture.nativeElement.querySelector('.we-ls-panel')).toBeNull();
  });

  it('append copies every set and never hands over the historical set objects', async () => {
    const h = render(makeWorkout([]));

    await h.component.applyLastSession(h.entry, 'append');

    expect(h.replace).not.toHaveBeenCalled();
    const [, , sets] = h.addSets.calls.mostRecent().args as [string, string, WorkoutSet[]];
    expect(sets.length).toBe(3);
    expect(sets).toEqual(LAST_SETS);
    sets.forEach((set, i) => expect(set).not.toBe(LAST_SETS[i]));
    expect(sets[1].drops![0]).not.toBe(LAST_SETS[1].drops![0]);
  });

  it('append on an entry with sets today does not ask for confirmation', async () => {
    const h = render(makeWorkout([{ weight: 70, reps: 5 }]));

    await h.component.applyLastSession(h.entry, 'append');

    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.addSets).toHaveBeenCalled();
  });

  it('overwrite asks first and then replaces today\'s sets in one write', async () => {
    const h = render(makeWorkout([{ weight: 70, reps: 5 }]));

    await h.component.applyLastSession(h.entry, 'replace');

    expect(h.confirm).toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledWith('w1', 'e1', LAST_SETS);
    expect(h.addSets).not.toHaveBeenCalled();
  });

  it('overwrite writes nothing when the confirmation is declined', async () => {
    const h = render(makeWorkout([{ weight: 70, reps: 5 }]), false);

    await h.component.applyLastSession(h.entry, 'replace');

    expect(h.confirm).toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    expect(h.component.lastSessionPanelFor()).toBeNull();
  });

  it('overwrite on an empty entry needs no confirmation', async () => {
    const h = render(makeWorkout([]));

    await h.component.applyLastSession(h.entry, 'replace');

    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.replace).toHaveBeenCalledWith('w1', 'e1', LAST_SETS);
  });

  it('a single set can be copied on its own', async () => {
    const h = render(makeWorkout([]));

    await h.component.copyLastSessionSet(h.entry, LAST_SETS[1]);

    const [, , sets] = h.addSets.calls.mostRecent().args as [string, string, WorkoutSet[]];
    expect(sets).toEqual([LAST_SETS[1]]);
    expect(sets[0]).not.toBe(LAST_SETS[1]);
  });

  it('offers no history button for an exercise with no past session', () => {
    const workout = makeWorkout([]);
    workout.entries[0].exerciseId = 'unknown';
    const h = render(workout);

    expect(h.component.lastSession(h.entry)).toBeNull();
    expect(h.fixture.nativeElement.querySelector('.we-footer-btn--history')).toBeNull();
  });
});
