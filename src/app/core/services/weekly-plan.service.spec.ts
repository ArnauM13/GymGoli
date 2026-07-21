import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { WEEKS_RECURRING, WeeklyPlanService } from './weekly-plan.service';
import { WorkoutService } from './workout.service';
import { SportService } from './sport.service';
import { TemplateService } from './template.service';
import { UserSettingsService } from './user-settings.service';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../models/user-settings.model';
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
  let ensureMonthLoadedWorkout: jasmine.Spy;
  let ensureMonthLoadedSport: jasmine.Spy;
  let getPlannedForDate: jasmine.Spy;
  let getDoneWorkoutsForDate: jasmine.Spy;
  let createPlannedWorkout: jasmine.Spy;
  let deleteWorkout: jasmine.Spy;
  let getSessionForDate: jasmine.Spy;
  let getPlannedSportSessionsForDate: jasmine.Spy;
  let logSession: jasmine.Spy;
  let deleteSession: jasmine.Spy;
  let templates: WorkoutTemplate[];
  let settingsState: ReturnType<typeof signal<UserSettings>>;
  let settingsUpdate: jasmine.Spy;
  let service: WeeklyPlanService;

  beforeEach(() => {
    // Wednesday: mondayOf() -> 2024-03-04, so Mon/Tue of that week are in the past.
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date('2024-03-06T12:00:00'));

    ensureMonthLoadedWorkout  = jasmine.createSpy().and.resolveTo(undefined);
    ensureMonthLoadedSport    = jasmine.createSpy().and.resolveTo(undefined);
    getPlannedForDate         = jasmine.createSpy().and.returnValue([]);
    getDoneWorkoutsForDate    = jasmine.createSpy().and.returnValue([]);
    createPlannedWorkout      = jasmine.createSpy().and.resolveTo('new-id');
    deleteWorkout             = jasmine.createSpy().and.resolveTo(undefined);
    getSessionForDate         = jasmine.createSpy().and.returnValue(undefined);
    getPlannedSportSessionsForDate = jasmine.createSpy().and.returnValue([]);
    logSession                = jasmine.createSpy().and.resolveTo(undefined);
    deleteSession             = jasmine.createSpy().and.resolveTo(undefined);
    templates                 = [];
    settingsState             = signal<UserSettings>({ ...DEFAULT_USER_SETTINGS });
    settingsUpdate            = jasmine.createSpy('update').and.callFake(
      async (patch: Partial<UserSettings>) => settingsState.update(s => ({ ...s, ...patch })));

    TestBed.configureTestingModule({
      providers: [
        {
          provide: WorkoutService,
          useValue: {
            ensureMonthLoaded:       ensureMonthLoadedWorkout,
            getPlannedForDate,
            getDoneWorkoutsForDate,
            createPlannedWorkout,
            deleteWorkout,
          },
        },
        {
          provide: SportService,
          useValue: {
            ensureMonthLoaded: ensureMonthLoadedSport,
            getSessionForDate,
            getPlannedSportSessionsForDate,
            logSession,
            deleteSession,
          },
        },
        {
          provide: TemplateService,
          useValue: { templates: () => templates, isLoaded: () => true },
        },
        {
          provide: UserSettingsService,
          useValue: {
            settings:   () => settingsState(),
            weeklyPlan: () => settingsState().weeklyPlan ?? EMPTY_WEEKLY_PLAN,
            update:     settingsUpdate,
          },
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
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-08', 'push', [], 'routine');
    });

    it('creates a planned workout for today itself', async () => {
      // "today" (mocked) is Wednesday 2024-03-06 -> dayIndex 2
      await service.apply(planWithGymOn(2, 'legs'), 1);
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-06', 'legs', [], 'routine');
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
      expect(logSession).toHaveBeenCalledWith(
        '2024-03-08', 'running', { subtypeId: undefined, duration: undefined }, 'planned', 'routine');
    });

    it('does not duplicate a sport session that already exists for that day', async () => {
      getSessionForDate.and.returnValue({ id: 'existing' } as unknown as SportSession);
      await service.apply(planWithSportOn(4, 'running'), 1);
      expect(logSession).not.toHaveBeenCalled();
    });

    it('applies to every week within the requested horizon', async () => {
      await service.apply(planWithGymOn(2 /* Wednesday */, 'push', true), 3);
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-06', 'push', [], 'routine'); // week 0
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-13', 'push', [], 'routine'); // week 1
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-20', 'push', [], 'routine'); // week 2
      expect(createPlannedWorkout).toHaveBeenCalledTimes(3);
    });

    it('targets an explicit startMonday instead of the current week when given one', async () => {
      // Explicit week starting 2024-03-11 (the week after the mocked "today"), Friday -> 2024-03-15
      await service.apply(planWithGymOn(4, 'push'), 1, '2024-03-11');
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-15', 'push', [], 'routine');
      expect(createPlannedWorkout).not.toHaveBeenCalledWith('2024-03-08', 'push', [], 'routine');
    });

    it('defaults to source "routine" when none is given', async () => {
      await service.apply(planWithGymOn(4, 'push'), 1);
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-08', 'push', [], 'routine');
    });

    it('tags created items with an explicit "manual" source when given (single-week planning)', async () => {
      await service.apply(planWithGymOn(4, 'push'), 1, '2024-03-04', 'manual');
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-08', 'push', [], 'manual');
    });

    it('threads the source through to logSession for sport items too', async () => {
      await service.apply(planWithSportOn(4, 'running'), 1, '2024-03-04', 'manual');
      expect(logSession).toHaveBeenCalledWith(
        '2024-03-08', 'running', { subtypeId: undefined, duration: undefined }, 'planned', 'manual');
    });

    it('keeps creating the remaining items when one item fails (e.g. offline)', async () => {
      const plan = emptyPlan();
      plan.days[2] = [{ type: 'gym', category: 'push' }, { type: 'gym', category: 'legs' }];
      createPlannedWorkout.and.callFake((_date: string, category: string) =>
        category === 'push' ? Promise.reject(new Error('network error')) : Promise.resolve('new-id'));

      await expectAsync(service.apply(plan, 1)).toBeResolved();
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-06', 'legs', [], 'routine');
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
      ], 'routine');
    });

    it('falls back to an empty workout if the referenced template no longer exists', async () => {
      templates = [];
      await service.apply(planWithGymOn(4, 'push', false, 'missing-tpl'), 1);
      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-08', 'push', [], 'routine');
    });

    it('prioritizes a custom entries list over a template id when both are present', async () => {
      templates = [{
        id: 'tpl-1', name: 'Push A', category: 'push', createdAt: '2024-01-01',
        entries: [{ exerciseId: 'from-tpl', exerciseName: 'From template' }],
      }];
      const plan = emptyPlan();
      plan.days[4] = [{
        type: 'gym', category: 'push', templateId: 'tpl-1',
        entries: [{ exerciseId: 'custom1', exerciseName: 'Custom exercise' }],
      }];

      await service.apply(plan, 1);

      expect(createPlannedWorkout).toHaveBeenCalledWith('2024-03-08', 'push', [
        { exerciseId: 'custom1', exerciseName: 'Custom exercise', sets: [] },
      ], 'routine');
    });

    it('passes a sport item\'s subtype and duration through to logSession', async () => {
      const plan = emptyPlan();
      plan.days[4] = [{ type: 'sport', sportId: 'running', subtypeId: 'sub1', duration: 45 }];

      await service.apply(plan, 1);

      expect(logSession).toHaveBeenCalledWith(
        '2024-03-08', 'running', { subtypeId: 'sub1', duration: 45 }, 'planned', 'routine');
    });
  });

  describe('retractRemoved()', () => {
    it('deletes a future routine-planned workout whose category is no longer wanted (default source)', async () => {
      getPlannedForDate.and.returnValue([
        { id: 'w1', categories: ['push'], plannedSource: 'routine' } as unknown as Workout,
      ]);
      await service.retractRemoved(emptyPlan(), 1); // nothing wanted on any day
      expect(deleteWorkout).toHaveBeenCalledWith('w1');
    });

    it('keeps a workout whose category is still in the plan', async () => {
      getPlannedForDate.and.callFake((date: string) =>
        date === '2024-03-06' ? [{ id: 'w1', categories: ['push'], plannedSource: 'routine' } as unknown as Workout] : []);
      await service.retractRemoved(planWithGymOn(2 /* Wednesday, today */, 'push'), 1);
      expect(deleteWorkout).not.toHaveBeenCalled();
    });

    it('never touches a workout sourced from a trainer proposal', async () => {
      getPlannedForDate.and.returnValue([
        { id: 'w1', categories: ['push'], plannedSource: 'trainer' } as unknown as Workout,
      ]);
      await service.retractRemoved(emptyPlan(), 1);
      expect(deleteWorkout).not.toHaveBeenCalled();
    });

    it('never touches a manually-planned workout when retracting the routine (independent sources)', async () => {
      getPlannedForDate.and.returnValue([
        { id: 'w1', categories: ['push'], plannedSource: 'manual' } as unknown as Workout,
      ]);
      await service.retractRemoved(emptyPlan(), 1); // default source: 'routine'
      expect(deleteWorkout).not.toHaveBeenCalled();
    });

    it('never touches a routine-planned workout when retracting a manual plan (independent sources)', async () => {
      getPlannedForDate.and.returnValue([
        { id: 'w1', categories: ['push'], plannedSource: 'routine' } as unknown as Workout,
      ]);
      await service.retractRemoved(emptyPlan(), 1, undefined, 'manual');
      expect(deleteWorkout).not.toHaveBeenCalled();
    });

    it('deletes a manually-planned workout no longer wanted when explicitly retracting manual plans', async () => {
      getPlannedForDate.and.returnValue([
        { id: 'w1', categories: ['push'], plannedSource: 'manual' } as unknown as Workout,
      ]);
      await service.retractRemoved(emptyPlan(), 1, undefined, 'manual');
      expect(deleteWorkout).toHaveBeenCalledWith('w1');
    });

    it('never touches legacy plannedSource "self" rows regardless of the requested source', async () => {
      getPlannedForDate.and.returnValue([
        { id: 'w1', categories: ['push'], plannedSource: 'self' } as unknown as Workout,
      ]);
      await service.retractRemoved(emptyPlan(), 1, undefined, 'routine');
      await service.retractRemoved(emptyPlan(), 1, undefined, 'manual');
      expect(deleteWorkout).not.toHaveBeenCalled();
    });

    it('skips days that already passed this week', async () => {
      getPlannedForDate.and.returnValue([
        { id: 'w1', categories: ['push'], plannedSource: 'routine' } as unknown as Workout,
      ]);
      await service.retractRemoved(emptyPlan(), 1);
      // Monday (2024-03-04) is in the past relative to mocked "today" (2024-03-06)
      expect(getPlannedForDate).not.toHaveBeenCalledWith('2024-03-04');
    });

    it('deletes a planned sport session whose sport is no longer wanted (default source)', async () => {
      getPlannedSportSessionsForDate.and.returnValue([
        { sport: { id: 'running' }, session: { id: 's1', plannedSource: 'routine' } },
      ]);
      await service.retractRemoved(emptyPlan(), 1);
      expect(deleteSession).toHaveBeenCalledWith('s1', jasmine.any(String));
    });

    it('keeps a planned sport session whose sport is still in the plan', async () => {
      getPlannedSportSessionsForDate.and.callFake((date: string) =>
        date === '2024-03-06' ? [{ sport: { id: 'running' }, session: { id: 's1', plannedSource: 'routine' } }] : []);
      await service.retractRemoved(planWithSportOn(2, 'running'), 1);
      expect(deleteSession).not.toHaveBeenCalled();
    });

    it('never touches a manually-planned sport session when retracting the routine', async () => {
      getPlannedSportSessionsForDate.and.returnValue([
        { sport: { id: 'running' }, session: { id: 's1', plannedSource: 'manual' } },
      ]);
      await service.retractRemoved(emptyPlan(), 1); // default source: 'routine'
      expect(deleteSession).not.toHaveBeenCalled();
    });

    it('keeps going when one deletion fails', async () => {
      getPlannedForDate.and.returnValue([
        { id: 'w1', categories: ['push'], plannedSource: 'routine' } as unknown as Workout,
      ]);
      deleteWorkout.and.rejectWith(new Error('network error'));
      await expectAsync(service.retractRemoved(emptyPlan(), 1)).toBeResolved();
    });
  });

  // Mocked "today" is Wednesday 2024-03-06 → monday 2024-03-04, so applying
  // WEEKS_RECURRING (13) weeks reaches sunday 2024-06-02.
  describe('routine horizon (re-materialization)', () => {
    it('apply() with source routine records how far the routine reaches', async () => {
      await service.apply(planWithGymOn(4, 'push', true), WEEKS_RECURRING, undefined, 'routine');
      expect(settingsUpdate).toHaveBeenCalledWith({ routineMaterializedUntil: '2024-06-02' });
    });

    it('apply() never shrinks the recorded horizon', async () => {
      settingsState.update(s => ({ ...s, routineMaterializedUntil: '2024-12-31' }));
      await service.apply(planWithGymOn(4, 'push', true), WEEKS_RECURRING, undefined, 'routine');
      expect(settingsUpdate).not.toHaveBeenCalled();
    });

    it('ensureRoutineHorizon() re-applies a recurring routine whose horizon ran low', async () => {
      settingsState.update(s => ({
        ...s,
        weeklyPlan: planWithGymOn(4, 'push', true),
        routineMaterializedUntil: '2024-03-10', // fewer than HORIZON_MIN_DAYS away
      }));
      await service.ensureRoutineHorizon();
      expect(createPlannedWorkout).toHaveBeenCalled();
      expect(settingsUpdate).toHaveBeenCalledWith({ routineMaterializedUntil: '2024-06-02' });
    });

    it('ensureRoutineHorizon() does nothing while the horizon is still far away', async () => {
      settingsState.update(s => ({
        ...s,
        weeklyPlan: planWithGymOn(4, 'push', true),
        routineMaterializedUntil: '2024-06-02',
      }));
      await service.ensureRoutineHorizon();
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });

    it('ensureRoutineHorizon() ignores non-recurring plans', async () => {
      settingsState.update(s => ({ ...s, weeklyPlan: planWithGymOn(4, 'push', false) }));
      await service.ensureRoutineHorizon();
      expect(createPlannedWorkout).not.toHaveBeenCalled();
    });
  });
});
