import { Mascot } from '../../core/models/mascot.model';
import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';
import { workoutPrimaryColor, workoutPrimaryIcon, workoutTypeLabel } from './workout-card.utils';

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

/** El dia de l'element. Un grup no surt mai d'un dia, o sigui que és el
 *  primer que es mira abans d'ajuntar dues sessions. */
export function dateOf(item: ActivityItem): string {
  return item.kind === 'workout' ? item.workout.date : item.session.date;
}

/**
 * Les activitats d'una mateixa sessió, per ordre cronològic.
 */
export interface SessionGroup {
  /** L'id del grup quan n'hi ha, i si no el de l'activitat que va sola: així
   *  `track` a la plantilla no depèn de si la sessió està agrupada o no. */
  key: string;
  /** Cert quan la sessió té més d'una activitat — l'únic cas en què la
   *  targeta canvia de forma. */
  grouped: boolean;
  /** Les activitats de la sessió, de la que s'ha fet abans a la de després.
   *  Barrejades: si has corregut i després has anat al gimnàs, la cursa va
   *  primer encara que siguin de menes diferents. */
  items: ActivityItem[];
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
 * Quan va passar l'activitat: el que ordena el dia.
 *
 * `startedAt` només hi és quan no coincideix amb l'alta de la fila —un pla
 * apuntat dilluns i fet dimecres—, i llavors mana ell: el dia s'ordena per
 * quan es va fer cada cosa, no per quan es va apuntar. Sense ell, la fila va
 * néixer quan l'activitat va començar i `createdAt` ja diu l'hora.
 */
export function activityTime(item: ActivityItem): number {
  const a = item.kind === 'workout' ? item.workout : item.session;
  return (a.startedAt ?? a.createdAt).getTime();
}

/** Un pla encara no ha passat: no té hora amb què ordenar-se entre el que ja
 *  s'ha fet, i per això va sempre al davant. */
export function isPlannedItem(item: ActivityItem): boolean {
  const a = item.kind === 'workout' ? item.workout : item.session;
  return (a.status ?? 'done') === 'planned';
}

/** Les icones de les activitats de la sessió, amb el seu color: és el que fa
 *  reconèixer d'un cop d'ull de què està feta l'anada. */
export function groupIcons(group: SessionGroup): { icon: string; color: string }[] {
  return group.items.map(item => item.kind === 'workout'
    ? { icon: workoutPrimaryIcon(item.workout), color: workoutPrimaryColor(item.workout) }
    : { icon: item.sport.icon, color: item.sport.color });
}

/** «Empenta · Córrer»: els noms de les activitats, en el mateix ordre que les
 *  icones i les targetes. */
export function groupTitle(group: SessionGroup): string {
  return group.items
    .map(item => item.kind === 'workout' ? workoutTypeLabel(item.workout) : item.sport.name)
    .join(' · ');
}

/**
 * Agrupa l'activitat d'un dia en sessions, per ordre cronològic.
 *
 * Un dia es llegeix com es va viure: el que s'ha fet abans surt abans, i les
 * activitats d'una mateixa sessió també queden ordenades entre elles. El que
 * encara està planificat va al davant de tot —no ha passat, no té hora amb
 * què ordenar-se— i baixa al seu lloc l'endemà de fer-se, perquè llavors ja
 * en té una (`activityTime`).
 */
export function groupDayFeed(
  workouts: Workout[],
  sports: { sport: Sport; session: SportSession }[],
): SessionGroup[] {
  const items: ActivityItem[] = [
    ...workouts.map((workout): ActivityItem => ({ kind: 'workout', workout })),
    ...sports.map(({ sport, session }): ActivityItem => ({ kind: 'sport', sport, session })),
  ];

  const byKey  = new Map<string, SessionGroup>();
  const groups: SessionGroup[] = [];

  for (const item of items) {
    const key      = sessionKey(activityOf(item));
    const existing = byKey.get(key);
    if (existing) { existing.items.push(item); continue; }

    const created: SessionGroup = { key, grouped: false, items: [item] };
    byKey.set(key, created);
    groups.push(created);
  }

  for (const g of groups) {
    g.items.sort(byWhenItHappened);
    g.grouped = g.items.length > 1;
  }

  // Els plans primer; la resta, de la sessió més matinera a la més tardana.
  return groups.sort((a, b) =>
    Number(!groupIsPlanned(a)) - Number(!groupIsPlanned(b))
    || groupTime(a) - groupTime(b)
  );
}

/** L'ordre de dins d'una sessió, i el de les sessions entre elles: el que ha
 *  passat abans va abans, i el que encara no ha passat, al davant. */
function byWhenItHappened(a: ActivityItem, b: ActivityItem): number {
  return Number(!isPlannedItem(a)) - Number(!isPlannedItem(b))
    || activityTime(a) - activityTime(b);
}

/** Una sessió és un pla mentre no se n'hagi fet res. */
function groupIsPlanned(group: SessionGroup): boolean {
  return group.items.every(isPlannedItem);
}

/** L'hora d'una sessió és la de la primera activitat que se'n va fer. */
function groupTime(group: SessionGroup): number {
  return Math.min(...group.items.map(activityTime));
}

// ── La veu ───────────────────────────────────────────────────────────────────

/**
 * Qui parla d'aquestes sessions: el Marley si tot és de gimnàs, el Xoco si
 * tot és d'esport, i tots dos quan l'anada barreja les dues coses —que és
 * justament el cas que fa existir els grups.
 */
export function sessionMascot(...groups: SessionGroup[]): Mascot {
  const gym   = groups.some(g => g.items.some(i => i.kind === 'workout'));
  const sport = groups.some(g => g.items.some(i => i.kind === 'sport'));
  if (gym && sport) return 'both';
  return sport ? 'xoco' : 'marley';
}

/** Un missatge amb qui el diu: el gos hi posa la cara i la frase. */
export interface MascotLine {
  mascot: Mascot;
  message: string;
}

/**
 * El que es diu quan dues sessions passen a ser una.
 *
 * Curt i sense deures, com mana `MASCOTES.md`: confirma el que acaba de
 * passar i para. Amb els dos gossos alhora el missatge és transversal i porta
 * menys gos i més dada.
 */
export function unifiedLine(...groups: SessionGroup[]): MascotLine {
  const mascot = sessionMascot(...groups);
  const message = mascot === 'marley' ? 'Tot en una sessió.'
                : mascot === 'xoco'   ? 'Tot d\'una tirada!'
                :                       'Una sola sessió.';
  return { mascot, message };
}

/**
 * I el que es diu quan una sessió unida es torna a partir.
 *
 * Separar és una sola acció —la sessió es desfà sencera—, o sigui que qui ho
 * diu surt del que hi havia dins: tots dos gossos quan l'anada barrejava
 * gimnàs i esport.
 */
export function splitLine(group: SessionGroup): MascotLine {
  const mascot = sessionMascot(group);
  const message = mascot === 'marley' ? 'Cadascú pel seu compte.'
                : mascot === 'xoco'   ? 'Aquesta ja va sola!'
                :                       'Cada activitat, la seva sessió.';
  return { mascot, message };
}
