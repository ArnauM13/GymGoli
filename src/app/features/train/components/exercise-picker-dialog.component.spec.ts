import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ExercisePickerDialogComponent, ExercisePickerData } from './exercise-picker-dialog.component';
import { ExerciseFormDialogComponent } from '../../library/components/exercise-form-dialog.component';
import { ExerciseService } from '../../../core/services/exercise.service';
import { CategoryService } from '../../../core/services/category.service';
import { Exercise } from '../../../core/models/exercise.model';
import { FeedbackService } from '../../../shared/services/feedback.service';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'ex1', name: 'Press banca', category: 'push', createdAt: new Date(),
    ...overrides,
  };
}

const FAKE_CATEGORIES = [
  { key: 'push', name: 'Empenta', icon: 'fitness_center',    color: '#e57373' },
  { key: 'pull', name: 'Tracció', icon: 'sports_gymnastics', color: '#64b5f6' },
  { key: 'legs', name: 'Cames',   icon: 'directions_run',    color: '#81c784' },
];
const CAT_BY_KEY = new Map(FAKE_CATEGORIES.map(c => [c.key, c]));
const mockCategoryService = {
  categoryChips: signal(FAKE_CATEGORIES.map(c => ({ value: c.key, label: c.name, icon: c.icon, color: c.color }))),
  label: (cat: string) => CAT_BY_KEY.get(cat)?.name ?? cat,
  color: (cat: string) => CAT_BY_KEY.get(cat)?.color ?? '#bbb',
};

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
        { provide: CategoryService, useValue: mockCategoryService },
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

    it('scopes results to categoryKeys for a hybrid workout, regardless of catFilter', () => {
      dialogData = { categoryKeys: ['push', 'pull'] };
      setup();
      expect(component.filtered().map(e => e.id)).toEqual(['ex1', 'ex2']);
    });

    it('scopes the filter-bar chips to categoryKeys as well', () => {
      dialogData = { categoryKeys: ['push', 'pull'] };
      setup();
      expect(component.categoryChips().map(c => c.value)).toEqual(['push', 'pull']);
    });
  });

  describe('groupedFiltered()', () => {
    it('puts exercises with no subcategory into an "Altres" group', () => {
      setup();
      const groups = component.groupedFiltered();
      expect(groups.map(g => g.label)).toEqual(['Altres']);
      expect(groups[0].exercises.map(e => e.id)).toEqual(['ex1', 'ex2', 'ex3']);
    });

    it('subdivides exercises by their main muscle group (subcategory), ordered chest → shoulders → triceps', () => {
      setup();
      exerciseService.exercises.set([
        makeExercise({ id: 'ex1', name: 'Press banca', category: 'push', subcategory: 'chest' }),
        makeExercise({ id: 'ex2', name: 'Press militar', category: 'push', subcategory: 'shoulders' }),
        makeExercise({ id: 'ex3', name: 'Extensió tríceps', category: 'push', subcategory: 'triceps' }),
      ]);

      const groups = component.groupedFiltered();
      expect(groups.map(g => g.label)).toEqual(['Pit', 'Espatlles', 'Tríceps']);
      expect(groups[0].exercises.map(e => e.id)).toEqual(['ex1']);
    });

    it('keeps groups ordered push → pull → legs regardless of exercise order', () => {
      setup();
      exerciseService.exercises.set([
        makeExercise({ id: 'ex1', name: 'Sentadilla', category: 'legs', subcategory: 'quads' }),
        makeExercise({ id: 'ex2', name: 'Dominades', category: 'pull', subcategory: 'back' }),
        makeExercise({ id: 'ex3', name: 'Press banca', category: 'push', subcategory: 'chest' }),
      ]);

      expect(component.groupedFiltered().map(g => g.label)).toEqual(['Pit', 'Esquena', 'Quàdriceps']);
    });

    it('omits groups with no matching exercises once a search term filters them out', () => {
      setup();
      exerciseService.exercises.set([
        makeExercise({ id: 'ex1', name: 'Press banca', category: 'push', subcategory: 'chest' }),
        makeExercise({ id: 'ex2', name: 'Press militar', category: 'push', subcategory: 'shoulders' }),
      ]);
      component.searchTerm.set('banca');

      expect(component.groupedFiltered().map(g => g.label)).toEqual(['Pit']);
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
