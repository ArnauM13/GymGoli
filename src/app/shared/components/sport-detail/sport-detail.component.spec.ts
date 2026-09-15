import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SportDetailComponent, SportSessionPatch } from './sport-detail.component';
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
  let loadSessionsForSport: jasmine.Spy;
  let scale: ReturnType<typeof signal<'emoji' | 'numeric'>>;

  function build(sport: Sport, session: SportSession, compact = false): HTMLElement {
    const fixture = TestBed.createComponent(SportDetailComponent);
    fixture.componentRef.setInput('sport', sport);
    fixture.componentRef.setInput('session', session);
    fixture.componentRef.setInput('compact', compact);
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
    allLoaded            = signal(false);
    loadSessionsForSport = jasmine.createSpy().and.resolveTo(undefined);
    scale                = signal<'emoji' | 'numeric'>('emoji');

    await TestBed.configureTestingModule({
      imports: [SportDetailComponent],
      providers: [
        { provide: UserSettingsService, useValue: { difficultyScale: scale } },
        { provide: SportService, useValue: {
          sessions,
          sportHistoryLoaded:   () => allLoaded(),
          loadSessionsForSport,
        } },
      ],
    }).compileComponents();
  });

  // Les d'aquest esport, no les de tots: qui obria una sessió de córrer
  // s'enduia també cada partit de pàdel que hagués jugat mai.
  it("demana l'historial d'aquest esport en obrir-se", () => {
    build(makeSport(), makeSession({ duration: 40 }));
    expect(loadSessionsForSport).toHaveBeenCalledWith('run');
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

  // Desplegat dins una targeta del feed és una ullada, no la lectura sencera:
  // les xifres i prou, que el context i el compte de sessions ja tenen pàgina.
  describe('plegat dins la targeta (compact)', () => {
    beforeEach(() => {
      allLoaded.set(true);
      sessions.set([
        makeSession({ id: 'a', date: '2024-01-01', duration: 40, feeling: 2 }),
        makeSession({ id: 'b', date: '2024-02-01', duration: 50, feeling: 2 }),
      ]);
    });

    it('segueix dient les dades de la sessió', () => {
      const el = build(makeSport(), makeSession({ duration: 90, metrics: { distance_km: 15 } }), true);
      expect(rows(el).map(r => r.label)).toEqual(['Durada', 'Distància']);
    });

    it('no diu el context de l\'historial', () => {
      const el = build(makeSport(), makeSession({ duration: 90, feeling: 4 }), true);
      expect(rows(el).every(r => r.note === '')).toBeTrue();
      expect(el.querySelector('.sdv-note')).toBeNull();
    });

    it('no porta ni titolets ni el peu de sessions i durada', () => {
      const el = build(makeSport(), makeSession({ duration: 90, feeling: 4, notes: 'Bé' }), true);
      expect(el.querySelector('.sdv-footer')).toBeNull();
      expect(el.querySelector('.sdv-block-title')).toBeNull();
    });

    // Els rècords i les mitjanes són l'única cosa que necessita l'historial
    // sencer de l'esport, i la ullada no en diu res: demanar-lo seria baixar
    // totes les sessions per pintar dues files que la targeta ja tenia.
    it("no demana l'historial de l'esport", () => {
      build(makeSport(), makeSession({ duration: 90 }), true);
      expect(loadSessionsForSport).not.toHaveBeenCalled();
    });

    it('no corona cap marca: la ullada són les dades i prou', () => {
      const el = build(makeSport(), makeSession({ duration: 90 }), true);
      expect(rows(el).some(r => r.record)).toBeFalse();
      expect(el.querySelector('.sdv-record')).toBeNull();
    });

    // La sensació i la nota ja són a la targeta que es desplega: repetir-les
    // just a sota fa el desplegable llarg sense dir res de nou.
    it('no repeteix la sensació ni la nota de la targeta', () => {
      const el = build(makeSport(), makeSession({ duration: 90, feeling: 4, notes: 'Bé' }), true);
      expect(rows(el).map(r => r.label)).toEqual(['Durada']);
      expect(el.querySelector('.sdv-notes')).toBeNull();
    });

    it('talla les dades que no caben a una ullada i diu quantes en queden', () => {
      const sport = makeSport({
        metricDefs: [
          { key: 'distance_km', label: 'Distància', type: 'number', unit: 'km' },
          { key: 'pace',        label: 'Ritme',     type: 'number', unit: 'min/km' },
          { key: 'elevation',   label: 'Desnivell', type: 'number', unit: 'm' },
          { key: 'calories',    label: 'Calories',  type: 'number', unit: 'kcal' },
          { key: 'hr',          label: 'Pulsacions', type: 'number', unit: 'ppm' },
        ],
      });
      const el = build(sport, makeSession({
        duration: 90,
        metrics: { distance_km: 15, pace: 5, elevation: 300, calories: 800, hr: 140 },
      }), true);

      expect(rows(el).length).toBe(5);
      expect(el.querySelector('.sdv-more')?.textContent).toContain('+1');
    });
  });
  // ── Editable ──
  // La mateixa fila que diu la dada és la que la deixa tocar: no hi ha un
  // formulari a part, com no n'hi ha al gimnàs.
  describe('editable', () => {
    function buildEdit(sport: Sport, session: SportSession) {
      const fixture = TestBed.createComponent(SportDetailComponent);
      fixture.componentRef.setInput('sport', sport);
      fixture.componentRef.setInput('session', session);
      fixture.componentRef.setInput('editable', true);
      const patches: SportSessionPatch[] = [];
      fixture.componentInstance.patch.subscribe(p => patches.push(p));
      fixture.detectChanges();
      return { el: fixture.nativeElement as HTMLElement, fixture, patches };
    }

    // Llegint, una dada que no consta no fa fila. Editant sí: la fila buida
    // és on es posa el valor.
    it('treu les files de tot el que l\'esport sap mesurar, amb valor o sense', () => {
      const { el } = buildEdit(makeSport(), makeSession());
      expect(rows(el).map(r => r.label))
        .toEqual(['Subtipus', 'Durada', 'Distància', 'Terreny', 'Sensació']);
    });

    it('cada mena de dada porta el seu control', () => {
      const { el } = buildEdit(makeSport(), makeSession({ duration: 40 }));
      // La durada i la distància són xifres; el terreny i el subtipus, tries
      // curtes, que caben com a segmentat dins la fila.
      expect(el.querySelectorAll('.num-input').length).toBe(2);
      expect(el.querySelectorAll('.sdv-seg').length).toBe(2);
      expect(el.querySelector('.sdv-feel')).toBeTruthy();
      expect(el.querySelector('.sdv-notes-input')).toBeTruthy();
    });

    // Els 17 estils de ioga eren un mur de pastilles més alt que tota la
    // resta de la sessió junta.
    it('una tria llarga no es pinta sencera: s\'obre en una fulla', () => {
      const sport = makeSport({
        subtypes: [
          { id: 'a', name: 'Hatha' }, { id: 'b', name: 'Vinyasa' },
          { id: 'c', name: 'Yin' },   { id: 'd', name: 'Ashtanga' },
        ],
      });
      const { el, fixture } = buildEdit(sport, makeSession());

      const pick = el.querySelector<HTMLButtonElement>('.sdv-pick');
      expect(pick).toBeTruthy();
      expect(el.querySelector('.bottom-sheet')).toBeNull();

      pick!.click();
      fixture.detectChanges();
      expect(el.querySelectorAll('.sdv-sheet-opt').length).toBe(4);
    });

    it('un toc al + puja la xifra el pas que toca', () => {
      const { el, patches } = buildEdit(makeSport(), makeSession({ duration: 40 }));
      const plus = el.querySelectorAll<HTMLButtonElement>('.num-input button');
      plus[1].click();  // el + de la durada
      expect(patches).toEqual([{ duration: 45 }]);
    });

    // Pujar des de no-res és començar per baix, no per zero: una distància
    // que va de 0,5 en 0,5 no ha de posar-hi mig quilòmetre invisible.
    it('la primera pujada d\'una xifra buida parteix del mínim', () => {
      const { el, patches } = buildEdit(makeSport(), makeSession());
      const btns = el.querySelectorAll<HTMLButtonElement>('.num-input button');
      btns[3].click();  // el + de la distància (min 0.5)
      expect(patches).toEqual([{ metrics: { distance_km: 0.5 } }]);
    });

    it('escriure buit treu la xifra', () => {
      const { el, patches } = buildEdit(makeSport(), makeSession({ metrics: { distance_km: 10 } }));
      const input = el.querySelectorAll<HTMLInputElement>('.num-input input')[1];
      input.value = '';
      input.dispatchEvent(new Event('change'));
      expect(patches).toEqual([{ metrics: undefined }]);
    });

    // Zero gols és un resultat; zero minuts és no haver-hi posat res.
    it('la durada a zero vol dir sense durada', () => {
      const { el, patches } = buildEdit(makeSport(), makeSession({ duration: 5 }));
      el.querySelectorAll<HTMLButtonElement>('.num-input button')[0].click();
      expect(patches).toEqual([{ duration: undefined }]);
    });

    it('tornar a tocar la tria que ja hi era la treu', () => {
      const { el, patches } = buildEdit(makeSport(), makeSession({ metrics: { terrain: 'muntanya' } }));
      const segs = el.querySelectorAll<HTMLButtonElement>('.sdv-seg button');
      segs[1].click();  // «Muntanya», que és la que ja hi era
      expect(patches).toEqual([{ metrics: undefined }]);
    });

    it('una mètrica nova no s\'emporta les que ja hi havia', () => {
      const session = makeSession({ metrics: { distance_km: 10 } });
      const { el, patches } = buildEdit(makeSport(), session);
      el.querySelectorAll<HTMLButtonElement>('.sdv-seg button')[1].click();
      expect(patches).toEqual([{ metrics: { distance_km: 10, terrain: 'muntanya' } }]);
    });

    it('tornar a tocar la sensació que ja hi era la treu', () => {
      const { el, patches } = buildEdit(makeSport(), makeSession({ feeling: 3 }));
      const feels = el.querySelectorAll<HTMLButtonElement>('.sdv-feel button');
      feels[2].click();
      expect(patches).toEqual([{ feeling: undefined }]);
      feels[4].click();
      expect(patches[1]).toEqual({ feeling: 5 });
    });

    // Escriure no és decidir: la nota surt en deixar-la, no lletra a lletra.
    it('la nota es guarda en deixar-la', () => {
      const { el, patches } = buildEdit(makeSport(), makeSession());
      const ta = el.querySelector<HTMLTextAreaElement>('.sdv-notes-input')!;
      ta.value = '  Vent de cara  ';
      ta.dispatchEvent(new Event('input'));
      expect(patches).toEqual([]);
      ta.dispatchEvent(new Event('change'));
      expect(patches).toEqual([{ notes: 'Vent de cara' }]);
    });

    // El context és justament el que desapareixia quan el formulari tapava la
    // sessió, i és el que diu si la xifra que toques val alguna cosa.
    it('el context no desapareix mentre es toca la xifra', () => {
      allLoaded.set(true);
      sessions.set([
        makeSession({ id: 'a', date: '2024-01-01', duration: 30 }),
        makeSession({ id: 'b', date: '2024-02-01', duration: 30 }),
      ]);
      const { el } = buildEdit(makeSport(), makeSession({ duration: 90 }));

      const durada = rows(el).find(r => r.label === 'Durada')!;
      expect(durada.note).toBe('+60 min que de costum');
      expect(durada.record).toBeTrue();
    });

    // Un pla del futur encara no s'ha viscut.
    it('la sensació no hi és si el dia encara ha de venir', () => {
      const fixture = TestBed.createComponent(SportDetailComponent);
      fixture.componentRef.setInput('sport', makeSport());
      fixture.componentRef.setInput('session', makeSession());
      fixture.componentRef.setInput('editable', true);
      fixture.componentRef.setInput('feelingEditable', false);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.sdv-feel')).toBeNull();
      expect(el.querySelector('.sdv-notes-input')).toBeTruthy();
    });

    // El feed no canvia gens: allà el detall segueix sent per llegir.
    it('llegint no hi ha cap control', () => {
      const el = build(makeSport(), makeSession({ duration: 40 }));
      expect(el.querySelector('.num-input')).toBeNull();
      expect(el.querySelector('.sdv-seg')).toBeNull();
      expect(el.querySelector('.sdv-notes-input')).toBeNull();
    });
  });
});
