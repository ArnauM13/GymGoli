import { Component, NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { OfflineService } from './core/services/offline.service';
import { UserSettingsService } from './core/services/user-settings.service';
import { DEFAULT_USER_SETTINGS } from './core/models/user-settings.model';
import { TrainingTypeService } from './core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from './core/models/training-type.model';

@Component({ selector: 'app-stub', template: '', standalone: true })
class StubComponent {}

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
        provideRouter([
          { path: 'train', component: StubComponent },
          { path: 'train/planner', component: StubComponent },
          { path: 'trainer', component: StubComponent },
          { path: 'home', component: StubComponent },
          { path: 'exercises', component: StubComponent },
          { path: 'calendar', component: StubComponent },
          { path: 'charts', component: StubComponent },
        ]),
        {
          provide: TrainingTypeService,
          useValue: { types: signal(DEFAULT_TRAINING_TYPES) },
        },
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
      TestBed.createComponent(AppComponent);
      const offlineService = TestBed.inject(OfflineService);
      expect(offlineService.isOffline()).toBeFalse();
    });

    it('becomes true when the offline event fires', () => {
      TestBed.createComponent(AppComponent);
      const offlineService = TestBed.inject(OfflineService);
      window.dispatchEvent(new Event('offline'));
      expect(offlineService.isOffline()).toBeTrue();
    });

    it('becomes false again when the online event fires', () => {
      TestBed.createComponent(AppComponent);
      const offlineService = TestBed.inject(OfflineService);
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      expect(offlineService.isOffline()).toBeFalse();
    });
  });

  // ── worksOffline (decideix el cartell d'"només amb connexió") ────────────

  describe('worksOffline', () => {
    async function at(url: string) {
      const fixture = TestBed.createComponent(AppComponent);
      await TestBed.inject(Router).navigateByUrl(url);
      return fixture.componentInstance;
    }

    it('deixa entrenar sense connexió', async () => {
      expect((await at('/train')).worksOffline()).toBeTrue();
    });

    it('deixa el planificador setmanal, que és una subruta d\'Entrenar', async () => {
      expect((await at('/train/planner')).worksOffline()).toBeTrue();
    });

    it('deixa Inici: els últims dies són al dispositiu', async () => {
      expect((await at('/home')).worksOffline()).toBeTrue();
    });

    it('deixa el catàleg d\'exercicis, que també es guarda al dispositiu', async () => {
      expect((await at('/exercises')).worksOffline()).toBeTrue();
    });

    it('no deixa l\'historial sencer: el mes a mes viu a la base de dades', async () => {
      expect((await at('/calendar')).worksOffline()).toBeFalse();
    });

    it('no deixa el progrés, que necessita tot l\'historial', async () => {
      expect((await at('/charts')).worksOffline()).toBeFalse();
    });

    it('no deixa els clients', async () => {
      expect((await at('/trainer')).worksOffline()).toBeFalse();
    });
  });
});
