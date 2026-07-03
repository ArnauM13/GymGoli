import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { WeeklyPlannerComponent } from './weekly-planner.component';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WeeklyPlanService, WEEKS_RECURRING, WEEKS_SINGLE } from '../../core/services/weekly-plan.service';
import { SportService } from '../../core/services/sport.service';
import { TemplateService } from '../../core/services/template.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../../core/models/weekly-plan.model';
import { WorkoutTemplate } from '../../core/models/template.model';
import { Exercise } from '../../core/models/exercise.model';

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
  let dialogOpen: jasmine.Spy;
  let afterClosedResult: Exercise | undefined;

  function setup(): void {
    forCategory = jasmine.createSpy('forCategory').and.returnValue([]);
    savedPlan = signal(EMPTY_WEEKLY_PLAN);
    retractRemoved = jasmine.createSpy('retractRemoved').and.resolveTo(undefined);
    applyPlan = jasmine.createSpy('apply').and.resolveTo(undefined);
    confirm = jasmine.createSpy('confirm').and.resolveTo(true);
    afterClosedResult = undefined;
    dialogOpen = jasmine.createSpy('open').and.returnValue({
      afterClosed: () => of(afterClosedResult),
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: UserSettingsService, useValue: { weeklyPlan: savedPlan, updateWeeklyPlan: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: WeeklyPlanService,   useValue: { apply: applyPlan, retractRemoved } },
        { provide: SportService,        useValue: { sports: signal([]), ensureLoaded: jasmine.createSpy() } },
        { provide: TemplateService,     useValue: { forCategory } },
        { provide: MatSnackBar,         useValue: { open: jasmine.createSpy() } },
        { provide: ConfirmDialogService, useValue: { confirm } },
        { provide: MatDialog,           useValue: { open: dialogOpen } },
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

    it('clears any custom entries when a template is picked (mutual exclusivity)', () => {
      const exercise = { id: 'ex1', name: 'Press banca' } as Exercise;
      component.toggleGym(0, 'push');
      component.addGymEntry(0, 'push', exercise);
      component.setGymTemplate(0, 'push', 't1');

      expect(component.gymTemplate(0, 'push')).toBe('t1');
      expect(component.gymEntries(0, 'push')).toEqual([]);
    });
  });

  describe('gymEntries() / addGymEntry() / removeGymEntry()', () => {
    it('is empty until an exercise is added', () => {
      component.toggleGym(0, 'push');
      expect(component.gymEntries(0, 'push')).toEqual([]);
    });

    it('adds an exercise to the matching gym item only', () => {
      const exercise = { id: 'ex1', name: 'Press banca' } as Exercise;
      component.toggleGym(0, 'push');
      component.toggleGym(0, 'legs');
      component.addGymEntry(0, 'push', exercise);

      expect(component.gymEntries(0, 'push')).toEqual([{ exerciseId: 'ex1', exerciseName: 'Press banca' }]);
      expect(component.gymEntries(0, 'legs')).toEqual([]);
    });

    it('clears a template id when a custom exercise is added (mutual exclusivity)', () => {
      const exercise = { id: 'ex1', name: 'Press banca' } as Exercise;
      component.toggleGym(0, 'push');
      component.setGymTemplate(0, 'push', 't1');
      component.addGymEntry(0, 'push', exercise);

      expect(component.gymTemplate(0, 'push')).toBeUndefined();
    });

    it('removes an exercise by id', () => {
      const ex1 = { id: 'ex1', name: 'Press banca' } as Exercise;
      const ex2 = { id: 'ex2', name: 'Press militar' } as Exercise;
      component.toggleGym(0, 'push');
      component.addGymEntry(0, 'push', ex1);
      component.addGymEntry(0, 'push', ex2);
      component.removeGymEntry(0, 'push', 'ex1');

      expect(component.gymEntries(0, 'push')).toEqual([{ exerciseId: 'ex2', exerciseName: 'Press militar' }]);
    });
  });

  describe('openExercisePicker()', () => {
    it('opens the exercise picker excluding already-added exercises and adds the picked one', () => {
      const picked = { id: 'ex2', name: 'Press militar' } as Exercise;
      afterClosedResult = picked;
      component.toggleGym(0, 'push');
      component.addGymEntry(0, 'push', { id: 'ex1', name: 'Press banca' } as Exercise);

      component.openExercisePicker(0, 'push');

      expect(dialogOpen).toHaveBeenCalled();
      const config = dialogOpen.calls.mostRecent().args[1];
      expect(config.data).toEqual({ excludeIds: ['ex1'], defaultCategory: 'push' });
      expect(component.gymEntries(0, 'push')).toContain(jasmine.objectContaining({ exerciseId: 'ex2' }));
    });

    it('does nothing when the dialog is dismissed without a selection', () => {
      afterClosedResult = undefined;
      component.toggleGym(0, 'push');
      component.openExercisePicker(0, 'push');
      expect(component.gymEntries(0, 'push')).toEqual([]);
    });
  });

  describe('sportSubtype() / setSportSubtype() / sportDuration() / setSportDuration()', () => {
    it('are undefined until a sport is toggled on', () => {
      expect(component.sportSubtype(0, 'running')).toBeUndefined();
      expect(component.sportDuration(0, 'running')).toBeUndefined();
    });

    it('sets and clears the subtype for the matching sport item only', () => {
      component.toggleSport(0, 'running');
      component.toggleSport(0, 'swimming');
      component.setSportSubtype(0, 'running', 'sub1');

      expect(component.sportSubtype(0, 'running')).toBe('sub1');
      expect(component.sportSubtype(0, 'swimming')).toBeUndefined();

      component.setSportSubtype(0, 'running', undefined);
      expect(component.sportSubtype(0, 'running')).toBeUndefined();
    });

    it('sets the duration for the matching sport item only', () => {
      component.toggleSport(0, 'running');
      component.setSportDuration(0, 'running', 45);
      expect(component.sportDuration(0, 'running')).toBe(45);
    });
  });

  describe('numFromEvent()', () => {
    it('returns undefined for an empty input', () => {
      const ev = { target: { value: '' } } as unknown as Event;
      expect(component.numFromEvent(ev)).toBeUndefined();
    });

    it('parses a numeric input value', () => {
      const ev = { target: { value: '30' } } as unknown as Event;
      expect(component.numFromEvent(ev)).toBe(30);
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
