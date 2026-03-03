import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavBarComponent } from './shared/components/nav-bar/nav-bar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavBarComponent],
  template: `
    <div class="app-shell">

      <!-- ── Top brand bar ── -->
      <header class="app-header">
        <img src="assets/bibis.png" class="app-logo" alt="GymGoli logo">
        <span class="app-name">GymGoli</span>
      </header>

      <main class="app-content">
        <router-outlet />
      </main>

      <app-nav-bar />
    </div>
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
      padding: 8px 16px;
      background: white;
      border-bottom: 1px solid #f0f0f0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.05);
      height: 48px;
      flex-shrink: 0;
    }

    .app-logo {
      width: 30px;
      height: 30px;
      border-radius: 8px;
      object-fit: cover;
    }

    .app-name {
      font-size: 17px;
      font-weight: 700;
      color: #1a1a1a;
      letter-spacing: -0.3px;
    }

    .app-content {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
  `],
})
export class AppComponent {}
