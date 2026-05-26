import { ErrorHandler, Injectable, NgZone, inject, isDevMode } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable()
export class AppErrorHandler implements ErrorHandler {
  private readonly snackBar = inject(MatSnackBar);
  private readonly zone     = inject(NgZone);

  handleError(error: unknown): void {
    if (isDevMode()) {
      console.error('[AppError]', error);
    }

    // Ignore chunk-load errors on SW update (page will reload automatically)
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) return;

    this.zone.run(() => {
      this.snackBar.open(
        'S\'ha produït un error inesperat. Torna-ho a provar.',
        'Tancar',
        { duration: 5000, panelClass: 'snack-error' },
      );
    });
  }
}
