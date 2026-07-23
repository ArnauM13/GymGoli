export type ExerciseCategory = 'push' | 'pull' | 'legs';

/**
 * How an exercise is loaded, which decides how the logged weight becomes the
 * real load moved (used for volume):
 *  · 'weighted'   — external load only; the logged weight IS the load (default).
 *  · 'bodyweight' — moves your own weight; the logged weight is EXTRA weight
 *                   added on top (belt/dip-belt), 0 for pure bodyweight.
 *  · 'assisted'   — bodyweight minus machine/band assistance; the logged weight
 *                   is the assistance REMOVED from your bodyweight.
 */
export type LoadType = 'weighted' | 'bodyweight' | 'assisted';

export type ExerciseSubcategory =
  | 'chest' | 'shoulders' | 'triceps'       // push
  | 'back' | 'biceps' | 'forearms'          // pull
  | 'quads' | 'hamstrings' | 'glutes' | 'calves'; // legs

export const CATEGORY_LABELS: Record<ExerciseCategory, string> = {
  push: 'Empenta',
  pull: 'Tracció',
  legs: 'Cames',
};

export const CATEGORY_ICONS: Record<ExerciseCategory, string> = {
  push: 'fitness_center',
  pull: 'sports_gymnastics',
  legs: 'directions_run',
};

export const CATEGORY_COLORS: Record<ExerciseCategory, string> = {
  push: '#e57373',
  pull: '#64b5f6',
  legs: '#81c784',
};

export const CATEGORY_MUSCLES: Record<ExerciseCategory, string> = {
  push: 'Pit · Espatlles · Tríceps',
  pull: 'Esquena · Bíceps · Avantbraços',
  legs: 'Quàdriceps · Isquiotibials · Glutis',
};

export const SUBCATEGORY_OPTIONS: Record<ExerciseCategory, { value: ExerciseSubcategory; label: string }[]> = {
  push: [
    { value: 'chest', label: 'Pit' },
    { value: 'shoulders', label: 'Espatlles' },
    { value: 'triceps', label: 'Tríceps' },
  ],
  pull: [
    { value: 'back', label: 'Esquena' },
    { value: 'biceps', label: 'Bíceps' },
    { value: 'forearms', label: 'Avantbraços' },
  ],
  legs: [
    { value: 'quads', label: 'Quàdriceps' },
    { value: 'hamstrings', label: 'Isquiotibials' },
    { value: 'glutes', label: 'Glutis' },
    { value: 'calves', label: 'Bessons' },
  ],
};

export const SUBCATEGORY_LABELS: Partial<Record<ExerciseSubcategory, string>> = {
  chest: 'Pit',
  shoulders: 'Espatlles',
  triceps: 'Tríceps',
  back: 'Esquena',
  biceps: 'Bíceps',
  forearms: 'Avantbraços',
  quads: 'Quàdriceps',
  hamstrings: 'Isquiotibials',
  glutes: 'Glutis',
  calves: 'Bessons',
};

export const MUSCLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'pit',           label: 'Pit' },
  { value: 'espatlles',     label: 'Espatlles' },
  { value: 'triceps',       label: 'Tríceps' },
  { value: 'esquena',       label: 'Esquena' },
  { value: 'biceps',        label: 'Bíceps' },
  { value: 'avantbracos',   label: 'Avantbraços' },
  { value: 'core',          label: 'Core' },
  { value: 'quadriceps',    label: 'Quàdriceps' },
  { value: 'isquiotibials', label: 'Isquiotibials' },
  { value: 'glutis',        label: 'Glutis' },
  { value: 'bessons',       label: 'Bessons' },
];

export const MUSCLE_LABELS: Record<string, string> = Object.fromEntries(
  MUSCLE_OPTIONS.map(m => [m.value, m.label])
);

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  subcategory?: ExerciseSubcategory;
  notes?: string;
  muscles?: string[];
  description?: string;
  setsRange?: [number, number];
  repsRange?: [number, number];
  /** Worked one side at a time — lets the workout editor log weight per side. */
  unilateral?: boolean;
  /** How the exercise is loaded (see {@link LoadType}). Undefined = 'weighted'.
   *  For 'bodyweight'/'assisted' the volume calc folds in the user's bodyweight. */
  loadType?: LoadType;
  /** Fraction of bodyweight actually moved (0–1), for 'bodyweight'/'assisted'
   *  exercises — e.g. ~1 for dominades/fons, ~0.65 for flexions. Undefined = 1.
   *  Only advanced users edit it; otherwise it comes from the catalog default. */
  bodyweightFactor?: number;
  createdAt: Date;
}

