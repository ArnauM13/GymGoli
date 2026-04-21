import { Component, computed, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from './core/services/auth.service';
import { NavBarComponent } from './shared/components/nav-bar/nav-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavBarComponent],
  template: `
    @if (auth.user() !== undefined) {
    <div class="app-shell app-ready">

      <!-- ── Top brand bar ── -->
      <header class="app-header">
        <img src="assets/bibis.png" class="app-logo" alt="GymGoli logo">
        <span class="app-name">GymGoli</span>

        @if (auth.user()) {
          <button class="user-btn" (click)="toggleUserMenu()" title="Compte">
            @if (userAvatarUrl()) {
              <img [src]="userAvatarUrl()!" class="user-avatar" [alt]="userName() ?? ''">
            } @else {
              <span class="material-symbols-outlined user-icon">account_circle</span>
            }
          </button>

          @if (menuOpen) {
            <div class="user-menu-backdrop" (click)="menuOpen = false"></div>
            <div class="user-menu">
              <div class="user-menu-info">
                <span class="user-menu-name">{{ userName() }}</span>
                <span class="user-menu-email">{{ auth.user()?.email }}</span>
              </div>
              <hr class="user-menu-divider">
              <button class="user-menu-item logout" (click)="logout()">
                <span class="material-symbols-outlined">logout</span>
                Tancar sessió
              </button>
            </div>
          }
        }
      </header>

      <main class="app-content">
        <router-outlet />
      </main>

      @if (auth.user()) {
        <app-nav-bar />
      }
    </div>
    }
  `,
  styles: [`
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      height: 100dvh;
    }

    /* ── Top brand header ── */
    .app-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px 8px 16px;
      background: white;
      border-bottom: 1px solid #f0f0f0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      height: 48px;
      flex-shrink: 0;
      position: relative;
    }

    .app-logo {
      width: 30px; height: 30px; border-radius: 8px; object-fit: cover;
    }

    .app-name {
      font-size: 17px; font-weight: 700; color: #1a1a1a;
      letter-spacing: -0.3px; flex: 1;
    }

    /* ── User button ── */
    .user-btn {
      width: 34px; height: 34px;
      border: none; background: transparent; cursor: pointer; padding: 0;
      border-radius: 50%; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      transition: opacity 0.15s;
      &:hover { opacity: 0.8; }
    }
    .user-avatar {
      width: 34px; height: 34px; border-radius: 50%; object-fit: cover;
    }
    .user-icon { font-size: 28px; color: #bbb; }

    /* ── User dropdown menu ── */
    .user-menu-backdrop {
      position: fixed; inset: 0; z-index: 999;
    }
    .user-menu {
      position: absolute; top: 46px; right: 8px; z-index: 1000;
      background: white; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.14);
      padding: 12px 0; min-width: 220px;
      animation: menu-in 0.15s ease;
    }
    @keyframes menu-in {
      from { opacity: 0; transform: translateY(-6px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)    scale(1); }
    }

    .user-menu-info {
      padding: 4px 16px 12px;
      display: flex; flex-direction: column; gap: 2px;
    }
    .user-menu-name  { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .user-menu-email { font-size: 12px; color: #888; }

    .user-menu-divider { margin: 0; border: none; border-top: 1px solid #f0f0f0; }

    .user-menu-item {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 10px 16px;
      border: none; background: transparent; cursor: pointer;
      font-size: 14px; font-weight: 500; color: #333;
      transition: background 0.15s; text-align: left;
      .material-symbols-outlined { font-size: 18px; color: #888; }
      &:hover { background: #f5f5f5; }
      &.logout { color: #ef5350; .material-symbols-outlined { color: #ef5350; } }
    }

    .app-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .app-ready {
      animation: app-enter 0.45s ease both;
    }
    @keyframes app-enter {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
  `],
})
export class AppComponent {
  readonly auth   = inject(AuthService);
  private router  = inject(Router);
  private snackBar = inject(MatSnackBar);

  menuOpen = false;

  readonly userName      = computed(() => this.auth.user()?.user_metadata?.['full_name'] as string | undefined);
  readonly userAvatarUrl = computed(() => this.auth.user()?.user_metadata?.['avatar_url'] as string | undefined);

  constructor() {
    effect(() => {
      if (this.auth.user() === undefined) return;
      const loader = document.getElementById('app-loader');
      if (!loader) return;
      loader.classList.add('hiding');
      setTimeout(() => loader.remove(), 450);
    });
  }

  toggleUserMenu(): void { this.menuOpen = !this.menuOpen; }

  async logout(): Promise<void> {
    this.menuOpen = false;
    await this.auth.logout();
    await this.router.navigate(['/login']);
    this.snackBar.open('Sessió tancada', '', { duration: 2000 });
  }
}
