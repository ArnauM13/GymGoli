import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

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

  success(message: string, duration = DEFAULT_DURATION.success): void {
    this.show(message, 'success', duration);
  }

  error(message: string, duration = DEFAULT_DURATION.error): void {
    this.show(message, 'error', duration);
  }

  info(message: string, duration = DEFAULT_DURATION.info): void {
    this.show(message, 'info', duration);
  }

  private show(message: string, variant: FeedbackVariant, duration: number): void {
    this.snackBar.openFromComponent(FeedbackToastComponent, {
      data: { message, variant } satisfies FeedbackToastData,
      duration,
      panelClass: 'feedback-toast-panel',
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}
