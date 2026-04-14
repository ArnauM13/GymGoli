export interface SportSubtype {
  id: string;    // client-generated UUID
  name: string;
}

export interface Sport {
  id: string;
  name: string;
  icon: string;        // Material Symbol name
  color: string;       // hex colour
  subtypes: SportSubtype[];
  createdAt: Date;
}

export interface SportSession {
  id: string;
  date: string;        // YYYY-MM-DD
  sportId: string;     // FK → Sport.id
  subtypeId?: string;  // optional SportSubtype.id
  notes?: string;
  createdAt: Date;
}

/** Selectable Material Symbol icons for sports. */
export const SPORT_ICONS: string[] = [
  'sports_soccer', 'sports_tennis', 'directions_run', 'sports_basketball',
  'sports_handball', 'pool', 'pedal_bike', 'sports_volleyball',
  'sports_golf', 'hiking', 'sports_martial_arts', 'downhill_skiing',
  'kitesurfing', 'surfing', 'sports_rugby', 'ice_skating',
];

/** Preset colours for sports. */
export const SPORT_COLORS: string[] = [
  '#43A047', '#FB8C00', '#8E24AA', '#1E88E5',
  '#E53935', '#00ACC1', '#F4511E', '#7CB342',
];

/** Default sports seeded on first login. */
export const DEFAULT_SPORTS: Pick<Sport, 'name' | 'icon' | 'color'>[] = [
  { name: 'Futbol',  icon: 'sports_soccer', color: '#43A047' },
  { name: 'Pàdel',   icon: 'sports_tennis',  color: '#FB8C00' },
  { name: 'Córrer',  icon: 'directions_run', color: '#8E24AA' },
];
