import { Injectable, computed, inject, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService).client;

  private readonly _user    = signal<User | null | undefined>(undefined);
  private readonly _session = signal<Session | null>(null);

  /** Current Supabase user (undefined = still loading, null = signed out) */
  readonly user = this._user.asReadonly();

  /** UID of the current user, or null */
  readonly uid = computed(() => this._user()?.id ?? null);

  /**
   * True when the signed-in user is in the allowedEmails list.
   * If allowedEmails is empty, any authenticated user is allowed.
   */
  readonly isAllowed = computed(() => {
    const u = this._user();
    if (!u) return false;
    const list = environment.allowedEmails;
    if (!list.length) return true;
    return list.includes(u.email ?? '');
  });

  constructor() {
    // Restore session on init
    this.supabase.auth.getSession().then(({ data }) => {
      this._session.set(data.session);
      this._user.set(data.session?.user ?? null);
    });

    // Listen for auth state changes (login, logout, token refresh, OAuth redirect)
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
      this._user.set(session?.user ?? null);
    });
  }

  /** Synchronous check — safe to call immediately after sign-in */
  isCurrentUserAllowed(): boolean {
    const u = this._user();
    if (!u) return false;
    const list = environment.allowedEmails;
    if (!list.length) return true;
    return list.includes(u.email ?? '');
  }

  currentUserEmail(): string {
    return this._user()?.email ?? '';
  }

  async loginWithGoogle(): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    if (error) throw error;
  }

  async loginWithEmail(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async registerWithEmail(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signUp({ email, password });
    if (error) throw error;
  }

  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  /** Wait until auth has resolved (user is no longer undefined) */
  waitForAuth(): Promise<User | null> {
    return new Promise(resolve => {
      const check = () => {
        const u = this._user();
        if (u !== undefined) { resolve(u); return; }
        setTimeout(check, 50);
      };
      check();
    });
  }
}
