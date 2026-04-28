import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { OnboardingComponent } from './onboarding.component';
import { UserSettingsService } from '../../../core/services/user-settings.service';

describe('OnboardingComponent', () => {
  let component: OnboardingComponent;
  let mockUpdate: jasmine.Spy;

  beforeEach(async () => {
    mockUpdate = jasmine.createSpy('update');

    await TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [
        {
          provide: UserSettingsService,
          useValue: { update: mockUpdate },
        },
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

  it('has 3 slides', () => {
    expect(component.slides.length).toBe(3);
  });

  // ── next() ───────────────────────────────────────────────────────────────

  describe('next()', () => {
    it('advances to the next step', () => {
      component.next();
      expect(component.step()).toBe(1);
    });

    it('advances step by step through all slides', () => {
      component.next();
      component.next();
      expect(component.step()).toBe(2);
    });

    it('does not go past the last slide', () => {
      component.step.set(component.slides.length - 1);
      component.next();
      expect(component.step()).toBe(component.slides.length - 1);
    });
  });

  // ── skipToEnd() ──────────────────────────────────────────────────────────

  describe('skipToEnd()', () => {
    it('jumps to the last slide from step 0', () => {
      component.skipToEnd();
      expect(component.step()).toBe(component.slides.length - 1);
    });

    it('works from any intermediate step', () => {
      component.next(); // step 1
      component.skipToEnd();
      expect(component.step()).toBe(component.slides.length - 1);
    });
  });

  // ── finish() ─────────────────────────────────────────────────────────────

  describe('finish()', () => {
    it('calls settingsService.update with onboardingDone: true', () => {
      component.finish();
      expect(mockUpdate).toHaveBeenCalledWith({ onboardingDone: true });
    });

    it('emits the done output event', () => {
      let emitted = false;
      component.done.subscribe(() => (emitted = true));
      component.finish();
      expect(emitted).toBeTrue();
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
