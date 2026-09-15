import { Injectable, inject } from '@angular/core';

import { SportService } from './sport.service';
import { WorkoutService } from './workout.service';
import { isRoutineProjection } from './routine-projection.service';
import {
  ActivityItem, SessionGroup, activityOf, activityTime, dateOf, groupDayFeed, hasExplicitTime,
} from '../../shared/utils/session-group.utils';

/** L'aire que es deixa entre dues activitats en ordenar-les a mà. Un minut:
 *  prou perquè l'ordre sigui estricte i prou poc perquè l'hora resultant
 *  continuï dient el que deia —això va passar cap aquí. */
const ORDER_STEP_MS = 60_000;

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
   * Les sessions d'un dia que es poden unir entre elles.
   *
   * **Tot el que hi ha apuntat aquell dia**: el que ja s'ha fet i el que
   * encara està planificat, del gimnàs i de fora. Una anada es prepara igual
   * que es viu —el pàdel de dimarts i la cinta de després es poden deixar
   * apuntats junts—, i abans això només valia per a les sessions fetes: unir
   * dos plans no s'oferia enlloc.
   *
   * El que la rutina només projecta queda fora: no és cap fila, o sigui que no
   * hi ha res a posar dins de cap sessió. Comença'l i llavors sí.
   *
   * Va acotat a un dia —un grup no surt mai d'un dia— i es llegeix d'aquí i
   * d'enlloc més: qui pregunta «amb què puc unir això?» ha de rebre sempre la
   * mateixa resposta, la demani des de la targeta, des de l'activitat oberta o
   * des d'Entrenament.
   */
  groupsForDay(date: string): SessionGroup[] {
    const workouts = [
      ...this.workoutService.getPlannedForDate(date),
      ...this.workoutService.getDoneWorkoutsForDate(date),
    ].filter(w => !isRoutineProjection(w.id));
    const sports = [
      ...this.sportService.getPlannedSportSessionsForDate(date),
      ...this.sportService.getSportSessionsForDate(date),
    ].filter(p => !isRoutineProjection(p.session.id));

    return groupDayFeed(workouts, sports);
  }

  /** Cert si aquesta sessió es pot unir amb una altra. Una que la rutina
   *  només proposa, no: encara no existeix enlloc. */
  canMerge(group: SessionGroup): boolean {
    return group.items.every(i => !isRoutineProjection(activityOf(i).id));
  }

  /**
   * Deixa les activitats d'una sessió en aquest ordre.
   *
   * L'ordre de dins d'una anada és el de com va anar —primer la cinta, després
   * les sèries—, i qui ho sap és qui hi era. Fins ara sortia de l'hora de la
   * fila i no es podia contradir: una activitat apuntada després però feta
   * abans es quedava on l'hora la deixava.
   *
   * El que s'escriu és `startedAt`, que és **l'ordre del dia** des de la
   * migració 035: dir que la cinta va anar primer és dir a quina hora va anar.
   * Per això no cal cap columna nova ni cap camp que s'hagi de mantenir
   * d'acord amb un altre — hi ha una sola manera de saber quan va passar una
   * activitat, i ordenar-les l'escriu.
   *
   * S'escriuen les mínimes files: qui ja és a la seva hora no es torna a
   * tocar, o sigui que moure'n una en una sessió de tres en toca dues.
   */
  async reorder(items: ActivityItem[]): Promise<void> {
    if (items.length < 2) return;

    const day = dateOf(items[0]);
    if (items.some(i => dateOf(i) !== day)) {
      throw new Error('Una sessió no surt mai d\'un dia');
    }

    const base = Math.min(...items.map(activityTime));
    for (const [i, item] of items.entries()) {
      const when = base + i * ORDER_STEP_MS;
      if (hasExplicitTime(item) && activityTime(item) === when) continue;
      await this.setStartedAt(item, new Date(when));
    }
  }

  /** Quan va passar l'activitat dins del dia. Cada servei se n'escriu la
   *  seva; d'aquí només surt a quina banda va. */
  async setStartedAt(item: ActivityItem, startedAt: Date): Promise<void> {
    if (item.kind === 'workout') {
      await this.workoutService.setStartedAt(item.workout.id, startedAt);
      return;
    }
    await this.sportService.setStartedAt(item.session.id, item.session.date, startedAt);
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

  /**
   * Desfà la sessió sencera: cada activitat torna a comptar per ella mateixa.
   *
   * Separar és una sola acció —la sessió unida es parteix del tot—, i per això
   * es fa amb totes les activitats de cop: deixar-ne dues de tres juntes no és
   * el que demana qui toca «separar». Les que ja anaven soltes no s'escriuen.
   */
  async split(items: ActivityItem[]): Promise<void> {
    for (const item of items) {
      if (!activityOf(item).sessionGroupId) continue;
      await this.detach(item);
    }
  }
}
