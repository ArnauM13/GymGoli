import { Component, computed, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';

import { AuthService } from './core/services/auth.service';
import { SupabaseService } from './core/services/supabase.service';
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
  private supabaseService = inject(SupabaseService);
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
      const isDark = this.settingsService.darkMode();
      this.doc.documentElement.classList.toggle('dark', isDark);
      if (Capacitor.isNativePlatform()) {
        StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light }).catch(() => {});
      }
    });

    if (Capacitor.isNativePlatform()) {
      this.initNative();
    }
  }

  private initNative(): void {
    SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {});

    // Handle deep links for OAuth callbacks (com.gymgoli.app://...)
    App.addListener('appUrlOpen', ({ url }) => {
      const uri = new URL(url);
      // Supabase sends tokens as hash fragment: #access_token=...&refresh_token=...
      if (uri.hash) {
        const params = new URLSearchParams(uri.hash.replace('#', ''));
        const accessToken  = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        if (accessToken && refreshToken) {
          this.supabaseService.client.auth
            .setSession({ access_token: accessToken, refresh_token: refreshToken })
            .then(() => this.router.navigateByUrl('/train'))
            .catch(() => {});
          return;
        }
        // Password recovery
        const type = params.get('type');
        if (type === 'recovery') {
          this.router.navigateByUrl('/reset-password');
        }
      }
    });
  }

  onOnboardingDone(): void { /* showOnboarding() reacts to settings change automatically */ }
}
