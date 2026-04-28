import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

type AuthMode = 'login' | 'register';

// Supabase error messages use the message string directly (not error codes like Firebase)
function friendlyError(err: unknown): string {
  const msg = (err as { message?: string }).message ?? '';
  if (msg.includes('Invalid login credentials'))      return 'Correu o contrasenya incorrectes.';
  if (msg.includes('Email not confirmed'))            return 'Confirma el teu correu electrònic primer.';
  if (msg.includes('User already registered'))        return 'Aquest correu ja està registrat.';
  if (msg.includes('Password should be at least'))    return 'La contrasenya ha de tenir almenys 6 caràcters.';
  if (msg.includes('Unable to validate email'))       return 'Adreça de correu no vàlida.';
  if (msg.includes('Email rate limit exceeded'))      return 'Massa intents. Torna-ho a provar més tard.';
  if (msg.includes('signup is disabled'))             return 'El registre no està habilitat.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Error de xarxa. Comprova la connexió.';
  return 'Error en iniciar sessió. Torna-ho a provar.';
}

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="login-page">
      <div class="login-card">

        <div class="login-brand">
          <img src="assets/bibis.png" class="login-logo" alt="GymGoli">
          <h1 class="login-title">GymGoli</h1>
          <p class="login-sub">El teu registre d'entrenaments personal</p>
        </div>

        @if (blocked()) {
          <div class="access-denied">
            <span class="material-symbols-outlined ad-icon">block</span>
            <p class="ad-title">Accés denegat</p>
            <p class="ad-msg">El compte <strong>{{ blockedEmail() }}</strong> no té accés a aquesta aplicació.</p>
            <button class="btn-try-again" (click)="blocked.set(false)">Prova amb un altre compte</button>
          </div>
        } @else {

          <!-- ── Email / password form ── -->
          <form class="email-form" (ngSubmit)="submitEmail()" #f="ngForm">
            <div class="form-tabs">
              <button type="button" class="tab-btn" [class.active]="mode() === 'login'"    (click)="mode.set('login')">Inicia sessió</button>
              <button type="button" class="tab-btn" [class.active]="mode() === 'register'" (click)="mode.set('register')">Registra't</button>
            </div>

            <input
              class="form-input"
              type="email"
              placeholder="Correu electrònic"
              [(ngModel)]="email"
              name="email"
              required
              autocomplete="email"
            >
            <input
              class="form-input"
              type="password"
              placeholder="Contrasenya"
              [(ngModel)]="password"
              name="password"
              required
              [attr.autocomplete]="mode() === 'register' ? 'new-password' : 'current-password'"
            >

            @if (emailError()) {
              <p class="form-error">{{ emailError() }}</p>
            }

            @if (mode() === 'register' && registerSuccess()) {
              <p class="form-success">Compte creat! Comprova el teu correu per confirmar el compte.</p>
            }

            <button class="btn-email" type="submit" [disabled]="loadingEmail()">
              @if (loadingEmail()) {
                <span class="material-symbols-outlined spin">sync</span>
              }
              {{ mode() === 'login' ? 'Entra' : 'Crear compte' }}
            </button>
          </form>

          <!-- ── Divider ── -->
          <div class="divider"><span>o</span></div>

          <!-- ── Google ── -->
          <button class="btn-google" (click)="loginGoogle()" [disabled]="loadingGoogle()">
            @if (loadingGoogle()) {
              <span class="material-symbols-outlined spin">sync</span>
              Redirigint...
            } @else {
              <svg class="google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continuar amb Google
            }
          </button>

          @if (hasRestriction) {
            <p class="login-note">
              <span class="material-symbols-outlined">lock</span>
              Accés restringit a comptes autoritzats
            </p>
          }

        }

        <a class="privacy-link" routerLink="/privacy">Política de privacitat</a>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      min-height: 100dvh;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #f0fafb 0%, #e8f4f5 100%);
      padding: 24px;
    }

    .login-card {
      background: white;
      border-radius: 24px;
      box-shadow: 0 8px 40px rgba(0,104,116,0.12);
      padding: 40px 32px;
      width: 100%; max-width: 360px;
      display: flex; flex-direction: column; align-items: center; gap: 24px;
    }

    .login-brand {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      text-align: center;
    }
    .login-logo {
      width: 72px; height: 72px; border-radius: 18px; object-fit: cover;
      box-shadow: 0 4px 16px rgba(0,104,116,0.2);
    }
    .login-title { margin: 0; font-size: 28px; font-weight: 800; color: #1a1a1a; letter-spacing: -0.5px; }
    .login-sub   { margin: 0; font-size: 14px; color: #666; }

    /* ── Email form ── */
    .email-form {
      width: 100%;
      display: flex; flex-direction: column; gap: 10px;
    }

    .form-tabs {
      display: flex; border-radius: 10px; overflow: hidden;
      border: 1.5px solid #e0e0e0; margin-bottom: 2px;
    }
    .tab-btn {
      flex: 1; padding: 9px 0;
      border: none; background: transparent; cursor: pointer;
      font-size: 13px; font-weight: 600; color: #666;
      transition: all 0.18s;
      &.active { background: #006874; color: white; }
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

    .form-success {
      margin: 0; font-size: 12px; color: #4caf50;
      padding: 6px 10px; background: #f0faf0; border-radius: 8px;
    }

    .btn-email {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; padding: 13px;
      border: none; border-radius: 12px;
      background: #006874; color: white;
      font-size: 15px; font-weight: 600; cursor: pointer;
      transition: all 0.2s; touch-action: manipulation;
      &:hover:not(:disabled) { background: #00565f; transform: translateY(-1px); }
      &:disabled { opacity: 0.6; cursor: default; }
      .material-symbols-outlined { font-size: 18px; }
    }

    /* ── Divider ── */
    .divider {
      width: 100%; display: flex; align-items: center; gap: 10px;
      span { font-size: 12px; color: #767676; white-space: nowrap; }
      &::before, &::after {
        content: ''; flex: 1; height: 1px; background: #e8e8e8;
      }
    }

    /* ── Google button ── */
    .btn-google {
      display: flex; align-items: center; justify-content: center; gap: 12px;
      width: 100%; padding: 12px 20px;
      border: 1.5px solid #e0e0e0; border-radius: 14px;
      background: white; color: #333;
      font-size: 14px; font-weight: 600; cursor: pointer;
      transition: all 0.2s; touch-action: manipulation;

      &:hover:not(:disabled) {
        border-color: #006874;
        box-shadow: 0 2px 12px rgba(0,104,116,0.12);
        transform: translateY(-1px);
      }
      &:disabled { opacity: 0.6; cursor: default; }

      .google-icon { width: 18px; height: 18px; flex-shrink: 0; }
      .material-symbols-outlined { font-size: 18px; color: #006874; }
    }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }

    /* ── Access denied ── */
    .access-denied {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; text-align: center; width: 100%;
    }
    .ad-icon { font-size: 40px; color: #ef5350; }
    .ad-title { margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a; }
    .ad-msg   { margin: 0; font-size: 13px; color: #666; line-height: 1.5; }
    .btn-try-again {
      margin-top: 8px; padding: 8px 20px; border-radius: 20px;
      border: 1.5px solid #006874; background: transparent; color: #006874;
      font-size: 13px; font-weight: 600; cursor: pointer;
      &:hover { background: rgba(0,104,116,0.06); }
    }

    .login-note {
      display: flex; align-items: center; gap: 5px;
      margin: 0; font-size: 11px; color: #767676;
      .material-symbols-outlined { font-size: 13px; }
    }

    .privacy-link {
      font-size: 11px; color: #aaa; text-decoration: none;
      &:hover { color: #006874; text-decoration: underline; }
    }
  `],
})
export class LoginComponent {
  private authService = inject(AuthService);
  private router      = inject(Router);
  private snackBar    = inject(MatSnackBar);

  readonly mode            = signal<AuthMode>('login');
  readonly loadingEmail    = signal(false);
  readonly loadingGoogle   = signal(false);
  readonly blocked         = signal(false);
  readonly blockedEmail    = signal('');
  readonly emailError      = signal('');
  readonly registerSuccess = signal(false);
  readonly hasRestriction: boolean = environment.allowedEmails.length > 0;

  email    = '';
  password = '';

  async submitEmail(): Promise<void> {
    this.emailError.set('');
    this.registerSuccess.set(false);
    this.loadingEmail.set(true);
    try {
      if (this.mode() === 'login') {
        await this.authService.loginWithEmail(this.email, this.password);
        await this._handlePostLogin();
      } else {
        await this.authService.registerWithEmail(this.email, this.password);
        // Supabase sends a confirmation email — show success message
        this.registerSuccess.set(true);
      }
    } catch (err: unknown) {
      this.emailError.set(friendlyError(err));
    } finally {
      this.loadingEmail.set(false);
    }
  }

  async loginGoogle(): Promise<void> {
    this.loadingGoogle.set(true);
    try {
      // This redirects the browser — no need to handle post-login here
      await this.authService.loginWithGoogle();
    } catch (err: unknown) {
      this.loadingGoogle.set(false);
      this.snackBar.open('Error en iniciar sessió amb Google', '', { duration: 3000 });
    }
    // loadingGoogle stays true until redirect completes
  }

  private async _handlePostLogin(): Promise<void> {
    if (this.authService.isCurrentUserAllowed()) {
      await this.router.navigate(['/']);
    } else {
      this.blockedEmail.set(this.authService.currentUserEmail());
      this.blocked.set(true);
      await this.authService.logout();
    }
  }
}
