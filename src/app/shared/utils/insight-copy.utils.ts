import { InsightBar } from '../../core/models/insight.model';
import { daysBetween, offsetDate } from './date.utils';

/**
 * Com es diuen les xifres d'un insight perquè s'entenguin.
 *
 * La regla és una: **cap percentatge**. «Has augmentat un 1000%» no vol dir
 * res per a ningú que no faci servir fulls de càlcul, i com més gran és el
 * número menys en diu. Al seu lloc hi van les dues xifres reals («3 per
 * setmana, abans 1») i, si cal, una frase que les lligui («dues activitats
 * més cada setmana»).
 */

// ── Xifres ───────────────────────────────────────────────────────────────────

/** Un decimal amb coma, com mana el català. */
export function fmt1(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

/** Tones a partir del miler: 1.240 kg són més fàcils de veure com 1,2 t. */
export function fmtKg(kg: number): string {
  return kg >= 1000 ? `${fmt1(kg / 1000)} t` : `${Math.round(kg)} kg`;
}

/** 70 i 72,5 kg, però mai 70,0. */
export function fmtWeight(kg: number): string {
  return Number.isInteger(kg) ? `${kg}` : fmt1(kg);
}

/** `1 activitat` / `3 activitats`. */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Una proporció dita com la diria una persona: `7 de cada 10`. És la manera
 * d'ensenyar un percentatge sense dir-ne el nom.
 */
export function outOfTen(share: number): string {
  return `${Math.max(1, Math.min(10, Math.round(share * 10)))} de cada 10`;
}

/**
 * El canvi entre dos ritmes setmanals, en activitats i no en tants per cent.
 * Per sota de mitja activitat de diferència no val la pena posar-hi número:
 * «una mica més» ja ho diu tot i no fa pensar.
 */
export function weeklyChangePhrase(nowPerWeek: number, prevPerWeek: number): string {
  const diff  = Math.abs(nowPerWeek - prevPerWeek);
  const up    = nowPerWeek >= prevPerWeek;
  const dir   = up ? 'més' : 'menys';
  if (diff < 0.5) return `Una mica ${dir} cada setmana.`;
  return `${plural(Math.round(diff), 'activitat', 'activitats')} ${dir} cada setmana.`;
}

// ── Dates curtes ─────────────────────────────────────────────────────────────

/** `3/3` — per a sota d'una barra, on no hi cap res més. */
export function shortDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00')
    .toLocaleDateString('ca-ES', { day: 'numeric', month: 'numeric' });
}

/** `3 de març` — per a una línia de text. */
export function longDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00')
    .toLocaleDateString('ca-ES', { day: 'numeric', month: 'long' });
}

// ── Barres ───────────────────────────────────────────────────────────────────

/** El mínim que necessita `weekBars`: una setmana i el que hi vas fer. */
export interface CountedWeek {
  monday: string;
  total:  number;
}

interface BarOpts<T> {
  /** L'última barra és la setmana en curs: encara li queden dies. */
  lastIsCurrent?: boolean;
  /** Les barres del que l'insight explica. Són les que porten el número. */
  highlight?: (item: T, index: number, total: number) => boolean;
  /** Les barres que només hi són per comparar. */
  muted?: (item: T, index: number, total: number) => boolean;
}

function decorate<T>(bars: InsightBar[], items: T[], opts: BarOpts<T>): InsightBar[] {
  return bars.map((bar, i) => ({
    ...bar,
    highlight: opts.highlight?.(items[i], i, bars.length) || undefined,
    muted:     opts.muted?.(items[i], i, bars.length) || undefined,
  }));
}

/**
 * Setmanes de calendari, de la més vella a la més nova. És la unitat dels
 * objectius: l'objectiu setmanal es compta de dilluns a diumenge, i barrejar-hi
 * finestres mòbils faria que el gràfic i la xifra no es corresponguessin.
 *
 * `weeks` arriba com la resta del servei, de la més nova a la més vella.
 */
export function weekBars<T extends CountedWeek>(weeks: T[], opts: BarOpts<T> = {}): InsightBar[] {
  const ordered = [...weeks].reverse();
  const bars = ordered.map((w, i): InsightBar => ({
    label: opts.lastIsCurrent && i === ordered.length - 1 ? 'ara' : shortDate(w.monday),
    value: w.total,
  }));
  return decorate(bars, ordered, opts);
}

/**
 * Finestres de 7 dies acabades avui, de la més vella a la més nova.
 *
 * Els insights que parlen de "els últims 7 dies" o "aquest mes contra
 * l'anterior" compten així, no per setmanes de calendari: si el gràfic ho
 * fes d'una altra manera, les barres no sumarien la xifra del text.
 */
export function rollingWeekBars(
  today: string, dates: string[], weeks: number, opts: BarOpts<number> = {},
): InsightBar[] {
  const bars: InsightBar[] = [];
  const index: number[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end   = offsetDate(today, -(i * 7));
    const start = offsetDate(end, -7);
    index.push(bars.length);
    bars.push({
      label: i === 0 ? 'ara' : shortDate(offsetDate(start, 1)),
      value: dates.filter(d => d > start && d <= end).length,
    });
  }
  return decorate(bars, index, opts);
}

/**
 * Una barra per element d'una llista qualsevol: sessions, dies de la setmana,
 * tipus d'entrenament. La resta de gràfics del detall surten d'aquí.
 */
export function itemBars<T>(
  items: T[], map: (item: T, index: number) => InsightBar, opts: BarOpts<T> = {},
): InsightBar[] {
  return decorate(items.map(map), items, opts);
}

/** Quantes de les últimes `weeks` finestres de 7 dies cobreix una història. */
export function livedWeeks(today: string, first: string | null, weeks: number): number {
  if (!first) return 0;
  return Math.min(weeks, Math.floor(daysBetween(first, today) / 7));
}
