import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialogChoice, ConfirmDialogComponent, ConfirmDialogData } from '../components/confirm-dialog/confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);

  async confirm(message: string, options: Partial<Omit<ConfirmDialogData, 'message' | 'choices'>> = {}): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { message, ...options } satisfies ConfirmDialogData,
      maxWidth: '360px',
      panelClass: 'confirm-dialog-panel',
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }

  /** Shows a dialog with one button per choice (plus Cancel) instead of a
   *  single confirm/cancel pair. Resolves to the chosen `value`, or `null`
   *  if the user cancels or dismisses the dialog. */
  async chooseAction<T extends string>(
    message: string,
    choices: (Omit<ConfirmDialogChoice, 'value'> & { value: T })[],
    options: Partial<Omit<ConfirmDialogData, 'message' | 'choices' | 'confirmLabel' | 'variant'>> = {},
  ): Promise<T | null> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { message, choices, ...options } satisfies ConfirmDialogData,
      maxWidth: '360px',
      panelClass: 'confirm-dialog-panel',
    });
    const result = await firstValueFrom(ref.afterClosed());
    return (typeof result === 'string' ? result : null) as T | null;
  }
}
