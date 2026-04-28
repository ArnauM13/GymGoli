import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { SettingsComponent } from './settings.component';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { AuthService } from '../../core/services/auth.service';
import { FitnessMetricsService } from '../../core/services/fitness-metrics.service';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let mockEnabled:       ReturnType<typeof signal<boolean>>;
  let mockDarkMode:      ReturnType<typeof signal<boolean>>;
  let mockWeightUnit:    ReturnType<typeof signal<'kg' | 'lb'>>;
  let mockGoalMode:      ReturnType<typeof signal<'combined' | 'separate'>>;
  let mockGoal:          ReturnType<typeof signal<number | null>>;
  let mockGymGoal:       ReturnType<typeof signal<number | null>>;
  let mockSportGoal:     ReturnType<typeof signal<number | null>>;
  let mockStreak:        ReturnType<typeof signal<number>>;
  let mockUpdate:        jasmine.Spy;
  let mockLogout:        jasmine.Spy;
  let mockDeleteAccount: jasmine.Spy;
  let mockNavigate:      jasmine.Spy;
  let mockSnackBarOpen:  jasmine.Spy;

  beforeEach(async () => {
    mockEnabled    = signal(false);
    mockDarkMode   = signal(false);
    mockWeightUnit = signal<'kg' | 'lb'>('kg');
    mockGoalMode   = signal<'combined' | 'separate'>('combined');
    mockGoal       = signal<number | null>(null);
    mockGymGoal    = signal<number | null>(null);
    mockSportGoal  = signal<number | null>(null);
    mockStreak     = signal(0);
    mockUpdate     = jasmine.createSpy('update');
    mockLogout     = jasmine.createSpy('logout').and.returnValue(Promise.resolve());
    mockDeleteAccount = jasmine.createSpy('deleteAccount').and.returnValue(Promise.resolve());
    mockNavigate   = jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true));
    mockSnackBarOpen = jasmine.createSpy('open');

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        {
          provide: UserSettingsService,
          useValue: {
            metricsEnabled:     mockEnabled,
            darkMode:           mockDarkMode,
            weightUnit:         mockWeightUnit,
            goalMode:           mockGoalMode,
            weeklyActivityGoal: mockGoal,
            weeklyGymGoal:      mockGymGoal,
            weeklySportGoal:    mockSportGoal,
            loaded:             signal(true),
            settings:           signal({
              metricsEnabled: false,
              darkMode: false,
              weightUnit: 'kg',
              weeklyActivityGoal: null,
              weeklyGymGoal: null,
              weeklySportGoal: null,
              goalMode: 'combined',
              onboardingDone: false,
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
          useValue: { logout: mockLogout, deleteAccount: mockDeleteAccount },
        },
        {
          provide: Router,
          useValue: { navigate: mockNavigate },
        },
        {
          provide: MatSnackBar,
          useValue: { open: mockSnackBarOpen },
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

  // ── toggleDarkMode() ─────────────────────────────────────────────────────

  describe('toggleDarkMode()', () => {
    it('enables dark mode when currently disabled', () => {
      mockDarkMode.set(false);
      component.toggleDarkMode();
      expect(mockUpdate).toHaveBeenCalledWith({ darkMode: true });
    });

    it('disables dark mode when currently enabled', () => {
      mockDarkMode.set(true);
      component.toggleDarkMode();
      expect(mockUpdate).toHaveBeenCalledWith({ darkMode: false });
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
    it('does nothing when user cancels the confirm dialog', async () => {
      spyOn(window, 'confirm').and.returnValue(false);
      await component.deleteAccount();
      expect(mockDeleteAccount).not.toHaveBeenCalled();
    });

    it('calls authService.deleteAccount() when user confirms', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      await component.deleteAccount();
      expect(mockDeleteAccount).toHaveBeenCalled();
    });

    it('navigates to /login after successful deletion', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      await component.deleteAccount();
      expect(mockNavigate).toHaveBeenCalledWith(['/login']);
    });

    it('resets deletingAccount to false after success', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      await component.deleteAccount();
      expect(component.deletingAccount()).toBeFalse();
    });

    it('shows snackbar and resets flag on error', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      mockDeleteAccount.and.returnValue(Promise.reject(new Error('fail')));
      await component.deleteAccount();
      expect(mockSnackBarOpen).toHaveBeenCalled();
      expect(component.deletingAccount()).toBeFalse();
    });
  });
});
