import { Component, computed, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
import { UserSettingsService } from './core/services/user-settings.service';
import { OfflineService } from './core/services/offline.service';
import { NavBarComponent } from './shared/components/nav-bar/nav-bar.component';
import { OnboardingComponent } from './shared/components/onboarding/onboarding.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavBarComponent, OnboardingComponent],
  template: `
    @if (auth.user() !== undefined) {
    <div class="app-shell app-ready">

    @if (showOnboarding()) {
      <app-onboarding (done)="onOnboardingDone()" />
    }

    @if (offlineService.isOffline()) {
      <div class="offline-banner" role="status" aria-live="polite">
        <span class="material-symbols-outlined">wifi_off</span>
        <span>Sense connexió · Mode offline</span>
      </div>
    }

      <main class="app-content">
        <router-outlet />
        @if (offlineService.isOffline() && !isTrainRoute()) {
          <div class="offline-page-overlay">
            <span class="material-symbols-outlined">wifi_off</span>
            <p>Disponible només amb connexió</p>
          </div>
        }
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
      padding-top: env(safe-area-inset-top, 0);
    }

    /* ── Offline banner ── */
    .offline-banner {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 9px 16px; flex-shrink: 0;
      background: #455a64; color: white;
      font-size: 13px; font-weight: 600; line-height: 1.3; text-align: center;
      .material-symbols-outlined { font-size: 17px; flex-shrink: 0; }
    }

    .app-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
    }

    /* ── Offline page overlay ── */
    .offline-page-overlay {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 12px;
      background: var(--c-bg);
      color: var(--c-text-3);
      .material-symbols-outlined { font-size: 48px; opacity: 0.4; }
      p { margin: 0; font-size: 15px; font-weight: 500; }
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
  readonly auth           = inject(AuthService);
  readonly offlineService = inject(OfflineService);
  private settingsService = inject(UserSettingsService);
  private router          = inject(Router);
  private doc             = inject(DOCUMENT);

  readonly showOnboarding = computed(() => {
    const user     = this.auth.user();
    const settings = this.settingsService.settings();
    const loaded   = this.settingsService.loaded();
    return !!user && loaded && !settings.onboardingDone;
  });

  isTrainRoute(): boolean {
    return this.router.url === '/train' || this.router.url.startsWith('/train?');
  }

  constructor() {
    effect(() => {
      if (this.auth.user() === undefined) return;
      const loader = this.doc.getElementById('app-loader');
      if (!loader) return;
      loader.classList.add('hiding');
      setTimeout(() => loader.remove(), 300);
    });

    effect(() => {
      if (this.auth.isPasswordRecovery()) this.router.navigate(['/reset-password']);
    });

    effect(() => {
      this.doc.documentElement.classList.toggle('dark', this.settingsService.darkMode());
    });
  }

  onOnboardingDone(): void { /* showOnboarding() reacts to settings change automatically */ }
}
