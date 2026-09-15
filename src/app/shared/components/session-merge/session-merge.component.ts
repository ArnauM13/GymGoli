import { Component, computed, inject, input, output, signal } from '@angular/core';

import { SessionGroupService } from '../../../core/services/session-group.service';
import { FeedbackService } from '../../services/feedback.service';
import { SessionPickerComponent } from '../session-picker/session-picker.component';
import {
  ActivityItem, SessionGroup, activityOf, dateOf, sessionKey, unifiedLine,
} from '../../utils/session-group.utils';

/**
 * Unir aquesta activitat amb una altra del mateix dia.
 *
 * Una sessió és una anada: al gimnàs i, en acabar, vint minuts de cinta. El
 * cas de sempre és que les dues activitats ja estiguin apuntades per separat
 * —s'apunten quan es fan, no quan te n'adones que van ser la mateixa sortida—,
 * o sigui que unir-les s'ofereix **des de l'activitat**.
 *
 * ── On surt ─────────────────────────────────────────────────────────────────
 * Al menú de l'activitat oberta, i enlloc més. Abans era una targeta plantada
 * a la pàgina, sota de tot el que hi havia: ocupava com una acció principal
 * per a una cosa que es fa un cop de cada deu, i sortia igual tant si la
 * volies com si no. Al menú hi és quan la busques i no fa nosa la resta de
 * l'estona.
 *
 * Amb què es pot unir ho diu `SessionGroupService.groupsForDay()`, i vol dir
 * **tot el que el dia té apuntat**: fet i planificat, gimnàs i esport. Una
 * anada es prepara igual que es viu.
 *
 * No es toca res del contingut: cada activitat es queda amb les seves sèries,
 * les seves mètriques i els seus rècords. L'única cosa que canvia és de quina
 * sessió són, i és el que fa que es comptin com una (vegeu
 * `shared/utils/session-group.utils`).
 *
 * Desfer-ho no és d'aquí: la sessió unida es separa des d'on es llegeix, al
 * peu de la caixa que l'engloba a Inici i a l'Historial.
 */
@Component({
  selector: 'app-session-merge',
  standalone: true,
  imports: [SessionPickerComponent],
  template: `
    @if (targets().length) {
      <app-session-picker [sessions]="targets()" [busy]="merging()" (pick)="unify($event)" />
    } @else {
      <p class="sm-none">Aquest dia no hi ha cap altra sessió.</p>
    }
  `,
  styles: [`
    .sm-none {
      margin: 0; padding: 10px 2px;
      font-size: 12.5px; font-weight: 600; color: var(--c-text-3); line-height: 1.4;
    }
  `],
})
export class SessionMergeComponent {
  private sessionGroups  = inject(SessionGroupService);
  private feedback       = inject(FeedbackService);

  /** L'activitat que s'està mirant: la que s'unirà amb la que es triï. */
  readonly item = input.required<ActivityItem>();
  /** Unit: qui l'ha obert pot tancar-se. */
  readonly merged = output<void>();

  readonly merging = signal(false);

  /** Les sessions del dia amb què es pot unir: les diu el servei, que és qui
   *  sap què és una fila i què és només una projecció de la rutina. */
  private readonly dayGroups = computed((): SessionGroup[] =>
    this.sessionGroups.groupsForDay(dateOf(this.item()))
  );

  /** La sessió d'aquesta activitat, si el dia és carregat i és de les que es
   *  poden unir. */
  readonly mine = computed((): SessionGroup | null =>
    this.dayGroups().find(g => g.key === sessionKey(activityOf(this.item()))) ?? null
  );

  /** Les altres sessions del dia: les candidates a unir-s'hi. */
  readonly targets = computed((): SessionGroup[] => {
    const mine = this.mine();
    if (!mine) return [];
    return this.dayGroups().filter(g => g.key !== mine.key);
  });

  /**
   * Uneix la sessió triada amb aquesta: totes dues passen a ser una sola
   * anada, sense registrar res de nou.
   */
  async unify(target: SessionGroup | null): Promise<void> {
    const mine = this.mine();
    if (!target || !mine || this.merging()) return;

    this.merging.set(true);
    try {
      await this.sessionGroups.merge(mine.items, target.items);
      // Qui ho diu surt del que ha quedat: tots dos gossos quan l'anada
      // barreja gimnàs i esport, que és el cas que fa existir els grups.
      const { mascot, message } = unifiedLine(mine, target);
      this.feedback.success(message, 2200, mascot);
      this.merged.emit();
    } catch {
      this.feedback.error('Error en unir', 2500);
    } finally {
      this.merging.set(false);
    }
  }
}
