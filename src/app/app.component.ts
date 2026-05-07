import { Component, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
import { UserSettingsService } from './core/services/user-settings.service';
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

    @if (isOffline()) {
      <div class="offline-banner" role="status" aria-live="polite">
        <span class="material-symbols-outlined">wifi_off</span>
        Sense connexió — les dades es guardaran quan torni internet
      </div>
    }

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
      padding-top: env(safe-area-inset-top, 0);
    }

    /* ── Offline banner ── */
    .offline-banner {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      padding: 8px 16px; flex-shrink: 0;
      background: #455a64; color: white;
      font-size: 12px; font-weight: 500; line-height: 1.3; text-align: center;
      .material-symbols-outlined { font-size: 16px; flex-shrink: 0; }
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
  readonly auth            = inject(AuthService);
  private settingsService  = inject(UserSettingsService);
  private router           = inject(Router);
  private doc              = inject(DOCUMENT);

  readonly isOffline = signal(false);

  readonly showOnboarding = computed(() => {
    const user     = this.auth.user();
    const settings = this.settingsService.settings();
    const loaded   = this.settingsService.loaded();
    return !!user && loaded && !settings.onboardingDone;
  });

  constructor() {
    effect(() => {
      if (this.auth.user() === undefined) return;
      const loader = this.doc.getElementById('app-loader');
      if (!loader) return;
      loader.classList.add('hiding');
      setTimeout(() => loader.remove(), 300);
    });

    // Redirect to /reset-password when Supabase fires PASSWORD_RECOVERY
    effect(() => {
      if (this.auth.isPasswordRecovery()) {
        this.router.navigate(['/reset-password']);
      }
    });

    // Apply / remove dark class on <html>
    effect(() => {
      this.doc.documentElement.classList.toggle('dark', this.settingsService.darkMode());
    });

    const win = this.doc.defaultView;
    if (win) {
      this.isOffline.set(!win.navigator.onLine);
      win.addEventListener('offline', () => this.isOffline.set(true));
      win.addEventListener('online',  () => this.isOffline.set(false));
    }
  }

  onOnboardingDone(): void { /* showOnboarding() reacts to settings change automatically */ }
}
