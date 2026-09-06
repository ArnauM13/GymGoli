/**
 * Dates en hora local, sempre.
 *
 * `new Date().toISOString()` dona el dia **en UTC**: a Espanya, entre les 00:00
 * i les 02:00, encara retorna el dia d'ahir. Per això el canvi de dia de l'app
 * no passava a les 12 de la nit de l'usuari sinó unes hores més tard. Tota
 * data "de calendari" (YYYY-MM-DD) es construeix aquí, amb el fus del mòbil.
 */

/** `YYYY-MM-DD` d'una data, en hora local. */
export function toDateStr(d: Date): string {
  const year  = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day   = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** El dia d'avui de l'usuari, `YYYY-MM-DD`. */
export function todayStr(): string {
  return toDateStr(new Date());
}

/** Mitjanit local del dia següent — quan toca canviar de dia. */
export function nextMidnight(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setHours(24, 0, 0, 0);
  return d;
}

/** La mateixa data desplaçada `days` dies, `YYYY-MM-DD`. */
export function offsetDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/**
 * Dies de `a` a `b`. Es compara al migdia a propòsit: així un canvi d'hora
 * enmig no converteix 7 dies en 6,96 i el `round` no s'hi juga res.
 */
export function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000
  );
}
