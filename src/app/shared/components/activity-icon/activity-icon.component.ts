import { Component, computed, input } from '@angular/core';

import { MASCOTS, Mascot } from '../../../core/models/mascot.model';

/**
 * La icona d'una activitat, amb el gos que l'acompanya a la cantonada.
 *
 * Mana la icona: és el que has de reconèixer d'un cop d'ull, i el gos és
 * l'afegit. Per això va petit i a baix a la dreta, on el glif gairebé no té
 * tinta — li toca el cantó en comptes de menjar-se'l.
 *
 * Viu en un sol lloc a posta. Abans estava copiat a la targeta del feed i al
 * suggeriment d'Entrenament, i les dues còpies van acabar amb mides diferents.
 */
@Component({
  selector: 'app-activity-icon',
  standalone: true,
  host: { '[attr.aria-hidden]': '"true"', '[style.--ai-c]': 'color()' },
  template: `
    <span class="material-symbols-outlined ai-icon">{{ icon() }}</span>
    @if (dog(); as d) {
      <img class="ai-dog" [src]="d.avatar" alt="">
    }
  `,
  styles: [`
    /* Quadrat: la icona i el gos han de quedar centrats dins la mateixa
       caixa a totes les targetes, sigui d'esport o d'entrenament. */
    :host {
      width: 38px; height: 38px; flex-shrink: 0; position: relative;
      display: flex; align-items: center; justify-content: center;
    }

    .ai-icon {
      font-size: 28px; line-height: 1; color: var(--ai-c, var(--c-text-2));
      font-variation-settings: 'FILL' 1;
    }

    .ai-dog {
      position: absolute; right: -3px; bottom: -3px;
      width: 18px; height: 18px; border-radius: 50%;
      object-fit: cover; display: block;
      border: 1.5px solid var(--c-card);
    }
  `],
})
export class ActivityIconComponent {
  /** Nom del glif de Material Symbols. */
  readonly icon = input.required<string>();

  /** Color de l'activitat. Sense color, la icona agafa el to neutre. */
  readonly color = input<string | null>(null);

  /** Qui acompanya. `null` deixa la icona sola. */
  readonly mascot = input<Mascot | null>(null);

  protected readonly dog = computed(() => {
    const m = this.mascot();
    // `both` no té sentit aquí: una activitat és de gimnàs o d'esport.
    return m && m !== 'both' ? MASCOTS[m] : null;
  });
}
