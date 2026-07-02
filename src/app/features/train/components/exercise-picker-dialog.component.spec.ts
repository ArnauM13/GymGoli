import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ExercisePickerDialogComponent, ExercisePickerData } from './exercise-picker-dialog.component';
import { ExerciseService } from '../../../core/services/exercise.service';
import { Exercise } from '../../../core/models/exercise.model';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex1', name: 'Press banca', category: 'push', createdAt: new Date(),
    ...overrides,
  };
}

describe('ExercisePickerDialogComponent', () => {
  let component: ExercisePickerDialogComponent;
  let dialogRef: jasmine.SpyObj<MatDialogRef<ExercisePickerDialogComponent>>;
  let exerciseService: { exercises: ReturnType<typeof signal<Exercise[]>>; isLoaded: ReturnType<typeof signal<boolean>>; ensureLoaded: jasmine.Spy; create: jasmine.Spy };
  let dialogData: ExercisePickerData;

  function setup(): void {
    dialogRef = jasmine.createSpyObj('MatDialogRef', ['close']);
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
        { provide: MAT_DIALOG_DATA, useValue: dialogData },
        { provide: ExerciseService, useValue: exerciseService },
        { provide: MatSnackBar,     useValue: { open: jasmine.createSpy('open') } },
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

  describe('create mode', () => {
    it('startCreate() switches to create mode, prefilling name and category', () => {
      setup();
      component.searchTerm.set('Zancada');
      component.catFilter.set('legs');
      component.startCreate();

      expect(component.mode()).toBe('create');
      expect(component.createName).toBe('Zancada');
      expect(component.createCategory()).toBe('legs');
    });

    it('cancelCreate() switches back to list mode', () => {
      setup();
      component.startCreate();
      component.cancelCreate();
      expect(component.mode()).toBe('list');
    });

    it('toggleSubcat() selects then deselects the same subcategory', () => {
      setup();
      component.toggleSubcat('chest');
      expect(component.createSubcat()).toBe('chest');
      component.toggleSubcat('chest');
      expect(component.createSubcat()).toBe('');
    });

    it('saveNew() creates the exercise and closes the dialog on success', async () => {
      setup();
      const created = makeExercise({ id: 'new-id', name: 'Zancada', category: 'legs' });
      exerciseService.create.and.resolveTo(created);
      component.createName = 'Zancada';
      component.createCategory.set('legs');

      await component.saveNew();

      expect(exerciseService.create).toHaveBeenCalled();
      expect(dialogRef.close).toHaveBeenCalledWith(created);
    });

    it('saveNew() does nothing without a name or category', async () => {
      setup();
      component.createName = '';
      component.createCategory.set('legs');

      await component.saveNew();

      expect(exerciseService.create).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });

    it('saveNew() resets the creating flag and does not close the dialog on failure', async () => {
      setup();
      exerciseService.create.and.rejectWith(new Error('network error'));
      component.createName = 'Zancada';
      component.createCategory.set('legs');

      await component.saveNew();

      expect(component.creating()).toBeFalse();
      expect(dialogRef.close).not.toHaveBeenCalled();
    });
  });
});
