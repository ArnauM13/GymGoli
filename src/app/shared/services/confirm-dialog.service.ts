import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialogComponent, ConfirmDialogData } from '../components/confirm-dialog/confirm-dialog.component';

@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  private readonly dialog = inject(MatDialog);

  async confirm(message: string, options: Partial<Omit<ConfirmDialogData, 'message'>> = {}): Promise<boolean> {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { message, ...options } satisfies ConfirmDialogData,
      maxWidth: '360px',
      panelClass: 'confirm-dialog-panel',
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
