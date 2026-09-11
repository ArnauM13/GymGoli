import { FeelingLevel, PlannedSource } from './workout.model';

export type MetricType = 'number' | 'select';

export interface SportMetricOption { value: string; label: string; }

export interface SportMetricDef {
  key: string;
  label: string;
  type: MetricType;
  unit?: string;
  options?: SportMetricOption[];
  min?: number;
  max?: number;
  step?: number;
}

export interface SportSubtype {
  id: string;
  name: string;
}

export interface Sport {
  id: string;
  name: string;
  icon: string;
  color: string;
  subtypes: SportSubtype[];
  metricDefs: SportMetricDef[];
  createdAt: Date;
}

export type SportSessionStatus = 'planned' | 'done';

export interface SportSession {
  id: string;
  date: string;
  sportId: string;
  subtypeId?: string;
  duration?: number;       // minutes
  feeling?: FeelingLevel;  // 1–5
  metrics?: Record<string, string | number>;
  notes?: string;
  status?: SportSessionStatus; // absent = 'done' (retrocompat)
  plannedSource?: PlannedSource;
  /** Les activitats que en comparteixen un són la mateixa sessió — vegeu
   *  `Workout.sessionGroupId` i `shared/utils/session-group.utils`. Absent
   *  vol dir que la sessió d'esport és una sessió ella sola. */
  sessionGroupId?: string;
  createdAt: Date;
  /** Quan la sessió es va fer de debò, si no és quan es va crear la fila —un
   *  pàdel apuntat per dijous i jugat dijous. Vegeu `Workout.startedAt`: és
   *  el que ordena el dia. */
  startedAt?: Date;
}

/** Selectable Material Symbol icons for sports.
 *
 *  Van per famílies perquè qui busca la seva no llegeix la llista: hi passa
 *  l'ull per sobre i mira on cau el seu esport. Treure'n cap trencaria els
 *  esports que ja la fan servir —la icona es guarda amb l'esport—, així que
 *  la llista només creix. */
export const SPORT_ICONS: string[] = [
  // Pilota
  'sports_soccer', 'sports_basketball', 'sports_volleyball', 'sports_handball',
  'sports_rugby', 'sports_football', 'sports_baseball', 'sports_cricket',
  'sports_hockey', 'sports_tennis', 'pickleball', 'sports_golf',
  // Córrer i caminar
  'directions_run', 'sprint', 'directions_walk', 'nordic_walking', 'hiking',
  // Rodes i patins
  'pedal_bike', 'skateboarding', 'roller_skating', 'ice_skating',
  // Aigua
  'pool', 'scuba_diving', 'surfing', 'kitesurfing', 'rowing', 'kayaking', 'sailing',
  // Neu
  'downhill_skiing', 'snowboarding', 'snowshoeing', 'sledding',
  // Cos i combat: ioga, gimnàstica i arts marcials
  'self_improvement', 'sports_gymnastics', 'sports_martial_arts', 'sports_mma',
  'sports_kabaddi',
  // Aire, i les dues genèriques per a tot el que no hi surt
  'paragliding', 'fitness_center', 'sports',
];

/** Preset colours for sports: tons plens, que és el que distingeix un esport
 *  d'un altre d'un cop d'ull al calendari i a l'activitat. Els tipus
 *  d'entrenament porten la mateixa roda un to més clar. */
export const SPORT_COLORS: string[] = [
  '#43A047', '#FB8C00', '#8E24AA', '#1E88E5',
  '#E53935', '#00ACC1', '#F4511E', '#7CB342',
  '#6D4C41', '#546E7A', '#F9A825', '#AD1457',
  '#3949AB', '#5E35B1', '#00897B', '#C0CA33',
  '#D81B60', '#039BE5', '#EF6C00', '#616161',
];

/**
 * All available metric definitions users can add to any sport.
 * Supabase migration required:
 *   ALTER TABLE sports ADD COLUMN IF NOT EXISTS metric_defs jsonb DEFAULT '[]';
 *   ALTER TABLE sport_sessions
 *     ADD COLUMN IF NOT EXISTS duration  integer,
 *     ADD COLUMN IF NOT EXISTS feeling   smallint,
 *     ADD COLUMN IF NOT EXISTS metrics   jsonb DEFAULT '{}';
 */
