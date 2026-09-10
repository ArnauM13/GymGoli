import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LowerCasePipe } from '@angular/common';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { TrainComponent } from './train.component';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { SessionGroupService } from '../../core/services/session-group.service';
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
import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';
import { DEFAULT_USER_SETTINGS } from '../../core/models/user-settings.model';
import { EMPTY_WEEKLY_PLAN } from '../../core/models/weekly-plan.model';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';
import { todayStr } from '../../shared/utils/date.utils';

const TODAY = todayStr();
const P = { daysSinceLast: 3, typicalGapDays: 4, overdueScore: 0.75 };

const SPORT = {
  id: 'sp1', name: 'Córrer', icon: 'directions_run', color: '#111',
  subtypes: [], metricDefs: [], createdAt: new Date(),
} as Sport;

function workout(id: string, sessionGroupId?: string): Workout {
  return {
    id, date: TODAY, status: 'done', category: 'push', categories: ['push'],
    entries: [], createdAt: new Date(), sessionGroupId,
  } as unknown as Workout;
}

function sportPair(id: string): { sport: Sport; session: SportSession } {
  return { sport: SPORT, session: { id, date: TODAY, sportId: 'sp1', createdAt: new Date() } };
}

/**
 * Entrar a Entrenar per ampliar una sessió (`/train?date=…&sessio=<grup>`).
 *
 * El cas de sempre és que les dues activitats ja estiguin apuntades —el
 * gimnàs i la cinta de després—, o sigui que les altres sessions d'aquell dia
 * són la primera opció; registrar-ne una de nova ve després.
 */
