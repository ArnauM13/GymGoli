import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router } from '@angular/router';

import { SettingsComponent } from './settings.component';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { AuthService } from '../../core/services/auth.service';
import { FitnessMetricsService } from '../../core/services/fitness-metrics.service';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { TrainerService } from '../../core/services/trainer.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../core/models/training-type.model';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let mockEnabled:       ReturnType<typeof signal<boolean>>;
  let mockThemeMode:     ReturnType<typeof signal<'light' | 'dark' | 'system'>>;
  let mockWeightUnit:    ReturnType<typeof signal<'kg' | 'lb'>>;
  let mockRestTimer:     ReturnType<typeof signal<number>>;
  let mockGoalMode:      ReturnType<typeof signal<'combined' | 'separate'>>;
  let mockGoal:          ReturnType<typeof signal<number | null>>;
  let mockGymGoal:       ReturnType<typeof signal<number | null>>;
  let mockSportGoal:     ReturnType<typeof signal<number | null>>;
  let mockStreak:        ReturnType<typeof signal<number>>;
  let mockUpdate:        jasmine.Spy;
  let mockLogout:        jasmine.Spy;
  let mockDeleteAccount: jasmine.Spy;
  let mockNavigate:      jasmine.Spy;
  let mockFeedbackError: jasmine.Spy;

  beforeEach(async () => {
    mockEnabled    = signal(false);
    mockThemeMode  = signal<'light' | 'dark' | 'system'>('system');
    mockWeightUnit = signal<'kg' | 'lb'>('kg');
    mockRestTimer  = signal(90);
    mockGoalMode   = signal<'combined' | 'separate'>('combined');
    mockGoal       = signal<number | null>(null);
    mockGymGoal    = signal<number | null>(null);
    mockSportGoal  = signal<number | null>(null);
    mockStreak     = signal(0);
    mockUpdate     = jasmine.createSpy('update');
    mockLogout     = jasmine.createSpy('logout').and.returnValue(Promise.resolve());
    mockDeleteAccount = jasmine.createSpy('deleteAccount').and.returnValue(Promise.resolve());
    mockNavigate   = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
    mockFeedbackError = jasmine.createSpy('error');

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        {
          provide: UserSettingsService,
          useValue: {
            metricsEnabled:     mockEnabled,
            themeMode:          mockThemeMode,
            darkMode:           signal(false),
            weightUnit:         mockWeightUnit,
            restTimerSeconds:   mockRestTimer,
            goalMode:           mockGoalMode,
            weeklyActivityGoal: mockGoal,
            weeklyGymGoal:      mockGymGoal,
            weeklySportGoal:    mockSportGoal,
            fitnessGoal:        signal(null),
            supersetsEnabled:   signal(false),
            dropsetsEnabled:    signal(false),
            rirEnabled:         signal(false),
            difficultyScale:    signal('emoji'),
            bodyweightKg:       signal(null),
            catalogSyncedVersion: signal(0),
            loaded:             signal(true),
            settings:           signal({
              metricsEnabled: false,
              themeMode: 'system',
              weightUnit: 'kg',
              restTimerSeconds: 90,
              weeklyActivityGoal: null,
              weeklyGymGoal: null,
              weeklySportGoal: null,
              goalMode: 'combined',
              onboardingDone: false,
              routineHintDismissed: false,
            }),
            update: mockUpdate,
          },
        },
        {
          provide: FitnessMetricsService,
          useValue: { goalStreak: mockStreak },
        },
        {
          provide: AuthService,
          useValue: { user: signal(null), logout: mockLogout, deleteAccount: mockDeleteAccount },
        },
        {
          provide: WorkoutService,
          useValue: { workouts: signal([]) },
        },
        {
          provide: TrainingTypeService,
          useValue: {
            types: signal(DEFAULT_TRAINING_TYPES),
            isLoaded: signal(true), missingDefaultCount: signal(0),
            ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
            addMissingDefaults: jasmine.createSpy().and.resolveTo(0),
          },
        },
        {
          provide: SportService,
          useValue: {
            sports: signal([]), sessions: signal([]),
            sportsLoaded: signal(true), missingDefaultCount: signal(0),
            ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
            addMissingDefaults: jasmine.createSpy().and.resolveTo(0),
          },
        },
        {
          provide: ExerciseService,
          useValue: {
            exercises: signal([]), isLoaded: signal(true), missingDefaultCount: signal(0),
            ensureLoaded: jasmine.createSpy().and.resolveTo(undefined),
            addMissingDefaults: jasmine.createSpy().and.resolveTo(0),
          },
        },
        {
          provide: Router,
          useValue: { navigate: mockNavigate },
        },
        {
          provide: FeedbackService,
          useValue: { success: jasmine.createSpy(), error: mockFeedbackError, info: jasmine.createSpy() },
        },
        {
          provide: TrainerService,
          useValue: {
            myTrainer:              signal(null),
            activeInvite:           signal(null),
            isTrainer:              jasmine.createSpy().and.returnValue(false),
            hasTrainer:             jasmine.createSpy().and.returnValue(false),
            activateTrainerMode:    jasmine.createSpy().and.resolveTo(undefined),
            deactivateTrainerMode:  jasmine.createSpy().and.resolveTo(undefined),
            loadActiveInvite:       jasmine.createSpy().and.resolveTo(undefined),
          },
        },
        {
          provide: ConfirmDialogService,
          useValue: { confirm: jasmine.createSpy('confirm').and.resolveTo(false) },
        },
      ],
    })
      .overrideComponent(SettingsComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(SettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── toggleMetrics() ──────────────────────────────────────────────────────

  describe('toggleMetrics()', () => {
    it('disables metrics when currently enabled', () => {
      mockEnabled.set(true);
      component.toggleMetrics();
      expect(mockUpdate).toHaveBeenCalledWith({ metricsEnabled: false });
    });

    it('enables metrics when currently disabled', () => {
      mockEnabled.set(false);
      component.toggleMetrics();
      expect(mockUpdate).toHaveBeenCalledWith({ metricsEnabled: true });
    });

    it('calls update exactly once per toggle', () => {
      component.toggleMetrics();
      expect(mockUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggleRoutineHint()', () => {
    it('dismisses the hint when currently shown', () => {
      component.toggleRoutineHint();
      expect(mockUpdate).toHaveBeenCalledWith({ routineHintDismissed: true });
    });
  });

  // ── setThemeMode() ───────────────────────────────────────────────────────

  describe('setThemeMode()', () => {
    it('sets theme to light', () => {
      component.setThemeMode('light');
      expect(mockUpdate).toHaveBeenCalledWith({ themeMode: 'light' });
    });

    it('sets theme to dark', () => {
      component.setThemeMode('dark');
      expect(mockUpdate).toHaveBeenCalledWith({ themeMode: 'dark' });
    });

    it('sets theme to system', () => {
      component.setThemeMode('system');
      expect(mockUpdate).toHaveBeenCalledWith({ themeMode: 'system' });
    });
  });

  // ── setWeightUnit() ──────────────────────────────────────────────────────

  describe('setWeightUnit()', () => {
    it('sets unit to kg', () => {
      mockWeightUnit.set('lb');
      component.setWeightUnit('kg');
      expect(mockUpdate).toHaveBeenCalledWith({ weightUnit: 'kg' });
    });

    it('sets unit to lb', () => {
      mockWeightUnit.set('kg');
      component.setWeightUnit('lb');
      expect(mockUpdate).toHaveBeenCalledWith({ weightUnit: 'lb' });
    });
  });

  // ── toggleRestTimer() / setRestTimerFromInput() ──────────────────────────

  describe('toggleRestTimer()', () => {
    it('enables timer (sets to 90) when currently disabled', () => {
      mockRestTimer.set(0);
      component.toggleRestTimer();
      expect(mockUpdate).toHaveBeenCalledWith({ restTimerSeconds: 90 });
    });

    it('disables timer (sets to 0) when currently enabled', () => {
      mockRestTimer.set(90);
      component.toggleRestTimer();
      expect(mockUpdate).toHaveBeenCalledWith({ restTimerSeconds: 0 });
    });
  });

  describe('restTimerEnabled()', () => {
    it('returns false when restTimerSeconds is 0', () => {
      mockRestTimer.set(0);
      expect(component.restTimerEnabled()).toBeFalse();
    });

    it('returns true when restTimerSeconds is positive', () => {
      mockRestTimer.set(60);
      expect(component.restTimerEnabled()).toBeTrue();
    });
  });

  describe('setRestTimerFromInput()', () => {
    it('clamps values below 1 to 1', () => {
      const event = { target: { value: '0' } } as unknown as Event;
      component.setRestTimerFromInput(event);
      expect(mockUpdate).toHaveBeenCalledWith({ restTimerSeconds: 1 });
    });

    it('clamps values above 3600 to 3600', () => {
      const event = { target: { value: '9999' } } as unknown as Event;
      component.setRestTimerFromInput(event);
      expect(mockUpdate).toHaveBeenCalledWith({ restTimerSeconds: 3600 });
    });

    it('accepts a valid value in range', () => {
      const event = { target: { value: '120' } } as unknown as Event;
      component.setRestTimerFromInput(event);
      expect(mockUpdate).toHaveBeenCalledWith({ restTimerSeconds: 120 });
    });
  });

  // ── settingsService exposure ─────────────────────────────────────────────

  describe('settingsService', () => {
    it('exposes the injected service', () => {
      expect(component.settingsService).toBeTruthy();
    });

    it('reflects the current metricsEnabled value', () => {
      mockEnabled.set(true);
      expect(component.settingsService.metricsEnabled()).toBeTrue();
      mockEnabled.set(false);
      expect(component.settingsService.metricsEnabled()).toBeFalse();
    });
  });

  // ── metricsService.goalStreak ────────────────────────────────────────────

  describe('metricsService.goalStreak', () => {
    it('exposes the injected metrics service', () => {
      expect(component.metricsService).toBeTruthy();
    });

    it('reflects the current streak value', () => {
      mockStreak.set(3);
      expect(component.metricsService.goalStreak()).toBe(3);
    });
  });

  // ── setGoalMode() ────────────────────────────────────────────────────────

  describe('setGoalMode()', () => {
    it('updates goalMode to combined', () => {
      component.setGoalMode('combined');
      expect(mockUpdate).toHaveBeenCalledWith({ goalMode: 'combined' });
    });

    it('updates goalMode to separate', () => {
      component.setGoalMode('separate');
      expect(mockUpdate).toHaveBeenCalledWith({ goalMode: 'separate' });
    });
  });

  // ── Combined goal ────────────────────────────────────────────────────────

  describe('setGoal()', () => {
    it('calls update with the given goal value', () => {
      component.setGoal(3);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyActivityGoal: 3 });
    });
  });

  describe('adjustGoal()', () => {
    it('increments the goal by delta', () => {
      mockGoal.set(3);
      component.adjustGoal(1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyActivityGoal: 4 });
    });

    it('decrements the goal by delta', () => {
      mockGoal.set(4);
      component.adjustGoal(-1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyActivityGoal: 3 });
    });

    it('clamps at minimum 1', () => {
      mockGoal.set(1);
      component.adjustGoal(-1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyActivityGoal: 1 });
    });

    it('clamps at maximum 7', () => {
      mockGoal.set(7);
      component.adjustGoal(1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyActivityGoal: 7 });
    });

    it('does nothing when goal is null', () => {
      mockGoal.set(null);
      component.adjustGoal(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('clearGoal()', () => {
    it('sets weeklyActivityGoal to null', () => {
      component.clearGoal();
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyActivityGoal: null });
    });
  });

  // ── Gym goal ─────────────────────────────────────────────────────────────

  describe('setGymGoal()', () => {
    it('calls update with the given gym goal value', () => {
      component.setGymGoal(2);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyGymGoal: 2 });
    });
  });

  describe('adjustGymGoal()', () => {
    it('increments the gym goal by delta', () => {
      mockGymGoal.set(2);
      component.adjustGymGoal(1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyGymGoal: 3 });
    });

    it('decrements the gym goal by delta', () => {
      mockGymGoal.set(3);
      component.adjustGymGoal(-1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyGymGoal: 2 });
    });

    it('clamps at minimum 1', () => {
      mockGymGoal.set(1);
      component.adjustGymGoal(-1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyGymGoal: 1 });
    });

    it('clamps at maximum 7', () => {
      mockGymGoal.set(7);
      component.adjustGymGoal(1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyGymGoal: 7 });
    });

    it('does nothing when gym goal is null', () => {
      mockGymGoal.set(null);
      component.adjustGymGoal(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('clearGymGoal()', () => {
    it('sets weeklyGymGoal to null', () => {
      component.clearGymGoal();
      expect(mockUpdate).toHaveBeenCalledWith({ weeklyGymGoal: null });
    });
  });

  // ── Sport goal ───────────────────────────────────────────────────────────

  describe('setSportGoal()', () => {
    it('calls update with the given sport goal value', () => {
      component.setSportGoal(2);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklySportGoal: 2 });
    });
  });

  describe('adjustSportGoal()', () => {
    it('increments the sport goal by delta', () => {
      mockSportGoal.set(2);
      component.adjustSportGoal(1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklySportGoal: 3 });
    });

    it('decrements the sport goal by delta', () => {
      mockSportGoal.set(3);
      component.adjustSportGoal(-1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklySportGoal: 2 });
    });

    it('clamps at minimum 1', () => {
      mockSportGoal.set(1);
      component.adjustSportGoal(-1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklySportGoal: 1 });
    });

    it('clamps at maximum 7', () => {
      mockSportGoal.set(7);
      component.adjustSportGoal(1);
      expect(mockUpdate).toHaveBeenCalledWith({ weeklySportGoal: 7 });
    });

    it('does nothing when sport goal is null', () => {
      mockSportGoal.set(null);
      component.adjustSportGoal(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });

  describe('clearSportGoal()', () => {
    it('sets weeklySportGoal to null', () => {
      component.clearSportGoal();
      expect(mockUpdate).toHaveBeenCalledWith({ weeklySportGoal: null });
    });
  });

  // ── deletingAccount signal ───────────────────────────────────────────────

  describe('deletingAccount', () => {
    it('starts as false', () => {
      expect(component.deletingAccount()).toBeFalse();
    });
  });

  // ── logout() ─────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('calls authService.logout()', async () => {
      await component.logout();
      expect(mockLogout).toHaveBeenCalled();
    });

    it('navigates to /login after logout', async () => {
      await component.logout();
      expect(mockNavigate).toHaveBeenCalledWith(['/login']);
    });
  });

  // ── deleteAccount() ──────────────────────────────────────────────────────

  describe('deleteAccount()', () => {
    let confirmSpy: jasmine.Spy;

    beforeEach(() => {
      confirmSpy = TestBed.inject(ConfirmDialogService).confirm as jasmine.Spy;
    });

    it('does nothing when user cancels the confirm dialog', async () => {
      confirmSpy.and.resolveTo(false);
      await component.deleteAccount();
      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it('calls authService.deleteAccount() when user confirms', async () => {
      confirmSpy.and.resolveTo(true);
      await component.deleteAccount();
      expect(mockDeleteAccount).toHaveBeenCalled();
    });

    it('navigates to /login after successful deletion', async () => {
      confirmSpy.and.resolveTo(true);
      await component.deleteAccount();
      expect(mockNavigate).toHaveBeenCalledWith(['/login']);
    });

    it('resets deletingAccount to false after success', async () => {
      confirmSpy.and.resolveTo(true);
      await component.deleteAccount();
      expect(component.deletingAccount()).toBeFalse();
    });

    it('shows snackbar and resets flag on error', async () => {
      confirmSpy.and.resolveTo(true);
      mockDeleteAccount.and.returnValue(Promise.reject(new Error('fail')));
      await component.deleteAccount();
      expect(mockFeedbackError).toHaveBeenCalled();
      expect(component.deletingAccount()).toBeFalse();
    });
  });

  // ── exportData() ─────────────────────────────────────────────────────────

  describe('exportData()', () => {
    let mockAnchor: { href: string; download: string; click: jasmine.Spy };

    beforeEach(() => {
      mockAnchor = { href: '', download: '', click: jasmine.createSpy('click') };
      const doc = TestBed.inject(DOCUMENT);
      spyOn(doc, 'createElement').and.returnValue(mockAnchor as unknown as HTMLAnchorElement);
      spyOn(URL, 'createObjectURL').and.returnValue('blob:fake-url');
      spyOn(URL, 'revokeObjectURL');
    });

    it('triggers a file download', async () => {
      await component.exportData();
      expect(mockAnchor.click).toHaveBeenCalled();
    });

    it('sets a .json filename with today\'s date', async () => {
      await component.exportData();
      expect(mockAnchor.download).toMatch(/^gymgoli-\d{4}-\d{2}-\d{2}\.json$/);
    });

    it('creates a JSON blob with the expected top-level keys', async () => {
      const blobSpy = spyOn(window, 'Blob').and.callThrough();
      await component.exportData();
      const [args] = blobSpy.calls.mostRecent().args as [BlobPart[], BlobPropertyBag];
      const parsed = JSON.parse(args[0] as string);
      expect(parsed).toEqual(jasmine.objectContaining({
        exportDate: jasmine.any(String),
        version: 1,
        workouts: jasmine.any(Array),
        exercises: jasmine.any(Array),
        sports: jasmine.any(Array),
        sportSessions: jasmine.any(Array),
        settings: jasmine.any(Object),
      }));
    });

    it('revokes the object URL after download', async () => {
      await component.exportData();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    });
  });
});
