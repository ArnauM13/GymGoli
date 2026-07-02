import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WeeklyPlanService, WEEKS_RECURRING } from './weekly-plan.service';
import { AuthService } from './auth.service';
import { UserSettingsService } from './user-settings.service';
import { WorkoutService } from './workout.service';
import { SportService } from './sport.service';
import { TemplateService } from './template.service';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../models/weekly-plan.model';
import { Workout } from '../models/workout.model';
import { SportSession } from '../models/sport.model';
import { WorkoutTemplate } from '../models/template.model';

function emptyPlan(): WeeklyPlan {
  return { recurring: false, days: [[], [], [], [], [], [], []] };
}

/** Monday-indexed (0=Mon..6=Sun) plan with a single item on the given day. */
function planWithGymOn(dayIndex: number, category: 'push' | 'pull' | 'legs' = 'push', recurring = false, templateId?: string): WeeklyPlan {
  const p = emptyPlan();
  p.recurring = recurring;
  p.days[dayIndex] = [{ type: 'gym', category, templateId }];
  return p;
}

function planWithSportOn(dayIndex: number, sportId: string, recurring = false): WeeklyPlan {
  const p = emptyPlan();
  p.recurring = recurring;
  p.days[dayIndex] = [{ type: 'sport', sportId }];
  return p;
}

