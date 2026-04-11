export type SportType = 'football' | 'padel' | 'running';

export interface SportSession {
  id: string;
  date: string; // YYYY-MM-DD
  sport: SportType;
  durationMinutes?: number;
  notes?: string;
  createdAt: Date;
}

export const SPORT_CONFIG: Record<SportType, { label: string; icon: string; color: string }> = {
  football: { label: 'Futbol',  icon: 'sports_soccer', color: '#43A047' },
  padel:    { label: 'Pàdel',   icon: 'sports_tennis', color: '#FB8C00' },
  running:  { label: 'Córrer',  icon: 'directions_run', color: '#8E24AA' },
};

export const SPORT_TYPES: SportType[] = ['football', 'padel', 'running'];

/** Single dot colour for calendar indicators (sport sessions). */
export const SPORT_DOT_COLOR = '#FB8C00';
