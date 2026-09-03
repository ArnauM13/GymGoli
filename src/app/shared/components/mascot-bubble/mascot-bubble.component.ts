import { Component, computed, input, output } from '@angular/core';

import { MASCOTS, Mascot, MascotMeta } from '../../../core/models/mascot.model';

/**
 * El gos surt a baix a la dreta i et diu una cosa, amb bafarada de còmic.
 *
 * És una capa i res més: el que diu ja surt també a la targeta de sota, així
 * que tancar-la no et fa perdre res. Per això el botó de tancar és gran i la
 * bafarada no bloqueja res del darrere.
 */
@Component({
  selector: 'app-mascot-bubble',
  standalone: true,
  template: `
    <div class="mb-wrap" [style.--mb-lift.px]="lift()">
      <div class="mb-bubble" role="status">
        <p class="mb-text">{{ message() }}</p>
        <button class="mb-close" type="button" (click)="close.emit()"
                aria-label="Tancar el missatge">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>
      <span class="mb-dogs" aria-hidden="true">
        <img class="mb-dog" [class.mb-dog--pair]="mascot() === 'both'"
             [src]="figure().figure" alt="">
      </span>
    </div>
  `,
  styles: [`
    .mb-wrap {
      position: fixed; right: 14px; z-index: 91;
      bottom: calc(var(--nav-height) + var(--mb-lift, 16px));
      max-width: calc(100% - 28px);
      display: flex; align-items: flex-end; gap: 7px;
      animation: mb-in 0.32s cubic-bezier(0.34, 1.4, 0.64, 1) both;
      pointer-events: none;
    }

    @keyframes mb-in {
      from { opacity: 0; transform: translateY(14px) scale(0.94); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }

    .mb-bubble {
      position: relative; pointer-events: auto;
      background: var(--c-card);
      border: 1px solid var(--c-border-2);
      border-radius: 16px 16px 4px 16px;
      box-shadow: 0 6px 22px var(--c-shadow-md);
      padding: 10px 38px 10px 14px;
      display: flex; align-items: center;
      min-width: 0;
    }

    /* La cua apunta al gos, que sempre és a la dreta de la bafarada. */
    .mb-bubble::after {
      content: ''; position: absolute; right: -6px; bottom: 11px;
      width: 11px; height: 11px; background: var(--c-card);
      border-top: 1px solid var(--c-border-2); border-right: 1px solid var(--c-border-2);
      transform: rotate(45deg); border-radius: 0 3px 0 0;
    }

    .mb-text {
      margin: 0; font-size: 13px; font-weight: 600; line-height: 1.35;
      color: var(--c-text);
    }

    .mb-close {
      position: absolute; top: 50%; right: 4px; transform: translateY(-50%);
      width: 30px; height: 30px; border: none; background: transparent;
      cursor: pointer; touch-action: manipulation; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      border-radius: 50%; transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 1px; }
    }

    /* Aquí surten grans i retallats del fons, sense cercle ni marc: la
     * silueta ja diu qui és, i emmarcar-los només els faria petits. */
    .mb-dogs { display: flex; align-items: flex-end; flex-shrink: 0; }

    .mb-dog {
      height: 96px; width: auto; display: block;
      filter: drop-shadow(0 3px 8px var(--c-shadow-md));
      /* El dibuix original acaba a mitja pitrera. Sense això, la vora recta
       * de sota es veu com un retall; amb el degradat sembla que s'esvaeixi. */
      mask-image: linear-gradient(to bottom, #000 84%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, #000 84%, transparent 100%);
    }

    /* Quan hi són tots dos fem servir el dibuix on ja surten junts: encavalcar
     * dues retallades deixa una costura al mig. Com que és més ample, baixa
     * una mica d'alçada per ocupar el mateix. */
    .mb-dog--pair { height: 82px; }

    @media (prefers-reduced-motion: reduce) {
      .mb-wrap { animation: none; }
    }
  `],
})
export class MascotBubbleComponent {
  /** Qui parla. `both` pinta els dos encavalcats. */
  readonly mascot = input.required<Mascot>();

  readonly message = input.required<string>();

  /**
   * Píxels per sobre de la barra de navegació. Puja-la quan la pantalla ja
   * té alguna cosa fixa a baix (a `train`, la targeta de suggeriment).
   */
  readonly lift = input(16);

  readonly close = output<void>();

  /**
   * Una sola imatge sempre. Per a `both` no s'encavalquen dues retallades:
   * es fa servir el dibuix on el Marley i el Xoco ja surten junts.
   */
  readonly figure = computed((): MascotMeta => MASCOTS[this.mascot()]);
}
