import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AppHintService } from '../../../core/services/app-hint.service';

/**
 * Shows the next un-dismissed discovery hint (one at a time), inviting the
 * user to a feature/setting they may not have found yet. Renders nothing once
 * every hint is dismissed. Visually matches the "set up a routine" hint card.
 */
@Component({
  selector: 'app-discovery-hint',
  standalone: true,
  template: `
    @if (hintService.nextDiscoveryHint(); as hint) {
      <div class="dh-card">
        <button class="dh-dismiss" (click)="hintService.dismiss(hint.id)" aria-label="No tornar a mostrar">
          <span class="material-symbols-outlined">close</span>
        </button>
        <div class="dh-top">
          <span class="material-symbols-outlined dh-icon">{{ hint.icon }}</span>
          <div class="dh-text">
            <span class="dh-eyebrow">Descobreix</span>
            <span class="dh-title">{{ hint.title }}</span>
            <span class="dh-sub">{{ hint.body }}</span>
          </div>
        </div>
        <div class="dh-actions">
          <button class="dh-btn" (click)="go(hint.route)">
            <span class="material-symbols-outlined">{{ hint.icon }}</span>
            {{ hint.cta }}
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .dh-card {
      position: relative;
      display: flex; flex-direction: column; gap: 10px;
      margin: 16px 16px 0; padding: 14px 34px 14px 14px;
      background: var(--c-card);
      border: 1.5px solid var(--c-border-2); border-radius: 16px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .dh-top { display: flex; align-items: flex-start; gap: 10px; }
    .dh-icon { font-size: 22px; color: var(--c-brand); flex-shrink: 0; font-variation-settings: 'FILL' 0, 'wght' 300; }
    .dh-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .dh-eyebrow {
      font-size: 9.5px; font-weight: 700; line-height: 1; color: var(--c-brand);
      text-transform: uppercase; letter-spacing: 0.6px;
    }
    .dh-title { font-size: 13.5px; font-weight: 800; color: var(--c-text); }
    .dh-sub { font-size: 11.5px; color: var(--c-text-3); line-height: 1.35; }
    .dh-actions { display: flex; justify-content: flex-end; }
    .dh-btn {
      display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
      padding: 9px 14px; border: none; border-radius: 11px;
      background: var(--c-brand); color: white;
      font-size: 12.5px; font-weight: 700; letter-spacing: 0.1px;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: var(--c-brand-dk); }
    }
    .dh-dismiss {
      position: absolute; top: 8px; right: 8px;
      width: 26px; height: 26px; border-radius: 50%; border: none;
      background: transparent; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { background: var(--c-subtle); color: var(--c-text-2); }
    }
  `],
})
export class DiscoveryHintComponent {
  readonly hintService = inject(AppHintService);
  private router = inject(Router);

  go(route: string): void {
    this.router.navigate([route]);
  }
}
