import { Component, input, model } from '@angular/core';

/**
 * El menú de tres punts d'una pàgina de sessió: un botó rodó flotant a baix a
 * la dreta i, en obrir-lo, les opcions just al damunt. El que no es fa cada
 * dia —ordenar, unir amb una altra activitat, compartir, esborrar— hi viu
 * dins, que un botó per cada cosa es menja la pantalla justament on hi ha el
 * que estàs mirant.
 *
 * És el mateix a l'entrenament i a la sessió d'esport, i per això és un sol
 * component. Les opcions les escriu qui el fa servir, amb `.fab-menu-item`
 * (i `.fab-menu-item--danger` per esborrar): com que hi arriben projectades,
 * el seu estil és global (`styles.scss`), al costat del de la fulla de baix.
 */
@Component({
  selector: 'app-fab-menu',
  standalone: true,
  host: { class: 'fab-menu' },
  template: `
    @if (open()) {
      <div class="fab-menu-backdrop" (click)="open.set(false)" aria-hidden="true"></div>
      <div class="fab-menu-dropdown" role="menu" [attr.aria-label]="label()">
        <ng-content />
      </div>
    }
    <button class="fab-menu-btn" [class.fab-menu-btn--open]="open()"
            (click)="open.set(!open())"
            [attr.aria-label]="label()" [attr.aria-expanded]="open()">
      <span class="material-symbols-outlined">more_vert</span>
    </button>
  `,
})
export class FabMenuComponent {
  /** Obert o tancat. És un `model()` perquè la pàgina també el tanca: en
   *  triar una opció, en obrir una fulla, en sortir de la sessió. */
  readonly open  = model(false);
  /** Què és aquest menú, per a qui no el veu. */
  readonly label = input('Opcions');
}
