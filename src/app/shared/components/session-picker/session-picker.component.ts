import { Component, booleanAttribute, input, output } from '@angular/core';

import { SessionGroup, groupIcons, groupTitle } from '../../utils/session-group.utils';

/**
 * Les sessions d'un dia, per triar-ne una.
 *
 * Una fila per sessió, amb les icones de què està feta: la llista és curta
 * —el que aquell dia tens apuntat— i s'ha de reconèixer d'un cop d'ull quina
 * és quina abans de tocar-la.
 *
 * ── Una sola llista per a una sola pregunta ─────────────────────────────────
 * «A quina sessió va això?» es fa en dos moments —abans de crear l'activitat,
 * a Entrenar, i després, des del menú de l'activitat oberta— i és la mateixa
 * pregunta: la llista es pinta aquí i prou. Qui la fa servir decideix què vol
 * dir triar-ne una (apuntar-s'hi o unir-s'hi de debò); d'aquí només en surt
 * quina s'ha tocat.
 */
@Component({
  selector: 'app-session-picker',
  standalone: true,
  template: `
    <div class="sp-list">
      <!-- Deixar-ho sol també és una tria, i ha de poder-se desfer: si no, qui
           toca una sessió sense voler no té com tornar enrere. -->
      @if (allowNew()) {
        <button class="sp-btn" [class.sp-btn--on]="!selectedKey()" (click)="pick.emit(null)">
          <span class="material-symbols-outlined sp-new" aria-hidden="true">add_circle</span>
          <span class="sp-name">Sessió nova</span>
          @if (!selectedKey()) {
            <span class="material-symbols-outlined sp-go" aria-hidden="true">check</span>
          }
        </button>
      }

      @for (g of sessions(); track g.key) {
        <button class="sp-btn" [class.sp-btn--on]="selectedKey() === g.key"
                [disabled]="busy()" (click)="pick.emit(g)">
          <span class="sp-icons" aria-hidden="true">
            @for (ic of groupIcons(g); track $index) {
              <span class="material-symbols-outlined sp-ic" [style.color]="ic.color">{{ ic.icon }}</span>
            }
          </span>
          <span class="sp-name">{{ groupTitle(g) }}</span>
          <span class="material-symbols-outlined sp-go" aria-hidden="true">
            {{ selectedKey() === g.key ? 'check' : goIcon() }}
          </span>
        </button>
      }
    </div>
  `,
  styles: [`
    .sp-list { display: flex; flex-direction: column; gap: 8px; }
    .sp-btn {
      display: flex; align-items: center; gap: 10px; width: 100%; box-sizing: border-box;
      padding: 11px 12px; border-radius: 14px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      color: var(--c-text); font-size: 13.5px; font-weight: 700; text-align: left;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover:not(:disabled) { border-color: var(--c-brand); background: color-mix(in srgb, var(--c-brand) 6%, var(--c-card)); }
      &:disabled { opacity: 0.5; cursor: default; }
      &.sp-btn--on {
        border-color: var(--c-brand);
        background: color-mix(in srgb, var(--c-brand) 10%, var(--c-card));
      }
    }
    .sp-icons { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .sp-ic    { font-size: 19px; }
    .sp-new   { font-size: 19px; flex-shrink: 0; color: var(--c-text-3); }
    .sp-name  { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sp-go    { flex-shrink: 0; font-size: 19px; color: var(--c-brand); }
  `],
})
export class SessionPickerComponent {
  readonly sessions = input.required<SessionGroup[]>();
  /** La sessió ja triada, si n'hi ha cap. */
  readonly selectedKey = input<string | null>(null);
  /** Hi ha l'opció de no triar-ne cap: l'activitat serà una anada per ella
   *  mateixa. Només val quan encara no existeix res. */
  readonly allowNew = input(false, { transform: booleanAttribute });
  /** Mentre s'escriu, no s'hi torna a tocar. */
  readonly busy = input(false, { transform: booleanAttribute });
  /** El glif de la dreta d'una fila no triada: unir-s'hi o apuntar-s'hi. */
  readonly goIcon = input('add_link');

  /** La sessió tocada, o `null` si s'ha triat deixar-ho sol. */
  readonly pick = output<SessionGroup | null>();

  readonly groupIcons = groupIcons;
  readonly groupTitle = groupTitle;
}
