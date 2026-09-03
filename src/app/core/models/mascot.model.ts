/**
 * Marley i Xoco — les dues mascotes de l'app.
 *
 * No són decoració: són la veu del feedback. Cada insight l'explica el gos
 * que li toca, i això dona personalitat a l'app sense afegir cap pantalla
 * nova. La divisió segueix la que ja existeix al model de dades
 * (`GoalMode = 'combined' | 'separate'`):
 *
 *   marley → gimnàs. Calmat, t'espera, mai t'apressa. Parla de constància
 *            i de descans. És qui està content quan tornes.
 *   xoco   → esport. Enèrgic, sempre vol sortir, et porta la corretja.
 *   both   → transversal (objectius setmanals, resum, ratxa). Aquí no parla
 *            cap dels dos en primera persona: hi són com a acompanyament.
 *
 * Regla de veu (no negociable): cap dels dos culpabilitza mai. L'onboarding
 * promet «sense alarmes ni pressions» i els gossos hi estan subjectes. Un
 * gos s'alegra de veure't tant si has entrenat com si no.
 *
 * Regla d'ús: un gos per targeta. Els dos junts només quan el missatge és
 * transversal o quan és la marca (icona, login, onboarding).
 */
export type Mascot = 'marley' | 'xoco' | 'both';

export interface MascotMeta {
  /** Nom propi, per si algun dia el copy l'ha d'anomenar. */
  name: string;
  /** Cara retallada en quadrat, per pintar-la dins d'un cercle petit. */
  avatar: string;
  /**
   * Cap i pit retallats del fons, amb transparència. Per quan surten grans i
   * sense cercle: la silueta ja els identifica i el marc només els empetitiria.
   */
  figure: string;
  /** Text alternatiu per a lectors de pantalla. */
  alt: string;
}

export const MASCOTS: Record<Mascot, MascotMeta> = {
  marley: {
    name: 'Marley', alt: 'El Marley',
    avatar: 'assets/marley.png', figure: 'assets/marley-full.png',
  },
  xoco: {
    name: 'Xoco', alt: 'El Xoco',
    avatar: 'assets/xoco.png', figure: 'assets/xoco-full.png',
  },
  both: {
    name: 'Marley i Xoco', alt: 'El Marley i el Xoco',
    avatar: 'assets/bibis.png', figure: 'assets/bibis-full.png',
  },
};