export const DEFAULT_EXERCISES: Omit<Exercise, 'id' | 'createdAt'>[] = [
  {
    name: 'Press banca', category: 'push', subcategory: 'chest',
    muscles: ['pit', 'triceps', 'espatlles'],
    description: "Estirat al banc, agafa la barra a l'amplada dels espatlles. Baixa fins que toqui el pit de forma controlada i empenta cap amunt. Manté els peus al terra i el core tensat.",
    setsRange: [3, 4], repsRange: [6, 10],
  },
  {
    name: 'Press inclinat amb mancuernes', category: 'push', subcategory: 'chest',
    muscles: ['pit', 'triceps'],
    description: "Banc a 30–45°. Baixa les mancuernes fins als costats del pit amb els colzes a 45°. Treballa especialment la part superior del pit.",
    setsRange: [3, 4], repsRange: [8, 12],
  },
  {
    name: 'Creuaments en politja', category: 'push', subcategory: 'chest',
    muscles: ['pit'],
    description: "De peu al centre entre dues polítges altes. Creua els braços cap al centre amb els colzes lleugerament doblegats. Ideal per a congestió i definició del pit.",
    setsRange: [3, 4], repsRange: [12, 15],
  },
  {
    name: 'Press militar', category: 'push', subcategory: 'shoulders',
    muscles: ['espatlles', 'triceps'],
    description: "Dempeus o assegut, empenta la barra des dels espatlles fins a braços estesos. Enganxa el core per protegir la zona lumbar. Baixa de forma controlada.",
    setsRange: [3, 4], repsRange: [6, 10],
  },
  {
    name: 'Elevacions laterals', category: 'push', subcategory: 'shoulders',
    muscles: ['espatlles'],
    description: "Dempeus amb una mancuerna a cada mà, aixeca els braços lateralment fins a l'alçada dels espatlles. Moviment lent i controlat per màxim efecte al deltoides lateral.",
    setsRange: [3, 4], repsRange: [12, 20],
  },
  {
    name: 'Extensió tríceps politja', category: 'push', subcategory: 'triceps',
    muscles: ['triceps'],
    description: "Agafa la corda o barra i empenta cap avall mantenint els colzes fixos al costat del cos. Estira completament el braç al final del moviment.",
    setsRange: [3, 4], repsRange: [10, 15],
  },
  {
    name: 'Flexions', category: 'push', subcategory: 'chest',
    muscles: ['pit', 'triceps', 'espatlles'], loadType: 'bodyweight', bodyweightFactor: 0.65,
    description: "En planxa amb les mans a l'amplada dels espatlles, baixa el pit fins prop del terra amb els colzes a ~45° i empenta. Manté el cos recte i el core tens.",
    setsRange: [3, 4], repsRange: [8, 20],
  },
  {
    name: 'Fons en paral·leles', category: 'push', subcategory: 'triceps',
    muscles: ['triceps', 'pit', 'espatlles'], loadType: 'bodyweight', bodyweightFactor: 1,
    description: "Suspès entre dues barres paral·leles, baixa flexionant els colzes fins a ~90° i empenta. Inclina't endavant per fer més pit, vertical per més tríceps.",
    setsRange: [3, 4], repsRange: [5, 12],
  },
  {
    name: 'Dominades', category: 'pull', subcategory: 'back',
    muscles: ['esquena', 'biceps'], loadType: 'bodyweight', bodyweightFactor: 1,
    description: "Penja d'una barra amb agafada prona. Puja activant l'esquena fins que el mentó superi la barra. Baixa lentament i de forma controlada.",
    setsRange: [3, 5], repsRange: [5, 10],
  },
  {
    name: 'Rem invertit', category: 'pull', subcategory: 'back',
    muscles: ['esquena', 'biceps'], loadType: 'bodyweight', bodyweightFactor: 0.5,
    description: "Estirat sota una barra baixa, cos recte i talons al terra. Tira el pit cap a la barra mantenint el core tens. Com més horitzontal, més dur.",
    setsRange: [3, 4], repsRange: [8, 15],
  },
  {
    name: 'Rem amb barra', category: 'pull', subcategory: 'back',
    muscles: ['esquena', 'biceps'],
    description: "Peu a peu, inclina el tronc a 45° i tira la barra cap al melic. Manté l'esquena recta i neutral. Porta els colzes cap enrere per activar l'esquena.",
    setsRange: [3, 4], repsRange: [6, 10],
  },
  {
    name: 'Rem amb mancuernes', category: 'pull', subcategory: 'back',
    muscles: ['esquena', 'biceps'],
    description: "Recolza un genoll i una mà al banc. Tira la mancuerna cap al maluc mantenint l'espatlla estable. Ideal per treballar cada costat de forma independent.",
    setsRange: [3, 4], repsRange: [8, 12],
  },
  {
    name: 'Curl bíceps amb barra', category: 'pull', subcategory: 'biceps',
    muscles: ['biceps'],
    description: "Dempeus, dobla els avantbraços cap als espatlles mantenint els colzes fixos als costats del cos. Baixa de forma lenta per màxim estirament.",
    setsRange: [3, 4], repsRange: [8, 12],
  },
  {
    name: 'Curl bíceps amb mancuernes', category: 'pull', subcategory: 'biceps',
    muscles: ['biceps', 'avantbracos'],
    description: "Permet girar el canell (supinació) mentre puges per maximitzar la contracció. Alterna els braços o fes-los simultàniament.",
    setsRange: [3, 4], repsRange: [10, 15],
  },
  {
    name: 'Sentadilla', category: 'legs', subcategory: 'quads',
    muscles: ['quadriceps', 'glutis', 'isquiotibials'],
    description: "Peus a l'amplada dels malucs, puntes lleugerament obertes. Baixa fins que els malucs quedin per sota dels genolls. Manté el pit amunt i el pes als talons.",
    setsRange: [3, 5], repsRange: [5, 8],
  },
  {
    name: 'Premsa de cames', category: 'legs', subcategory: 'quads',
    muscles: ['quadriceps', 'glutis'],
    description: "Peus a l'amplada dels malucs a la plataforma. Baixa fins a 90° de flexió i empenta. No bloquegis del tot els genolls al final del moviment.",
    setsRange: [3, 4], repsRange: [8, 15],
  },
  {
    name: 'Pes mort romanès', category: 'legs', subcategory: 'hamstrings',
    muscles: ['isquiotibials', 'glutis', 'esquena'],
    description: "Peu a peu, baixa la barra lliscant per les cames mentre els malucs receden. Sent l'estirament als isquiotibials. Manté l'esquena recta en tot moment.",
    setsRange: [3, 4], repsRange: [8, 12],
  },
  {
    name: 'Hip thrust', category: 'legs', subcategory: 'glutes',
    muscles: ['glutis', 'isquiotibials'],
    description: "Recolza les espatlles al banc amb la barra als malucs. Empenta els malucs cap amunt fins a posició horitzontal contraient els glutis. El millor exercici aïllat per a glutis.",
    setsRange: [3, 4], repsRange: [8, 15],
  },
  {
    name: 'Elevació de bessons dempeus', category: 'legs', subcategory: 'calves',
    muscles: ['bessons'],
    description: "Dempeus en un escaló amb els talons suspesos. Puja sobre les puntes i baixa fins sentir l'estirament complet. Moviment lent i de rang complet.",
    setsRange: [3, 4], repsRange: [12, 20],
  },
  {
    name: 'Sentadilla amb pes corporal', category: 'legs', subcategory: 'quads',
    muscles: ['quadriceps', 'glutis'], loadType: 'bodyweight', bodyweightFactor: 0.6,
    description: "Peus a l'amplada dels malucs, baixa els malucs per sota dels genolls mantenint el pit amunt i els talons al terra. Puja empenyent des dels talons.",
    setsRange: [3, 4], repsRange: [12, 25],
  },
];

