import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { FitnessInsightsComponent } from './fitness-insights.component';
import { FitnessInsight, FitnessMetricsService } from '../../../core/services/fitness-metrics.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';

function makeInsight(type: string, overrides: Partial<FitnessInsight> = {}): FitnessInsight {
  return {
    type: type as FitnessInsight['type'],
    emoji: '🔥',
    title: `Title for ${type}`,
    message: `Message for ${type}`,
    color: '#006874',
    ...overrides,
  };
}

describe('FitnessInsightsComponent', () => {
  let component: FitnessInsightsComponent;
  let mockEnabled:  ReturnType<typeof signal<boolean>>;
  let mockLoaded:   ReturnType<typeof signal<boolean>>;
  let mockInsights: ReturnType<typeof signal<FitnessInsight[]>>;

  beforeEach(async () => {
    mockEnabled  = signal(true);
    mockLoaded   = signal(true);
    mockInsights = signal<FitnessInsight[]>([]);

    await TestBed.configureTestingModule({
      imports: [FitnessInsightsComponent],
      providers: [
        {
          provide: UserSettingsService,
          useValue: { metricsEnabled: mockEnabled, loaded: mockLoaded },
        },
        {
          provide: FitnessMetricsService,
          useValue: { insights: mockInsights },
        },
      ],
    })
      .overrideComponent(FitnessInsightsComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(FitnessInsightsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // ── visibleInsights() ────────────────────────────────────────────────────

  describe('visibleInsights()', () => {
    it('returns all insights when none are dismissed', () => {
      mockInsights.set([makeInsight('gran_setmana'), makeInsight('recupera_esport')]);
      expect(component.visibleInsights().length).toBe(2);
    });

    it('returns empty array when there are no insights', () => {
      mockInsights.set([]);
      expect(component.visibleInsights()).toEqual([]);
    });

    it('excludes a dismissed insight', () => {
      mockInsights.set([makeInsight('gran_setmana'), makeInsight('recupera_esport')]);

      component.dismiss('gran_setmana');

      expect(component.visibleInsights().length).toBe(1);
      expect(component.visibleInsights()[0].type).toBe('recupera_esport');
    });

    it('excludes all dismissed insights', () => {
      mockInsights.set([makeInsight('gran_setmana'), makeInsight('recupera_esport')]);

      component.dismiss('gran_setmana');
      component.dismiss('recupera_esport');

      expect(component.visibleInsights()).toEqual([]);
    });

    it('preserves insight order after dismissals', () => {
      mockInsights.set([
        makeInsight('setmana_fluixa'),
        makeInsight('gran_setmana'),
        makeInsight('prova_esport'),
      ]);

      component.dismiss('gran_setmana');

      const types = component.visibleInsights().map(i => i.type);
      expect(types).toEqual(['setmana_fluixa', 'prova_esport']);
    });

    it('reacts reactively when insights signal changes', () => {
      mockInsights.set([]);
      expect(component.visibleInsights().length).toBe(0);

      mockInsights.set([makeInsight('gran_setmana')]);
      expect(component.visibleInsights().length).toBe(1);
    });
  });

  // ── dismiss() ────────────────────────────────────────────────────────────

  describe('dismiss()', () => {
    it('dismissing a non-present type does not affect remaining insights', () => {
      mockInsights.set([makeInsight('gran_setmana')]);
      component.dismiss('prova_esport');
      expect(component.visibleInsights().length).toBe(1);
    });

    it('dismissing the same type twice does not cause errors', () => {
      mockInsights.set([makeInsight('gran_setmana')]);
      component.dismiss('gran_setmana');
      component.dismiss('gran_setmana');
      expect(component.visibleInsights()).toEqual([]);
    });

    it('dismissals persist if insights signal emits the same types again', () => {
      mockInsights.set([makeInsight('gran_setmana')]);
      component.dismiss('gran_setmana');

      // signal emits same value again
      mockInsights.set([makeInsight('gran_setmana')]);
      expect(component.visibleInsights()).toEqual([]);
    });
  });
});
