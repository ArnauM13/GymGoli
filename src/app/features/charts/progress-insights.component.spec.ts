import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { ProgressInsightsComponent } from './progress-insights.component';
import { FitnessInsight, INSIGHT_LEVEL } from '../../core/models/insight.model';
import { FitnessMetricsService } from '../../core/services/fitness-metrics.service';
import { UserSettingsService } from '../../core/services/user-settings.service';

function insight(type: string, level: number, strength = 1): FitnessInsight {
  return {
    type: type as FitnessInsight['type'],
    mascot: 'marley', emoji: '💪', title: `T ${type}`, stat: '1', message: 'm',
    color: '#7e57c2', level, strength, cooldownDays: 0,
    detail: {
      headline: 'h',
      chart: { caption: 'c', range: 'r', bars: [] },
      facts: [], meaning: 'm',
    },
  };
}

describe('ProgressInsightsComponent', () => {
  let component: ProgressInsightsComponent;

  function setup(insights: FitnessInsight[] = [], metricsEnabled = true): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ProgressInsightsComponent],
      providers: [
        provideRouter([]),
        { provide: FitnessMetricsService, useValue: { insights: signal(insights) } },
        { provide: UserSettingsService,   useValue: { metricsEnabled: signal(metricsEnabled) } },
      ],
    });
    const fixture = TestBed.createComponent(ProgressInsightsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => setup());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('agrupa per família i es queda només amb les que tenen alguna cosa', () => {
    setup([
      insight('progres', INSIGHT_LEVEL.progres),
      insight('ratxa_en_joc', INSIGHT_LEVEL.objectiu),
      insight('patro_setmanal', INSIGHT_LEVEL.patro),
    ]);

    expect(component.families().map(f => f.label)).toEqual(['Objectiu', 'Progrés', 'Patró']);
    expect(component.total()).toBe(3);
  });

  // A Inici en surt un i es tanca; aquí hi són tots, que és a què s'hi ve.
  it('no se n\'amaga cap: dos de la mateixa família surten tots dos', () => {
    setup([
      insight('progres', INSIGHT_LEVEL.progres),
      insight('volum_gym', INSIGHT_LEVEL.progres),
    ]);

    expect(component.families().length).toBe(1);
    expect(component.families()[0].insights.length).toBe(2);
  });

  it('calla del tot quan l\'usuari té els insights desactivats', () => {
    setup([insight('progres', INSIGHT_LEVEL.progres)], false);
    expect(component.families()).toEqual([]);
  });

  describe('el full de detall', () => {
    it('s\'obre amb el que s\'ha tocat i es tanca', () => {
      const ins = insight('progres', INSIGHT_LEVEL.progres);
      setup([ins]);

      component.open(ins);
      expect(component.selected()).toBe(ins);
      component.close();
      expect(component.selected()).toBeNull();
    });
  });
});
