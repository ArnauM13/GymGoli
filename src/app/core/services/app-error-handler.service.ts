import { ErrorHandler, Injectable, NgZone, inject, isDevMode } from '@angular/core';

import { FeedbackService } from '../../shared/services/feedback.service';

/** How long the same error message is suppressed after it's been shown once.
 *  A template expression that throws re-throws on every change-detection pass,
 *  so without this window one recurring error would open an unbounded stream
 *  of identical toasts and freeze the page. Matches the toast's own lifespan. */
const DEDUPE_MS = 5000;

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly feedback = inject(FeedbackService);
  private readonly zone     = inject(NgZone);

  /** Re-entrancy guard: showing a toast triggers change detection, which can
   *  re-throw the very error we're handling before this call returns. */
  private _showing = false;
  private _lastMessage = '';
  private _lastShownAt = 0;

  handleError(error: unknown): void {
    if (isDevMode()) {
      console.error('[AppError]', error);
    }

    const msg = error instanceof Error ? error.message : String(error);

    // Ignore chunk-load errors on SW update (page will reload automatically)
    if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) return;

    const now = Date.now();
    // Never stack a second toast on top of one we're already opening, and
    // collapse a burst of the same error into a single toast per window — the
    // fix that keeps a repeating render error from spiralling into a page crash.
    if (this._showing) return;
    if (msg === this._lastMessage && now - this._lastShownAt < DEDUPE_MS) return;

    this._showing = true;
    this._lastMessage = msg;
    this._lastShownAt = now;
    try {
      this.zone.run(() => {
        this.feedback.error('S\'ha produït un error inesperat. Torna-ho a provar.', 5000);
      });
    } finally {
      this._showing = false;
    }
  }
}
