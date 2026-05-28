import { Component, computed, effect, inject, signal } from '@angular/core';
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

      <main class="app-content">
        <router-outlet />
        @if (offlineService.isOffline() && !isTrainRoute()) {
          <div class="offline-page-overlay">
            <span class="material-symbols-outlined">wifi_off</span>
            <p>Disponible només amb connexió</p>
          </div>
        }
        @if (showOfflineToast()) {
          <div class="offline-toast" role="status" aria-live="polite">
            <span class="offline-toast-icon material-symbols-outlined">wifi_off</span>
            <div class="offline-toast-text">
              <strong>Sense connexió</strong>
              <span>Continua entrenant tranquil·lament — tot es guardarà i sincronitzarà quan tornis a tenir internet.</span>
            </div>
            <button class="offline-toast-close" (click)="dismissOfflineToast()" aria-label="Tancar">
              <span class="material-symbols-outlined">close</span>
            </button>
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

    /* ── Offline toast ── */
    .offline-toast {
      position: absolute; bottom: 16px; left: 16px; right: 16px;
      display: flex; align-items: flex-start; gap: 12px;
      background: #37474f; color: white;
      border-radius: 16px; padding: 14px 12px 14px 16px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      animation: toast-in 0.3s cubic-bezier(0.34, 1.15, 0.64, 1);
      z-index: 100;
    }
    @keyframes toast-in {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .offline-toast-icon {
      font-size: 22px; flex-shrink: 0; margin-top: 1px; opacity: 0.9;
    }
    .offline-toast-text {
      flex: 1; display: flex; flex-direction: column; gap: 3px;
      strong { font-size: 14px; font-weight: 700; }
      span   { font-size: 13px; line-height: 1.5; opacity: 0.85; }
    }
    .offline-toast-close {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; flex-shrink: 0; margin-top: -2px;
      border: none; background: transparent; color: white; opacity: 0.7;
      cursor: pointer; border-radius: 50%; transition: opacity 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { opacity: 1; }
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

  private _toastDismissed = signal(false);
  readonly showOfflineToast = computed(() =>
    this.offlineService.isOffline() && !this._toastDismissed()
  );

  dismissOfflineToast(): void { this._toastDismissed.set(true); }

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

    // Reset toast when connection is restored so it shows again next time offline
    effect(() => {
      if (!this.offlineService.isOffline()) this._toastDismissed.set(false);
    });
  }

  onOnboardingDone(): void { /* showOnboarding() reacts to settings change automatically */ }
}
