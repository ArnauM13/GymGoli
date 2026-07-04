import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

export type FeedbackVariant = 'success' | 'error' | 'info';

export interface FeedbackToastData {
  message: string;
  variant: FeedbackVariant;
}

const VARIANT_ICON: Record<FeedbackVariant, string> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
};

@Component({
  selector: 'app-feedback-toast',
  standalone: true,
  template: `
    <div class="fb-toast" [class]="'fb-toast--' + data.variant">
      <div class="fb-bar"></div>
      <span class="material-symbols-outlined fb-icon">{{ icon }}</span>
      <span class="fb-msg">{{ data.message }}</span>
      <button type="button" class="fb-close" (click)="dismiss()" aria-label="Tancar">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
  `,
  styles: [`
    .fb-toast {
      display: flex; align-items: center; gap: 10px;
      min-width: 220px; max-width: 100%;
      padding: 12px 8px 12px 0;
      border-radius: 14px; overflow: hidden;
      background: var(--c-card); color: var(--c-text);
      box-shadow: 0 6px 24px var(--c-shadow-md), 0 2px 8px var(--c-shadow);
      animation: fb-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .fb-bar { width: 5px; align-self: stretch; flex-shrink: 0; border-radius: 0 4px 4px 0; }
    .fb-toast--success .fb-bar { background: #43a047; }
    .fb-toast--error   .fb-bar { background: #ef5350; }
    .fb-toast--info    .fb-bar { background: var(--c-brand); }
    .fb-icon {
      font-size: 20px; flex-shrink: 0;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .fb-toast--success .fb-icon { color: #43a047; }
    .fb-toast--error   .fb-icon { color: #ef5350; }
    .fb-toast--info    .fb-icon { color: var(--c-brand); }
    .fb-msg { flex: 1; font-size: 13.5px; font-weight: 600; line-height: 1.4; }
    .fb-close {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 26px; height: 26px; border-radius: 50%; border: none;
      background: transparent; color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: var(--c-hover); color: var(--c-text); }
    }
    @keyframes fb-in {
      from { transform: translateY(14px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
  `],
})
export class FeedbackToastComponent {
  readonly data = inject<FeedbackToastData>(MAT_SNACK_BAR_DATA);
  private readonly ref = inject(MatSnackBarRef<FeedbackToastComponent>);
  readonly icon = VARIANT_ICON[this.data.variant];

  dismiss(): void {
    this.ref.dismiss();
  }
}
