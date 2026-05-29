import { Injectable, computed, signal } from '@angular/core';

const LS_KEY = 'gymgoli_force_offline';

@Injectable({ providedIn: 'root' })
export class OfflineService {
  private readonly _networkOffline = signal(false);
  readonly forceOffline            = signal(false);

  readonly isOffline = computed(() => this.forceOffline() || this._networkOffline());

  constructor() {
    if (typeof window === 'undefined') return;
    this._networkOffline.set(!navigator.onLine);
    window.addEventListener('online',  () => this._networkOffline.set(false));
    window.addEventListener('offline', () => this._networkOffline.set(true));
    this.forceOffline.set(localStorage.getItem(LS_KEY) === 'true');
  }

  toggleForceOffline(): void {
    const next = !this.forceOffline();
    this.forceOffline.set(next);
    localStorage.setItem(LS_KEY, String(next));
  }
}
