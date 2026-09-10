import { Component, computed, inject, input, signal } from '@angular/core';

import { SessionGroupService } from '../../../core/services/session-group.service';
import { SportService } from '../../../core/services/sport.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { FeedbackService } from '../../services/feedback.service';
import {
  ActivityItem, SessionGroup, activityOf, dateOf, groupDayFeed, groupIcons, groupTitle,
  sessionKey, unifiedLine,
} from '../../utils/session-group.utils';

/**
 * Unir aquesta activitat amb una altra del mateix dia.
 *
 * Una sessió és una anada: al gimnàs i, en acabar, vint minuts de cinta. El
 * cas de sempre és que les dues activitats ja estiguin apuntades per separat
 * —s'apunten quan es fan, no quan te n'adones que van ser la mateixa sortida—,
 * o sigui que unir-les s'ofereix **des de l'activitat**, just on acabes en
 * registrar-ne una: si el dia ja en té una altra, aquí hi surt.
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
  template: `
    @if (targets().length) {
      <div class="sm-card">
        <div class="sm-head">
          <span class="material-symbols-outlined sm-icon" aria-hidden="true">merge</span>
          <div class="sm-head-text">
            <span class="sm-title">Ha estat la mateixa sessió?</span>
            <span class="sm-sub">Uneix-la amb una altra activitat d'avui i comptaran com una sola anada.</span>
          </div>
          <button class="sm-x" (click)="dismiss()" aria-label="Ara no">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <!-- Una fila per sessió, amb les icones de què està feta: la llista és
             curta —les altres sessions del dia— i s'ha de reconèixer d'un cop
             d'ull quina és quina abans de tocar-la. -->
        <div class="sm-list">
          @for (target of targets(); track target.key) {
            <button class="sm-btn" (click)="unify(target)" [disabled]="merging()">
              <span class="sm-icons" aria-hidden="true">
                @for (ic of groupIcons(target); track $index) {
                  <span class="material-symbols-outlined sm-ic" [style.color]="ic.color">{{ ic.icon }}</span>
                }
              </span>
              <span class="sm-name">{{ groupTitle(target) }}</span>
              <span class="material-symbols-outlined sm-go" aria-hidden="true">add_link</span>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .sm-card {
      margin: 16px 16px 0; padding: 13px 13px 14px;
      background: var(--c-card); border-radius: 18px;
      border: 1.5px solid color-mix(in srgb, var(--c-brand) 30%, var(--c-border-2));
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .sm-head { display: flex; align-items: flex-start; gap: 9px; margin-bottom: 11px; }
    .sm-icon {
      font-size: 21px; color: var(--c-brand); flex-shrink: 0;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .sm-head-text { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .sm-title { font-size: 14.5px; font-weight: 800; color: var(--c-text); }
    .sm-sub   { font-size: 12px; font-weight: 500; color: var(--c-text-3); line-height: 1.35; }
    .sm-x {
      flex-shrink: 0; width: 28px; height: 28px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: var(--c-text-2); background: color-mix(in srgb, var(--c-text) 6%, transparent); }
    }

    .sm-list { display: flex; flex-direction: column; gap: 8px; }
    .sm-btn {
      display: flex; align-items: center; gap: 10px; width: 100%;
      padding: 11px 12px; border-radius: 14px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      color: var(--c-text); font-size: 13.5px; font-weight: 700; text-align: left;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover:not(:disabled) { border-color: var(--c-brand); background: color-mix(in srgb, var(--c-brand) 6%, var(--c-card)); }
      &:disabled { opacity: 0.5; cursor: default; }
    }
    .sm-icons { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .sm-ic    { font-size: 19px; }
    .sm-name  { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sm-go    { flex-shrink: 0; font-size: 19px; color: var(--c-brand); }
  `],
})
export class SessionMergeComponent {
  private workoutService = inject(WorkoutService);
  private sportService   = inject(SportService);
  private sessionGroups  = inject(SessionGroupService);
  private feedback       = inject(FeedbackService);

  /** L'activitat que s'està mirant: la que s'unirà amb la que es triï. */
  readonly item = input.required<ActivityItem>();

  readonly merging = signal(false);
  /** L'activitat per a la qual s'ha dit «ara no»: l'oferiment no ha de
   *  seguir-te la resta de l'entrenament si ja l'has apartat. */
  private readonly dismissed = signal<string | null>(null);

  /**
   * Les sessions fetes del dia. Un pla no hi entra: encara no és cap anada, i
   * el grup diu com s'ha fet una cosa, no com es farà.
   */
  private readonly dayGroups = computed((): SessionGroup[] => {
    const date = dateOf(this.item());
    return groupDayFeed(
      this.workoutService.getDoneWorkoutsForDate(date),
      this.sportService.getSportSessionsForDate(date),
    );
  });

  /** La sessió d'aquesta activitat, si el dia és carregat i és una de feta. */
  readonly mine = computed((): SessionGroup | null =>
    this.dayGroups().find(g => g.key === sessionKey(activityOf(this.item()))) ?? null
  );

  /** Les altres sessions del dia: les candidates a unir-s'hi. */
  readonly targets = computed((): SessionGroup[] => {
    if (this.dismissed() === activityOf(this.item()).id) return [];
    const mine = this.mine();
    if (!mine) return [];
    return this.dayGroups().filter(g => g.key !== mine.key);
  });

  readonly groupIcons = groupIcons;
  readonly groupTitle = groupTitle;

  dismiss(): void {
    this.dismissed.set(activityOf(this.item()).id);
  }

  /**
   * Uneix la sessió triada amb aquesta: totes dues passen a ser una sola
   * anada, sense registrar res de nou.
   *
   * Fet això no cal anar enlloc: la que s'acaba d'unir ja no és una altra
   * sessió, o sigui que surt sola de la llista i el que hi queda —si hi
   * queda res— continua sent el que encara es podria unir.
   */
  async unify(target: SessionGroup): Promise<void> {
    const mine = this.mine();
    if (!mine || this.merging()) return;

    this.merging.set(true);
    try {
      await this.sessionGroups.merge(mine.items, target.items);
      // Qui ho diu surt del que ha quedat: tots dos gossos quan l'anada
      // barreja gimnàs i esport, que és el cas que fa existir els grups.
      const { mascot, message } = unifiedLine(mine, target);
      this.feedback.success(message, 2200, mascot);
    } catch {
      this.feedback.error('Error en unir', 2500);
    } finally {
      this.merging.set(false);
    }
  }
}
