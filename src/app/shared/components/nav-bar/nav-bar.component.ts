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
      @for (item of navItems(); track item.path) {
        <a
          [routerLink]="item.path"
          routerLinkActive="active"
          class="nav-item"
          [attr.aria-label]="item.label"
        >
          <span class="nav-pill">
            <span class="material-symbols-outlined nav-icon">{{ item.icon }}</span>
          </span>
          <span class="nav-label">{{ item.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: [`
    .bottom-nav {
      display: flex; align-items: stretch;
      height: var(--nav-height);
      padding: 6px 6px 0;
      padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 4px);
      background: var(--c-card);
      box-shadow: 0 -1px 0 color-mix(in srgb, var(--c-border) 70%, transparent),
                  0 -4px 18px color-mix(in srgb, var(--c-shadow) 80%, transparent);
      flex-shrink: 0; gap: 2px;
    }

    .nav-item {
      flex: 1;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      gap: 3px;
      padding: 2px 0 4px;
      text-decoration: none;
      color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      transition: color 0.2s ease;

      &:hover:not(.active) {
        color: var(--c-text-2);
        .nav-pill { background: var(--c-subtle); }
      }
      &:active { transform: scale(0.96); }

      &.active {
        color: var(--c-brand);
        .nav-pill {
          background: var(--c-brand);
          box-shadow: 0 3px 10px rgba(var(--c-brand-rgb), 0.32),
                      0 1px 3px rgba(var(--c-brand-rgb), 0.18);
        }
        .nav-icon {
          color: white;
          font-variation-settings: 'FILL' 1, 'wght' 500;
          transform: scale(1.04);
        }
        .nav-label { font-weight: 700; }
      }
    }

    .nav-pill {
      display: flex; align-items: center; justify-content: center;
      width: 54px; height: 30px; border-radius: 15px;
      background: transparent;
      transition: background 0.22s cubic-bezier(0.4, 0, 0.2, 1),
                  box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .nav-icon {
      font-size: 22px;
      color: inherit;
      font-variation-settings: 'FILL' 0, 'wght' 400;
      transition: font-variation-settings 0.2s ease,
                  color 0.2s ease,
                  transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1);
    }

    .nav-label {
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.2px;
      line-height: 1;
      transition: font-weight 0.2s ease;
    }
  `],
})
export class NavBarComponent {
  private trainerService = inject(TrainerService);

  readonly navItems = computed<NavItem[]>(() => {
    const base: NavItem[] = [
      { path: '/train',    icon: 'exercise',       label: 'Entrena' },
      { path: '/history',  icon: 'history',        label: 'Historial' },
      { path: '/charts',   icon: 'bar_chart',      label: 'Progrés' },
      { path: '/settings', icon: 'account_circle', label: 'Perfil' },
    ];
    if (this.trainerService.isTrainer()) {
      base.splice(2, 0, { path: '/trainer', icon: 'sports', label: 'Clients' });
    }
    return base;
  });
}
