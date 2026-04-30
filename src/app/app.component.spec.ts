import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { UserSettingsService } from './core/services/user-settings.service';
import { DEFAULT_USER_SETTINGS } from './core/models/user-settings.model';

describe('AppComponent', () => {
  let mockUser:               ReturnType<typeof signal<unknown>>;
  let mockIsPasswordRecovery: ReturnType<typeof signal<boolean>>;
  let mockSettings:           ReturnType<typeof signal<typeof DEFAULT_USER_SETTINGS>>;
  let mockLoaded:             ReturnType<typeof signal<boolean>>;

  beforeEach(async () => {
    mockUser               = signal(null);
    mockIsPasswordRecovery = signal(false);
    mockSettings           = signal({ ...DEFAULT_USER_SETTINGS });
    mockLoaded             = signal(true);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user:               mockUser,
            uid:                signal(null),
            isPasswordRecovery: mockIsPasswordRecovery,
            logout:             jasmine.createSpy('logout').and.returnValue(Promise.resolve()),
          },
        },
        {
          provide: UserSettingsService,
          useValue: {
            settings:           mockSettings,
            loaded:             mockLoaded,
            metricsEnabled:     signal(false),
            weeklyActivityGoal: signal(null),
            update:             jasmine.createSpy('update'),
          },
        },
        {
          provide: MatSnackBar,
          useValue: { open: jasmine.createSpy('open') },
        },
      ],
    })
      .overrideComponent(AppComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // ── showOnboarding ───────────────────────────────────────────────────────

  describe('showOnboarding', () => {
    it('is false when user is null', () => {
      mockUser.set(null);
      const fixture = TestBed.createComponent(AppComponent);
      expect(fixture.componentInstance.showOnboarding()).toBeFalse();
    });

    it('is false when onboarding already done', () => {
      mockUser.set({ id: 'u1' });
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, onboardingDone: true });
      const fixture = TestBed.createComponent(AppComponent);
      expect(fixture.componentInstance.showOnboarding()).toBeFalse();
    });

    it('is true when user logged in, settings loaded, onboarding not done', () => {
      mockUser.set({ id: 'u1' });
      mockLoaded.set(true);
      mockSettings.set({ ...DEFAULT_USER_SETTINGS, onboardingDone: false });
      const fixture = TestBed.createComponent(AppComponent);
      expect(fixture.componentInstance.showOnboarding()).toBeTrue();
    });

    it('is false when settings not yet loaded', () => {
      mockUser.set({ id: 'u1' });
      mockLoaded.set(false);
      const fixture = TestBed.createComponent(AppComponent);
      expect(fixture.componentInstance.showOnboarding()).toBeFalse();
    });
  });

  // ── isOffline ────────────────────────────────────────────────────────────

  describe('isOffline', () => {
    it('starts as false in the test environment (JSDOM is online)', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      // JSDOM reports navigator.onLine as true by default
      expect(app.isOffline()).toBeFalse();
    });

    it('becomes true when the offline event fires', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      window.dispatchEvent(new Event('offline'));
      expect(app.isOffline()).toBeTrue();
    });

    it('becomes false again when the online event fires', () => {
      const fixture = TestBed.createComponent(AppComponent);
      const app = fixture.componentInstance;
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      expect(app.isOffline()).toBeFalse();
    });
  });
});
