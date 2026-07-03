import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ConfirmDialogChoice {
  label: string;
  value: string;
  variant?: 'danger' | 'default';
}

export interface ConfirmDialogData {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  /** When given, renders one button per choice (each closing with its
   *  `value`) instead of the default single confirm/cancel pair. */
  choices?: ConfirmDialogChoice[];
}

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [MatDialogModule],
  template: `
    <div class="cd-wrap">
      @if (data.title) {
        <h2 class="cd-title">{{ data.title }}</h2>
      }
      <p class="cd-msg">{{ data.message }}</p>
      <div class="cd-actions">
        <button class="cd-btn cd-btn--cancel" (click)="close(null)">{{ data.cancelLabel ?? 'Cancel·lar' }}</button>
        @if (data.choices?.length) {
          @for (choice of data.choices; track choice.value) {
            <button class="cd-btn"
                    [class.cd-btn--danger]="choice.variant === 'danger'"
                    [class.cd-btn--confirm]="choice.variant !== 'danger'"
                    (click)="close(choice.value)">
              {{ choice.label }}
            </button>
          }
        } @else {
          <button class="cd-btn"
                  [class.cd-btn--danger]="data.variant === 'danger'"
                  [class.cd-btn--confirm]="data.variant !== 'danger'"
                  (click)="close(true)">
            {{ data.confirmLabel ?? 'Confirmar' }}
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    .cd-wrap { padding: 24px 20px 16px; max-width: 320px; }
    .cd-title { margin: 0 0 10px; font-size: 17px; font-weight: 700; color: var(--c-text); }
    .cd-msg { margin: 0 0 20px; font-size: 14px; color: var(--c-text-2); line-height: 1.55; }
    .cd-actions { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
    .cd-btn {
      padding: 10px 18px; border-radius: 10px; font-size: 14px; font-weight: 600;
      cursor: pointer; border: none; transition: background 0.15s;
    }
    .cd-btn--cancel {
      background: var(--c-subtle); color: var(--c-text-2);
      border: 1.5px solid var(--c-border-2);
      &:hover { background: var(--c-border); }
    }
    .cd-btn--danger  { background: #d32f2f; color: #fff; &:hover { background: #b71c1c; } }
    .cd-btn--confirm { background: var(--c-brand); color: #fff; &:hover { background: var(--c-brand-dk); } }
  `],
})
export class ConfirmDialogComponent {
  readonly data    = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent, boolean | string | null>);

  close(result: boolean | string | null): void { this.dialogRef.close(result); }
}
