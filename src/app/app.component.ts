import { Component, computed, effect, inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';

import { AuthService } from './core/services/auth.service';
import { UserSettingsService } from './core/services/user-settings.service';
import { OfflineService } from './core/services/offline.service';
import { SyncService } from './core/services/sync.service';
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
        Sense connexió — es guardarà quan torni internet
        @if (syncService.pendingCount() > 0) {
          <span class="sync-badge">{{ syncService.pendingCount() }}</span>
        }
      </div>
    } @else if (syncService.status() !== 'synced') {
      <div class="sync-bar" [class.sync-bar--error]="syncService.status() === 'error'"
           role="status" aria-live="polite">
        <span class="material-symbols-outlined"
              [class.spin]="syncService.status() === 'syncing'">
          {{ syncService.status() === 'error' ? 'sync_problem' : 'cloud_upload' }}
        </span>
        {{ syncService.status() === 'syncing' ? 'Sincronitzant...' :
           syncService.pendingCount() + (syncService.pendingCount() === 1 ? ' canvi pendent' : ' canvis pendents') }}
      </div>
    }

      <main class="app-content">
        <router-outlet />
      </main>

      @if (auth.user() && !offlineService.isOffline()) {
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
    .sync-badge {
      background: rgba(255,255,255,0.25); border-radius: 10px;
      padding: 1px 7px; font-size: 11px; font-weight: 700;
    }

    /* ── Sync status bar ── */
    .sync-bar {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 5px 16px; flex-shrink: 0;
      background: color-mix(in srgb, #006874 10%, white);
      color: #006874;
      font-size: 11px; font-weight: 600; line-height: 1.3; text-align: center;
      border-bottom: 1px solid rgba(0,104,116,0.15);
      .material-symbols-outlined { font-size: 14px; flex-shrink: 0; }
      &.sync-bar--error { background: rgba(239,83,80,0.08); color: #d32f2f; border-bottom-color: rgba(239,83,80,0.2); }
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
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }
  `],
})
export class AppComponent {
  readonly auth            = inject(AuthService);
  readonly offlineService  = inject(OfflineService);
  readonly syncService     = inject(SyncService);
  private settingsService  = inject(UserSettingsService);
  private router           = inject(Router);
  private doc              = inject(DOCUMENT);

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

    effect(() => {
      if (this.auth.isPasswordRecovery()) this.router.navigate(['/reset-password']);
    });

    effect(() => {
      this.doc.documentElement.classList.toggle('dark', this.settingsService.darkMode());
    });
  }

  onOnboardingDone(): void { /* showOnboarding() reacts to settings change automatically */ }
}
