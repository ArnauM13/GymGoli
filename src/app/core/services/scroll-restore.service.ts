import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';

/** Qui fa scroll a l'app: el `<main>` de l'`AppComponent`, no la finestra. */
const SCROLLER = '.app-content';

/** Quantes pàgines recorden on eres. Prou per a l'anar i venir d'una sessió;
 *  no és un historial, és una memòria curta. */
const MAX_ENTRIES = 10;

/** La pàgina, sense query params ni fragment: `/train?date=…` i `/train` són
 *  el mateix lloc, i canviar-ne un filtre no és canviar de pantalla. */
function pathOf(url: string): string {
  return url.split('?')[0].split('#')[0];
}

/**
 * Cada pàgina s'obre a dalt, i tornar enrere et torna on eres.
 *
 * Qui es mou aquí no és la finestra sinó `.app-content`, i per això el router
 * no ho pot fer sol: `scrollPositionRestoration` mira el document, que en
 * aquesta app no es mou mai. Sense això, obrir una subpàgina des del final
 * d'una de llarga —Progrés → «Mira-t'ho de prop»— deixava la pàgina nova a
 * mitja alçada: la pantalla «baixava» i semblava que el clic no hagués
 * obert res.
 *
 * Canviar només un query param (un filtre, una fila seleccionada) no és
 * canviar de pantalla i no toca la posició.
 */
@Injectable({ providedIn: 'root' })
export class ScrollRestoreService {
  private readonly router = inject(Router);
  private readonly doc    = inject(DOCUMENT);

  /** On eres a cada pàgina, per si hi tornes. */
  private readonly positions = new Map<string, number>();

  /** De la navegació que s'està fent: d'on venim i si és un «enrere». */
  private fromPath = '';
  private restoring = false;

  constructor() {
    this.router.events.subscribe(e => {
      if (e instanceof NavigationStart) this.onStart();
      else if (e instanceof NavigationEnd) this.onEnd(e.urlAfterRedirects);
    });
  }

  private onStart(): void {
    this.fromPath = pathOf(this.router.url);
    this.remember(this.fromPath, this.scroller()?.scrollTop ?? 0);

    // Un «enrere» torna on eres; qualsevol altra navegació comença a dalt.
    // El botó d'enrere de dins l'app navega com qualsevol altre (no és cap
    // `popstate`), i per això s'hi anuncia amb `restoreScroll`.
    const nav = this.router.getCurrentNavigation();
    this.restoring = nav?.trigger === 'popstate'
      || nav?.extras.state?.['restoreScroll'] === true;
  }

  private onEnd(url: string): void {
    const toPath = pathOf(url);
    if (toPath === this.fromPath) return;
    this.apply(this.restoring ? this.positions.get(toPath) ?? 0 : 0);
  }

  private apply(top: number): void {
    this.setTop(top);
    // La pàgina nova encara s'està muntant: demanar-li la posició abans que
    // tingui contingut la deixa retallada a zero. S'hi torna un cop pintada.
    setTimeout(() => this.setTop(top));
  }

  private setTop(top: number): void {
    const el = this.scroller();
    if (el) el.scrollTop = top;
  }

  private scroller(): HTMLElement | null {
    return this.doc.querySelector<HTMLElement>(SCROLLER);
  }

  private remember(path: string, top: number): void {
    this.positions.delete(path);
    this.positions.set(path, top);
    if (this.positions.size > MAX_ENTRIES) {
      this.positions.delete(this.positions.keys().next().value!);
    }
  }
}
