/**
 * Tria estable d'una variant de missatge.
 *
 * Els gossos tenen més d'una manera de dir la mateixa cosa: si la situació es
 * repeteix tres setmanes seguides, la frase no ha de ser sempre idèntica.
 *
 * La tria depèn de la llavor i no de l'atzar, i això és deliberat. Els
 * insights són `computed()` i es recalculen sovint; amb `Math.random()` la
 * frase ballaria a cada recàlcul, que es veuria. Amb la data com a llavor, la
 * frase és fixa durant tot el dia i l'endemà ja n'és una altra.
 *
 * Afegeix el tipus d'insight a la llavor perquè dos missatges del mateix dia
 * no caiguin sempre al mateix índex.
 */
export function pickVariant(variants: readonly string[], seed: string): string {
  if (variants.length === 0) return '';
  if (variants.length === 1) return variants[0];

  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h, 31) + seed.charCodeAt(i) | 0;
  }
  return variants[Math.abs(h) % variants.length];
}
