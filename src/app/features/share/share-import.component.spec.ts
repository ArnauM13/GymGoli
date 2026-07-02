import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';

import { ShareImportComponent } from './share-import.component';
import { AuthService } from '../../core/services/auth.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { SharedWorkout } from '../../core/models/shared-workout.model';
import { WorkoutTemplate } from '../../core/models/template.model';

function shared(overrides: Partial<SharedWorkout> = {}): SharedWorkout {
  return {
    id: 'share-1', ownerId: 'user-2', name: 'Push A', category: 'push',
    entries: [{ exerciseName: 'Press banca' }], createdAt: '2024-01-01',
    ...overrides,
  };
}

describe('ShareImportComponent', () => {
  let component: ShareImportComponent;
  let waitForAuth: jasmine.Spy;
  let fetchById: jasmine.Spy;
  let importAsTemplate: jasmine.Spy;
  let router: jasmine.SpyObj<Router>;

  function setup(paramId: string | null): void {
    waitForAuth = jasmine.createSpy('waitForAuth').and.resolveTo({ id: 'user-1' });
    fetchById = jasmine.createSpy('fetchById').and.resolveTo(shared());
    importAsTemplate = jasmine.createSpy('importAsTemplate').and.resolveTo({
      template: { id: 'tpl-1' } as WorkoutTemplate, skipped: [],
    });
    router = jasmine.createSpyObj('Router', ['navigate']);

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => paramId } } } },
        { provide: Router,         useValue: router },
        { provide: AuthService,    useValue: { waitForAuth } },
        { provide: SharedWorkoutService, useValue: { fetchById, importAsTemplate } },
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
    importAsTemplate.and.resolveTo({ template: { id: 'tpl-1' } as WorkoutTemplate, skipped: ['Exercici X'] });
    await component.ngOnInit();

    await component.confirmImport();

    expect(importAsTemplate).toHaveBeenCalledWith(shared());
    expect(component.status()).toBe('success');
    expect(component.skippedCount()).toBe(1);
  });

  it('shows an error if the import fails', async () => {
    setup('share-1');
    importAsTemplate.and.rejectWith(new Error('boom'));
    await component.ngOnInit();

    await component.confirmImport();

    expect(component.status()).toBe('error');
  });

  it('navigates home when goHome() is called', () => {
    setup('share-1');
    component.goHome();
    expect(router.navigate).toHaveBeenCalledWith(['/train']);
  });

  it('navigates to templates when goTemplates() is called', () => {
    setup('share-1');
    component.goTemplates();
    expect(router.navigate).toHaveBeenCalledWith(['/templates']);
  });
});
