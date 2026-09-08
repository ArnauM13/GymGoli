import { Directive, ElementRef, NgZone, OnDestroy, inject, input, output } from '@angular/core';

/**
 * Arrossegar un full de baix cap avall per tancar-lo.
 *
 * Un full que puja des de baix demana que es pugui tornar a baixar amb el dit:
 * al mòbil la creu queda a dalt a la dreta, lluny del polze, i el gest és el
 * que tothom prova primer. La creu es queda on és —el gest la complementa, no
 * la substitueix, perquè amb ratolí o teclat no hi ha dit.
 *
 * Com decideix si és un gest o un scroll: el full pot tenir contingut més alt
 * que ell mateix, així que l'arrossegament només comença si el contingut ja és
 * a dalt de tot (`scrollTop <= 0`) i el dit baixa més del que es mou de costat.
 * A partir d'aquí el gest es queda l'esdeveniment (`preventDefault`) perquè el
 * navegador no comenci a desplaçar la pàgina de sota alhora.
 *
 * S'aplica al panell (`.bottom-sheet`); el fosc de darrere se li passa per
 * `appSheetDragBackdrop` perquè s'apagui amb el mateix moviment.
 *
 *   <div #bd class="bottom-sheet-backdrop" (click)="close()"></div>
 *   <div class="bottom-sheet" appSheetDrag [appSheetDragBackdrop]="bd"
 *        (sheetDragDismiss)="close()"> … </div>
 */

/** Quant ha de baixar el dit perquè, en deixar-lo anar, el full es tanqui. */
const DISMISS_PX = 92;
/** …o a quina velocitat (px/ms), perquè un cop sec també compti encara que sigui curt. */
const DISMISS_VELOCITY = 0.6;
/** El que s'ha de moure el dit abans de decidir si és un gest o un scroll. */
const START_PX = 6;
/** Resistència quan s'estira cap amunt: es mou, però costa i no arriba enlloc. */
const UP_DRAG = 0.25;
/** Durada de la sortida quan el gest ja ha decidit que es tanca. */
const EXIT_MS = 200;

