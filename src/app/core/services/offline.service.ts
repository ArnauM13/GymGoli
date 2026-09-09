import { Injectable, signal } from '@angular/core';

/**
 * Les pàgines que funcionen sense connexió.
 *
 * Són les que treballen amb el que hi ha guardat al dispositiu: entrenar,
 * l'activitat dels últims dies d'Inici, el catàleg d'exercicis, els esports i
 * els tipus, les plantilles i el perfil. La resta (l'historial sencer, el
 * progrés, els clients) demana coses que només són a la base de dades, i
 * ensenyar-les a mitges enganya més que no informa.
 */
const OFFLINE_ROUTES = [
  '/train', '/home', '/exercises', '/library', '/sports-config',
  '/training-types', '/templates', '/settings', '/debug',
];

@Injectable({ providedIn: 'root' })
export class OfflineService {
  readonly isOffline = signal(false);

  /** Si aquesta ruta es pot fer servir sense connexió. */
  worksOffline(url: string): boolean {
    const path = url.split('?')[0].split('#')[0];
    return OFFLINE_ROUTES.some(r => path === r || path.startsWith(`${r}/`));
  }

  constructor() {
    if (typeof window === 'undefined') return;
    this.isOffline.set(!navigator.onLine);
    window.addEventListener('online',  () => this.isOffline.set(false));
    window.addEventListener('offline', () => this.isOffline.set(true));
  }
}
