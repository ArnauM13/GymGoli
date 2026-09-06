import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SettingsAdvancedComponent } from './settings-advanced.component';
import { OnboardingTourService } from '../../core/services/onboarding-tour.service';
import { UserSettingsService } from '../../core/services/user-settings.service';

describe('SettingsAdvancedComponent', () => {
  let component: SettingsAdvancedComponent;
  let mockUpdate: jasmine.Spy;
  let startTour: jasmine.Spy;

  beforeEach(async () => {
    mockUpdate = jasmine.createSpy('update');
    startTour  = jasmine.createSpy('start');

    await TestBed.configureTestingModule({
      imports: [SettingsAdvancedComponent],
      providers: [
        provideRouter([]),
        {
          provide: UserSettingsService,
          useValue: {
            supersetsEnabled: signal(false),
            dropsetsEnabled:  signal(false),
            nextExerciseSuggestionEnabled: signal(true),
            rirEnabled:       signal(false),
            manualRestEnabled: signal(false),
            difficultyScale:  signal('emoji'),
            bodyweightFactorEnabled: signal(false),
            update:           mockUpdate,
          },
        },
        { provide: OnboardingTourService, useValue: { total: 9, start: startTour } },
      ],
    })
      .overrideComponent(SettingsAdvancedComponent, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();

    const fixture = TestBed.createComponent(SettingsAdvancedComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('toggleSupersets()', () => {
    it('enables supersets when currently disabled', () => {
      component.toggleSupersets();
      expect(mockUpdate).toHaveBeenCalledWith({ supersetsEnabled: true });
    });
  });

  describe('toggleDropsets()', () => {
    it('enables dropsets when currently disabled', () => {
      component.toggleDropsets();
      expect(mockUpdate).toHaveBeenCalledWith({ dropsetsEnabled: true });
    });
  });

  describe('toggleNextExerciseSuggestion()', () => {
    it('disables the next-exercise suggestion when currently enabled', () => {
      component.toggleNextExerciseSuggestion();
      expect(mockUpdate).toHaveBeenCalledWith({ nextExerciseSuggestionEnabled: false });
    });
  });

  describe('toggleRir()', () => {
    it('enables RIR when currently disabled', () => {
      component.toggleRir();
      expect(mockUpdate).toHaveBeenCalledWith({ rirEnabled: true });
    });
  });

  describe('toggleManualRest()', () => {
    it('enables manual rest logging when currently disabled', () => {
      component.toggleManualRest();
      expect(mockUpdate).toHaveBeenCalledWith({ manualRestEnabled: true });
    });
  });

  describe('setDifficultyScale()', () => {
    it('sets the difficulty scale to numeric', () => {
      component.setDifficultyScale('numeric');
      expect(mockUpdate).toHaveBeenCalledWith({ difficultyScale: 'numeric' });
    });
  });

  // ── Provar l'onboarding amb el teu propi compte ──────────────────────────

  describe('replayOnboarding()', () => {
    it('re-arms both the welcome and the tour', () => {
      component.replayOnboarding();
      expect(mockUpdate).toHaveBeenCalledWith({ onboardingDone: false, guidedTourDone: false });
    });

    // Provar la benvinguda no ha de costar cap dada.
    it('touches nothing else', () => {
      component.replayOnboarding();
      expect(Object.keys(mockUpdate.calls.mostRecent().args[0]).sort())
        .toEqual(['guidedTourDone', 'onboardingDone']);
    });

    it('confirms on screen, since the sheet opens over a scrolled page', () => {
      expect(component.replayed()).toBeFalse();
      component.replayOnboarding();
      expect(component.replayed()).toBeTrue();
    });
  });

  describe('startTour()', () => {
    it('runs the guided tour on its own', () => {
      component.startTour();
      expect(startTour).toHaveBeenCalled();
    });

    it('states the real number of stops', () => {
      expect(component.tourStops).toBe(9);
    });
  });
});
