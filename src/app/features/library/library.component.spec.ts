import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { LibraryComponent } from './library.component';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { AuthService } from '../../core/services/auth.service';
import { Exercise } from '../../core/models/exercise.model';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return { id: '1', name: 'Test', category: 'push', createdAt: new Date(), ...overrides };
}

describe('LibraryComponent', () => {
  let component: LibraryComponent;
  let mockExercises: ReturnType<typeof signal<Exercise[]>>;

  beforeEach(async () => {
    mockExercises = signal<Exercise[]>([]);

    const mockExerciseService = {
      exercises:    mockExercises,
      create:       jasmine.createSpy().and.resolveTo(undefined),
      update:       jasmine.createSpy().and.resolveTo(undefined),
      delete:       jasmine.createSpy().and.resolveTo(undefined),
      seedIfEmpty:  jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSportService = {
      sports:       signal<any[]>([]),
      createSport:  jasmine.createSpy().and.resolveTo(undefined),
      updateSport:  jasmine.createSpy().and.resolveTo(undefined),
      deleteSport:  jasmine.createSpy().and.resolveTo(undefined),
    };

    await TestBed.configureTestingModule({
      imports:   [LibraryComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ExerciseService, useValue: mockExerciseService },
        { provide: SportService,    useValue: mockSportService },
        { provide: AuthService,     useValue: { uid: signal('user-1') } },
        { provide: MatDialog,       useValue: { open: jasmine.createSpy() } },
        { provide: MatSnackBar,     useValue: { open: jasmine.createSpy() } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LibraryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── getCategoryLabel() ───────────────────────────────────────────────────

  describe('getCategoryLabel()', () => {
    it('returns "Empenta" for push', () => expect(component.getCategoryLabel('push')).toBe('Empenta'));
    it('returns "Tracció" for pull', () => expect(component.getCategoryLabel('pull')).toBe('Tracció'));
    it('returns "Cames" for legs',  () => expect(component.getCategoryLabel('legs')).toBe('Cames'));
  });

  // ── getCategoryColor() ───────────────────────────────────────────────────

  describe('getCategoryColor()', () => {
    it('returns the push color',  () => expect(component.getCategoryColor('push')).toBe('#e57373'));
    it('returns the pull color',  () => expect(component.getCategoryColor('pull')).toBe('#64b5f6'));
    it('returns the legs color',  () => expect(component.getCategoryColor('legs')).toBe('#81c784'));
  });

  // ── getCategoryIcon() ────────────────────────────────────────────────────

  describe('getCategoryIcon()', () => {
    it('returns the icon ligature for push', () => {
      expect(component.getCategoryIcon('push')).toBe('fitness_center');
    });
  });

  // ── getSubcategoryLabel() ────────────────────────────────────────────────

  describe('getSubcategoryLabel()', () => {
    it('returns the Catalan label for a known subcategory', () => {
      expect(component.getSubcategoryLabel('chest')).toBe('Pit');
    });

    it('returns the key itself for an unknown subcategory', () => {
      expect(component.getSubcategoryLabel('unknown')).toBe('unknown');
    });
  });

  // ── exercisesByCategory() ────────────────────────────────────────────────

  describe('exercisesByCategory()', () => {
    it('returns an empty array when there are no exercises', () => {
      expect(component.exercisesByCategory('push')).toEqual([]);
    });

    it('returns only exercises matching the given category', () => {
      mockExercises.set([
        makeExercise({ id: '1', category: 'push' }),
        makeExercise({ id: '2', category: 'pull' }),
        makeExercise({ id: '3', category: 'push' }),
      ]);
      expect(component.exercisesByCategory('push').length).toBe(2);
      expect(component.exercisesByCategory('legs').length).toBe(0);
    });
  });

  // ── visibleCategories() ──────────────────────────────────────────────────

  describe('visibleCategories()', () => {
    it('returns an empty list when no exercises exist and no filter is set', () => {
      expect(component.visibleCategories()).toEqual([]);
    });

    it('returns only categories that have at least one exercise', () => {
      mockExercises.set([makeExercise({ category: 'push' })]);
      const visible = component.visibleCategories();
      expect(visible.length).toBe(1);
      expect(visible[0].value).toBe('push');
    });

    it('returns only the active filter category regardless of exercise count', () => {
      component.activeFilter.set('pull');
      const visible = component.visibleCategories();
      expect(visible.length).toBe(1);
      expect(visible[0].value).toBe('pull');
    });

    it('shows all populated categories when filter is cleared', () => {
      mockExercises.set([
        makeExercise({ id: '1', category: 'push' }),
        makeExercise({ id: '2', category: 'legs' }),
      ]);
      component.activeFilter.set(null);
      const visible = component.visibleCategories();
      expect(visible.length).toBe(2);
    });
  });

  // ── activeFilter signal ──────────────────────────────────────────────────

  describe('activeFilter signal', () => {
    it('defaults to null', () => {
      expect(component.activeFilter()).toBeNull();
    });

    it('can be set to a category', () => {
      component.activeFilter.set('push');
      expect(component.activeFilter()).toBe('push');
    });
  });
});
