import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class OfflineService {
  readonly isOffline = signal(false);

  constructor() {
    if (typeof window === 'undefined') return;
    this.isOffline.set(!navigator.onLine);
    window.addEventListener('online',  () => this.isOffline.set(false));
    window.addEventListener('offline', () => this.isOffline.set(true));
  }
}
