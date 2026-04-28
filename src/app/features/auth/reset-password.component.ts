import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="reset-page">
      <div class="reset-card">

        <div class="reset-brand">
          <img src="assets/bibis.png" class="reset-logo" alt="GymGoli">
          <h1 class="reset-title">Nova contrasenya</h1>
          <p class="reset-sub">Escriu la teva nova contrasenya.</p>
        </div>

        @if (success()) {
          <div class="success-state">
            <span class="material-symbols-outlined success-icon">check_circle</span>
            <p class="success-msg">Contrasenya actualitzada! Ara pots iniciar sessió.</p>
            <button class="btn-primary" (click)="goToLogin()">Anar a l'inici</button>
          </div>
        } @else {
          <form class="reset-form" (ngSubmit)="submit()">
            <input
              class="form-input"
              type="password"
              placeholder="Nova contrasenya (mínim 6 caràcters)"
              [(ngModel)]="password"
              name="password"
              required
              autocomplete="new-password"
            >
            <input
              class="form-input"
              type="password"
              placeholder="Repeteix la contrasenya"
              [(ngModel)]="passwordConfirm"
              name="passwordConfirm"
              required
              autocomplete="new-password"
            >

            @if (error()) {
              <p class="form-error">{{ error() }}</p>
            }

            <button class="btn-primary" type="submit" [disabled]="loading()">
              @if (loading()) {
                <span class="material-symbols-outlined spin">sync</span>
              }
              Canviar contrasenya
            </button>
          </form>
        }

      </div>
    </div>
  `,
  styles: [`
    .reset-page {
      min-height: 100dvh;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #f0fafb 0%, #e8f4f5 100%);
      padding: 24px;
    }

    .reset-card {
      background: white; border-radius: 24px;
      box-shadow: 0 8px 40px rgba(0,104,116,0.12);
      padding: 40px 32px; width: 100%; max-width: 360px;
      display: flex; flex-direction: column; align-items: center; gap: 24px;
    }

    .reset-brand {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      text-align: center;
    }
    .reset-logo { width: 60px; height: 60px; border-radius: 16px; object-fit: cover; }
    .reset-title { margin: 0; font-size: 22px; font-weight: 800; color: #1a1a1a; }
    .reset-sub   { margin: 0; font-size: 14px; color: #888; }

    .reset-form {
      width: 100%; display: flex; flex-direction: column; gap: 10px;
    }

    .form-input {
      width: 100%; padding: 12px 14px;
      border: 1.5px solid #e0e0e0; border-radius: 10px;
      font-size: 14px; color: #1a1a1a; outline: none;
      transition: border-color 0.15s; box-sizing: border-box;
      &:focus { border-color: #006874; }
    }

    .form-error {
      margin: 0; font-size: 12px; color: #ef5350;
      padding: 6px 10px; background: #fef2f2; border-radius: 8px;
    }

    .btn-primary {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 13px; border: none; border-radius: 12px;
      background: #006874; color: white;
      font-size: 15px; font-weight: 600; cursor: pointer;
      transition: all 0.2s; touch-action: manipulation;
      &:hover:not(:disabled) { background: #00565f; transform: translateY(-1px); }
      &:disabled { opacity: 0.6; cursor: default; }
      .material-symbols-outlined { font-size: 18px; }
    }

    .success-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      text-align: center; width: 100%;
    }
    .success-icon { font-size: 48px; color: #4caf50; font-variation-settings: 'FILL' 1; }
    .success-msg  { margin: 0; font-size: 14px; color: #555; line-height: 1.5; }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }
  `],
})
export class ResetPasswordComponent {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private snackBar    = inject(MatSnackBar);

  readonly loading = signal(false);
  readonly success = signal(false);
  readonly error   = signal('');

  password        = '';
  passwordConfirm = '';

  async submit(): Promise<void> {
    this.error.set('');

    if (this.password.length < 6) {
      this.error.set('La contrasenya ha de tenir almenys 6 caràcters.');
      return;
    }
    if (this.password !== this.passwordConfirm) {
      this.error.set('Les contrasenyes no coincideixen.');
      return;
    }

    this.loading.set(true);
    try {
      await this.authService.updatePassword(this.password);
      this.success.set(true);
    } catch (err) {
      const msg = (err as { message?: string }).message ?? '';
      this.error.set(msg || 'Error en canviar la contrasenya. Torna-ho a provar.');
    } finally {
      this.loading.set(false);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
