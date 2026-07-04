import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ExercisePickerDialogComponent, ExercisePickerData } from './exercise-picker-dialog.component';
import { ExerciseFormDialogComponent } from '../../library/components/exercise-form-dialog.component';
import { ExerciseService } from '../../../core/services/exercise.service';
import { Exercise } from '../../../core/models/exercise.model';
import { FeedbackService } from '../../../shared/services/feedback.service';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex1', name: 'Press banca', category: 'push', createdAt: new Date(),
    ...overrides,
  };
}

describe('ExercisePickerDialogComponent', () => {
  let component: ExercisePickerDialogComponent;
  let dialogRef: jasmine.SpyObj<MatDialogRef<ExercisePickerDialogComponent>>;
  let dialog: jasmine.SpyObj<MatDialog>;
  let nestedDialogRef: jasmine.SpyObj<MatDialogRef<ExerciseFormDialogComponent>>;
  let exerciseService: { exercises: ReturnType<typeof signal<Exercise[]>>; isLoaded: ReturnType<typeof signal<boolean>>; ensureLoaded: jasmine.Spy; create: jasmine.Spy };
  let dialogData: ExercisePickerData;

  function setup(): void {
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
    nestedDialogRef = jasmine.createSpyObj('MatDialogRef', ['afterClosed']);
    nestedDialogRef.afterClosed.and.returnValue(of(undefined));
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    dialog.open.and.returnValue(nestedDialogRef);
    exerciseService = {
      exercises:    signal<Exercise[]>([
        makeExercise({ id: 'ex1', name: 'Press banca', category: 'push' }),
        makeExercise({ id: 'ex2', name: 'Dominades', category: 'pull' }),
        makeExercise({ id: 'ex3', name: 'Sentadilla', category: 'legs' }),
      ]),
      isLoaded:     signal(true),
      ensureLoaded: jasmine.createSpy('ensureLoaded'),
      create:       jasmine.createSpy('create'),
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: MatDialogRef,    useValue: dialogRef },
        { provide: MatDialog,       useValue: dialog },
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: ExerciseService, useValue: exerciseService },
        { provide: FeedbackService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new ExercisePickerDialogComponent());
  }

  beforeEach(() => { dialogData = {}; });

  describe('filtered()', () => {
    it('lists all exercises by default', () => {
      setup();
      expect(component.filtered().map(e => e.id)).toEqual(['ex1', 'ex2', 'ex3']);
    });

    it('excludes ids passed via excludeIds', () => {
      dialogData = { excludeIds: ['ex2'] };
      setup();
      expect(component.filtered().map(e => e.id)).not.toContain('ex2');
    });

    it('filters by category', () => {
      setup();
      component.catFilter.set('pull');
      expect(component.filtered().map(e => e.id)).toEqual(['ex2']);
    });

    it('filters by search term, case-insensitively', () => {
      setup();
      component.searchTerm.set('DOMIN');
      expect(component.filtered().map(e => e.id)).toEqual(['ex2']);
    });

    it('pre-selects defaultCategory in catFilter', () => {
      dialogData = { defaultCategory: 'legs' };
      setup();
      expect(component.catFilter()).toBe('legs');
      expect(component.filtered().map(e => e.id)).toEqual(['ex3']);
    });
  });

  describe('select() / close()', () => {
    it('select() closes the dialog with the chosen exercise', () => {
      setup();
      const ex = makeExercise({ id: 'ex1' });
      component.select(ex);
      expect(dialogRef.close).toHaveBeenCalledWith(ex);
    });

    it('close() closes the dialog with no result', () => {
      setup();
      component.close();
      expect(dialogRef.close).toHaveBeenCalledWith();
    });
  });

  describe('startCreate()', () => {
    it('opens the shared ExerciseFormDialogComponent (same one used to edit exercises)', () => {
      setup();
      component.startCreate();
      expect(dialog.open).toHaveBeenCalledWith(ExerciseFormDialogComponent, jasmine.objectContaining({ data: {} }));
    });

    it('does nothing further if the form dialog is dismissed without a result', fakeAsync(() => {
      setup();
      nestedDialogRef.afterClosed.and.returnValue(of(undefined));
      component.startCreate();
      tick();

      expect(exerciseService.create).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    }));

    it('creates the exercise from the form result and closes the picker with it', fakeAsync(() => {
      setup();
      const formResult = { name: 'Zancada', category: 'legs' as const };
      const created = makeExercise({ id: 'new-id', name: 'Zancada', category: 'legs' });
      nestedDialogRef.afterClosed.and.returnValue(of(formResult));
      exerciseService.create.and.resolveTo(created);

      component.startCreate();
      tick();

      expect(exerciseService.create).toHaveBeenCalledWith(formResult);
      expect(dialogRef.close).toHaveBeenCalledWith(created);
    }));

    it('shows an error and does not close the picker if creation fails', fakeAsync(() => {
      setup();
      const formResult = { name: 'Zancada', category: 'legs' as const };
      nestedDialogRef.afterClosed.and.returnValue(of(formResult));
      exerciseService.create.and.rejectWith(new Error('network error'));

      component.startCreate();
      tick();

      expect(dialogRef.close).not.toHaveBeenCalled();
    }));
  });
});
