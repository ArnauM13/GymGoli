import { Component, ElementRef, viewChild } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { SheetDragDirective } from './sheet-drag.directive';

@Component({
  standalone: true,
  imports: [SheetDragDirective],
  template: `
    <div #bd class="bd" style="opacity: 1"></div>
    <div #sheet class="sheet" style="height: 300px; overflow-y: auto"
         appSheetDrag [appSheetDragBackdrop]="bd" (sheetDragDismiss)="closed = closed + 1">
      <div style="height: 900px"></div>
    </div>
  `,
})
class HostComponent {
  closed = 0;
  readonly sheet   = viewChild.required<ElementRef<HTMLElement>>('sheet');
  readonly backdrop = viewChild.required<ElementRef<HTMLElement>>('bd');
}

describe('SheetDragDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let sheet: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    sheet = host.sheet().nativeElement;
    // El full ha de ser al document perquè tingui alçada real: el gest en
    // depèn per saber fins on ha baixat.
    document.body.appendChild(fixture.nativeElement);
  });

  afterEach(() => fixture.nativeElement.remove());

  function fire(type: string, y: number, x = 0): void {
    const t = new Touch({ identifier: 1, target: sheet, clientX: x, clientY: y });
    sheet.dispatchEvent(new TouchEvent(type, {
      touches: type === 'touchend' || type === 'touchcancel' ? [] : [t],
      changedTouches: [t], bubbles: true, cancelable: true,
    }));
  }

  /** Un arrossegament complet de `from` a `to`, en dos passos. */
  function drag(from: number, to: number, x = 0): void {
    fire('touchstart', from, x);
    fire('touchmove', from + (to - from) / 2, x);
    fire('touchmove', to, x);
    fire('touchend', to, x);
  }

  it('tanca el full quan s\'arrossega prou avall', fakeAsync(() => {
    drag(100, 260);
    tick(400);

    expect(host.closed).toBe(1);
  }));

  it('tanca amb un cop sec, encara que sigui curt', fakeAsync(() => {
    // 40 px en menys d\'un mil·lisegon: poc recorregut, molta velocitat.
    drag(100, 140);
    tick(400);

    expect(host.closed).toBe(1);
  }));

  it('torna a lloc si el gest es queda curt i lent', fakeAsync(() => {
    fire('touchstart', 100);
    fire('touchmove', 110);
    tick(300);          // prou estona perquè no compti com un cop sec
    fire('touchmove', 130);
    fire('touchend', 130);
    tick(400);

    expect(host.closed).toBe(0);
    expect(sheet.style.transform).toBe('translateY(0px)');
  }));

  it('no es mou si el contingut no és a dalt de tot: allà el dit desplaça', fakeAsync(() => {
    sheet.scrollTop = 120;

    drag(100, 300);
    tick(400);

    expect(host.closed).toBe(0);
    expect(sheet.style.transform).toBe('');
  }));

  it('no es tanca amb un gest de costat', fakeAsync(() => {
    fire('touchstart', 100, 20);
    fire('touchmove', 108, 160);
    fire('touchmove', 112, 300);
    fire('touchend', 112, 300);
    tick(400);

    expect(host.closed).toBe(0);
    expect(sheet.style.transform).toBe('');
  }));

  it('un gest cap amunt no és cosa seva: el full ni es mou', fakeAsync(() => {
    drag(200, 100);
    tick(400);

    expect(host.closed).toBe(0);
    expect(sheet.style.transform).toBe('');
  }));

  it('si el gest torna per sobre d\'on va començar, el full amb prou feines puja', () => {
    fire('touchstart', 200);
    fire('touchmove', 260);   // avall: el gest ja és seu
    fire('touchmove', 160);   // i ara 40 px per sobre del punt de partida

    // Rubber band: es mou, però molt menys del que ha pujat el dit.
    expect(sheet.style.transform).toBe('translateY(-10px)');
  });

  it('el fosc de darrere s\'apaga mentre el full baixa', () => {
    fire('touchstart', 100);
    fire('touchmove', 160);

    const opacity = Number(host.backdrop().nativeElement.style.opacity);
    expect(opacity).toBeLessThan(1);
    expect(opacity).toBeGreaterThan(0);
  });

  it('un gest interromput deixa el full on era', fakeAsync(() => {
    fire('touchstart', 100);
    fire('touchmove', 150);
    fire('touchcancel', 150);
    tick(400);

    expect(host.closed).toBe(0);
    expect(sheet.style.transform).toBe('translateY(0px)');
  }));
});
