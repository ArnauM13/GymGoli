import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { WeeklyPlannerComponent } from './weekly-planner.component';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WeeklyPlanService, WEEKS_RECURRING, WEEKS_SINGLE } from '../../core/services/weekly-plan.service';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { TemplateService } from '../../core/services/template.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../../core/models/weekly-plan.model';
import { WorkoutTemplate } from '../../core/models/template.model';
import { Exercise } from '../../core/models/exercise.model';
import { Workout } from '../../core/models/workout.model';
import { Sport, SportSession } from '../../core/models/sport.model';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

function template(overrides: Partial<WorkoutTemplate> = {}): WorkoutTemplate {
  return { id: 't1', name: 'Push A', category: 'push', entries: [], createdAt: '2024-01-01', ...overrides };
}

describe('WeeklyPlannerComponent', () => {
  let component: WeeklyPlannerComponent;
  let forCategory: jasmine.Spy;
  let savedPlan: ReturnType<typeof signal<WeeklyPlan>>;
  let updateWeeklyPlan: jasmine.Spy;
  let retractRemoved: jasmine.Spy;
  let applyPlan: jasmine.Spy;
  let confirm: jasmine.Spy;
  let chooseAction: jasmine.Spy;
  let getPlannedForDate: jasmine.Spy;
  let getWorkoutsForDate: jasmine.Spy;
  let getSportSessionsForDate: jasmine.Spy;
  let getPlannedSportSessionsForDate: jasmine.Spy;
  let dialogOpen: jasmine.Spy;
  let goBack: jasmine.Spy;
  let afterClosedResult: Exercise | undefined;

  function setup(
    week: string | null = null,
    initial: {
      getPlannedForDate?: (date: string) => Workout[];
      getWorkoutsForDate?: (date: string) => Workout[];
      getSportSessionsForDate?: (date: string) => Array<{ sport: Sport; session: SportSession }>;
      getPlannedSportSessionsForDate?: (date: string) => Array<{ sport: Sport; session: SportSession }>;
    } = {},
  ): void {
    forCategory = jasmine.createSpy('forCategory').and.returnValue([]);
    savedPlan = signal(EMPTY_WEEKLY_PLAN);
    updateWeeklyPlan = jasmine.createSpy('updateWeeklyPlan').and.resolveTo(undefined);
    retractRemoved = jasmine.createSpy('retractRemoved').and.resolveTo(undefined);
    applyPlan = jasmine.createSpy('apply').and.resolveTo(undefined);
    confirm = jasmine.createSpy('confirm').and.resolveTo(true);
    chooseAction = jasmine.createSpy('chooseAction').and.resolveTo(null);
    getPlannedForDate = jasmine.createSpy('getPlannedForDate').and.callFake(initial.getPlannedForDate ?? (() => []));
    getWorkoutsForDate = jasmine.createSpy('getWorkoutsForDate').and.callFake(initial.getWorkoutsForDate ?? (() => []));
    getSportSessionsForDate = jasmine.createSpy('getSportSessionsForDate')
      .and.callFake(initial.getSportSessionsForDate ?? (() => []));
    getPlannedSportSessionsForDate = jasmine.createSpy('getPlannedSportSessionsForDate')
      .and.callFake(initial.getPlannedSportSessionsForDate ?? (() => []));
    afterClosedResult = undefined;
    goBack = jasmine.createSpy('goBack');
    dialogOpen = jasmine.createSpy('open').and.returnValue({
      afterClosed: () => of(afterClosedResult),
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: UserSettingsService, useValue: { weeklyPlan: savedPlan, updateWeeklyPlan } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: WeeklyPlanService,   useValue: { apply: applyPlan, retractRemoved } },
        { provide: WorkoutService,      useValue: { getPlannedForDate, getWorkoutsForDate } },
        { provide: SportService,        useValue: { sports: signal([]), ensureLoaded: jasmine.createSpy(), getSportSessionsForDate, getPlannedSportSessionsForDate } },
        { provide: TemplateService,     useValue: { forCategory } },
        { provide: FeedbackService,     useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
        { provide: ConfirmDialogService, useValue: { confirm, chooseAction } },
        { provide: NavigationHistoryService, useValue: { goBack } },
        { provide: MatDialog,           useValue: { open: dialogOpen } },
        { provide: ActivatedRoute,      useValue: { snapshot: { queryParamMap: { get: () => week } } } },
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

  describe('collapsible days', () => {
    it('starts every day collapsed', () => {
      expect(component.isDayExpanded(0)).toBeFalse();
      expect(component.isDayExpanded(6)).toBeFalse();
    });

    it('toggleDay() expands and collapses a single day independently', () => {
      component.toggleDay(2);
      expect(component.isDayExpanded(2)).toBeTrue();
      expect(component.isDayExpanded(3)).toBeFalse();
      component.toggleDay(2);
      expect(component.isDayExpanded(2)).toBeFalse();
    });
  });

  describe('daySummary()', () => {
    it('is empty for a day with nothing planned', () => {
      expect(component.daySummary(0)).toEqual([]);
    });

    it('lists selected gym categories with their label/icon/color', () => {
      component.toggleGym(0, 'push');
      const summary = component.daySummary(0);
      expect(summary.length).toBe(1);
      expect(summary[0].key).toBe('gym-push');
      expect(summary[0].label).toBe('Empenta');
    });
  });

  describe('cancel()', () => {
    it('restores the plan to its state on entry and navigates back', () => {
      component.toggleGym(0, 'push');
      expect(component.daySummary(0).length).toBe(1);

      component.cancel();

      expect(component.daySummary(0)).toEqual([]);
      expect(goBack).toHaveBeenCalledWith('/train');
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

  describe('weekMonday', () => {
    it('is null in the default (settings/recurring routine) mode', () => {
      expect(component.weekMonday).toBeNull();
    });

    it('never locks days in routine mode (weekdays are abstract, not dates)', () => {
      for (let i = 0; i < 7; i++) expect(component.isDayLocked(i)).toBeFalse();
      expect(component.weekHasPastDays()).toBeFalse();
    });
  });

  describe('save() in settings mode (weekMonday is null)', () => {
    it('always saves as a recurring plan across the full recurring horizon, tagged source "routine"', async () => {
      component.toggleGym(0, 'push');

      await component.save();

      expect(updateWeeklyPlan).toHaveBeenCalledWith(jasmine.objectContaining({ recurring: true }));
      expect(retractRemoved).toHaveBeenCalledWith(jasmine.objectContaining({ recurring: true }), WEEKS_RECURRING, undefined, 'routine');
      expect(applyPlan).toHaveBeenCalledWith(jasmine.objectContaining({ recurring: true }), WEEKS_RECURRING, undefined, 'routine');
    });
  });

  describe('deletePlan()', () => {
    it('does nothing when the confirmation is declined', async () => {
      confirm.and.resolveTo(false);
      await component.deletePlan();
      expect(retractRemoved).not.toHaveBeenCalled();
    });

    it('clears the plan and retracts stale routine items across the recurring horizon once confirmed', async () => {
      savedPlan.set({ recurring: true, days: [[], [], [], [], [], [], []] });
      await component.deletePlan();

      expect(retractRemoved).toHaveBeenCalledWith(EMPTY_WEEKLY_PLAN, WEEKS_RECURRING, undefined, 'routine');
      expect(component.plan().days.every(items => items.length === 0)).toBeTrue();
    });
  });

  describe('week mode (single-week planning from the calendar)', () => {
    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date('2024-03-06T12:00:00')); // Wednesday of the requested week
      TestBed.resetTestingModule();
      setup('2024-03-04');
    });

    afterEach(() => jasmine.clock().uninstall());

    it('exposes the requested week', () => {
      expect(component.weekMonday).toBe('2024-03-04');
    });

    it('weekRange() formats the week label', () => {
      expect(component.weekRange('2024-03-04')).toContain('2024');
    });

    describe('days before today are locked', () => {
      it('locks past days and keeps today and future days editable', () => {
        expect(component.isDayLocked(0)).toBeTrue();  // dilluns 04
        expect(component.isDayLocked(1)).toBeTrue();  // dimarts 05
        expect(component.isDayLocked(2)).toBeFalse(); // dimecres 06 (avui)
        expect(component.isDayLocked(6)).toBeFalse(); // diumenge 10
      });

      it('toggleDay() cannot expand a locked day', () => {
        component.toggleDay(0);
        expect(component.isDayExpanded(0)).toBeFalse();
        component.toggleDay(2);
        expect(component.isDayExpanded(2)).toBeTrue();
      });

      it('weekHasPastDays() is true for the current week once past Monday', () => {
        expect(component.weekHasPastDays()).toBeTrue();
      });

      it('locks nothing when planning a future week', () => {
        TestBed.resetTestingModule();
        setup('2024-03-11');
        for (let i = 0; i < 7; i++) expect(component.isDayLocked(i)).toBeFalse();
        expect(component.weekHasPastDays()).toBeFalse();
      });
    });

    describe('pre-filling the actual planned state for this week (not the persisted routine)', () => {
      it('marks a gym category as selected with its actual planned entries for that day', () => {
        TestBed.resetTestingModule();
        setup('2024-03-04', {
          getWorkoutsForDate: (date) => date === '2024-03-04'
            ? [{ id: 'w1', plannedSource: 'manual', category: 'push', entries: [{ exerciseId: 'ex1', exerciseName: 'Press banca' }] } as unknown as Workout]
            : [],
        });

        expect(component.isGymSelected(0, 'push')).toBeTrue();
        expect(component.gymEntries(0, 'push')).toEqual([{ exerciseId: 'ex1', exerciseName: 'Press banca' }]);
        expect(component.isGymSelected(1, 'push')).toBeFalse();
      });

      it('marks a sport as selected with its actual planned subtype/duration for that day', () => {
        TestBed.resetTestingModule();
        setup('2024-03-04', {
          getPlannedSportSessionsForDate: (date) => date === '2024-03-05'
            ? [{ sport: { id: 'running' } as Sport, session: { plannedSource: 'manual', subtypeId: 'sub1', duration: 30 } as SportSession }]
            : [],
        });

        expect(component.isSportSelected(1, 'running')).toBeTrue();
        expect(component.sportSubtype(1, 'running')).toBe('sub1');
        expect(component.sportDuration(1, 'running')).toBe(30);
        expect(component.isSportSelected(0, 'running')).toBeFalse();
      });

      it('still marks a day whose planned workout has already been completed (status done)', () => {
        TestBed.resetTestingModule();
        setup('2024-03-04', {
          getWorkoutsForDate: (date) => date === '2024-03-04'
            ? [{ id: 'w1', status: 'done', plannedSource: 'manual', category: 'push', entries: [] } as unknown as Workout]
            : [],
        });

        expect(component.isGymSelected(0, 'push')).toBeTrue();
      });

      it('still marks a day whose planned sport session has already been completed (status done)', () => {
        TestBed.resetTestingModule();
        setup('2024-03-04', {
          getSportSessionsForDate: (date) => date === '2024-03-05'
            ? [{ sport: { id: 'running' } as Sport, session: { status: 'done', plannedSource: 'manual' } as SportSession }]
            : [],
        });

        expect(component.isSportSelected(1, 'running')).toBeTrue();
      });

      it('ignores workouts not created by planning (no plannedSource), even if already categorized', () => {
        TestBed.resetTestingModule();
        setup('2024-03-04', {
          getWorkoutsForDate: (date) => date === '2024-03-04'
            ? [{ id: 'w1', category: 'push', entries: [] } as unknown as Workout]
            : [],
        });

        expect(component.isGymSelected(0, 'push')).toBeFalse();
      });

      it('ignores planned workouts with no category (defensive)', () => {
        TestBed.resetTestingModule();
        setup('2024-03-04', {
          getWorkoutsForDate: (date) => date === '2024-03-04'
            ? [{ id: 'w1', plannedSource: 'manual', entries: [] } as unknown as Workout]
            : [],
        });

        expect(component.plan().days[0]).toEqual([]);
      });

      it('starts empty when nothing is planned for any day of the week', () => {
        TestBed.resetTestingModule();
        setup('2024-03-04');
        expect(component.plan().days.every(items => items.length === 0)).toBeTrue();
      });
    });

    describe('save() when the routine has nothing planned for this week', () => {
      it('applies only to the requested week, tagged source "manual", without asking or touching the persisted routine', async () => {
        component.toggleGym(0, 'push');

        await component.save();

        expect(chooseAction).not.toHaveBeenCalled();
        expect(retractRemoved).toHaveBeenCalledWith(component.plan(), WEEKS_SINGLE, '2024-03-04', 'manual');
        expect(applyPlan).toHaveBeenCalledWith(component.plan(), WEEKS_SINGLE, '2024-03-04', 'manual');
        expect(updateWeeklyPlan).not.toHaveBeenCalled();
      });
    });

    describe('save() when the routine already has something planned for this week', () => {
      beforeEach(() => {
        getPlannedForDate.and.callFake((date: string) =>
          date === '2024-03-06' ? [{ id: 'w1', plannedSource: 'routine' } as unknown as Workout] : []);
      });

      it('asks the user to overwrite or add on top before saving anything', async () => {
        component.toggleGym(0, 'push');
        chooseAction.and.resolveTo(null);

        await component.save();

        expect(chooseAction).toHaveBeenCalledWith(
          jasmine.stringMatching(/rutina/i),
          jasmine.arrayContaining([
            jasmine.objectContaining({ value: 'overwrite' }),
            jasmine.objectContaining({ value: 'add' }),
          ]),
        );
        expect(retractRemoved).not.toHaveBeenCalled();
        expect(applyPlan).not.toHaveBeenCalled();
      });

      it('only retracts the manual plan (routine untouched) when the user chooses to add on top', async () => {
        component.toggleGym(0, 'push');
        chooseAction.and.resolveTo('add');

        await component.save();

        expect(retractRemoved).toHaveBeenCalledWith(component.plan(), WEEKS_SINGLE, '2024-03-04', 'manual');
        expect(retractRemoved).not.toHaveBeenCalledWith(EMPTY_WEEKLY_PLAN, WEEKS_SINGLE, '2024-03-04', 'routine');
        expect(applyPlan).toHaveBeenCalledWith(component.plan(), WEEKS_SINGLE, '2024-03-04', 'manual');
      });

      it('also retracts the routine\'s plan for this specific week when the user chooses to overwrite', async () => {
        component.toggleGym(0, 'push');
        chooseAction.and.resolveTo('overwrite');

        await component.save();

        expect(retractRemoved).toHaveBeenCalledWith(EMPTY_WEEKLY_PLAN, WEEKS_SINGLE, '2024-03-04', 'routine');
        expect(retractRemoved).toHaveBeenCalledWith(component.plan(), WEEKS_SINGLE, '2024-03-04', 'manual');
        expect(applyPlan).toHaveBeenCalledWith(component.plan(), WEEKS_SINGLE, '2024-03-04', 'manual');
      });

      it('does not ask when the routine only has items on days already passed', async () => {
        getPlannedForDate.and.callFake((date: string) =>
          date === '2024-03-04' /* Monday, before today */ ? [{ id: 'w1', plannedSource: 'routine' } as unknown as Workout] : []);
        component.toggleGym(3, 'push');

        await component.save();

        expect(chooseAction).not.toHaveBeenCalled();
        expect(applyPlan).toHaveBeenCalledWith(component.plan(), WEEKS_SINGLE, '2024-03-04', 'manual');
      });
    });
  });
});
