import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LowerCasePipe } from '@angular/common';
import { provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { TrainComponent } from './train.component';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { AuthService } from '../../core/services/auth.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { OfflineService } from '../../core/services/offline.service';
import { TrainerService } from '../../core/services/trainer.service';
import { TemplateService } from '../../core/services/template.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { WorkoutProfileService } from '../../core/services/workout-profile.service';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { AppHintService } from '../../core/services/app-hint.service';
import { ExerciseSuggestionService } from '../../core/services/exercise-suggestion.service';
import { Workout } from '../../core/models/workout.model';
import { Exercise } from '../../core/models/exercise.model';
import { DEFAULT_USER_SETTINGS } from '../../core/models/user-settings.model';
import { EMPTY_WEEKLY_PLAN } from '../../core/models/weekly-plan.model';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

const TODAY = new Date().toISOString().split('T')[0];
const P = { daysSinceLast: 3, typicalGapDays: 4, overdueScore: 0.75 };

function ex(id: string, category: string, subcategory: string, extra: Partial<Exercise> = {}): Exercise {
  return { id, name: id, category, subcategory, createdAt: new Date(), ...extra } as unknown as Exercise;
}

/**
 * Regression guard for the "opening today's training crashes" report: the
 * live-training aids (`exerciseSuggestions`, `needsBodyweightHint`) run *only*
 * for today's active workout, so a throw in either blanks the whole workout
 * view and spirals into a repeating error toast. They must degrade to no hint
 * instead of throwing.
 */
describe('TrainComponent — today-only aids never crash the workout view', () => {
  function setup(suggestionServiceValue: unknown) {
    const exercises = [ex('e1', 'push', 'pit'), ex('e2', 'push', 'espatlles')];
    const done: Workout = {
      id: 'w1', date: TODAY, status: 'done', category: 'push', categories: ['push'],
      entries: [
        { exerciseId: 'e1', exerciseName: 'e1', sets: [{ weight: 60, reps: 8 }] },
        { exerciseId: 'e2', exerciseName: 'e2', sets: [{ weight: 20, reps: 12 }] },
      ],
      createdAt: new Date(), updatedAt: new Date(),
    } as unknown as Workout;
    const exBy = new Map(exercises.map(e => [e.id, e]));

    TestBed.configureTestingModule({
      imports: [TrainComponent],
      providers: [
        provideRouter([]),
        { provide: WorkoutService, useValue: {
          workouts: signal([done]), doneWorkouts: signal([done]), isLoading: signal(false),
          getWorkoutsForDate: () => [], getDoneWorkoutsForDate: () => [], getPlannedForDate: () => [],
          getLastWorkoutByCategory: () => null, getAllTimeMaxWeight: () => 0, getLastSessionInfo: () => null,
          ensureMonthLoaded: () => {},
        } },
        { provide: SportService, useValue: {
          sports: signal([]), sessions: signal([]), isLoaded: signal(true), sportsLoaded: signal(true),
          getSportSessionsForDate: () => [], getPlannedSportSessionsForDate: () => [],
          ensureMonthLoaded: () => {}, ensureLoaded: () => Promise.resolve(),
        } },
        { provide: ExerciseService, useValue: {
          exercises: signal(exercises), isLoaded: signal(true), ensureLoaded: () => Promise.resolve(),
          getById: (id: string) => exBy.get(id),
          loadTypeOf: (id: string) => exBy.get(id)?.loadType,
          bodyweightFactorOf: (id: string) => exBy.get(id)?.bodyweightFactor,
        } },
        { provide: AuthService, useValue: { uid: signal('user-1') } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: ExerciseSuggestionService, useValue: suggestionServiceValue },
        { provide: UserSettingsService, useValue: {
          weightUnit: signal<'kg' | 'lb'>('kg'), fitnessGoal: signal('strength'), loaded: signal(true),
          weeklyPlan: signal(EMPTY_WEEKLY_PLAN), settings: signal(DEFAULT_USER_SETTINGS), update: () => Promise.resolve(),
          supersetsEnabled: signal(false), dropsetsEnabled: signal(false), rirEnabled: signal(false),
          manualRestEnabled: signal(false), difficultyScale: signal('emoji'), restTimerSeconds: signal(90),
          dismissedHints: signal<string[]>([]), bodyweightKg: signal(null),
        } },
        { provide: OfflineService, useValue: { isOffline: signal(false), forceOffline: signal(false) } },
        { provide: TrainerService, useValue: { myTrainer: signal(null), hasTrainer: () => false, getProposalForDate: () => null } },
        { provide: TemplateService, useValue: { templates: signal([]), forCategory: () => [] } },
        { provide: SharedWorkoutService, useValue: {} },
        { provide: WorkoutProfileService, useValue: { profile: signal({ gym: { push: P, pull: P, legs: P }, favoriteSport: null, recentSport: null, minRecovery: 2 }) } },
        { provide: AppHintService, useValue: { isDismissed: () => false, dismiss: () => {} } },
        { provide: MatDialog, useValue: { open: () => {}, openDialogs: [] } },
        { provide: FeedbackService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
        { provide: ConfirmDialogService, useValue: { confirm: () => Promise.resolve(false) } },
        { provide: NavigationHistoryService, useValue: { goBack: () => {} } },
      ],
    }).overrideComponent(TrainComponent, { set: { imports: [LowerCasePipe], schemas: [NO_ERRORS_SCHEMA] } });

    const fixture = TestBed.createComponent(TrainComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    component.openWorkout('w1');
    return { fixture, component };
  }

  it('renders a completed today workout without throwing', () => {
    const { fixture, component } = setup({ suggest: () => [] });
    expect(() => component.exerciseSuggestions()).not.toThrow();
    expect(() => component.needsBodyweightHint()).not.toThrow();
    expect(() => fixture.detectChanges()).not.toThrow();
  });

  it('swallows a suggestion-engine failure instead of crashing the view', () => {
    const { fixture, component } = setup({ suggest: () => { throw new Error('engine boom'); } });
    expect(() => component.exerciseSuggestions()).not.toThrow();
    expect(component.exerciseSuggestions()).toEqual([]);
    expect(() => fixture.detectChanges()).not.toThrow();
  });
});
