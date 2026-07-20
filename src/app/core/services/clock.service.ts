import { Injectable, signal } from '@angular/core';

const todayStr = (): string => new Date().toISOString().split('T')[0];

/**
 * Reactive calendar day. `today()` refreshes when the app returns to the
 * foreground and once a minute, so services and keep-alive pages never
 * keep working against yesterday's date after midnight (a PWA left open
 * in the background overnight is the normal case, not the exception).
 */
@Injectable({ providedIn: 'root' })
export class ClockService {
  private readonly _today = signal(todayStr());
  readonly today = this._today.asReadonly();

  constructor() {
    if (typeof window === 'undefined') return;
    window.addEventListener('focus', () => this.refresh());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.refresh();
    });
    setInterval(() => this.refresh(), 60_000);
  }

  refresh(): void {
    const t = todayStr();
    if (t !== this._today()) this._today.set(t);
  }
}
