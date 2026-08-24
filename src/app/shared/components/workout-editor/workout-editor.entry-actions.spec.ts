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
import { Workout, WorkoutSet } from '../../../core/models/workout.model';
import { Exercise } from '../../../core/models/exercise.model';

const TODAY = new Date().toISOString().split('T')[0];

const LAST_SESSION: LastSessionEntry = {
  date: '2024-03-01', maxWeight: 60, sets: [{ weight: 60, reps: 8 }],
  workingSets: 1, warmupSets: 0, totalReps: 8,
};

function makeWorkout(sets: WorkoutSet[]): Workout {
  return {
    id: 'w1', date: TODAY, status: 'done', category: 'push', categories: ['push'],
    entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets }],
    createdAt: new Date(),
  } as unknown as Workout;
}

interface Harness {
  fixture:     ComponentFixture<WorkoutEditorComponent>;
  component:   WorkoutEditorComponent;
  el:          HTMLElement;
  removeEntry: jasmine.Spy;
  confirm:     jasmine.Spy;
  dialogOpen:  jasmine.Spy;
}

function render(workout: Workout, confirmResult = true): Harness {
  const exBy = new Map([['e1', { id: 'e1', name: 'Press banca', category: 'push', subcategory: 'pit', createdAt: new Date() } as unknown as Exercise]]);
  const removeEntry = jasmine.createSpy('removeEntryFromWorkout').and.resolveTo(undefined);
  const confirm     = jasmine.createSpy('confirm').and.resolveTo(confirmResult);
  const dialogOpen  = jasmine.createSpy('open');

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [WorkoutEditorComponent, ReactiveFormsModule],
    providers: [
      { provide: WorkoutService, useValue: {
        workouts: signal([workout]), doneWorkouts: signal([workout]),
        getAllTimeMaxWeight: () => 0, getLastSessionInfo: () => null,
        getLastSessionEntry: (id: string) => (id === 'e1' ? LAST_SESSION : null),
        addSetsToEntry: () => Promise.resolve(), replaceEntrySets: () => Promise.resolve(),
        removeEntryFromWorkout: removeEntry,
      } },
      { provide: ExerciseService, useValue: { exercises: signal([...exBy.values()]), isLoaded: signal(true), ensureLoaded: () => Promise.resolve(), getById: (id: string) => exBy.get(id), loadTypeOf: () => undefined, bodyweightFactorOf: () => undefined } },
      { provide: UserSettingsService, useValue: { weightUnit: signal<'kg' | 'lb'>('kg'), difficultyScale: signal('emoji'), restTimerSeconds: signal(90), bodyweightKg: signal(null), dropsetsEnabled: signal(false), rirEnabled: signal(false), manualRestEnabled: signal(false), supersetsEnabled: signal(false) } },
      { provide: OfflineService, useValue: { isOffline: signal(false) } },
      { provide: FeedbackService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
      { provide: ConfirmDialogService, useValue: { confirm, chooseAction: () => Promise.resolve(null) } },
      { provide: MatDialog, useValue: { open: dialogOpen, openDialogs: [] } },
    ],
  }).overrideComponent(WorkoutEditorComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } });

  const fixture = TestBed.createComponent(WorkoutEditorComponent);
  fixture.componentRef.setInput('workout', workout);
  fixture.componentRef.setInput('alwaysEditable', true);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, el: fixture.nativeElement, removeEntry, confirm, dialogOpen };
}

function footerButtons(el: HTMLElement): HTMLButtonElement[] {
  return Array.from(el.querySelectorAll<HTMLButtonElement>('.we-entry-footer button'));
}

