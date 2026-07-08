import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { ShareImportComponent } from './share-import.component';
import { AuthService } from '../../core/services/auth.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { CategoryService } from '../../core/services/category.service';
import { SharedWorkout } from '../../core/models/shared-workout.model';

const mockCategoryService = {
  ensureLoaded: jasmine.createSpy(),
  label: (cat: string) => ({ push: 'Empenta', pull: 'Tracció', legs: 'Cames' } as Record<string, string>)[cat] ?? cat,
};

function shared(overrides: Partial<SharedWorkout> = {}): SharedWorkout {
  return {
    id: 'share-1', name: 'Push A', category: 'push',
    entries: [{ exerciseName: 'Press banca', sets: [{ weight: 60, reps: 8 }, { weight: 65, reps: 6 }] }],
    createdAt: '2024-01-01',
    ...overrides,
  };
}

describe('ShareImportComponent', () => {
  let component: ShareImportComponent;
  let waitForAuth: jasmine.Spy;
  let fetchById: jasmine.Spy;
  let importAsWorkout: jasmine.Spy;
  let router: jasmine.SpyObj<Router>;

  function setup(paramId: string | null): void {
    waitForAuth = jasmine.createSpy('waitForAuth').and.resolveTo({ id: 'user-1' });
    fetchById = jasmine.createSpy('fetchById').and.resolveTo(shared());
    importAsWorkout = jasmine.createSpy('importAsWorkout').and.resolveTo({
      workoutId: 'workout-1', skipped: [],
    });
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => paramId } } } },
        { provide: Router,         useValue: router },
        { provide: AuthService,    useValue: { waitForAuth } },
        { provide: SharedWorkoutService, useValue: { fetchById, importAsWorkout } },
        { provide: UserSettingsService,  useValue: { weightUnit: signal<'kg' | 'lb'>('kg') } },
        { provide: CategoryService,      useValue: mockCategoryService },
      ],
    });
    component = TestBed.runInInjectionContext(() => new ShareImportComponent());
  }

  it('shows an error for a link with no id', async () => {
    setup(null);
    await component.ngOnInit();
    expect(component.status()).toBe('error');
  });

  it('shows "needs-auth" when there is no logged-in user', async () => {
    setup('share-1');
    waitForAuth.and.resolveTo(null);
    await component.ngOnInit();
    expect(component.status()).toBe('needs-auth');
    expect(fetchById).not.toHaveBeenCalled();
  });

  it('loads the shared workout and moves to the confirm step', async () => {
    setup('share-1');
    await component.ngOnInit();
    expect(component.status()).toBe('confirm');
    expect(component.workout()?.name).toBe('Push A');
  });

  it('shows an error when the shared workout no longer exists', async () => {
    setup('share-1');
    fetchById.and.resolveTo(null);
    await component.ngOnInit();
    expect(component.status()).toBe('error');
  });

  it('imports the workout on confirmation and reports skipped exercises', async () => {
    setup('share-1');
    importAsWorkout.and.resolveTo({ workoutId: 'workout-1', skipped: ['Exercici X'] });
    await component.ngOnInit();

    await component.confirmImport();

    expect(importAsWorkout).toHaveBeenCalledWith(shared());
    expect(component.status()).toBe('success');
    expect(component.skippedCount()).toBe(1);
  });

  it('shows an error if the import fails', async () => {
    setup('share-1');
    importAsWorkout.and.rejectWith(new Error('boom'));
    await component.ngOnInit();

    await component.confirmImport();

    expect(component.status()).toBe('error');
  });

  it('navigates home when goHome() is called', () => {
    setup('share-1');
    component.goHome();
    expect(router.navigate).toHaveBeenCalledWith(['/train']);
  });

  describe('setsSummary()', () => {
    it('formats each set as reps×weight in the user\'s preferred unit', () => {
      setup('share-1');
      const summary = component.setsSummary({
        exerciseName: 'Press banca',
        sets: [{ weight: 60, reps: 8 }, { weight: 65, reps: 6 }],
      });
      expect(summary).toBe('8×60kg, 6×65kg');
    });
  });
});
