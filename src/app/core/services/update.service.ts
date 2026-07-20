import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;

/** Reloads at most once per minute — a broken install that keeps failing
 *  must not put the app in an endless reload loop. */
export function reloadOncePerMinute(guardKey: string): void {
  try {
    const last = Number(sessionStorage.getItem(guardKey) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(guardKey, String(Date.now()));
  } catch { /* sessionStorage unavailable — reload anyway */ }
  location.reload();
}

/**
 * Keeps the installed PWA up to date. Without this, the service worker
 * keeps serving the old app shell until the user happens to do two full
 * reloads — users could stay on stale versions indefinitely.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  // Optional: absent in dev (service worker disabled) and in unit tests.
  private readonly updates = inject(SwUpdate, { optional: true });

  /** True once a new version is downloaded and ready to activate. */
  readonly updateReady = signal(false);

  constructor() {
    if (!this.updates?.isEnabled) return;

    this.updates.versionUpdates
      .pipe(filter(e => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));

    // A failed install can leave the running version unable to lazy-load
    // its chunks — recover with a (guarded) full reload.
    this.updates.versionUpdates
      .pipe(filter(e => e.type === 'VERSION_INSTALLATION_FAILED'))
      .subscribe(() => reloadOncePerMinute('gymgoli_sw_reload_at'));

    setInterval(() => this.check(), CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.check();
    });
  }

  check(): void {
    this.updates?.checkForUpdate().catch(() => { /* offline — ignore */ });
  }

  async reloadToUpdate(): Promise<void> {
    try { await this.updates?.activateUpdate(); } catch { /* activate best-effort */ }
    location.reload();
  }
}
