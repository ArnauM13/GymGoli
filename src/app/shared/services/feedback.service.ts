import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Mascot } from '../../core/models/mascot.model';
import { FeedbackToastComponent, FeedbackToastData, FeedbackVariant } from '../components/feedback-toast/feedback-toast.component';

const DEFAULT_DURATION: Record<FeedbackVariant, number> = {
  success: 2200,
  info: 2200,
  error: 3500,
};

/** Single entry point for on-screen feedback across the app — a small,
 *  color-coded toast (success/error/info) instead of raw MatSnackBar
 *  messages, so every screen looks and behaves the same way. */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly snackBar = inject(MatSnackBar);

  /** `mascot` fa que ho digui un gos: la seva cara al lloc del glif i la
   *  frase en la seva veu (`MASCOTES.md`). Sense gos, el toast de sempre. */
  success(message: string, duration = DEFAULT_DURATION.success, mascot?: Mascot): void {
    this.show(message, 'success', duration, mascot);
  }

  /** Un error no el diu mai cap gos: cap dels dos dona males notícies. */
  error(message: string, duration = DEFAULT_DURATION.error): void {
    this.show(message, 'error', duration);
  }

  info(message: string, duration = DEFAULT_DURATION.info, mascot?: Mascot): void {
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
