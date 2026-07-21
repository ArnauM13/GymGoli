import { Component, input, output } from '@angular/core';

/** Error state for data that failed to load — shown instead of an
 *  empty state so a network/server failure never reads as "no tens
 *  dades". Keeps the same visual language as the empty states. */
@Component({
  selector: 'app-load-error',
  standalone: true,
  template: `
    <div class="load-error">
      <span class="material-symbols-outlined load-error-icon">cloud_off</span>
      <p class="load-error-text">{{ message() }}</p>
      <button class="load-error-retry" (click)="retry.emit()">
        <span class="material-symbols-outlined">refresh</span>
        Torna-ho a provar
      </button>
    </div>
  `,
  styles: [`
    .load-error { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 28px 16px; text-align: center; }
    .load-error-icon { font-size: 44px; color: #ccc; }
    .load-error-text { margin: 0; font-size: 14px; color: #888; }
    .load-error-retry {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 18px; border: 1px solid #e0e0e0; border-radius: 20px;
      background: #ffffff; color: #555; font-size: 14px; font-weight: 500;
      cursor: pointer; transition: background 0.15s ease;
    }
    .load-error-retry:hover { background: #f5f5f7; }
    .load-error-retry .material-symbols-outlined { font-size: 18px; }
  `],
})
export class LoadErrorComponent {
  readonly message = input('No s\'han pogut carregar les dades');
  readonly retry   = output<void>();
}
