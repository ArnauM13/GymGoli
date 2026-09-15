import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

import { MASCOTS, Mascot } from '../../../core/models/mascot.model';

export type FeedbackVariant = 'success' | 'error' | 'info';

export interface FeedbackToastData {
  message: string;
  variant: FeedbackVariant;
  /**
   * Qui ho diu.
   *
   * Tot el que ha anat bé ho diu un gos: el que toca gimnàs és del Marley, el
   * que toca esport és del Xoco i la resta és de tots dos (vegeu
   * `MASCOTES.md`). Qui truca no ho ha de recordar —`FeedbackService` hi posa
   * `both` si no se'n diu cap—, i per això aquí sempre n'hi ha un.
   *
   * Els errors no en porten: cap dels dos dona males notícies.
   */
  mascot?: Mascot;
}

const VARIANT_ICON: Record<FeedbackVariant, string> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
};

/**
 * La confirmació del que acabes de fer.
 *
 * És una targeta de la casa, no un rètol de sistema: mides, vores i ombra de
 * `DESIGN.md`, la barra de color de 5px a l'esquerra com qualsevol targeta
 * d'activitat, i la cara de qui ho diu en gran. Va ample —fins on hi cap la
 * pàgina— perquè una frase hi càpiga d'una línia i es llegeixi de passada,
 * que és tot el temps que té.
 */
@Component({
  selector: 'app-feedback-toast',
  standalone: true,
  template: `
    <div class="fb-toast" [class]="'fb-toast--' + data.variant">
      <div class="fb-bar" aria-hidden="true"></div>
      @if (dog; as d) {
        <span class="fb-dog-ring" aria-hidden="true">
          <img class="fb-dog" [src]="d.avatar" [alt]="d.alt">
        </span>
      } @else {
        <span class="fb-icon-wrap" aria-hidden="true">
          <span class="material-symbols-outlined fb-icon">{{ icon }}</span>
        </span>
      }
      <span class="fb-msg">{{ data.message }}</span>
      <button type="button" class="fb-close" (click)="dismiss()" aria-label="Tancar">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  `,
  styles: [`
    /* L'ample el mana el panell (styles.scss): aquí dins s'omple sempre, que
       una confirmació estreta enmig de la pantalla es llegia com un avís del
       navegador i no com una cosa de l'app. */
    .fb-toast {
      display: flex; align-items: center; gap: 11px;
      width: 100%; box-sizing: border-box;
      padding: 12px 10px 12px 0;
      border-radius: 18px; overflow: hidden;
      background: var(--c-card); color: var(--c-text);
      border: 1.5px solid var(--fb-c, var(--c-border-2));
      box-shadow: 0 10px 30px var(--c-shadow-md), 0 3px 10px var(--c-shadow);
      animation: fb-in 0.26s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    /* La barra de color, com a qualsevol targeta d'activitat. */
    .fb-bar { width: 5px; align-self: stretch; flex-shrink: 0; background: var(--fb-c); }
    .fb-toast--success { --fb-c: #43a047; }
    .fb-toast--error   { --fb-c: #ef5350; }
    .fb-toast--info    { --fb-c: var(--c-brand); }

    /* ── Qui ho diu ──
       El gos va gran i amb anella del color que toca: és la cara de l'app
       dient-te que allò ha quedat guardat. */
    .fb-dog-ring {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 42px; height: 42px; border-radius: 50%;
      background: color-mix(in srgb, var(--fb-c) 14%, var(--c-card));
      border: 1.5px solid color-mix(in srgb, var(--fb-c) 45%, transparent);
    }
    .fb-dog { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; display: block; }

    .fb-icon-wrap {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 42px; height: 42px; border-radius: 13px;
      background: color-mix(in srgb, var(--fb-c) 12%, var(--c-card));
    }
    .fb-icon {
      font-size: 24px; color: var(--fb-c);
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }

    .fb-msg { flex: 1; min-width: 0; font-size: 14.5px; font-weight: 700; line-height: 1.35; }
    .fb-close {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 30px; height: 30px; border-radius: 50%; border: none;
      background: transparent; color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); color: var(--c-text); }
    }
    @keyframes fb-in {
      from { transform: translateY(16px) scale(0.97); opacity: 0; }
      to   { transform: translateY(0)    scale(1);    opacity: 1; }
    }
  `],
})
export class FeedbackToastComponent {
  readonly data = inject<FeedbackToastData>(MAT_SNACK_BAR_DATA);
  private readonly ref = inject(MatSnackBarRef<FeedbackToastComponent>);
  readonly icon = VARIANT_ICON[this.data.variant];
  /** La cara de qui ho diu. Només falta als errors. */
  readonly dog = this.data.mascot ? MASCOTS[this.data.mascot] : null;

  dismiss(): void {
    this.ref.dismiss();
  }
}
