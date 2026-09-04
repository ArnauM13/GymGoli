import { DestroyRef, Injectable, inject, signal } from '@angular/core';

import { nextMidnight, todayStr } from '../../shared/utils/date.utils';

/**
 * Quin dia és avui, com a senyal.
 *
 * L'app es queda oberta (és una PWA): sense això, una pestanya oberta des
 * d'ahir es pensa que encara és ahir i "Avui" apunta al dia equivocat. El
 * senyal salta a la **mitjanit local** de l'usuari i també quan es torna a
 * l'app, que és quan un mòbil desperta i el temporitzador pot haver quedat
 * enrere.
 */
@Injectable({ providedIn: 'root' })
export class TodayService {
  private readonly _today = signal(todayStr());

  /** `YYYY-MM-DD` del dia actual de l'usuari. */
  readonly today = this._today.asReadonly();

  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this._scheduleMidnight();
    document.addEventListener('visibilitychange', this._onVisible);
    window.addEventListener('focus', this._onVisible);

    inject(DestroyRef).onDestroy(() => {
      if (this._timer) clearTimeout(this._timer);
      document.removeEventListener('visibilitychange', this._onVisible);
      window.removeEventListener('focus', this._onVisible);
    });
  }

  /** Torna a mirar el rellotge ara mateix. */
  refresh(): void {
    const now = todayStr();
    if (now !== this._today()) this._today.set(now);
  }

  private readonly _onVisible = (): void => {
    if (document.visibilityState === 'hidden') return;
    this.refresh();
    this._scheduleMidnight();
  };

  private _scheduleMidnight(): void {
    if (this._timer) clearTimeout(this._timer);
    // Un segon de coixí perquè el temporitzador no s'avanci a la mitjanit per
    // arrodoniment i es quedi amb el dia d'ahir.
    const ms = Math.max(1000, nextMidnight().getTime() - Date.now() + 1000);
    // setTimeout satura per sobre de ~24,8 dies; aquí mai hi arribem.
    this._timer = setTimeout(() => {
      this.refresh();
      this._scheduleMidnight();
    }, ms);
  }
}
