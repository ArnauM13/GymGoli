import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Mascot } from '../../core/models/mascot.model';
import { FeedbackToastComponent, FeedbackToastData, FeedbackVariant } from '../components/feedback-toast/feedback-toast.component';

const DEFAULT_DURATION: Record<FeedbackVariant, number> = {
  success: 2200,
  info: 2200,
  error: 3500,
};

/**
 * L'única manera de dir-li res a l'usuari a la pantalla.
 *
 * Tot el que canvia les seves dades es confirma —crear, editar, unir,
 * esborrar—, perquè d'una escriptura que no diu res no se'n sap mai si ha
 * passat. La forma la posa `FeedbackToastComponent`; d'aquí surt qui ho diu i
 * quanta estona.
 *
 * ── Sempre amb gos ──
 * Una confirmació la diu el Marley si va de gimnàs, el Xoco si va d'esport i
 * tots dos si no és de cap dels dos mons (vegeu `MASCOTES.md`). Qui truca no
 * ho ha de recordar: **sense mascota, hi van tots dos**. Així no hi ha cap
 * camí que acabi en un tic de sistema, que era el que passava a la majoria.
 */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly snackBar = inject(MatSnackBar);

  /** `mascot` diu qui ho celebra. Si no se'n diu cap, tots dos. */
  success(message: string, duration = DEFAULT_DURATION.success, mascot: Mascot = 'both'): void {
    this.show(message, 'success', duration, mascot);
  }

  /** Un error no el diu mai cap gos: cap dels dos dona males notícies. */
  error(message: string, duration = DEFAULT_DURATION.error): void {
    this.show(message, 'error', duration);
  }

  info(message: string, duration = DEFAULT_DURATION.info, mascot: Mascot = 'both'): void {
    this.show(message, 'info', duration, mascot);
  }

  private show(message: string, variant: FeedbackVariant, duration: number, mascot?: Mascot): void {
    this.snackBar.openFromComponent(FeedbackToastComponent, {
      data: { message, variant, mascot } satisfies FeedbackToastData,
      duration,
      panelClass: 'feedback-toast-panel',
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}
