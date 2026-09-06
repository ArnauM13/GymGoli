import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { OnboardingComponent } from './onboarding.component';
import { OnboardingTourService } from '../../../core/services/onboarding-tour.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';

describe('OnboardingComponent', () => {
  let component: OnboardingComponent;
  let mockUpdate: jasmine.Spy;
  let settings: { update: jasmine.Spy; fitnessGoal: () => any; hasWeeklyGoal: () => boolean };

  beforeEach(async () => {
    mockUpdate = jasmine.createSpy('update');
    settings   = { update: mockUpdate, fitnessGoal: () => null, hasWeeklyGoal: () => false };

    await TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [
        { provide: UserSettingsService, useValue: settings },
        { provide: OnboardingTourService, useValue: { total: 9 } },
      ],
    })
      .overrideComponent(OnboardingComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(OnboardingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('starts at step 0', () => {
    expect(component.step()).toBe(0);
  });

  it('has 4 presentation slides, then the goal and the tour offer', () => {
    expect(component.slides.length).toBe(4);
    expect(component.GOAL_STEP).toBe(4);
    expect(component.INVITE_STEP).toBe(5);
    expect(component.TOTAL_STEPS).toBe(6);
  });

  // ── Els gossos es presenten ───────────────────────────────────────────────

  describe('presentation', () => {
    it('opens with both dogs', () => {
      expect(component.slides[0].mascot).toBe('both');
    });

    it('gives Marley and Xoco a slide each, in that order', () => {
      expect(component.slides[1].mascot).toBe('marley');
      expect(component.slides[2].mascot).toBe('xoco');
    });

    it('only lets a single dog speak in first person — the shared slides carry no line', () => {
      for (const slide of component.slides) {
        if (slide.mascot === 'both') expect(slide.line).toBeUndefined();
        else expect(slide.line).toBeTruthy();
      }
    });

    it('shows the cut-out figure, never the small circular avatar', () => {
      expect(component.slideDog().figure).toContain('-full');
    });

    it('follows the current slide when the step changes', () => {
      component.next();
      expect(component.slideDog().figure).toContain('marley-full');
    });

    it('promises the real number of tour stops', () => {
      expect(component.tourSteps).toBe(9);
    });

    it('starts with no goal picked for a new account', () => {
      expect(component.selectedGoal()).toBeNull();
    });
  });

  // ── next() ───────────────────────────────────────────────────────────────

  describe('next()', () => {
    it('advances to the next step', () => {
      component.next();
      expect(component.step()).toBe(1);
    });

    it('does not go past the tour offer', () => {
      component.step.set(component.TOTAL_STEPS - 1);
      component.next();
      expect(component.step()).toBe(component.TOTAL_STEPS - 1);
    });

    it('goes from the goal step to the tour offer', () => {
      component.step.set(component.GOAL_STEP);
      component.next();
      expect(component.step()).toBe(component.INVITE_STEP);
    });
  });

  // ── skipToGoal() ─────────────────────────────────────────────────────────

  describe('skipToGoal()', () => {
    it('jumps to the goal step from step 0', () => {
      component.skipToGoal();
      expect(component.step()).toBe(component.GOAL_STEP);
    });

    it('works from any intermediate step', () => {
      component.next();
      component.skipToGoal();
      expect(component.step()).toBe(component.GOAL_STEP);
    });

    // Tocar el fons no ha de retrocedir ningú a un pas que ja ha contestat.
    it('does nothing once the goal step is behind the user', () => {
      component.step.set(component.INVITE_STEP);
      component.skipToGoal();
      expect(component.step()).toBe(component.INVITE_STEP);
    });
  });

  // ── finish() ─────────────────────────────────────────────────────────────

  describe('finish()', () => {
    it('marks the onboarding done', () => {
      component.selectedGoal.set('strength');
      component.finish(true);
      expect(mockUpdate).toHaveBeenCalledWith(jasmine.objectContaining({ onboardingDone: true }));
    });

    it('saves the chosen goal with its weekly default', () => {
      component.selectedGoal.set('strength');
      component.finish(true);
      expect(mockUpdate).toHaveBeenCalledWith(jasmine.objectContaining({
        fitnessGoal: 'strength', metricsEnabled: true, weeklyActivityGoal: 3,
      }));
    });

    it('lets the user through without a goal', () => {
      component.finish(false);
      const patch = mockUpdate.calls.mostRecent().args[0];
      expect(patch.onboardingDone).toBeTrue();
      expect('fitnessGoal' in patch).toBeFalse();
    });

    it('leaves the tour un-done when the user accepts it, so it can run', () => {
      component.finish(true);
      const patch = mockUpdate.calls.mostRecent().args[0];
      expect('guidedTourDone' in patch).toBeFalse();
    });

    it('marks the tour done when declined, so it is never pushed again', () => {
      component.finish(false);
      expect(mockUpdate).toHaveBeenCalledWith(jasmine.objectContaining({ guidedTourDone: true }));
    });

    // Repetir la benvinguda des dels paràmetres avançats no ha de trepitjar
    // un objectiu setmanal que l'usuari s'hagi ajustat.
    it('leaves an existing weekly goal alone', () => {
      settings.hasWeeklyGoal = () => true;
      component.selectedGoal.set('weight');
      component.finish(false);
      const patch = mockUpdate.calls.mostRecent().args[0];
      expect(patch.fitnessGoal).toBe('weight');
      expect('weeklyActivityGoal' in patch).toBeFalse();
    });

    it('emits whether the tour should start', () => {
      const emitted: boolean[] = [];
      component.done.subscribe(v => emitted.push(v));
      component.finish(true);
      component.finish(false);
      expect(emitted).toEqual([true, false]);
    });
  });

  // ── currentSlide() ───────────────────────────────────────────────────────

  describe('currentSlide()', () => {
    it('returns the slide matching the current step', () => {
      expect(component.currentSlide()).toBe(component.slides[0]);
    });

    it('updates when step changes', () => {
      component.next();
      expect(component.currentSlide()).toBe(component.slides[1]);
    });
  });
});
