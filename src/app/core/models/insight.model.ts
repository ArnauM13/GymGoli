import { Mascot } from './mascot.model';

/**
 * Els insights d'Inici són **tendències**, no consells del dia.
 *
 * Aquí hi ha només la forma que tenen; qui els calcula és
 * `FitnessMetricsService` i qui els pinta, `FitnessInsightsComponent`.
 */
export type InsightType =
  // Objectiu — el que hi ha en joc més enllà de la setmana en curs
  | 'ratxa_en_joc'
  | 'objectiu_a_l_alca'
  | 'objectiu_desajustat'
  | 'compliment_objectiu'
  // Ruptura — un canvi prou gran per voler saber-lo ara
  | 'sense_activitat'
  | 'carrega_alta'
  // Progrés — millores mesurables que no es veuen des d'una targeta
  | 'progres'
  | 'volum_gym'
  // Tendència — cap on va el ritme
  | 'tendencia_volum'
  | 'esforc_creixent'
  // Patró — com és realment la teva rutina
  | 'patro_setmanal'
  | 'equilibri_gym';

/** Nivells de prioritat. Guanya sempre el nivell més baix. */
export const INSIGHT_LEVEL = {
  objectiu:  1,
  ruptura:   2,
  progres:   3,
  tendencia: 4,
  patro:     5,
} as const;

// ── El detall ────────────────────────────────────────────────────────────────

/**
 * Una barra del gràfic del detall. Una setmana, un dia de la setmana, una
 * sessió o un tipus d'entrenament, segons l'insight.
 */
export interface InsightBar {
  /** Etiqueta curta sota la barra: `dl`, `S-3`, `Cames`. */
  label: string;
  value: number;
  /** El valor tal com es llegeix, si no és el número pelat: `1,2 t`, `45 min`. */
  display?: string;
  /** Context: hi és per poder comparar, però no és del que parlem. */
  muted?: boolean;
  /** El que l'insight explica. Només aquestes porten el valor escrit a sobre. */
  highlight?: boolean;
  /** Color propi (els tipus d'entrenament ja en tenen un a tota l'app). */
  color?: string;
}

/**
 * El gràfic del detall. Sempre barres: és l'única forma que s'entén d'un cop
 * d'ull en un mòbil i sense saber llegir gràfics.
 */
export interface InsightChart {
  /** Què hi ha a les barres, en pla: «Activitats per setmana». */
  caption: string;
  bars: InsightBar[];
  /** Línia horitzontal de referència, típicament l'objectiu setmanal. */
  reference?: { value: number; label: string };
}

/** Una xifra amb el seu nom. El que abans anava atapeït a la línia d'stat. */
export interface InsightFact {
  label: string;
  value: string;
}

/**
 * El «per què em dius això». S'obre en tocar la targeta.
 *
 * Regla de llenguatge: aquí **no hi ha percentatges ni jerga**. Un usuari no
 * ha de traduir «+180% de volum» a res; ha de veure dues xifres seves i una
 * frase que les lligui. Si una dada no es pot dir en pla, no hi va.
 */
export interface InsightDetail {
  /** Una frase: què hem mirat i què hi hem vist. */
  headline: string;
  chart: InsightChart;
  /** Les xifres, separades i amb nom. Dues o tres, mai més de quatre. */
  facts: InsightFact[];
  /** Què vol dir i què en pots fer. Sense deures ni retrets. */
  meaning: string;
}

export interface FitnessInsight {
  type: InsightType;
  /** Qui ho diu. L'emoji continua sent com se sent — veure `mascot.model.ts`. */
  mascot: Mascot;
  emoji: string;
  title: string;
  /** La línia de xifres. És el que fa que l'insight aporti per si sol. */
  stat: string;
  message: string;
  color: string;
  /** 1–5, veure `INSIGHT_LEVEL`. Ordena abans que res. */
  level: number;
  /** Desempat dins d'un nivell: com de fort és el senyal en aquestes dades. */
  strength: number;
  /**
   * Dies que ha d'esperar per tornar a sortir un cop mostrat. Els estats lents
   * (un patró de 12 setmanes) no canvien d'un dia per l'altre i cansarien;
   * els esdeveniments (una ratxa en joc) poden sortir cada dia, que per això
   * es poden tancar.
   */
  cooldownDays: number;
  /** L'explicació de darrere. Veure `InsightDetail`. */
  detail: InsightDetail;
}