describe('WorkoutEditor — entry action bar', () => {
  it('keeps the footer down to consultation, notes, fatiga and the overflow menu', () => {
    const { el } = render(makeWorkout([{ weight: 60, reps: 8 }]));
    const classes = footerButtons(el).map(b => b.className);

    expect(classes.length).toBe(4);
    expect(classes.filter(c => c.includes('we-footer-btn--history')).length).toBe(1);
    expect(classes.filter(c => c.includes('we-footer-btn--note')).length).toBe(1);
    expect(classes.filter(c => c.includes('we-footer-btn--feeling')).length).toBe(1);
    expect(classes.filter(c => c.includes('we-footer-btn--menu')).length).toBe(1);
  });

  it('no longer offers the exercise-editing shortcut out of the workout', () => {
    const { el } = render(makeWorkout([{ weight: 60, reps: 8 }]));
    const labels = footerButtons(el).map(b => b.getAttribute('aria-label') ?? '');

    expect(labels.some(l => l.toLowerCase().includes('editar'))).toBe(false);
  });

  it('names every footer button and hides its glyph from screen readers', () => {
    const { el } = render(makeWorkout([{ weight: 60, reps: 8 }]));

    for (const btn of footerButtons(el)) {
      expect(btn.getAttribute('aria-label')).toBeTruthy();
      for (const glyph of Array.from(btn.querySelectorAll('.material-symbols-outlined'))) {
        expect(glyph.getAttribute('aria-hidden')).toBe('true');
      }
    }
  });

  it('gives each action its own hue class so they are told apart by more than shape', () => {
    const { el } = render(makeWorkout([{ weight: 60, reps: 8 }]));
    const hues = new Set(footerButtons(el).map(b =>
      (b.className.match(/we-footer-btn--(history|note|feeling|menu)/) ?? [])[1]));

    expect(hues.size).toBe(4);
  });

  it('reflects "has a note" and "has fatiga" in the button label, not only in color', () => {
    const workout = makeWorkout([{ weight: 60, reps: 8 }]);
    workout.entries[0].notes   = 'Bona sensació';
    workout.entries[0].feeling = 3;
    const { el } = render(workout);
    const labels = footerButtons(el).map(b => b.getAttribute('aria-label') ?? '');

    expect(labels.some(l => l.includes('Nota escrita'))).toBe(true);
    expect(labels.some(l => l.startsWith('Fatiga:'))).toBe(true);
  });

  describe('options sheet', () => {
    it('opens as a labelled dialog with the stats and delete actions', () => {
      const h = render(makeWorkout([{ weight: 60, reps: 8 }]));

      h.component.openOptions('e1');
      h.fixture.detectChanges();

      const sheet = h.el.querySelector('.we-options-sheet')!;
      expect(sheet.getAttribute('role')).toBe('dialog');
      expect(sheet.getAttribute('aria-modal')).toBe('true');
      expect(h.el.querySelector('#we-options-title')!.textContent).toContain('Press banca');
      expect(sheet.querySelectorAll('.we-option').length).toBe(2);
      expect(sheet.querySelector('.we-option--danger')).toBeTruthy();
    });

    it('escape closes it', () => {
      const h = render(makeWorkout([]));
      h.component.openOptions('e1');

      h.component.onEscape();

      expect(h.component.optionsFor()).toBeNull();
    });

    it('opening the stats dialog closes the sheet', () => {
      const h = render(makeWorkout([{ weight: 60, reps: 8 }]));
      h.component.openOptions('e1');

      h.component.openStatsFromOptions(h.component.optionsEntry()!);

      expect(h.component.optionsFor()).toBeNull();
      expect(h.dialogOpen).toHaveBeenCalled();
    });
  });

  describe('deleting an exercise', () => {
    it('asks before discarding logged sets', async () => {
      const h = render(makeWorkout([{ weight: 60, reps: 8 }, { weight: 60, reps: 6 }]));

      await h.component.removeEntry('e1');

      expect(h.confirm).toHaveBeenCalled();
      expect(h.confirm.calls.mostRecent().args[0]).toContain('2 sèries');
      expect(h.removeEntry).toHaveBeenCalledWith('w1', 'e1');
    });

    it('keeps the exercise when the confirmation is declined', async () => {
      const h = render(makeWorkout([{ weight: 60, reps: 8 }]), false);

      await h.component.removeEntry('e1');

      expect(h.removeEntry).not.toHaveBeenCalled();
    });

    it('stays a single tap while there is nothing to lose', async () => {
      const h = render(makeWorkout([]));

      await h.component.removeEntry('e1');

      expect(h.confirm).not.toHaveBeenCalled();
      expect(h.removeEntry).toHaveBeenCalledWith('w1', 'e1');
    });
  });

  describe('logged set rows', () => {
    it('are buttons that spell out the set instead of a row of loose pills', () => {
      const { el } = render(makeWorkout([{ weight: 60, reps: 8 }]));
      const row = el.querySelector<HTMLButtonElement>('button.we-set-main')!;

      expect(row).toBeTruthy();
      expect(row.getAttribute('aria-label')).toBe('Editar sèrie 1, 60 kg per 8 repeticions');
      expect(row.querySelector('.we-set-pills')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('open the inline editor when activated', () => {
      const h = render(makeWorkout([{ weight: 60, reps: 8 }]));

      h.el.querySelector<HTMLButtonElement>('button.we-set-main')!.click();
      h.fixture.detectChanges();

      expect(h.component.editingSet()).toEqual({ exerciseId: 'e1', index: 0 });
    });

    it('describe a warm-up set as such', () => {
      const h = render(makeWorkout([{ weight: 40, reps: 10, warmup: true }]));

      expect(h.component.setAriaLabel(h.component.workout()!.entries[0], 0, { weight: 40, reps: 10, warmup: true }))
        .toBe("sèrie d'escalfament, 40 kg per 10 repeticions");
    });
  });
});