describe('TrainComponent — ampliar una sessió que ja hi és', () => {
  let merge: jasmine.Spy;
  let join: jasmine.Spy;
  let goBack: jasmine.Spy;

  function setup(opts: {
    workouts?: Workout[];
    sports?: { sport: Sport; session: SportSession }[];
    sessio?: string | null;
  } = {}) {
    const workouts = opts.workouts ?? [];
    const sports   = opts.sports ?? [];
    merge  = jasmine.createSpy('merge').and.resolveTo('g1');
    join   = jasmine.createSpy('join').and.resolveTo(undefined);
    goBack = jasmine.createSpy('goBack');

    const query: Record<string, string> = { date: TODAY };
    if (opts.sessio !== null) query['sessio'] = opts.sessio ?? 'g1';

    TestBed.configureTestingModule({
      imports: [TrainComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
        { provide: WorkoutService, useValue: {
          workouts: signal(workouts), doneWorkouts: signal(workouts), isLoading: signal(false),
          getWorkoutsForDate: () => workouts, getDoneWorkoutsForDate: () => workouts,
          getPlannedForDate: () => [], getLastWorkoutByCategory: () => null,
          getAllTimeMaxWeight: () => 0, getLastSessionInfo: () => null, getLastSessionEntry: () => null,
          ensureMonthLoaded: () => {}, ensureWorkoutEntries: () => Promise.resolve(),
        } },
        { provide: SportService, useValue: {
          sports: signal([SPORT]), sessions: signal(sports.map(s => s.session)),
          isLoaded: signal(true), sportsLoaded: signal(true),
          getSportSessionsForDate: () => sports, getPlannedSportSessionsForDate: () => [],
          getSessionForDate: () => undefined, hasSportOnDate: () => false,
          ensureMonthLoaded: () => {}, ensureLoaded: () => Promise.resolve(),
        } },
        { provide: SessionGroupService, useValue: { merge, join } },
        { provide: ExerciseService, useValue: {
          exercises: signal([]), isLoaded: signal(true), ensureLoaded: () => Promise.resolve(),
          getById: () => undefined, loadTypeOf: () => undefined, bodyweightFactorOf: () => undefined,
        } },
        { provide: AuthService, useValue: { uid: signal('user-1') } },
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
        { provide: ExerciseSuggestionService, useValue: { suggest: () => [] } },
        { provide: UserSettingsService, useValue: {
          weightUnit: signal<'kg' | 'lb'>('kg'), fitnessGoal: signal('strength'), loaded: signal(true),
          weeklyPlan: signal(EMPTY_WEEKLY_PLAN), settings: signal(DEFAULT_USER_SETTINGS), update: () => Promise.resolve(),
          supersetsEnabled: signal(false), dropsetsEnabled: signal(false), rirEnabled: signal(false),
          nextExerciseSuggestionEnabled: signal(false),
          manualRestEnabled: signal(false), difficultyScale: signal('emoji'), restTimerSeconds: signal(90),
          dismissedHints: signal<string[]>([]), bodyweightKg: signal(null),
        } },
        { provide: OfflineService, useValue: { isOffline: signal(false) } },
        { provide: TrainerService, useValue: { myTrainer: signal(null), hasTrainer: () => false, getProposalForDate: () => null } },
        { provide: TemplateService, useValue: { templates: signal([]), forCategory: () => [] } },
        { provide: SharedWorkoutService, useValue: {} },
        { provide: WorkoutProfileService, useValue: { profile: signal({ gym: { push: P, pull: P, legs: P }, favoriteSport: null, recentSport: null, minRecovery: 2 }) } },
        { provide: AppHintService, useValue: { isDismissed: () => false, dismiss: () => {} } },
        { provide: MatDialog, useValue: { open: () => {}, openDialogs: [] } },
        { provide: FeedbackService, useValue: { success: () => {}, error: () => {}, info: () => {} } },
        { provide: ConfirmDialogService, useValue: { confirm: () => Promise.resolve(false) } },
        { provide: NavigationHistoryService, useValue: { goBack } },
      ],
    }).overrideComponent(TrainComponent, { set: { imports: [LowerCasePipe], schemas: [NO_ERRORS_SCHEMA] } });

    const fixture = TestBed.createComponent(TrainComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return { fixture, component };
  }

  it('les altres sessions del dia són la primera opció', () => {
    const { fixture, component } = setup({
      workouts: [workout('w1', 'g1'), workout('w2')],
      sports:   [sportPair('s1')],
    });

    // La que s'està ampliant no és candidata d'ella mateixa.
    expect(component.joinTargets().map(g => g.key)).toEqual(['w2', 's1']);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.join-btn').length).toBe(2);
    // I es distingeix el que ja hi és del que es registra de nou.
    expect(el.querySelector('.section-title')?.textContent).toContain('Unir amb');
    expect(el.querySelector('.join-new')?.textContent).toContain('Nova activitat');
  });

  it('triar-ne una les uneix i torna d\'on s\'ha vingut', async () => {
    const { component } = setup({
      workouts: [workout('w1', 'g1')],
      sports:   [sportPair('s1')],
    });

    await component.joinExisting(component.joinTargets()[0]);

    expect(merge).toHaveBeenCalledTimes(1);
    const [mine, target] = merge.calls.mostRecent().args as [unknown[], unknown[]];
    expect((mine[0] as { workout: Workout }).workout.id).toBe('w1');
    expect((target[0] as { session: SportSession }).session.id).toBe('s1');
    expect(goBack).toHaveBeenCalled();
  });

  it('sense la sessió carregada, el que es tria hi entra igualment', async () => {
    // El dia del grup no és en memòria (per exemple, s'hi arriba per enllaç):
    // l'id de la sessió el porta l'adreça, i és tot el que cal.
    const { component } = setup({ workouts: [workout('w2')] });

    await component.joinExisting(component.joinTargets()[0]);

    expect(merge).not.toHaveBeenCalled();
    expect(join).toHaveBeenCalledWith(jasmine.objectContaining({ kind: 'workout' }), 'g1');
  });

  it('sense cap altra sessió al dia, només queda registrar-ne una de nova', () => {
    const { fixture, component } = setup({ workouts: [workout('w1', 'g1')] });

    expect(component.joinTargets()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.join-btn')).toBeNull();
  });

  it('sense venir a ampliar res, no hi ha cap candidata', () => {
    const { component } = setup({ sessio: null, workouts: [workout('w1'), workout('w2')] });
    expect(component.joinTargets()).toEqual([]);
  });
});
