import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';

/**
 * Una sessió és una **anada**, no una fila.
 *
 * Al gimnàs i, en acabar, vint minuts de cinta: dues activitats, una sortida
 * de casa. Gimnàs al matí i futbol a la tarda: dues activitats i dues
 * sortides. Fins ara les dues coses comptaven igual —una fila, una sessió— i
 * la ratxa, el resum de la setmana i «X sessions els últims 7 dies» donaven
 * per bona la lectura equivocada.
 *
 * El que ho distingeix és `sessionGroupId`: les activitats que en comparteixen
 * un s'han fet d'una tirada. **Una activitat sense grup és una sessió ella
 * sola**, que és exactament el que volia dir abans que això existís — per això
 * tot l'historial anterior es continua comptant igual sense tocar-ne cap fila.
 *
 * Un grup no surt mai d'un dia: el magatzem local està partit per mes i
 * l'activitat es demana per trams, i un grup a cavall de dos dies els
 * trencaria tots dos. Qui agrupa (`SessionGroupService`) ho fa complir perquè
 * només ajunta activitats d'un mateix dia.
 */

/** El mínim que cal saber d'una activitat per comptar-la. */
export interface GroupableActivity {
  id: string;
  sessionGroupId?: string;
}

/** Una activitat, sigui de quin tipus sigui. És el que s'ajunta i se separa. */
export type ActivityItem =
  | { kind: 'workout'; workout: Workout }
  | { kind: 'sport';   sport: Sport; session: SportSession };

/** L'activitat que hi ha dins de l'element, sense mirar de quin tipus és. */
export function activityOf(item: ActivityItem): GroupableActivity {
  return item.kind === 'workout' ? item.workout : item.session;
}

/**
 * Les activitats d'una mateixa sessió, tal com es pinten: els entrenaments
 * primer i els esports després, com abans d'existir els grups.
 */
export interface SessionGroup {
  /** L'id del grup quan n'hi ha, i si no el de l'activitat que va sola: així
   *  `track` a la plantilla no depèn de si la sessió està agrupada o no. */
  key: string;
  /** Cert quan la sessió té més d'una activitat — l'únic cas en què la
   *  targeta canvia de forma. */
  grouped: boolean;
  workouts: Workout[];
  sports:   { sport: Sport; session: SportSession }[];
}

/** La clau per la qual dues activitats són la mateixa sessió. Sense grup,
 *  l'activitat és la seva pròpia sessió i la clau és el seu id. */
export function sessionKey(a: GroupableActivity): string {
  return a.sessionGroupId ?? a.id;
}

/**
 * Quantes **sessions** hi ha en aquestes activitats: els grups diferents més
 * les activitats que no en tenen.
 *
 * ```
 * gimnàs(g1) + cinta(g1) + futbol(—)  →  2
 * gimnàs(—)  + futbol(—)              →  2
 * gimnàs(g1) + cinta(g1)              →  1
 * ```
 */
export function countSessions(activities: GroupableActivity[]): number {
  const keys = new Set<string>();
  for (const a of activities) keys.add(sessionKey(a));
  return keys.size;
}

/**
 * Agrupa l'activitat d'un dia en sessions, mantenint l'ordre d'abans: una
 * sessió es col·loca on hi ha la primera de les seves activitats, i les que
 * no comparteixen grup surten soltes, exactament com sempre.
 */
export function groupDayFeed(
  workouts: Workout[],
  sports: { sport: Sport; session: SportSession }[],
): SessionGroup[] {
  const byKey  = new Map<string, SessionGroup>();
  const groups: SessionGroup[] = [];

  const groupFor = (a: GroupableActivity): SessionGroup => {
    const key = sessionKey(a);
    const existing = byKey.get(key);
    if (existing) return existing;
    const created: SessionGroup = { key, grouped: false, workouts: [], sports: [] };
    byKey.set(key, created);
    groups.push(created);
    return created;
  };

  for (const w of workouts) groupFor(w).workouts.push(w);
  for (const s of sports)   groupFor(s.session).sports.push(s);

  for (const g of groups) g.grouped = g.workouts.length + g.sports.length > 1;
  return groups;
}
