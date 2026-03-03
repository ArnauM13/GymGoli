import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

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
      @for (item of navItems; track item.path) {
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
    </nav>
  `,
  styles: [`
    .bottom-nav {
      display: flex;
      height: 64px;
      background: #ffffff;
      border-top: 1px solid #e0e0e0;
      box-shadow: 0 -2px 8px rgba(0,0,0,0.06);
      padding-bottom: env(safe-area-inset-bottom);
    }

    .nav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      text-decoration: none;
      color: #757575;
      transition: color 0.2s ease;
      cursor: pointer;
      border-radius: 12px;
      margin: 4px;

      &:hover {
        color: #006874;
        background: rgba(0, 104, 116, 0.06);
      }

      &.active {
        color: #006874;

        .nav-icon {
          font-variation-settings: 'FILL' 1;
        }
      }
    }

    .nav-icon {
      font-size: 24px;
      font-variation-settings: 'FILL' 0, 'wght' 300;
      transition: font-variation-settings 0.2s ease;
    }

    .nav-label {
      font-size: 11px;
      font-weight: 500;
      letter-spacing: 0.3px;
    }
  `],
})
export class NavBarComponent {
  readonly navItems: NavItem[] = [
    { path: '/today', icon: 'today', label: 'Avui' },
    { path: '/history', icon: 'calendar_month', label: 'Historial' },
    { path: '/library', icon: 'fitness_center', label: 'Exercicis' },
    { path: '/charts', icon: 'bar_chart', label: 'Progrés' },
  ];
}
