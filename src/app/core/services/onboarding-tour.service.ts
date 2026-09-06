import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { TOUR_STOPS, TourStop } from '../models/onboarding-tour.model';
import { UserSettingsService } from './user-settings.service';

/**
 * Porta el tour guiat: quina parada toca, a quina pantalla ha d'anar i quan
 * s'acaba. Qui pinta el focus i la targeta és `OnboardingTourComponent`; aquí
 * no hi ha res del DOM.
 *
 * Es fa servir des de dos llocs: just després de l'onboarding (si l'usuari
 * l'accepta) i des de Perfil, a la secció «Onboarding», per repetir-lo. No
 * s'engega mai tot sol a algú que ja fa servir l'app: un tour que t'assalta
 * és pitjor que no tenir-ne.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingTourService {
  private router   = inject(Router);
  private settings = inject(UserSettingsService);

  private readonly _index  = signal(0);
  private readonly _active = signal(false);

  readonly stops  = TOUR_STOPS;
  readonly total  = TOUR_STOPS.length;
  readonly active = this._active.asReadonly();
  readonly index  = this._index.asReadonly();

  readonly stop    = computed<TourStop | null>(() =>
    this._active() ? TOUR_STOPS[this._index()] ?? null : null);
  readonly isFirst = computed(() => this._index() === 0);
  readonly isLast  = computed(() => this._index() === TOUR_STOPS.length - 1);

  /** Ja l'ha fet (o l'ha saltat) alguna vegada. */
  readonly done = computed(() => this.settings.guidedTourDone());

  start(): void {
    this._index.set(0);
    this._active.set(true);
    this._go(TOUR_STOPS[0]);
  }

  next(): void {
    if (this.isLast()) { this.finish(); return; }
    this._index.update(i => i + 1);
    this._go(TOUR_STOPS[this._index()]);
  }

  prev(): void {
    if (this.isFirst()) return;
    this._index.update(i => i - 1);
    this._go(TOUR_STOPS[this._index()]);
  }

  /** L'usuari el talla pel mig. Compta com a fet: no se li ha de tornar a
   *  oferir sol, i sempre el té a Perfil, a «Onboarding», si el vol
   *  reprendre. */
  skip(): void { this._end(); }

  finish(): void { this._end(); }

  private _end(): void {
    this._active.set(false);
    this.settings.update({ guidedTourDone: true });
    this.router.navigate(['/home']);
  }

  /** Navega només si cal: repetir la mateixa ruta recrearia la pàgina i
   *  faria saltar el focus que acabem de mesurar. */
  private _go(stop: TourStop): void {
    const current = this.router.url.split('?')[0];
    if (current === stop.route && !stop.queryParams) return;
    this.router.navigate([stop.route], stop.queryParams ? { queryParams: stop.queryParams } : {});
  }
}
