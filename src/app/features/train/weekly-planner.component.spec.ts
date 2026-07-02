import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { WeeklyPlannerComponent } from './weekly-planner.component';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WeeklyPlanService, WEEKS_RECURRING, WEEKS_SINGLE } from '../../core/services/weekly-plan.service';
import { SportService } from '../../core/services/sport.service';
import { TemplateService } from '../../core/services/template.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../../core/models/weekly-plan.model';
import { WorkoutTemplate } from '../../core/models/template.model';

function template(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return { id: 't1', name: 'Push A', category: 'push', entries: [], createdAt: '2024-01-01', ...overrides };
}

describe('WeeklyPlannerComponent', () => {
  let component: WeeklyPlannerComponent;
  let forCategory: jasmine.Spy;
  let savedPlan: ReturnType<typeof signal<WeeklyPlan>>;
  let retractRemoved: jasmine.Spy;
  let applyPlan: jasmine.Spy;
  let confirm: jasmine.Spy;

  function setup(): void {
    forCategory = jasmine.createSpy('forCategory').and.returnValue([]);
    savedPlan = signal(EMPTY_WEEKLY_PLAN);
    retractRemoved = jasmine.createSpy('retractRemoved').and.resolveTo(undefined);
    applyPlan = jasmine.createSpy('apply').and.resolveTo(undefined);
    confirm = jasmine.createSpy('confirm').and.resolveTo(true);

    TestBed.configureTestingModule({
      providers: [
        { provide: UserSettingsService, useValue: { weeklyPlan: savedPlan, updateWeeklyPlan: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: WeeklyPlanService,   useValue: { apply: applyPlan, retractRemoved } },
        { provide: SportService,        useValue: { sports: signal([]), ensureLoaded: jasmine.createSpy() } },
        { provide: TemplateService,     useValue: { forCategory } },
        { provide: MatSnackBar,         useValue: { open: jasmine.createSpy() } },
        { provide: ConfirmDialogService, useValue: { confirm } },
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

  describe('save()', () => {
    it('retracts stale items before applying the new plan, using the wider of the two horizons', async () => {
      savedPlan.set({ recurring: true, days: [[], [], [], [], [], [], []] }); // previously recurring (8 weeks)
      component.toggleGym(0, 'push');
      component.setRecurring(false); // new plan is single-week

      await component.save();

      expect(retractRemoved).toHaveBeenCalledWith(component.plan(), WEEKS_RECURRING);
      expect(applyPlan).toHaveBeenCalledWith(component.plan(), WEEKS_SINGLE);
    });

    it('uses the new plan\'s horizon when it is wider than the previous one', async () => {
      savedPlan.set({ recurring: false, days: [[], [], [], [], [], [], []] });
      component.toggleGym(0, 'push');
      component.setRecurring(true);

      await component.save();

      expect(retractRemoved).toHaveBeenCalledWith(component.plan(), WEEKS_RECURRING);
    });
  });

  describe('deletePlan()', () => {
    it('does nothing when the confirmation is declined', async () => {
      confirm.and.resolveTo(false);
      await component.deletePlan();
      expect(retractRemoved).not.toHaveBeenCalled();
    });

    it('clears the plan and retracts stale items across the previous horizon once confirmed', async () => {
      savedPlan.set({ recurring: true, days: [[], [], [], [], [], [], []] });
      await component.deletePlan();

      expect(retractRemoved).toHaveBeenCalledWith(EMPTY_WEEKLY_PLAN, WEEKS_RECURRING);
      expect(component.plan().days.every(items => items.length === 0)).toBeTrue();
    });
  });
});
