import { Component, inject, input } from '@angular/core';
import { NavigationHistoryService } from '../../../core/services/navigation-history.service';

@Component({
  selector: 'app-page-header',
  standalone: true,
  template: `
    <header class="ph">
      @if (showBack()) {
        <button class="ph-back" (click)="navHistory.goBack(backFallback())" aria-label="Enrere">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
      }
      <div class="ph-text">
        <h1 class="ph-title">{{ title() }}</h1>
        @if (subtitle(); as sub) { <span class="ph-sub">{{ sub }}</span> }
      </div>
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
    .ph-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .ph-title {
      margin: 0;
      font-size: 22px; font-weight: 700; color: var(--c-text); letter-spacing: -0.3px;
    }
    /* El quan de la pàgina. Va aquí i no a la targeta de sota: la targeta és
       la mateixa que al feed, on el dia el diu el grup de targetes. */
    .ph-sub {
      font-size: 12px; font-weight: 500; color: var(--c-text-3);
      line-height: 1.2; text-transform: capitalize;
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
  readonly title        = input.required<string>();
  /** Sota el títol, en veu baixa: el dia de l'activitat que s'està mirant. */
  readonly subtitle     = input('');
  readonly showBack     = input(false);
  readonly backFallback = input('/home');
  protected readonly navHistory = inject(NavigationHistoryService);
}
