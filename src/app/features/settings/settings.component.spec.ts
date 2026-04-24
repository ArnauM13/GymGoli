import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { SettingsComponent } from './settings.component';
import { UserSettingsService } from '../../core/services/user-settings.service';

describe('SettingsComponent', () => {
  let component: SettingsComponent;
  let mockEnabled: ReturnType<typeof signal<boolean>>;
  let mockUpdate:  jasmine.Spy;

  beforeEach(async () => {
    mockEnabled = signal(true);
    mockUpdate  = jasmine.createSpy('update');

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [
        {
          provide: UserSettingsService,
          useValue: {
            metricsEnabled: mockEnabled,
            loaded:         signal(true),
            update:         mockUpdate,
          },
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

    it('alternates correctly across multiple toggles', () => {
      mockEnabled.set(true);
      component.toggleMetrics();
      expect(mockUpdate).toHaveBeenCalledWith({ metricsEnabled: false });

      mockEnabled.set(false);
      component.toggleMetrics();
      expect(mockUpdate).toHaveBeenCalledWith({ metricsEnabled: true });
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
});
