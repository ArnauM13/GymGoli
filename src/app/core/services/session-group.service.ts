import { Injectable, inject } from '@angular/core';

import { SportService } from './sport.service';
import { WorkoutService } from './workout.service';
import { ActivityItem, activityOf, dateOf } from '../../shared/utils/session-group.utils';

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

  /**
   * Ajunta dues sessions que ja hi són en una de sola.
   *
   * Fins ara ampliar una sessió volia dir registrar-hi una activitat nova;
   * però el gimnàs i la cinta sovint ja estan tots dos apuntats abans que
   * te n'adonis que van ser la mateixa anada. Ajuntar-les no en toca cap
   * contingut: totes les activitats de les dues bandes passen a portar el
   * mateix `sessionGroupId`, i prou.
   *
   * **Només del mateix dia.** Un grup a cavall de dos dies trencaria el
   * magatzem local (partit per mes) i les peticions per trams, o sigui que
   * aquí es comprova i es rebutja abans d'escriure res.
   *
   * Es queda l'id de grup que ja existeix —el de la primera banda que en
   * tingui— perquè s'escriguin les mínimes files: ajuntar una activitat
   * solta a una sessió de tres només toca la solta.
   */
  async merge(a: ActivityItem[], b: ActivityItem[]): Promise<string> {
    if (!a.length || !b.length) throw new Error('Cal una activitat a cada banda');

    const items = [...a, ...b];
    const day   = dateOf(items[0]);
    if (items.some(i => dateOf(i) !== day)) {
      throw new Error('Una sessió no surt mai d\'un dia');
    }

    const groupId = items.map(i => activityOf(i).sessionGroupId).find(Boolean)
      ?? crypto.randomUUID();

    for (const item of items) {
      if (activityOf(item).sessionGroupId === groupId) continue;
      await this.join(item, groupId);
    }
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
