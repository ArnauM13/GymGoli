import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';

import { InsightDetailSheetComponent } from './insight-detail-sheet.component';
import { FitnessInsight, InsightBar, InsightChart } from '../../../core/models/insight.model';

function makeInsight(chart: InsightChart, overrides: Partial<FitnessInsight> = {}): FitnessInsight {
  return {
    type: 'tendencia_volum',
    mascot: 'both',
    emoji: '📈',
    title: 'Puges de ritme',
    stat: '3,0 activitats per setmana · abans 1,0',
    message: 'Dues activitats més cada setmana.',
    color: '#0288d1',
    level: 4,
    strength: 30,
    cooldownDays: 7,
    detail: {
      headline: 'Aquest mes portes 12 activitats; el mes passat en vas fer 4.',
      chart,
      facts: [{ label: 'Aquest mes', value: '12 activitats' }],
      meaning: 'Compara els últims 28 dies amb els 28 d\'abans.',
    },
    ...overrides,
  };
}

function bars(...values: number[]): InsightBar[] {
  return values.map((value, i) => ({ label: `b${i}`, value }));
}

/** Un dit que baixa pel full, de `from` a `to`. */
function swipeDown(el: HTMLElement, from: number, to: number): void {
  for (const [type, y] of [['touchstart', from], ['touchmove', (from + to) / 2], ['touchmove', to], ['touchend', to]] as const) {
    const t = new Touch({ identifier: 1, target: el, clientX: 0, clientY: y });
    el.dispatchEvent(new TouchEvent(type, {
      touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true, cancelable: true,
    }));
  }
}

describe('InsightDetailSheetComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<InsightDetailSheetComponent>>;
  let component: InsightDetailSheetComponent;

  /** Munta el full amb un gràfic concret; el període, si no es diu, ja hi és. */
  function build(partial: Omit<InsightChart, 'range'> & { range?: string }): void {
    const chart: InsightChart = { range: '3 de març – 23 d\'abril', ...partial };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [InsightDetailSheetComponent],
      providers: [{ provide: MatDialog, useValue: { openDialogs: [] } }],
    });
    fixture = TestBed.createComponent(InsightDetailSheetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('insight', makeInsight(chart));
    fixture.detectChanges();
  }

  // ── Escala ───────────────────────────────────────────────────────────────

  it('mesura les barres contra la més alta', () => {
    build({ caption: 'Activitats per setmana', bars: bars(1, 2, 4) });

    expect(component.pct(4)).toBe(100);
    expect(component.pct(2)).toBe(50);
    expect(component.pct(0)).toBe(0);
  });

  it('deixa la línia de referència dins del gràfic encara que superi les barres', () => {
    // Un objectiu de 6 amb setmanes d'1 i 2: si l'escala només mirés les
    // barres, la ratlla quedaria fora del dibuix i no es veuria.
    build({
      caption: 'Activitats per setmana',
      bars: bars(1, 2),
      reference: { value: 6, label: 'objectiu 6' },
    });

    expect(component.pct(6)).toBe(100);
    expect(component.pct(2)).toBeCloseTo(33.3, 0);
  });

  it('no es divideix per zero quan encara no hi ha res', () => {
    build({ caption: 'Activitats per setmana', bars: bars(0, 0) });

    expect(component.pct(0)).toBe(0);
  });

  // ── Etiquetes ────────────────────────────────────────────────────────────

  it('escriu el número només a l\'última barra destacada', () => {
    build({
      caption: 'Activitats per setmana',
      bars: [
        { label: 'a', value: 1 },
        { label: 'b', value: 2, highlight: true },
        { label: 'c', value: 3, highlight: true },
      ],
    });

    expect(component.valueIndex()).toBe(2);
  });

  it('no n\'escriu cap si no hi ha res destacat', () => {
    build({ caption: 'Activitats per setmana', bars: bars(1, 2) });

    expect(component.valueIndex()).toBe(-1);
  });

  it('amb poques barres, totes porten etiqueta', () => {
    build({ caption: 'Activitats per setmana', bars: bars(1, 2, 3) });

    expect([0, 1, 2].every(i => component.showXLabel(i))).toBe(true);
  });

  it('amb moltes barres deixa les puntes i la destacada, que si no es toquen', () => {
    build({
      caption: 'Activitats per setmana',
      bars: bars(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
        .map((b, i) => (i === 5 ? { ...b, highlight: true } : b)),
    });

    expect(component.showXLabel(0)).toBe(true);
    expect(component.showXLabel(5)).toBe(true);
    expect(component.showXLabel(11)).toBe(true);
    expect(component.showXLabel(3)).toBe(false);
  });

  // ── Accessibilitat ───────────────────────────────────────────────────────

  it('llegeix el gràfic sencer per a qui no el veu', () => {
    build({
      caption: 'Activitats per setmana',
      bars: [{ label: '3/3', value: 2 }, { label: 'ara', value: 5, display: '5 kg' }],
      reference: { value: 3, label: 'objectiu 3' },
    });

    const label = component.chartLabel();
    expect(label).toContain('Activitats per setmana');
    expect(label).toContain('3/3: 2');
    expect(label).toContain('ara: 5 kg');
    expect(label).toContain('objectiu 3');
  });

  it('el gràfic va marcat com a imatge amb el seu text', () => {
    build({ caption: 'Activitats per setmana', bars: bars(1, 2) });

    const plot = fixture.nativeElement.querySelector('.ids-plot') as HTMLElement;
    expect(plot.getAttribute('role')).toBe('img');
    expect(plot.getAttribute('aria-label')).toContain('Activitats per setmana');
  });

  // ── Tancar ───────────────────────────────────────────────────────────────

  it('es tanca amb Escape', () => {
    build({ caption: 'Activitats per setmana', bars: bars(1, 2) });
    let closed = false;
    component.close.subscribe(() => (closed = true));

    component.onEscape();

    expect(closed).toBe(true);
  });

  it('es tanca arrossegant-lo cap avall', fakeAsync(() => {
    build({ caption: 'Activitats per setmana', bars: bars(1, 2) });
    let closed = false;
    component.close.subscribe(() => (closed = true));

    const sheet = fixture.nativeElement.querySelector('.ids-sheet') as HTMLElement;
    document.body.appendChild(fixture.nativeElement);
    swipeDown(sheet, 100, 300);
    tick(400);
    fixture.nativeElement.remove();

    expect(closed).toBe(true);
  }));

  it('pinta les xifres i l\'explicació', () => {
    build({ caption: 'Activitats per setmana', bars: bars(1, 2) });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Aquest mes portes 12 activitats');
    expect(text).toContain('Compara els últims 28 dies');
    expect(text).toContain('12 activitats');
  });
});
