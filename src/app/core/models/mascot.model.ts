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
  /** Ruta de l'avatar, relativa a l'arrel de l'app. */
  avatar: string;
  /** Text alternatiu per a lectors de pantalla. */
  alt: string;
}

export const MASCOTS: Record<Mascot, MascotMeta> = {
  marley: { name: 'Marley',         avatar: 'assets/marley.png', alt: 'El Marley'            },
  xoco:   { name: 'Xoco',           avatar: 'assets/xoco.png',   alt: 'El Xoco'              },
  both:   { name: 'Marley i Xoco',  avatar: 'assets/bibis.png',  alt: 'El Marley i el Xoco'  },
};
