import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { WeeklyPlannerComponent } from './weekly-planner.component';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WeeklyPlanService } from '../../core/services/weekly-plan.service';
import { SportService } from '../../core/services/sport.service';
import { TemplateService } from '../../core/services/template.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { EMPTY_WEEKLY_PLAN } from '../../core/models/weekly-plan.model';
import { WorkoutTemplate } from '../../core/models/template.model';

function template(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return { id: 't1', name: 'Push A', category: 'push', entries: [], createdAt: '2024-01-01', ...overrides };
}

describe('WeeklyPlannerComponent', () => {
  let component: WeeklyPlannerComponent;
  let forCategory: jasmine.Spy;

  function setup(): void {
    forCategory = jasmine.createSpy('forCategory').and.returnValue([]);

    TestBed.configureTestingModule({
      providers: [
        { provide: UserSettingsService, useValue: { weeklyPlan: signal(EMPTY_WEEKLY_PLAN), updateWeeklyPlan: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: WeeklyPlanService,   useValue: { apply: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: SportService,        useValue: { sports: signal([]), ensureLoaded: jasmine.createSpy() } },
        { provide: TemplateService,     useValue: { forCategory } },
        { provide: MatSnackBar,         useValue: { open: jasmine.createSpy() } },
        { provide: ConfirmDialogService, useValue: { confirm: jasmine.createSpy().and.resolveTo(false) } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new WeeklyPlannerComponent());
  }

  beforeEach(() => setup());

  describe('templatesFor()', () => {
    it('delegates to TemplateService.forCategory()', () => {
      const tpls = [template()];
      forCategory.and.returnValue(tpls);
      expect(component.templatesFor('push')).toBe(tpls);
      expect(forCategory).toHaveBeenCalledWith('push');
    });
  });

  describe('gymTemplate() / setGymTemplate()', () => {
    it('is undefined until a gym category is selected for that day', () => {
      expect(component.gymTemplate(0, 'push')).toBeUndefined();
    });

    it('defaults to no template once the category is toggled on', () => {
      component.toggleGym(0, 'push');
      expect(component.gymTemplate(0, 'push')).toBeUndefined();
    });

    it('assigns a template id to the matching gym item only', () => {
      component.toggleGym(0, 'push');
      component.toggleGym(0, 'legs');
      component.setGymTemplate(0, 'push', 't1');

      expect(component.gymTemplate(0, 'push')).toBe('t1');
      expect(component.gymTemplate(0, 'legs')).toBeUndefined();
    });

    it('clears the template id when reset to undefined ("Buit")', () => {
      component.toggleGym(0, 'push');
      component.setGymTemplate(0, 'push', 't1');
      component.setGymTemplate(0, 'push', undefined);
      expect(component.gymTemplate(0, 'push')).toBeUndefined();
    });

    it('does not affect the same category on a different day', () => {
      component.toggleGym(0, 'push');
      component.toggleGym(1, 'push');
      component.setGymTemplate(0, 'push', 't1');

      expect(component.gymTemplate(0, 'push')).toBe('t1');
      expect(component.gymTemplate(1, 'push')).toBeUndefined();
    });
  });
});
