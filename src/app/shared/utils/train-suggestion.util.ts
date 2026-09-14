import { ActivityProfile } from '../../core/services/workout-profile.service';

/**
 * Què proposar avui: un tipus d'entrenament i un esport, com a molt.
 *
 * ── Una sola manera de triar ────────────────────────────────────────────────
 * El gimnàs i l'esport es decideixen amb **el mateix càlcul sobre les mateixes
 * dades** (`ActivityProfile`). Abans no: el gimnàs mirava la cadència de
 * l'usuari i l'esport es quedava amb «l'últim que vas fer», que no diu si et
 * toca ni si fa mig any que no hi tornes. Dues maneres de contestar la mateixa
 * pregunta són una de sobrera.
 *
 * ── D'on surt cada proposta ─────────────────────────────────────────────────
 * Quatre motius, en aquest ordre. El primer que s'aguanta, mana:
 *
 *   1. `planned` — **ho tens planificat per avui**, per la rutina o a mà. Una
 *      cosa que has dit que faries guanya sempre a qualsevol estadística.
 *   2. `comeback` — **ho feies i fa temps que no**. Demana historial de debò
 *      (`sessions`, del servidor): un esport provat un cop no és una cosa que
 *      «feies», i una classe del gimnàs que has deixat sí.
 *   3. `due` — **et toca**, segons la teva pròpia cadència (`overdueScore`).
 *   4. `habit` — res no reclama res: el de sempre.
 *
 * ── El que no es proposa mai ────────────────────────────────────────────────
 * El que ja has fet avui, i el que encara està descansant (per sota de
 * `minRecovery`). Proposar-te el que acabes de fer no és un suggeriment.
 */
export type SuggestionKind   = 'gym' | 'sport';
export type SuggestionSource = 'planned' | 'comeback' | 'due' | 'untried' | 'habit';

/** Una activitat candidata: el perfil, més el que passa avui amb ella. */
export interface SuggestionCandidate {
  /** El tipus d'entrenament (`push`, `bodypump`…) o l'id de l'esport. */
  key:      string;
  profile:  ActivityProfile;
  /** Hi ha un pla per avui, de la rutina o fet a mà. */
  planned?: boolean;
  /** La rutina ho diu, en comptes d'un pla posat a mà per a avui. */
  fromRoutine?: boolean;
  /** Ja s'ha fet avui: fora. */
  doneToday?: boolean;
}

export interface RankedSuggestion {
  key:    string;
  source: SuggestionSource;
  score:  number;
  /** La línia de sota el nom, que és on va la dada. El gos parla amb la
   *  figura i la bafarada, no aquí (vegeu `MASCOTES.md` §Regles de veu). */
  reason: string;
}

export interface PickOptions {
  /** Dies mínims de descans abans de tornar a proposar la mateixa activitat. */
  minRecovery: number;
  /** Es pot proposar una activitat que no s'ha fet mai. El gimnàs sí —un tipus
   *  d'entrenament sense estrenar és justament el que s'ha de proposar—; un
   *  esport només si l'objectiu de l'usuari hi va. */
  allowUntried: boolean;
}

/** Fa tant que no la fas que ja no és «et toca», és «hi tornem?». */
const COMEBACK_MIN_DAYS = 21;
/** I per «tornar-hi» cal haver-hi estat: provar-ho un cop no compta. */
const COMEBACK_MIN_SESSIONS = 3;

/**
 * Quant fa, dit com es diu en veu alta: dies fins a dues setmanes, després
 * setmanes, i a partir de dos mesos, mesos.
 */
export function sinceLabel(days: number): string {
  if (days <= 1)  return '1 dia';
  if (days < 14)  return `${days} dies`;
  if (days < 60)  return `${Math.round(days / 7)} setmanes`;
  return `${Math.max(2, Math.round(days / 30))} mesos`;
}

/** La millor proposta d'un costat (gimnàs o esport), o cap. */
export function pickSuggestion(
  candidates: SuggestionCandidate[],
  opts: PickOptions,
): RankedSuggestion | null {
  const ranked = candidates
    .map(c => rank(c, opts))
    .filter((r): r is RankedSuggestion => r !== null)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  return ranked[0] ?? null;
}

function rank(c: SuggestionCandidate, opts: PickOptions): RankedSuggestion | null {
  const p = c.profile;

  // Ja fet avui: no es proposa, ni que estigui planificat — el pla ja s'ha
  // complert.
  if (c.doneToday) return null;

  if (c.planned) {
    return {
      key: c.key, source: 'planned', score: 1000,
      reason: c.fromRoutine ? 'Toca avui, per la rutina' : 'Planificat per avui',
    };
  }

  // Encara descansant. Un pla sí que passa per sobre (l'usuari mana), la
  // estadística no.
  if (p.everDone && p.daysSinceLast < opts.minRecovery) return null;

  if (!p.everDone) {
    if (!opts.allowUntried) return null;
    return { key: c.key, source: 'untried', score: 115, reason: 'Encara no l\'has provat' };
  }

  const comebackAfter = Math.max(COMEBACK_MIN_DAYS, p.typicalGapDays * 3);
  if (p.sessions >= COMEBACK_MIN_SESSIONS && p.daysSinceLast >= comebackAfter) {
    return {
      key: c.key, source: 'comeback',
      // Com més temps fa, més amunt: entre dues coses oblidades, la més
      // oblidada. El sostre evita que una de fa vuit anys tapi per sempre la
      // de fa dos mesos.
      score: 500 + Math.min(p.daysSinceLast, 365) / 10,
      reason: `Hi tornem? Fa ${sinceLabel(p.daysSinceLast)}`,
    };
  }

  if (p.overdueScore >= 1) {
    return {
      key: c.key, source: 'due',
      score: 100 + Math.min(p.overdueScore, 4) * 10,
      reason: `Fa ${sinceLabel(p.daysSinceLast)}`,
    };
  }

  return { key: c.key, source: 'habit', score: 10, reason: `Fa ${sinceLabel(p.daysSinceLast)}` };
}
