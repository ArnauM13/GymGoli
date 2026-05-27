import { Component, inject, input } from '@angular/core';
import { Location } from '@angular/common';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="ph">
      @if (showBack()) {
        <button class="ph-back" (click)="location.back()" aria-label="Enrere">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
      }
      <h1 class="ph-title">{{ title() }}</h1>
      <div class="ph-actions">
        <ng-content />
      </div>
    </header>
  `,
  styles: [`
    .ph {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 16px 10px;
    }
    .ph-title {
      margin: 0; flex: 1;
      font-size: 22px; font-weight: 700; color: var(--c-text); letter-spacing: -0.3px;
    }
    .ph-back {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      border: none; background: var(--c-subtle); color: var(--c-text-2);
      cursor: pointer; transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-hover); }
    }
    .ph-actions {
      display: flex; align-items: center; gap: 6px;
      &:empty { display: none; }
    }
  `],
})
export class PageHeaderComponent {
  readonly title    = input.required<string>();
  readonly showBack = input(false);
  protected readonly location = inject(Location);
}
