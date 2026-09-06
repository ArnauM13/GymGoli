import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { FitnessInsightsComponent } from './fitness-insights.component';
import { FitnessInsight, INSIGHT_LEVEL } from '../../../core/models/insight.model';
import { FitnessMetricsService } from '../../../core/services/fitness-metrics.service';
import { TodayService } from '../../../core/services/today.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';

const TODAY     = '2025-04-23';
const YESTERDAY = '2025-04-22';

const DISMISS_KEY = 'gymgoli_insight_dismissed';
const SHOWN_KEY   = 'gymgoli_insight_shown';
const ONCE_KEY    = 'gymgoli_insight_once';

function makeInsight(type: string, overrides: Partial<FitnessInsight> = {}): FitnessInsight {
  return {
    type: type as FitnessInsight['type'],
    mascot: 'both',
    emoji: '🔥',
    title: `Title for ${type}`,
    stat: `Stat for ${type}`,
    message: `Message for ${type}`,
    color: '#006874',
    level: INSIGHT_LEVEL.tendencia,
    strength: 10,
    cooldownDays: 0,
    detail: {
      headline: `Headline for ${type}`,
      chart: {
        caption: 'Activitats per setmana',
        range: '3 de març – 23 d\'abril',
        bars: [{ label: 'dl', value: 2 }],
      },
      facts: [{ label: 'Fact', value: '2' }],
      meaning: `Meaning for ${type}`,
    },
    ...overrides,
  };
}

