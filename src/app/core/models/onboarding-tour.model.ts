import { Mascot } from './mascot.model';

/**
 * Una parada del tour guiat: el Marley i el Xoco et porten per l'app de
 * veritat, no per captures.
 *
 * Cada parada **navega** a la seva pantalla i **il·lumina** l'element del qual
 * parla. Aquesta és tota la gràcia: dir «els esports es configuren a Perfil»
 * no serveix de res si l'usuari no ha vist mai on és Perfil. Per això el
 * `target` no és decoració — és el motiu pel qual la parada existeix.
 *
 * Els selectors apunten a atributs `data-tour` posats a propòsit a les
 * pantalles. No es fan servir classes de CSS: renombrar una classe és una
 * refactorització normal i no ha de trencar el tour en silenci.
 */
export interface TourStop {
  /** Id estable, per a tests i per no dependre de l'ordre. */
  id: string;
  /** On navega abans d'il·luminar. */
  route: string;
  queryParams?: Record<string, string>;
  /**
   * Selectors dels elements a il·luminar. Es fa servir el rectangle que els
   * conté tots, així que només s'hi posen elements veïns (dues files seguides
   * d'una llista, mai dues coses als extrems de la pantalla). Buit = missatge
   * centrat, sense focus: per obrir i tancar el tour.
   */
  targets: string[];
  mascot: Mascot;
  /** La porta oberta. Una línia. */
  title: string;
  /** El que hi ha allà. Una frase, la dada. */
  body: string;
  /**
   * La frase del gos, de dues a cinc paraules. Opcional a propòsit: les
   * parades transversals (`both`) porten menys gos i més dada — si tot parla
   * amb corretges, la broma es gasta (MASCOTES.md §Regles de veu 6).
   */
  line?: string;
}

/**
 * El recorregut. L'ordre explica una història: primer on són les coses
 * (pestanyes), després com es configuren (Perfil), després com es programen
 * (rutines), i al final per què val la pena tenir-ho tot junt.
 *
 * Nou parades. És deliberat: cada pantalla nova costa atenció, i un tour que
 * es fa llarg s'abandona a la meitat — que és pitjor que un de curt.
 *
 * Les parades del Perfil (`cfg-*`) assenyalen files que viuen dins d'una
 * secció plegable, i per això naveguen amb `?section=config`: el Perfil obre
 * la secció que li demana la URL. Si algú mou aquestes files a una altra
 * secció, aquí s'ha de canviar el `queryParams`, o el tour parlarà d'una cosa
 * que no es veu.
 */
export const TOUR_STOPS: TourStop[] = [
  {
    id: 'nav-home',
    route: '/home',
    targets: ['[data-tour="nav/home"]'],
    mascot: 'both',
    title: 'Inici: el teu dia',
    body: 'El calendari de la setmana, el que has fet i el que et toca avui.',
    line: 'Comencem per aquí.',
  },
  {
    id: 'day-action',
    route: '/home',
    targets: ['[data-tour="day-action"]'],
    mascot: 'marley',
    title: 'El botó que ho registra tot',
    body: 'Tria un dia al calendari i el botó fa el que toca: començar avui, apuntar un dia passat o planificar-ne un de futur. En blanc o des d\'una plantilla.',
    line: 'Ves-hi.',
  },
  {
    id: 'nav-history-progress',
    route: '/home',
    targets: ['[data-tour="nav/calendar"]', '[data-tour="nav/charts"]'],
    mascot: 'both',
    title: 'Historial i Progrés',
    body: 'Tot el que has registrat, amb cerca i filtres. I les gràfiques, per veure com evoluciona.',
  },
  {
    id: 'nav-settings',
    route: '/home',
    targets: ['[data-tour="nav/settings"]'],
    mascot: 'both',
    title: 'Perfil: on es configura tot',
    body: 'Exercicis, tipus d\'entrenament, esports, rutines i objectiu setmanal, cada cosa dins la seva secció. Toca un títol i s\'obre. Hi entrem.',
  },
  {
    id: 'cfg-gym',
    route: '/settings',
    queryParams: { section: 'config' },
    targets: ['[data-tour="cfg-exercises"]', '[data-tour="cfg-training-types"]'],
    mascot: 'marley',
    title: 'El gym, a la teva manera',
    body: 'Dins de «Configuració»: els exercicis que fas i els tipus d\'entrenament (Empenta, Tracció, Cames…). El que configuris és el que et trobaràs mentre entrenes.',
    line: 'Aquesta part és meva.',
  },
  {
    id: 'cfg-sports',
    route: '/settings',
    queryParams: { section: 'config' },
    targets: ['[data-tour="cfg-sports"]'],
    mascot: 'xoco',
    title: 'I tot el que no és gym',
    body: 'Pàdel, córrer, escalada, natació… afegeix cada esport amb les seves mètriques i subtipus i registra\'l com una sessió més.',
    line: 'Sortim?',
  },
  {
    id: 'cfg-routines',
    route: '/settings',
    queryParams: { section: 'config' },
    targets: ['[data-tour="cfg-routines"]'],
    mascot: 'both',
    title: 'Programa la setmana',
    body: 'Defineix què toca cada dia i l\'app t\'ho proposarà sola, setmana rere setmana. Anem a veure-ho.',
  },
  {
    id: 'planner',
    route: '/train/planner',
    targets: ['[data-tour="planner-mode"]', '[data-tour="planner-day"]'],
    mascot: 'both',
    title: 'Cada dia, el que vulguis',
    body: 'Obre un dia, hi poses gym o esport, i queda fixat per a totes les setmanes. Des d\'Inici pots retocar-ne una de sola sense tocar la rutina.',
  },
  {
    id: 'wrap-up',
    route: '/home',
    targets: [],
    mascot: 'both',
    title: 'Un sol lloc per a tot',
    body: 'Gym, pàdel, córrer, escalada… tot al mateix registre, també sense connexió. El tour el pots repetir des de Perfil, a «Onboarding».',
    line: 'Anem?',
  },
];
