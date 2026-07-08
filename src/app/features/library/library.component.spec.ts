import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { MatDialog } from '@angular/material/dialog';

import { LibraryComponent } from './library.component';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { AuthService } from '../../core/services/auth.service';
import { CategoryService } from '../../core/services/category.service';
import { Exercise } from '../../core/models/exercise.model';
import { FeedbackService } from '../../shared/services/feedback.service';

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return { id: '1', name: 'Test', category: 'push', createdAt: new Date(), ...overrides };
}

const FAKE_CATEGORIES = [
  { key: 'push', name: 'Empenta', icon: 'fitness_center',    color: '#e57373' },
  { key: 'pull', name: 'Tracció', icon: 'sports_gymnastics', color: '#64b5f6' },
  { key: 'legs', name: 'Cames',   icon: 'directions_run',    color: '#81c784' },
];
const CAT_BY_KEY = new Map(FAKE_CATEGORIES.map(c => [c.key, c]));
const mockCategoryService = {
  categoryChips: signal(FAKE_CATEGORIES.map(c => ({ value: c.key, label: c.name, icon: c.icon, color: c.color }))),
  ensureLoaded:  jasmine.createSpy(),
  label: (cat: string) => CAT_BY_KEY.get(cat)?.name ?? cat,
  color: (cat: string) => CAT_BY_KEY.get(cat)?.color ?? '#bbb',
  icon:  (cat: string) => CAT_BY_KEY.get(cat)?.icon ?? 'fitness_center',
};

describe('LibraryComponent', () => {
  let component: LibraryComponent;
  let mockExercises: ReturnType<typeof signal<Exercise[]>>;

  beforeEach(async () => {
    mockExercises = signal<Exercise[]>([]);

    const mockExerciseService = {
      exercises:    mockExercises,
      isLoaded:     signal(true),
      create:       jasmine.createSpy().and.resolveTo(undefined),
      update:       jasmine.createSpy().and.resolveTo(undefined),
      delete:       jasmine.createSpy().and.resolveTo(undefined),
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    const mockSportService = {
      sports:       signal<any[]>([]),
      isLoaded:     signal(true),
      createSport:  jasmine.createSpy().and.resolveTo(undefined),
      updateSport:  jasmine.createSpy().and.resolveTo(undefined),
      deleteSport:  jasmine.createSpy().and.resolveTo(undefined),
      ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
    };

    await TestBed.configureTestingModule({
      imports:   [LibraryComponent],
      providers: [
        provideNoopAnimations(),
        { provide: ExerciseService, useValue: mockExerciseService },
        { provide: SportService,    useValue: mockSportService },
        { provide: CategoryService, useValue: mockCategoryService },
        { provide: AuthService,     useValue: { uid: signal('user-1') } },
        { provide: MatDialog,       useValue: { open: jasmine.createSpy() } },
        { provide: FeedbackService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
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
