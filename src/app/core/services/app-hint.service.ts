import { Injectable, computed, inject } from '@angular/core';

import { UserSettingsService } from './user-settings.service';

/**
 * A discovery nudge: a small, dismissible card that points the user at a
 * feature/setting they might not know exists. Generalises the one-off
 * "set up a routine" hint into a reusable, per-id-dismissible system so new
 * nudges can be added in one place.
 */
export interface AppHint {
  /** Stable id persisted once dismissed — never reuse for different copy. */
  id: string;
  icon: string;
  title: string;
  body: string;
  /** Router link the CTA navigates to. */
  route: string;
  /** CTA label. */
  cta: string;
}

/** Curated discovery hints, shown one at a time on Inici (first un-dismissed
 *  wins). Ordered by how broadly useful they are. */
const DISCOVERY_HINTS: AppHint[] = [
  {
    id: 'discover-sports',
    icon: 'directions_run',
    title: 'Registra també els teus esports',
    body: 'Configura els esports que practiques i registra sessions amb durada, sensació i mètriques pròpies.',
    route: '/sports-config',
    cta: 'Configurar esports',
  },
  {
    id: 'discover-exercises',
    icon: 'fitness_center',
    title: 'Organitza els teus exercicis',
    body: 'Afegeix, edita i classifica els exercicis que fas servir als teus entrenaments.',
    route: '/exercises',
    cta: 'Configurar exercicis',
  },
  {
    id: 'discover-templates',
    icon: 'bookmark',
    title: 'Crea plantilles d\'entrenament',
    body: 'Desa les teves rutines com a plantilles i comença el proper entrenament en un sol tap.',
    route: '/templates',
    cta: 'Veure plantilles',
  },
  {
    id: 'discover-goal',
    icon: 'flag',
    title: 'Marca\'t un objectiu setmanal',
    body: 'Defineix quantes activitats vols fer cada setmana i segueix el teu progrés — pots separar gym i esport.',
    route: '/settings',
    cta: 'Definir objectiu',
  },
  {
    id: 'discover-progress',
    icon: 'bar_chart',
    title: 'Mira el teu progrés',
    body: 'Gràfiques, resum i seguiment de l\'objectiu setmanal amb tot el teu historial.',
    route: '/charts',
    cta: 'Veure progrés',
  },
  {
    id: 'discover-preferences',
    icon: 'palette',
    title: 'Fes l\'app teva des de Perfil',
    body: 'Tema, unitats de pes (kg/lb) i temporitzador de descans entre sèries: tot es pot personalitzar.',
    route: '/settings',
    cta: 'Obrir Perfil',
  },
  {
    id: 'discover-advanced',
    icon: 'tune',
    title: 'Opcions per entrenar més fi',
    body: 'Activa supersets, dropsets, RIR o l\'escala de dificultat numèrica als paràmetres avançats.',
    route: '/settings/advanced',
    cta: 'Paràmetres avançats',
  },
];

@Injectable({ providedIn: 'root' })
export class AppHintService {
  private settingsService = inject(UserSettingsService);

  private readonly _dismissed = computed(() => new Set(this.settingsService.dismissedHints()));

  /** Whether a given hint id has been dismissed. */
  isDismissed(id: string): boolean {
    return this._dismissed().has(id);
  }

  /** The first discovery hint the user hasn't dismissed yet, or null. */
  readonly nextDiscoveryHint = computed((): AppHint | null =>
    DISCOVERY_HINTS.find(h => !this._dismissed().has(h.id)) ?? null
  );

  /** Permanently dismiss a hint (persisted in user settings). */
  dismiss(id: string): void {
    if (this._dismissed().has(id)) return;
    this.settingsService.update({
      dismissedHints: [...this.settingsService.dismissedHints(), id],
    });
  }
}
