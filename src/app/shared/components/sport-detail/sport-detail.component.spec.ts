import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SportDetailComponent } from './sport-detail.component';
import { SportService } from '../../../core/services/sport.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { Sport, SportSession } from '../../../core/models/sport.model';

function makeSport(overrides: Partial<Sport> = {}): Sport {
  return {
    id: 'run', name: 'Running', icon: 'directions_run', color: '#43A047',
    subtypes: [{ id: 'llarga', name: 'Tirada llarga' }],
    metricDefs: [
      { key: 'distance_km', label: 'Distància', type: 'number', unit: 'km', min: 0.5, max: 100, step: 0.5 },
      { key: 'terrain', label: 'Terreny', type: 'select', options: [
        { value: 'muntanya', label: 'Muntanya' }, { value: 'asfaltat', label: 'Asfaltat' },
      ]},
    ],
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<SportSession> = {}): SportSession {
  return { id: 's1', date: '2024-03-05', sportId: 'run', createdAt: new Date(), ...overrides };
}

describe('SportDetailComponent', () => {
  let sessions: ReturnType<typeof signal<SportSession[]>>;
  let allLoaded: ReturnType<typeof signal<boolean>>;
  let loadAllSessions: jasmine.Spy;
  let scale: ReturnType<typeof signal<'emoji' | 'numeric'>>;

  function build(sport: Sport, session: SportSession): HTMLElement {
    const fixture = TestBed.createComponent(SportDetailComponent);
    fixture.componentRef.setInput('sport', sport);
    fixture.componentRef.setInput('session', session);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function rows(el: HTMLElement): { label: string; value: string; note: string; record: boolean }[] {
    return Array.from(el.querySelectorAll('.sdv-row')).map(row => ({
      label:  row.querySelector('.sdv-label')?.textContent?.trim() ?? '',
      value:  row.querySelector('.sdv-value')?.textContent?.trim().replace(/\s+/g, ' ') ?? '',
      note:   row.querySelector('.sdv-note')?.textContent?.trim() ?? '',
      record: row.classList.contains('sdv-row--record'),
    }));
  }

  beforeEach(async () => {
    sessions        = signal<SportSession[]>([]);
    allLoaded       = signal(false);
    loadAllSessions = jasmine.createSpy().and.resolveTo(undefined);
    scale           = signal<'emoji' | 'numeric'>('emoji');

    await TestBed.configureTestingModule({
      imports: [SportDetailComponent],
      providers: [
        { provide: UserSettingsService, useValue: { difficultyScale: scale } },
        { provide: SportService, useValue: { sessions, allSessionsLoaded: allLoaded, loadAllSessions } },
      ],
    }).compileComponents();
  });

  it("demana l'historial sencer en obrir-se", () => {
    build(makeSport(), makeSession({ duration: 40 }));
    expect(loadAllSessions).toHaveBeenCalled();
  });

  describe('les dades de la sessió', () => {
    it('llista subtipus, durada i mètriques, en aquest ordre', () => {
      const el = build(makeSport(), makeSession({
        subtypeId: 'llarga', duration: 90, metrics: { distance_km: 15, terrain: 'muntanya' },
      }));

      expect(rows(el).map(r => [r.label, r.value])).toEqual([
        ['Subtipus', 'Tirada llarga'],
        ['Durada', '90 min'],
        ['Distància', '15km'],
        ['Terreny', 'Muntanya'],
      ]);
    });

    it('salta les mètriques sense valor', () => {
      const el = build(makeSport(), makeSession({ duration: 60, metrics: { terrain: 'asfaltat' } }));
      expect(rows(el).map(r => r.label)).toEqual(['Durada', 'Terreny']);
    });

    it('ho diu quan la sessió no porta cap dada', () => {
      const el = build(makeSport(), makeSession());
      expect(el.querySelector('.sdv-none')).toBeTruthy();
      expect(rows(el).length).toBe(0);
    });

    it('separa la sensació i les notes en un bloc propi', () => {
      const el = build(makeSport(), makeSession({ duration: 45, feeling: 4, notes: 'Vent de cara' }));

      const blocks = Array.from(el.querySelectorAll('.sdv-block-title')).map(n => n.textContent?.trim());
      expect(blocks).toEqual(['Sessió', 'Com ha anat']);
      expect(el.querySelector('.sdv-notes')?.textContent).toContain('Vent de cara');
      expect(rows(el).some(r => r.label === 'Sensació')).toBeTrue();
    });

    it("mostra la sensació segons l'escala de l'usuari", () => {
      scale.set('numeric');
      const el = build(makeSport(), makeSession({ feeling: 3 }));
      expect(rows(el).find(r => r.label === 'Sensació')?.value).toBe('6');
    });
  });

  // El que dona substància al detall: una sessió plana llegida contra tot
  // l'historial de l'esport.
  describe('context sobre l\'historial', () => {
    const past = (id: string, date: string, extra: Partial<SportSession> = {}) =>
      makeSession({ id, date, ...extra });

    it('no diu res de rècords ni mitjanes mentre no tingui tot l\'historial', () => {
      sessions.set([past('a', '2024-01-01', { duration: 30 }), past('b', '2024-02-01', { duration: 30 })]);
      allLoaded.set(false);

      const el = build(makeSport(), makeSession({ duration: 120, metrics: { distance_km: 42 } }));
      expect(rows(el).some(r => r.record)).toBeFalse();
      expect(rows(el).every(r => r.note === '')).toBeTrue();
    });

    it('corona la millor durada i la millor marca', () => {
      allLoaded.set(true);
      sessions.set([
        past('a', '2024-01-01', { duration: 40, metrics: { distance_km: 8 } }),
        past('b', '2024-02-01', { duration: 50, metrics: { distance_km: 10 } }),
      ]);

      const el = build(makeSport(), makeSession({ duration: 90, metrics: { distance_km: 15 } }));
      const byLabel = new Map(rows(el).map(r => [r.label, r]));
      expect(byLabel.get('Durada')?.record).toBeTrue();
      expect(byLabel.get('Distància')?.record).toBeTrue();
      expect(byLabel.get('Durada')?.value).toContain('RÈCORD');
    });

    it('no corona una marca que no supera les anteriors', () => {
      allLoaded.set(true);
      sessions.set([past('a', '2024-01-01', { duration: 120, metrics: { distance_km: 20 } })]);

      const el = build(makeSport(), makeSession({ duration: 90, metrics: { distance_km: 15 } }));
      expect(rows(el).some(r => r.record)).toBeFalse();
    });

    it('no corona la primera sessió: no hi ha res a batre', () => {
      allLoaded.set(true);
      sessions.set([]);

      const el = build(makeSport(), makeSession({ duration: 90, metrics: { distance_km: 15 } }));
      expect(rows(el).some(r => r.record)).toBeFalse();
    });

    it('no corona una tria, ni una xifra que no sigui una fita', () => {
      allLoaded.set(true);
      const sport = makeSport({ metricDefs: [
        { key: 'sets_lost', label: 'Sets perduts', type: 'number', min: 0, max: 4, step: 1 },
        { key: 'terrain',   label: 'Terreny', type: 'select', options: [{ value: 'muntanya', label: 'Muntanya' }] },
      ]});
      sessions.set([past('a', '2024-01-01', { metrics: { sets_lost: 1 } })]);

      const el = build(sport, makeSession({ metrics: { sets_lost: 3, terrain: 'muntanya' } }));
      expect(rows(el).some(r => r.record)).toBeFalse();
    });

    it('situa la durada respecte del que sols fer', () => {
      allLoaded.set(true);
      sessions.set([past('a', '2024-01-01', { duration: 40 }), past('b', '2024-02-01', { duration: 50 })]);

      const el = build(makeSport(), makeSession({ duration: 75 }));
      expect(rows(el).find(r => r.label === 'Durada')?.note).toBe('+30 min que de costum');

      const short = build(makeSport(), makeSession({ duration: 20 }));
      expect(rows(short).find(r => r.label === 'Durada')?.note).toBe('−25 min que de costum');
    });

    it('calla quan la durada és la de sempre', () => {
      allLoaded.set(true);
      sessions.set([past('a', '2024-01-01', { duration: 60 }), past('b', '2024-02-01', { duration: 60 })]);

      const el = build(makeSport(), makeSession({ duration: 62 }));
      expect(rows(el).find(r => r.label === 'Durada')?.note).toBe('Com de costum');
    });

    it('compta quantes sessions portes fins aquell dia', () => {
      allLoaded.set(true);
      sessions.set([
        past('a', '2024-01-01'), past('b', '2024-02-01'),
        // Posterior a la sessió que es mira: no la compta.
        past('c', '2024-12-01'),
      ]);

      const el = build(makeSport(), makeSession({ date: '2024-03-05', duration: 45 }));
      expect(el.querySelector('.sdv-footer')?.textContent).toContain('3a sessió de Running');
    });

    it('marca un pla al peu', () => {
      const el = build(makeSport(), makeSession({ duration: 60, status: 'planned' }));
      expect(el.querySelector('.sdv-footer')?.textContent).toContain('Planificat');
    });
  });
});
