import { Component, computed, effect, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

import { AuthService } from './core/services/auth.service';
import { UserSettingsService } from './core/services/user-settings.service';
import { OfflineService } from './core/services/offline.service';
import { NavigationHistoryService } from './core/services/navigation-history.service';
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

      <main class="app-content" [class.page-anim-a]="!pageAnimToggle()" [class.page-anim-b]="pageAnimToggle()">
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
    /* Opacity-only: a transform here would give every position:fixed
     * descendant (FABs, bottom sheets, the suggestion card, ...) a new
     * containing block, detaching them from the viewport and throwing
     * off their "bottom: calc(var(--nav-height) + Npx)" placement. */
    @keyframes app-enter {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    /* ── Page transition: replayed on every route change. Two identically-
     *  defined classes are toggled back and forth (rather than one class
     *  being added/removed) so the animation restarts even when navigating
     *  between routes that reuse the same cached component instance.
     *  Opacity-only for the same reason as .app-ready above. ── */
    .page-anim-a, .page-anim-b {
      animation: page-enter 0.24s ease both;
    }
    @keyframes page-enter {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
  `],
})
export class AppComponent {
  readonly auth           = inject(AuthService);
  readonly offlineService = inject(OfflineService);
  private settingsService = inject(UserSettingsService);
  private router          = inject(Router);
  private doc             = inject(DOCUMENT);
  // Injected here (unused directly) to start tracking navigation from the
  // very first route change, before any page needs goBack().
  private navigationHistory = inject(NavigationHistoryService);

  readonly pageAnimToggle = signal(false);

  readonly showOnboarding = computed(() => {
    const user     = this.auth.user();
    const settings = this.settingsService.settings();
    const loaded   = this.settingsService.loaded();
    return !!user && loaded && !settings.onboardingDone;
  });

  isTrainRoute(): boolean {
    const path = this.router.url.split('?')[0];
    return path === '/train' || path.startsWith('/train/');
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

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => this.pageAnimToggle.update(v => !v));
  }

  onOnboardingDone(): void { /* showOnboarding() reacts to settings change automatically */ }
}
