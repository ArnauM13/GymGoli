import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../../core/services/auth.service';
import { TrainerService } from '../../../core/services/trainer.service';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [],
  template: `
    <div class="join-page">
      <div class="join-card">
        <span class="material-symbols-outlined join-icon">sports</span>
        <h1>Invitació d'entrenador</h1>

        @if (status() === 'loading') {
          <p class="join-desc">Processant la invitació...</p>
          <span class="material-symbols-outlined spin">sync</span>
        } @else if (status() === 'success') {
          <span class="material-symbols-outlined success-icon">check_circle</span>
          <p class="join-desc">Ja estàs connectat al teu entrenador.</p>
          <button class="btn-primary" (click)="goHome()">Anar a l'app</button>
        } @else if (status() === 'error') {
          <span class="material-symbols-outlined error-icon">error</span>
          <p class="join-desc">{{ errorMessage() }}</p>
          <button class="btn-primary" (click)="goHome()">Anar a l'app</button>
        } @else if (status() === 'needs-auth') {
          <p class="join-desc">Has d'iniciar sessió per acceptar la invitació.</p>
          <button class="btn-primary" (click)="goLogin()">Iniciar sessió</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .join-page {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px; background: var(--c-bg);
    }
    .join-card {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      padding: 32px 28px; background: var(--c-card); border-radius: 24px;
      box-shadow: 0 4px 24px var(--c-shadow-md);
      max-width: 360px; width: 100%; text-align: center;
    }
    .join-icon {
      font-size: 48px; color: var(--c-brand);
      font-variation-settings: 'FILL' 1, 'wght' 300;
    }
    h1 { margin: 0; font-size: 20px; font-weight: 800; color: var(--c-text); letter-spacing: -0.3px; }
    .join-desc { margin: 0; font-size: 14px; color: var(--c-text-2); line-height: 1.5; }
    .success-icon {
      font-size: 40px; color: #2e7d32;
      font-variation-settings: 'FILL' 1;
    }
    .error-icon {
      font-size: 40px; color: #c62828;
      font-variation-settings: 'FILL' 1;
    }
    .btn-primary {
      padding: 10px 28px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white;
      font-size: 14px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
    }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; font-size: 32px; color: var(--c-brand); }
  `],
})
export class JoinComponent implements OnInit {
  private route          = inject(ActivatedRoute);
  private router         = inject(Router);
  private auth           = inject(AuthService);
  private trainerService = inject(TrainerService);
  private snackBar       = inject(MatSnackBar);

  readonly status       = signal<'loading' | 'success' | 'error' | 'needs-auth'>('loading');
  readonly errorMessage = signal('');

  private static readonly LS_PENDING_TOKEN = 'gymgoli_pending_invite_token';

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!token) {
      this.status.set('error');
      this.errorMessage.set('Enllaç invàlid.');
      return;
    }

    const user = await this.auth.waitForAuth();
    if (!user) {
      // Store token and redirect to login
      try { localStorage.setItem(JoinComponent.LS_PENDING_TOKEN, token); } catch { }
      this.status.set('needs-auth');
      return;
    }

    await this.processToken(token);
  }

  private async processToken(token: string): Promise<void> {
    this.status.set('loading');
    try {
      await this.trainerService.acceptInviteByToken(token);
      try { localStorage.removeItem(JoinComponent.LS_PENDING_TOKEN); } catch { }
      this.status.set('success');
    } catch (e) {
      this.status.set('error');
      this.errorMessage.set((e as Error).message ?? 'Error desconegut.');
    }
  }

  goHome(): void  { this.router.navigate(['/train']); }
  goLogin(): void { this.router.navigate(['/login']); }

  /** Called from LoginComponent after successful login to handle pending tokens */
  static getPendingToken(): string | null {
    try { return localStorage.getItem(JoinComponent.LS_PENDING_TOKEN); } catch { return null; }
  }
}