export const METRIC_CATALOGUE: SportMetricDef[] = [
  { key: 'distance_km', label: 'Distància',    type: 'number', unit: 'km', min: 0.5, max: 100,   step: 0.5 },
  { key: 'distance_m',  label: 'Distància',    type: 'number', unit: 'm',  min: 100, max: 10000, step: 100 },
  { key: 'pace',        label: 'Ritme',         type: 'select', options: [
    { value: 'lent',    label: 'Lent' },
    { value: 'moderat', label: 'Moderat' },
    { value: 'rapid',   label: 'Ràpid' },
  ]},
  { key: 'terrain',     label: 'Terreny',       type: 'select', options: [
    { value: 'asfaltat',   label: 'Asfaltat' },
    { value: 'senderisme', label: 'Senderisme' },
    { value: 'muntanya',   label: 'Muntanya' },
    { value: 'platja',     label: 'Platja' },
    { value: 'cinta',      label: 'Cinta' },
  ]},
  { key: 'match_type',  label: 'Tipus',         type: 'select', options: [
    { value: 'partida',     label: 'Partida' },
    { value: 'entrenament', label: 'Entrenament' },
  ]},
  { key: 'result',      label: 'Resultat',      type: 'select', options: [
    { value: 'guanyat', label: 'Guanyat 🏆' },
    { value: 'empat',   label: 'Empat' },
    { value: 'perdut',  label: 'Perdut' },
  ]},
  { key: 'goals',       label: 'Gols marcats',  type: 'number', min: 0, max: 20,  step: 1 },
  { key: 'points',      label: 'Punts marcats', type: 'number', min: 0, max: 150, step: 1 },
  { key: 'sets_won',    label: 'Sets guanyats', type: 'number', min: 0, max: 4,  step: 1 },
  { key: 'sets_lost',   label: 'Sets perduts',  type: 'number', min: 0, max: 4,  step: 1 },
  { key: 'style_swim',  label: 'Estil',         type: 'select', options: [
    { value: 'crol',      label: 'Crol' },
    { value: 'brassa',    label: 'Braça' },
    { value: 'esquena',   label: 'Esquena' },
    { value: 'papallona', label: 'Papallona' },
    { value: 'lliure',    label: 'Lliure' },
  ]},
  { key: 'environment', label: 'Entorn',          type: 'select', options: [
    { value: 'piscina', label: 'Piscina' },
    { value: 'mar',     label: 'Mar' },
    { value: 'llac',    label: 'Llac' },
  ]},
  { key: 'yoga_style',  label: 'Estil',           type: 'select', options: [
    { value: 'hatha',       label: 'Hatha' },
    { value: 'vinyasa',     label: 'Vinyasa' },
    { value: 'yin',         label: 'Yin' },
    { value: 'ashtanga',    label: 'Ashtanga' },
    { value: 'restauratiu', label: 'Restauratiu' },
    { value: 'nidra',       label: 'Yoga Nidra' },
  ]},
  { key: 'intensity',   label: 'Intensitat',      type: 'select', options: [
    { value: 'baixa',    label: 'Baixa' },
    { value: 'moderada', label: 'Moderada' },
    { value: 'alta',     label: 'Alta' },
  ]},
];

/**
 * Quines mètriques valen la pena a la previsualització de la targeta, de més
 * a menys rellevant.
 *
 * La targeta és un cop d'ull: hi caben dues xifres i prou (la durada compta
 * com una). Un partit de pàdel es reconeix pel resultat, una sortida a córrer
 * per la distància; el terreny o l'estil són context que ja surt en obrir la
 * sessió. Una clau que no sigui aquí queda l'última, per ordre del propi
 * esport.
 */
export const CARD_METRIC_PRIORITY: string[] = [
  'result', 'distance_km', 'distance_m', 'goals', 'points',
  'sets_won', 'sets_lost', 'intensity', 'pace', 'style_swim',
  'yoga_style', 'terrain', 'environment', 'match_type',
];

/**
 * Les mètriques on una xifra alta és una fita, i per tant es poden coronar
 * com a rècord al detall d'una sessió.
 *
 * Hi ha d'anar només el que millora quan puja: els sets perduts no hi són, i
 * cap tria (`select`) tampoc — guanyar un partit és una alegria, no un rècord
 * a batre. La durada es tracta a part: val per a qualsevol esport.
 */
export const RECORD_METRICS: string[] = [
  'distance_km', 'distance_m', 'goals', 'points', 'sets_won',
];

function _m(key: string): SportMetricDef {
  const def = METRIC_CATALOGUE.find(m => m.key === key);
  if (!def) throw new Error(`Metric key "${key}" not found in catalogue`);
  return def;
}

/** Default sports seeded on first login. */
export const DEFAULT_SPORTS: Pick<Sport, 'name' | 'icon' | 'color' | 'subtypes' | 'metricDefs'>[] = [
  {
    name: 'Caminar', icon: 'directions_walk', color: '#43A047', subtypes: [],
    metricDefs: [_m('distance_km'), _m('pace'), _m('terrain')],
  },
  {
    name: 'Futbol', icon: 'sports_soccer', color: '#1E88E5', subtypes: [],
    metricDefs: [_m('match_type'), _m('result'), _m('goals')],
  },
  {
    name: 'Pàdel', icon: 'sports_tennis', color: '#FB8C00', subtypes: [],
    metricDefs: [_m('match_type'), _m('result'), _m('sets_won'), _m('sets_lost')],
  },
  {
    name: 'Yoga', icon: 'self_improvement', color: '#8E24AA',
    subtypes: [
      { id: 'hatha',       name: 'Hatha' },
      { id: 'vinyasa',     name: 'Vinyasa' },
      { id: 'ashtanga',    name: 'Ashtanga' },
      { id: 'iyengar',     name: 'Iyengar' },
      { id: 'bikram',      name: 'Bikram' },
      { id: 'hot',         name: 'Hot Yoga' },
      { id: 'yin',         name: 'Yin' },
      { id: 'restauratiu', name: 'Restauratiu' },
      { id: 'nidra',       name: 'Yoga Nidra' },
      { id: 'kundalini',   name: 'Kundalini' },
      { id: 'power',       name: 'Power Yoga' },
      { id: 'sivananda',   name: 'Sivananda' },
      { id: 'jivamukti',   name: 'Jivamukti' },
      { id: 'anusara',     name: 'Anusara' },
      { id: 'prenatal',    name: 'Prenatal' },
      { id: 'aeri',        name: 'Aeri' },
      { id: 'acroyoga',    name: 'Acroyoga' },
    ],
    // Style now lives in the subtypes above; keep only intensity as a metric.
    metricDefs: [_m('intensity')],
  },
  {
    name: 'Natació', icon: 'pool', color: '#00ACC1', subtypes: [],
    metricDefs: [_m('distance_m'), _m('style_swim'), _m('environment')],
  },
  {
    name: 'Bàsquet', icon: 'sports_basketball', color: '#EF6C00', subtypes: [],
    metricDefs: [_m('match_type'), _m('result'), _m('points')],
  },
];
