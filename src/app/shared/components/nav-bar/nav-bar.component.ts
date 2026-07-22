import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { TrainerService } from '../../../core/services/trainer.service';

interface NavItem {
  path: string;
  icon: string;
  label: string;
}

@Component({
  selector: 'app-nav-bar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  template: `
    <nav class="bottom-nav">
      <div class="nav-capsule">
        @for (item of navItems(); track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="active"
            class="nav-item"
            [attr.aria-label]="item.label"
          >
            <span class="material-symbols-outlined nav-icon">{{ item.icon }}</span>
            <span class="nav-label">{{ item.label }}</span>
          </a>
        }
      </div>
    </nav>
  `,
  styles: [`
    /* The nav floats over the page: it's an absolutely-positioned, transparent
     * band pinned to the bottom, so page content scrolls underneath the capsule
     * instead of sitting on an opaque shelf. The band keeps the full
     * --nav-height footprint so fixed elements that clear the nav via
     * calc(var(--nav-height) + N) still line up. */
    .bottom-nav {
      position: absolute; left: 0; right: 0; bottom: 0;
      height: var(--nav-height);
      box-sizing: border-box;
      display: flex; align-items: center;
      padding: 0 14px calc(env(safe-area-inset-bottom, 0px));
      background: transparent;
      pointer-events: none;
    }

    .nav-capsule {
      pointer-events: auto;
      flex: 1;
      display: flex; align-items: center; justify-content: space-evenly; gap: 2px;
      height: 58px; padding: 0 6px; box-sizing: border-box;
      background: var(--c-card);
      border: 1px solid color-mix(in srgb, var(--c-border) 50%, transparent);
      border-radius: 29px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.07);
    }

    .nav-item {
      display: flex; align-items: center; justify-content: center;
      height: 44px; padding: 0 14px; border-radius: 22px;
      text-decoration: none;
      color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition: background 0.28s cubic-bezier(0.4, 0, 0.2, 1),
                  color 0.2s ease, transform 0.1s ease;

      &:hover:not(.active) { color: var(--c-text-2); background: var(--c-subtle); }
      &:active { transform: scale(0.94); }

      &.active {
        color: white;
        background: var(--c-brand);
        box-shadow: 0 3px 12px rgba(var(--c-brand-rgb), 0.36);
        .nav-icon { color: white; font-variation-settings: 'FILL' 1, 'wght' 500; }
        .nav-label { max-width: 96px; opacity: 1; margin-left: 7px; }
      }
    }

    .nav-icon {
      font-size: 24px;
      color: inherit; flex-shrink: 0;
      font-variation-settings: 'FILL' 0, 'wght' 400;
      transition: font-variation-settings 0.2s ease, color 0.2s ease;
    }

    /* Labels are hidden for inactive items and reveal (width + fade) only for
     * the active one, so it grows into an icon+text pill. */
    .nav-label {
      max-width: 0; opacity: 0; overflow: hidden; white-space: nowrap;
      font-size: 13px; font-weight: 700; letter-spacing: 0.1px; line-height: 1;
      transition: max-width 0.3s cubic-bezier(0.34, 1.06, 0.64, 1),
                  opacity 0.22s ease, margin 0.3s cubic-bezier(0.34, 1.06, 0.64, 1);
    }
  `],
})
export class NavBarComponent {
  private trainerService = inject(TrainerService);

  readonly navItems = computed<NavItem[]>(() => {
    const base: NavItem[] = [
      { path: '/home',     icon: 'home',           label: 'Inici' },
      { path: '/calendar', icon: 'calendar_month',  label: 'Calendari' },
      { path: '/settings', icon: 'account_circle', label: 'Perfil' },
    ];
    if (this.trainerService.isTrainer()) {
      base.splice(2, 0, { path: '/trainer', icon: 'sports', label: 'Clients' });
    }
    return base;
  });
}