describe('WeeklyPlanService', () => {
  let uid: ReturnType<typeof signal<string | null>>;
  let weeklyPlan: ReturnType<typeof signal<WeeklyPlan>>;
  let ensureMonthLoadedWorkout: jasmine.Spy;
  let ensureMonthLoadedSport: jasmine.Spy;
  let getPlannedForDate: jasmine.Spy;
  let getDoneWorkoutsForDate: jasmine.Spy;
  let createPlannedWorkout: jasmine.Spy;
  let getSessionForDate: jasmine.Spy;
  let logSession: jasmine.Spy;
  let templates: WorkoutTemplate[];
  let service: WeeklyPlanService;

  beforeEach(() => {
    // Wednesday: mondayOf() -> 2024-03-04, so Mon/Tue of that week are in the past.
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2024-03-06T12:00:00'));

    uid                       = signal<string | null>('user-1');
    weeklyPlan                = signal<WeeklyPlan>(EMPTY_WEEKLY_PLAN);
    ensureMonthLoadedWorkout  = jasmine.createSpy().and.resolveTo(undefined);
    ensureMonthLoadedSport    = jasmine.createSpy().and.resolveTo(undefined);
    getPlannedForDate         = jasmine.createSpy().and.returnValue([]);
    getDoneWorkoutsForDate    = jasmine.createSpy().and.returnValue([]);
    createPlannedWorkout      = jasmine.createSpy().and.resolveTo('new-id');
    getSessionForDate         = jasmine.createSpy().and.returnValue(undefined);
    logSession                = jasmine.createSpy().and.resolveTo(undefined);
    templates                 = [];

    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService,         useValue: { uid } },
        { provide: UserSettingsService, useValue: { weeklyPlan } },
        {
          provide: WorkoutService,
          useValue: {
            ensureMonthLoaded:       ensureMonthLoadedWorkout,
            getPlannedForDate,
            getDoneWorkoutsForDate,
            createPlannedWorkout,
          },
        },
        {
          provide: SportService,
          useValue: {
            ensureMonthLoaded: ensureMonthLoadedSport,
            getSessionForDate,
            logSession,
          },
        },
        {
          provide: TemplateService,
          useValue: { templates: () => templates },
        },
      ],
    });
    service = TestBed.inject(WeeklyPlanService);
  });

  afterEach(() => jasmine.clock().uninstall());

  describe('apply()', () => {
    it('does nothing for a plan with no items on any day', async () => {
      await service.apply(emptyPlan(), 1);
      expect(ensureMonthLoadedWorkout).not.toHaveBeenCalled();
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });

    it('loads the calendar months touched by the requested horizon', async () => {
      await service.apply(planWithGymOn(4 /* Friday */), 1);
      expect(ensureMonthLoadedWorkout).toHaveBeenCalledWith(2024, 2); // March = month index 2
      expect(ensureMonthLoadedSport).toHaveBeenCalledWith(2024, 2);
    });

    it('creates a planned workout for a future day with a gym item', async () => {
      await service.apply(planWithGymOn(4 /* Friday, 2024-03-08 */, 'push'), 1);
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-08', 'push', []);
    });

    it('creates a planned workout for today itself', async () => {
      // "today" (mocked) is Wednesday 2024-03-06 -> dayIndex 2
      await service.apply(planWithGymOn(2, 'legs'), 1);
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-06', 'legs', []);
    });

    it('skips days that already passed this week', async () => {
      // Monday of the mocked week (2024-03-04) is before "today" (2024-03-06)
      await service.apply(planWithGymOn(0 /* Monday */, 'push'), 1);
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });

    it('does not duplicate a planned workout that already exists for that day+category', async () => {
      getPlannedForDate.and.returnValue([{ categories: ['push'] } as unknown as Workout]);
      await service.apply(planWithGymOn(4, 'push'), 1);
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });

    it('does not duplicate when a done workout of that category already exists', async () => {
      getDoneWorkoutsForDate.and.returnValue([{ categories: ['push'] } as unknown as Workout]);
      await service.apply(planWithGymOn(4, 'push'), 1);
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });

    it('still creates the workout if the existing entries are for a different category', async () => {
      getPlannedForDate.and.returnValue([{ categories: ['legs'] } as unknown as Workout]);
      await service.apply(planWithGymOn(4, 'push'), 1);
      expect(createPlannedWorkout).toHaveBeenCalled();
    });

    it('logs a planned sport session for a future day with a sport item', async () => {
      await service.apply(planWithSportOn(4, 'running'), 1);
      expect(logSession).toHaveBeenCalledWith('2024-03-08', 'running', {}, 'planned');
    });

    it('does not duplicate a sport session that already exists for that day', async () => {
      getSessionForDate.and.returnValue({ id: 'existing' } as unknown as SportSession);
      await service.apply(planWithSportOn(4, 'running'), 1);
      expect(logSession).not.toHaveBeenCalled();
    });

    it('applies to every week within the requested horizon', async () => {
      await service.apply(planWithGymOn(2 /* Wednesday */, 'push', true), 3);
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-06', 'push', []); // week 0
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-13', 'push', []); // week 1
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-20', 'push', []); // week 2
      expect(createPlannedWorkout).toHaveBeenCalledTimes(3);
    });

    it('keeps creating the remaining items when one item fails (e.g. offline)', async () => {
      const plan = emptyPlan();
      plan.days[2] = [{ type: 'gym', category: 'push' }, { type: 'gym', category: 'legs' }];
      createPlannedWorkout.and.callFake((_date: string, category: string) =>
        category === 'push' ? Promise.reject(new Error('network error')) : Promise.resolve('new-id'));

      await expectAsync(service.apply(plan, 1)).toBeResolved();
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-06', 'legs', []);
    });

    it('materializes a template\'s exercises when the gym item references one (plan in detail)', async () => {
      templates = [{
        id: 'tpl-1', name: 'Push A', category: 'push', createdAt: '2024-01-01',
        entries: [
          { exerciseId: 'ex1', exerciseName: 'Press banca', sets: 3, reps: 8, weight: 60 },
          { exerciseId: 'ex2', exerciseName: 'Press militar' },
        ],
      }];
      await service.apply(planWithGymOn(4, 'push', false, 'tpl-1'), 1);

      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-08', 'push', [
        { exerciseId: 'ex1', exerciseName: 'Press banca', sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 8 }] },
        { exerciseId: 'ex2', exerciseName: 'Press militar', sets: [] },
      ]);
    });

    it('falls back to an empty workout if the referenced template no longer exists', async () => {
      templates = [];
      await service.apply(planWithGymOn(4, 'push', false, 'missing-tpl'), 1);
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-08', 'push', []);
    });
  });

  describe('ensureRecurringApplied()', () => {
    it('does nothing when there is no authenticated user', async () => {
      uid.set(null);
      weeklyPlan.set(planWithGymOn(2, 'push', true));
      await service.ensureRecurringApplied();
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });

    it('does nothing when the saved plan is not recurring', async () => {
      weeklyPlan.set(planWithGymOn(2, 'push', false));
      await service.ensureRecurringApplied();
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });

    it('applies the plan across the full recurring horizon', async () => {
      weeklyPlan.set(planWithGymOn(2, 'push', true));
      await service.ensureRecurringApplied();
      expect(createPlannedWorkout).toHaveBeenCalledTimes(WEEKS_RECURRING);
    });

    it('only tops up once per authenticated session', async () => {
      weeklyPlan.set(planWithGymOn(2, 'push', true));
      await service.ensureRecurringApplied();
      createPlannedWorkout.calls.reset();

      await service.ensureRecurringApplied();
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });

    it('does not retry on the next call when an individual item failed, since apply() absorbs per-item errors', async () => {
      weeklyPlan.set(planWithGymOn(2, 'push', true));
      createPlannedWorkout.and.rejectWith(new Error('network error'));

      await service.ensureRecurringApplied();
      createPlannedWorkout.calls.reset();
      createPlannedWorkout.and.resolveTo('new-id');

      await service.ensureRecurringApplied();
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });
  });
});