@Directive({
  selector: '[appSheetDrag]',
  standalone: true,
  host: {
    // El full continua desplaçant-se amb el dit (`pan-y`), i quan arriba al
    // final no encomana el moviment a la pàgina de sota (`contain`): si no, el
    // gest de tancar acabaria desplaçant el que hi ha darrere del fosc.
    '[style.touch-action]': '"pan-y"',
    '[style.overscroll-behavior]': '"contain"',
  },
})
export class SheetDragDirective implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);

  /** El fosc de darrere, per apagar-lo al mateix ritme que baixa el full. */
  readonly backdrop = input<HTMLElement | null>(null, { alias: 'appSheetDragBackdrop' });

  /** El gest ha arribat prou avall: qui l'escolta ha de tancar el full. */
  readonly dismissed = output<void>({ alias: 'sheetDragDismiss' });

  private startY = 0;
  private startX = 0;
  private startAt = 0;
  private offset = 0;
  /** `null` mentre encara no se sap si el dit arrossega o desplaça. */
  private dragging: boolean | null = null;
  private pointerId: number | null = null;
  private closing = false;

  constructor() {
    const el = this.host.nativeElement;
    // Fora de la zona: un gest dispara desenes d'esdeveniments per segon i cap
    // no canvia l'estat d'Angular, només l'estil de dos elements.
    this.zone.runOutsideAngular(() => {
      el.addEventListener('touchstart', this.onTouchStart, { passive: true });
      el.addEventListener('touchmove', this.onTouchMove, { passive: false });
      el.addEventListener('touchend', this.onTouchEnd);
      el.addEventListener('touchcancel', this.onTouchCancel);
      el.addEventListener('pointerdown', this.onPointerDown);
    });
  }

  ngOnDestroy(): void {
    const el = this.host.nativeElement;
    el.removeEventListener('touchstart', this.onTouchStart);
    el.removeEventListener('touchmove', this.onTouchMove);
    el.removeEventListener('touchend', this.onTouchEnd);
    el.removeEventListener('touchcancel', this.onTouchCancel);
    el.removeEventListener('pointerdown', this.onPointerDown);
    this.detachPointer();
  }

  // ── Dit ────────────────────────────────────────────────────────────────────

  private readonly onTouchStart = (ev: TouchEvent): void => {
    if (ev.touches.length !== 1) return;
    this.begin(ev.touches[0].clientX, ev.touches[0].clientY);
  };

  private readonly onTouchMove = (ev: TouchEvent): void => {
    if (this.dragging === false || ev.touches.length !== 1) return;
    const t = ev.touches[0];
    if (this.move(t.clientX, t.clientY) && ev.cancelable) ev.preventDefault();
  };

  private readonly onTouchEnd = (): void => { this.end(); };
  private readonly onTouchCancel = (): void => { this.cancel(); };

  // ── Ratolí i llapis ────────────────────────────────────────────────────────
  // El mateix gest amb el ratolí: no cal per a res (hi ha la creu i l'Escape),
  // però qui el prova espera que respongui igual.

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (ev.pointerType === 'touch' || ev.button !== 0) return;
    this.pointerId = ev.pointerId;
    this.begin(ev.clientX, ev.clientY);
    this.zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
      window.addEventListener('pointercancel', this.onPointerCancel);
    });
  };

  private readonly onPointerMove = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointerId) return;
    // Sense això el navegador seleccionaria el text del full mentre s'arrossega.
    if (this.move(ev.clientX, ev.clientY)) ev.preventDefault();
  };

  private readonly onPointerUp = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointerId) return;
    this.detachPointer();
    this.end();
  };

  private readonly onPointerCancel = (ev: PointerEvent): void => {
    if (ev.pointerId !== this.pointerId) return;
    this.detachPointer();
    this.cancel();
  };

  private detachPointer(): void {
    this.pointerId = null;
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
  }

  // ── El gest ────────────────────────────────────────────────────────────────

  private begin(x: number, y: number): void {
    if (this.closing) return;
    this.startX = x;
    this.startY = y;
    this.startAt = Date.now();
    this.offset = 0;
    // Encara no se sap què és: ho dirà el primer moviment que passi el llindar.
    this.dragging = null;
  }

  /** Mou el full si el gest ja s'ha decidit. Torna `true` si l'ha de retenir. */
  private move(x: number, y: number): boolean {
    if (this.closing || this.dragging === false) return false;

    const dy = y - this.startY;
    const dx = x - this.startX;

    if (this.dragging === null) {
      if (Math.abs(dy) < START_PX && Math.abs(dx) < START_PX) return false;
      // Baixar amb el contingut ja a dalt de tot és l'única lectura que no pot
      // ser un scroll; qualsevol altra cosa es deixa al navegador.
      const canDrag = dy > 0 && Math.abs(dy) > Math.abs(dx) && this.host.nativeElement.scrollTop <= 0;
      this.dragging = canDrag;
      if (!canDrag) return false;
      // L'animació d'entrada té `fill: both`, i mentre s'aguanta guanya a
      // qualsevol `transform` en línia: s'ha de treure per poder moure el full.
      this.host.nativeElement.style.animation = 'none';
      this.host.nativeElement.style.transition = 'none';
      const bd = this.backdrop();
      if (bd) { bd.style.animation = 'none'; bd.style.transition = 'none'; }
    }

    this.offset = dy > 0 ? dy : dy * UP_DRAG;
    this.paint(this.offset);
    return true;
  }

  private end(): void {
    if (this.closing || !this.dragging) { this.cancel(); return; }
    this.dragging = null;

    const elapsed = Math.max(1, Date.now() - this.startAt);
    const velocity = this.offset / elapsed;
    if (this.offset >= DISMISS_PX || (this.offset > START_PX && velocity >= DISMISS_VELOCITY)) {
      this.exit();
    } else {
      this.springBack();
    }
  }

  private cancel(): void {
    this.dragging = null;
    if (!this.closing && this.offset !== 0) this.springBack();
  }

  /** Fins on ha baixat, de 0 (a lloc) a 1 (fora). */
  private progress(offset: number): number {
    const height = this.host.nativeElement.offsetHeight || 1;
    return Math.max(0, Math.min(1, offset / height));
  }

  private paint(offset: number): void {
    const el = this.host.nativeElement;
    el.style.transform = `translateY(${offset}px)`;
    const bd = this.backdrop();
    // El fosc s'aclareix amb el full, però no arriba a desaparèixer mentre el
    // gest es pugui desfer: seguir veient que hi ha un full obert.
    if (bd) bd.style.opacity = `${1 - this.progress(offset) * 0.55}`;
  }

  /** Torna al seu lloc: el gest no ha arribat prou lluny. */
  private springBack(): void {
    const el = this.host.nativeElement;
    const bd = this.backdrop();
    this.offset = 0;
    if (this.reducedMotion()) {
      el.style.transform = '';
      if (bd) bd.style.opacity = '';
      return;
    }
    el.style.transition = 'transform 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
    el.style.transform = 'translateY(0)';
    if (bd) {
      bd.style.transition = 'opacity 0.3s ease';
      bd.style.opacity = '1';
    }
  }

  /** Acaba de baixar sol i avisa qui l'ha de treure del DOM. */
  private exit(): void {
    this.closing = true;
    const el = this.host.nativeElement;
    const bd = this.backdrop();
    const done = (): void => this.zone.run(() => this.dismissed.emit());

    if (this.reducedMotion()) { done(); return; }

    el.style.transition = `transform ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`;
    el.style.transform = `translateY(${el.offsetHeight + 40}px)`;
    el.style.opacity = '0';
    if (bd) {
      bd.style.transition = `opacity ${EXIT_MS}ms ease-in`;
      bd.style.opacity = '0';
    }
    // Per temps i no per `transitionend`: si la pestanya passa a segon pla
    // l'esdeveniment no arriba mai i el full es quedaria penjat fora de la
    // pantalla, obert i sense que es vegi.
    setTimeout(done, EXIT_MS);
  }

  private reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
