import { FeelingLevel } from './workout.model';

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

export interface SportSession {
  id: string;
  date: string;
  sportId: string;
  subtypeId?: string;
  duration?: number;       // minutes
  feeling?: FeelingLevel;  // 1–5
  metrics?: Record<string, string | number>;
  notes?: string;
  createdAt: Date;
}

/** Selectable Material Symbol icons for sports. */
export const SPORT_ICONS: string[] = [
  'sports_soccer', 'sports_tennis', 'directions_run', 'directions_walk',
  'sports_basketball', 'sports_handball', 'pool', 'pedal_bike',
  'sports_volleyball', 'sports_golf', 'hiking', 'sports_martial_arts',
  'downhill_skiing', 'kitesurfing', 'surfing', 'sports_rugby', 'ice_skating',
];

/** Preset colours for sports. */
export const SPORT_COLORS: string[] = [
  '#43A047', '#FB8C00', '#8E24AA', '#1E88E5',
  '#E53935', '#00ACC1', '#F4511E', '#7CB342',
  '#6D4C41', '#546E7A', '#F9A825', '#AD1457',
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
  { key: 'goals',       label: 'Gols marcats',  type: 'number', min: 0, max: 20, step: 1 },
  { key: 'sets_won',    label: 'Sets guanyats', type: 'number', min: 0, max: 4,  step: 1 },
  { key: 'sets_lost',   label: 'Sets perduts',  type: 'number', min: 0, max: 4,  step: 1 },
  { key: 'style_swim',  label: 'Estil',         type: 'select', options: [
    { value: 'crol',      label: 'Crol' },
    { value: 'brassa',    label: 'Braça' },
    { value: 'esquena',   label: 'Esquena' },
    { value: 'papallona', label: 'Papallona' },
    { value: 'llure',     label: 'Llure' },
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
    name: 'Yoga', icon: 'sports_martial_arts', color: '#8E24AA', subtypes: [],
    metricDefs: [_m('yoga_style'), _m('intensity')],
  },
  {
    name: 'Natació', icon: 'pool', color: '#00ACC1', subtypes: [],
    metricDefs: [_m('distance_m'), _m('style_swim'), _m('environment')],
  },
];
