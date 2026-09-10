import { Injectable, inject } from '@angular/core';

import { SportService } from './sport.service';
import { WorkoutService } from './workout.service';
import { ActivityItem, activityOf } from '../../shared/utils/session-group.utils';

/**
 * Ajuntar i separar activitats d'una mateixa sessió.
 *
 * Una sessió és una anada: al gimnàs i, en acabar, vint minuts de cinta. Les
 * dues activitats continuen sent dues files amb la seva vida pròpia —les seves
 * sèries, les seves mètriques, els seus rècords—; l'única cosa que comparteixen
 * és `sessionGroupId`, i és el que fa que es llegeixin i es comptin com una.
 *
 * Aquí hi ha el poc que no pot viure ni a `WorkoutService` ni a `SportService`:
 * una sessió pot barrejar-ne de tots dos, i qui la munta ha de poder tocar les
 * dues bandes. La regla de qui mana, les revisions i la pujada continuen sent
 * de cada servei.
 */
@Injectable({ providedIn: 'root' })
export class SessionGroupService {
  private workoutService = inject(WorkoutService);
  private sportService   = inject(SportService);

  /**
   * L'id de la sessió d'aquesta activitat, creant-lo si encara no en tenia.
   *
   * És el primer pas d'«afegeix-hi una activitat»: la que ja hi ha passa a ser
   * el primer element del grup. Una activitat que es quedi sola amb un grup no
   * és cap problema —es compta i es pinta igual que si no en tingués—, o sigui
   * que obrir el flux i no acabar-lo no deixa res per netejar.
   */
  async ensureGroupId(item: ActivityItem): Promise<string> {
    const existing = activityOf(item).sessionGroupId;
    if (existing) return existing;

    const groupId = crypto.randomUUID();
    await this.join(item, groupId);
    return groupId;
  }

  /** Posa l'activitat dins d'una sessió. */
  async join(item: ActivityItem, groupId: string): Promise<void> {
    if (item.kind === 'workout') {
      await this.workoutService.setSessionGroup(item.workout.id, groupId);
      return;
    }
    await this.sportService.setSessionGroup(item.session.id, item.session.date, groupId);
  }

  /**
   * Treu l'activitat de la sessió: torna a ser una sessió ella sola.
   *
   * No cal desfer res més. Si al grup hi queda una sola activitat, el grup ja
   * no vol dir res: la targeta es pinta com sempre i el comptador la compta un
   * cop, exactament igual que si l'etiqueta no hi fos.
   */
  async detach(item: ActivityItem): Promise<void> {
    if (item.kind === 'workout') {
      await this.workoutService.setSessionGroup(item.workout.id, undefined);
      return;
    }
    await this.sportService.setSessionGroup(item.session.id, item.session.date, null);
  }
}
