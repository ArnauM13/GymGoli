import { ErrorHandler, Injectable, NgZone, inject, isDevMode } from '@angular/core';

import { FeedbackService } from '../../shared/services/feedback.service';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly feedback = inject(FeedbackService);
  private readonly zone     = inject(NgZone);

  handleError(error: unknown): void {
    if (isDevMode()) {
      console.error('[AppError]', error);
    }

    // Ignore chunk-load errors on SW update (page will reload automatically)
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) return;

    this.zone.run(() => {
      this.feedback.error('S\'ha produït un error inesperat. Torna-ho a provar.', 5000);
    });
  }
}
