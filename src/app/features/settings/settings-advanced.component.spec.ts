import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SettingsAdvancedComponent } from './settings-advanced.component';
import { UserSettingsService } from '../../core/services/user-settings.service';

describe('SettingsAdvancedComponent', () => {
  let component: SettingsAdvancedComponent;
  let mockUpdate: jasmine.Spy;

  beforeEach(async () => {
    mockUpdate = jasmine.createSpy('update');

    await TestBed.configureTestingModule({
      imports: [SettingsAdvancedComponent],
      providers: [
        provideRouter([]),
        {
          provide: UserSettingsService,
          useValue: {
            supersetsEnabled: signal(false),
            dropsetsEnabled:  signal(false),
            rirEnabled:       signal(false),
            difficultyScale:  signal('emoji'),
            bodyweightFactorEnabled: signal(false),
            update:           mockUpdate,
          },
        },
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

  describe('toggleRir()', () => {
    it('enables RIR when currently disabled', () => {
      component.toggleRir();
      expect(mockUpdate).toHaveBeenCalledWith({ rirEnabled: true });
    });
  });

  describe('setDifficultyScale()', () => {
    it('sets the difficulty scale to numeric', () => {
      component.setDifficultyScale('numeric');
      expect(mockUpdate).toHaveBeenCalledWith({ difficultyScale: 'numeric' });
    });
  });
});
