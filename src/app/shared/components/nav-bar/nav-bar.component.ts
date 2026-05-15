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
    <nav class="nav">
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
    .nav {
      display: flex; align-items: stretch;
      background: var(--c-card);
      border-top: 1.5px solid var(--c-border-2);
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.07);
      flex-shrink: 0;
      padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    .nav-item {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 2px; padding: 8px 4px 6px;
      text-decoration: none;
      color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation;
      transition: color 0.18s ease;
      -webkit-tap-highlight-color: transparent;

      &:hover { color: var(--c-brand); }

      &.active {
        color: var(--c-brand);
        .nav-pill { background: rgba(var(--c-brand-rgb), 0.12); }
        .nav-icon { font-variation-settings: 'FILL' 1, 'wght' 500; }
        .nav-label { font-weight: 700; }
      }
    }

    .nav-pill {
      display: flex; align-items: center; justify-content: center;
      width: 52px; height: 26px;
      border-radius: 13px;
      transition: background 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .nav-icon {
      font-size: 22px; line-height: 1;
      font-variation-settings: 'FILL' 0, 'wght' 300;
      transition: font-variation-settings 0.18s ease;
    }

    .nav-label {
      font-size: 10px; font-weight: 500;
      letter-spacing: 0.2px; line-height: 1;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 100%;
    }
  `],
})
export class NavBarComponent {
  private trainerService = inject(TrainerService);

  readonly navItems = computed<NavItem[]>(() => {
    const base: NavItem[] = [
      { path: '/train',    icon: 'exercise',        label: 'Entrena' },
      { path: '/history',  icon: 'calendar_month',  label: 'Historial' },
      { path: '/library',  icon: 'fitness_center',  label: 'Exercicis' },
      { path: '/charts',   icon: 'bar_chart',       label: 'Progrés' },
      { path: '/settings', icon: 'account_circle',  label: 'Perfil' },
    ];
    if (this.trainerService.isTrainer()) {
      base.splice(4, 0, { path: '/trainer', icon: 'sports', label: 'Clients' });
    }
    return base;
  });
}
