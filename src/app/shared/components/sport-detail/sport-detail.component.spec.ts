import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SportDetailComponent } from './sport-detail.component';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { Sport, SportSession } from '../../../core/models/sport.model';

function makeSport(overrides: Partial<Sport> = {}): Sport {
  return {
    id: 'padel', name: 'Pàdel', icon: 'sports_tennis', color: '#FB8C00',
    subtypes: [{ id: 'dobles', name: 'Dobles' }],
    metricDefs: [
      { key: 'result', label: 'Resultat', type: 'select', options: [
        { value: 'guanyat', label: 'Guanyat' }, { value: 'perdut', label: 'Perdut' },
      ]},
      { key: 'sets_won', label: 'Sets guanyats', type: 'number', min: 0, max: 4, step: 1 },
    ],
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSession(overrides: Partial<SportSession> = {}): SportSession {
  return { id: 's1', date: '2024-03-05', sportId: 'padel', createdAt: new Date(), ...overrides };
}

describe('SportDetailComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<SportDetailComponent>>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SportDetailComponent],
      providers: [
        { provide: UserSettingsService, useValue: { difficultyScale: signal('emoji') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SportDetailComponent);
  });

  function render(sport: Sport, session: SportSession): HTMLElement {
    fixture.componentRef.setInput('sport', sport);
    fixture.componentRef.setInput('session', session);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('llista subtipus, durada, mètriques i sensació, en aquest ordre', () => {
    const el = render(makeSport(), makeSession({
      subtypeId: 'dobles', duration: 90, feeling: 4,
      metrics: { result: 'guanyat', sets_won: 2 },
    }));

    const labels = Array.from(el.querySelectorAll('.sdv-label')).map(n => n.textContent?.trim());
    expect(labels).toEqual(['Subtipus', 'Durada', 'Resultat', 'Sets guanyats', 'Sensació']);

    const values = Array.from(el.querySelectorAll('.sdv-value')).map(n => n.textContent?.trim());
    expect(values.slice(0, 4)).toEqual(['Dobles', '90 min', 'Guanyat', '2']);
  });

  it('salta les mètriques sense valor', () => {
    const el = render(makeSport(), makeSession({ duration: 60, metrics: { result: 'perdut' } }));

    const labels = Array.from(el.querySelectorAll('.sdv-label')).map(n => n.textContent?.trim());
    expect(labels).toEqual(['Durada', 'Resultat']);
  });

  it('ho diu quan la sessió no porta cap dada', () => {
    const el = render(makeSport(), makeSession());
    expect(el.querySelector('.sdv-none')).toBeTruthy();
    expect(el.querySelectorAll('.sdv-row').length).toBe(0);
  });

  it('ensenya les notes a part de les dades', () => {
    const el = render(makeSport(), makeSession({ duration: 45, notes: 'Vent de cara' }));
    expect(el.querySelector('.sdv-notes')?.textContent).toContain('Vent de cara');
  });

  it('resumeix al peu, i marca un pla com a planificat', () => {
    const done = render(makeSport(), makeSession({ duration: 45, metrics: { result: 'guanyat' } }));
    expect(done.querySelector('.sdv-footer')?.textContent).toContain('45 min');
    expect(done.querySelector('.sdv-footer')?.textContent).toContain('1 dada');

    const planned = render(makeSport(), makeSession({ duration: 60, status: 'planned' }));
    expect(planned.querySelector('.sdv-footer')?.textContent).toContain('Planificat');
  });

  it("mostra la sensació segons l'escala de l'usuari", () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SportDetailComponent],
      providers: [{ provide: UserSettingsService, useValue: { difficultyScale: signal('numeric') } }],
    });
    const f = TestBed.createComponent(SportDetailComponent);
    f.componentRef.setInput('sport', makeSport());
    f.componentRef.setInput('session', makeSession({ feeling: 3 }));
    f.detectChanges();

    const values = Array.from((f.nativeElement as HTMLElement).querySelectorAll('.sdv-value'))
      .map(n => n.textContent?.trim());
    expect(values).toEqual(['6']);
  });
});