describe('FitnessInsightsComponent', () => {
  let component: FitnessInsightsComponent;
  let mockEnabled:  ReturnType<typeof signal<boolean>>;
  let mockLoaded:   ReturnType<typeof signal<boolean>>;
  let mockInsights: ReturnType<typeof signal<FitnessInsight[]>>;
  let mockToday:    ReturnType<typeof signal<string>>;
  let fixture:      ReturnType<typeof TestBed.createComponent<FitnessInsightsComponent>>;

  /** El component llegeix `localStorage` en construir-se: sembra-hi el que
   *  calgui abans de cridar-la. */
  async function build(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [FitnessInsightsComponent],
      providers: [
        { provide: UserSettingsService, useValue: { metricsEnabled: mockEnabled, loaded: mockLoaded } },
        { provide: FitnessMetricsService, useValue: { insights: mockInsights } },
        { provide: TodayService, useValue: { today: mockToday } },
      ],
    })
      .overrideComponent(FitnessInsightsComponent, {
        set: { imports: [], schemas: [NO_ERRORS_SCHEMA] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(FitnessInsightsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(SHOWN_KEY);
    localStorage.removeItem(ONCE_KEY);
    TestBed.resetTestingModule();

    mockEnabled  = signal(true);
    mockLoaded   = signal(true);
    mockInsights = signal<FitnessInsight[]>([]);
    mockToday    = signal(TODAY);
  });

  afterEach(() => {
    localStorage.removeItem(DISMISS_KEY);
    localStorage.removeItem(SHOWN_KEY);
    localStorage.removeItem(ONCE_KEY);
  });

  // ── Un i prou ────────────────────────────────────────────────────────────

  it('shows the first candidate and nothing else', async () => {
    await build();
    mockInsights.set([makeInsight('tendencia_volum'), makeInsight('equilibri_gym')]);

    expect(component.insight()!.type).toBe('tendencia_volum');
  });

  it('shows nothing when there are no candidates', async () => {
    await build();
    expect(component.insight()).toBeNull();
  });

  it('shows nothing while insights are off or settings are still loading', async () => {
    await build();
    mockInsights.set([makeInsight('tendencia_volum')]);

    mockEnabled.set(false);
    expect(component.insight()).toBeNull();

    mockEnabled.set(true);
    mockLoaded.set(false);
    expect(component.insight()).toBeNull();
  });

  // ── Tancar = silenciar només avui ────────────────────────────────────────

  describe('dismiss()', () => {
    it('hides the insight and falls through to the next candidate', async () => {
      await build();
      mockInsights.set([makeInsight('tendencia_volum'), makeInsight('equilibri_gym')]);

      component.dismiss('tendencia_volum');

      expect(component.insight()!.type).toBe('equilibri_gym');
    });

    it('stores the dismissal under today\'s date', async () => {
      await build();
      mockInsights.set([makeInsight('tendencia_volum')]);

      component.dismiss('tendencia_volum');

      expect(JSON.parse(localStorage.getItem(DISMISS_KEY)!)).toEqual({ tendencia_volum: TODAY });
    });

    it('lets a dismissed insight come back the next day', async () => {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ tendencia_volum: YESTERDAY }));
      await build();
      mockInsights.set([makeInsight('tendencia_volum')]);

      expect(component.insight()!.type).toBe('tendencia_volum');
    });

    it('keeps it hidden for the rest of the same day', async () => {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ tendencia_volum: TODAY }));
      await build();
      mockInsights.set([makeInsight('tendencia_volum')]);

      expect(component.insight()).toBeNull();
    });
  });

  // ── Descans dels estats lents ────────────────────────────────────────────

  describe('cooldown', () => {
    it('skips a slow insight seen inside its rest window', async () => {
      localStorage.setItem(SHOWN_KEY, JSON.stringify({ patro_setmanal: YESTERDAY }));
      await build();
      mockInsights.set([
        makeInsight('patro_setmanal', { cooldownDays: 14 }),
        makeInsight('equilibri_gym'),
      ]);

      expect(component.insight()!.type).toBe('equilibri_gym');
    });

    it('brings it back once the rest window is over', async () => {
      localStorage.setItem(SHOWN_KEY, JSON.stringify({ patro_setmanal: '2025-04-01' }));
      await build();
      mockInsights.set([makeInsight('patro_setmanal', { cooldownDays: 14 })]);

      expect(component.insight()!.type).toBe('patro_setmanal');
    });

    it('never rests an event insight', async () => {
      localStorage.setItem(SHOWN_KEY, JSON.stringify({ ratxa_en_joc: YESTERDAY }));
      await build();
      mockInsights.set([makeInsight('ratxa_en_joc', { cooldownDays: 0 })]);

      expect(component.insight()!.type).toBe('ratxa_en_joc');
    });

    it('keeps today\'s insight all day, even a slow one', async () => {
      localStorage.setItem(SHOWN_KEY, JSON.stringify({ patro_setmanal: TODAY }));
      await build();
      mockInsights.set([makeInsight('patro_setmanal', { cooldownDays: 14 })]);

      expect(component.insight()!.type).toBe('patro_setmanal');
    });

    it('records what it showed, so tomorrow it can rest', async () => {
      await build();
      mockInsights.set([makeInsight('patro_setmanal', { cooldownDays: 14 })]);
      // Pintar-lo és el que en deixa constància, via `effect`.
      fixture.detectChanges();
      expect(component.insight()!.type).toBe('patro_setmanal');

      expect(JSON.parse(localStorage.getItem(SHOWN_KEY)!)).toEqual({ patro_setmanal: TODAY });
    });
  });

  // ── Fites: una vegada i prou ─────────────────────────────────────────────

  describe('once', () => {
    it('shows a milestone that has never been celebrated', async () => {
      await build();
      mockInsights.set([makeInsight('ratxa_assolida', { once: 'ratxa_assolida:2025-04-14' })]);

      expect(component.insight()!.type).toBe('ratxa_assolida');
    });

    it('records the milestone when it shows it', async () => {
      await build();
      mockInsights.set([makeInsight('ratxa_assolida', { once: 'ratxa_assolida:2025-04-14' })]);
      // Pintar-la és el que en deixa constància, via `effect`.
      fixture.detectChanges();

      expect(JSON.parse(localStorage.getItem(ONCE_KEY)!)).toEqual(['ratxa_assolida:2025-04-14']);
    });

    it('never shows the same milestone again, not even months later', async () => {
      localStorage.setItem(ONCE_KEY, JSON.stringify(['ratxa_assolida:2025-04-14']));
      await build();
      mockInsights.set([
        makeInsight('ratxa_assolida', { once: 'ratxa_assolida:2025-04-14' }),
        makeInsight('equilibri_gym'),
      ]);

      expect(component.insight()!.type).toBe('equilibri_gym');
    });

    it('lets the next milestone through — it is another achievement', async () => {
      localStorage.setItem(ONCE_KEY, JSON.stringify(['ratxa_assolida:2025-04-14']));
      await build();
      mockInsights.set([makeInsight('ratxa_assolida', { once: 'ratxa_assolida:2025-04-21' })]);

      expect(component.insight()!.type).toBe('ratxa_assolida');
    });

    it('drops it as soon as the candidates are recomputed', async () => {
      // Sense esperar a reobrir l'app: la còpia en memòria ja la té marcada.
      await build();
      mockInsights.set([makeInsight('ratxa_assolida', { once: 'ratxa_assolida:2025-04-14' })]);
      fixture.detectChanges();

      mockToday.set('2025-04-24');
      expect(component.insight()).toBeNull();
    });
  });

  // ── El detall ────────────────────────────────────────────────────────────

  describe('el full de detall', () => {
    it('comença tancat i s\'obre tocant la targeta', async () => {
      await build();
      mockInsights.set([makeInsight('tendencia_volum')]);

      expect(component.detailOpen()).toBe(false);

      component.openDetail();
      expect(component.detailOpen()).toBe(true);
    });

    it('el botó diu on porta, sense repetir només el títol', async () => {
      await build();
      const label = component.openLabel(makeInsight('tendencia_volum'));

      expect(label).toContain('Title for tendencia_volum');
      expect(label.length).toBeGreaterThan('Title for tendencia_volum'.length);
    });

    it('es tanca sol quan es tanca la targeta', async () => {
      await build();
      mockInsights.set([makeInsight('tendencia_volum')]);
      component.openDetail();

      component.dismiss('tendencia_volum');

      expect(component.detailOpen()).toBe(false);
    });

    it('es tanca sol si l\'insight desapareix sota els peus', async () => {
      await build();
      mockInsights.set([makeInsight('tendencia_volum')]);
      fixture.detectChanges();
      component.openDetail();

      mockInsights.set([]);
      fixture.detectChanges();

      expect(component.detailOpen()).toBe(false);
    });
  });

  // ── Mascotes ─────────────────────────────────────────────────────────────

  describe('mascotsOf()', () => {
    it('pairs both dogs for a transversal insight', async () => {
      await build();
      expect(component.mascotsOf(makeInsight('tendencia_volum', { mascot: 'both' })).length).toBe(2);
    });

    it('returns a single dog otherwise', async () => {
      await build();
      const marley = component.mascotsOf(makeInsight('equilibri_gym', { mascot: 'marley' }));
      expect(marley.length).toBe(1);
      expect(marley[0]).toBe(component.mascotsOf(makeInsight('volum_gym', { mascot: 'marley' }))[0]);
    });
  });
});
