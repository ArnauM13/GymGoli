import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_USER_SETTINGS, UserSettings } from '../models/user-settings.model';

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _settings = signal<UserSettings>(DEFAULT_USER_SETTINGS);
  private readonly _loaded   = signal(false);

  readonly settings       = this._settings.asReadonly();
  readonly loaded         = this._loaded.asReadonly();
  readonly metricsEnabled = computed(() => this._settings().metricsEnabled);

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      this._settings.set(DEFAULT_USER_SETTINGS);
      this._loaded.set(false);
      if (uid) this._load(uid);
    });
  }

  private async _load(uid: string): Promise<void> {
    const { data } = await this.supabase
      .from('user_settings')
      .select('settings')
      .eq('user_id', uid)
      .maybeSingle();

    if (data?.settings) {
      this._settings.set({ ...DEFAULT_USER_SETTINGS, ...(data.settings as Partial<UserSettings>) });
    }
    this._loaded.set(true);
  }

  async update(patch: Partial<UserSettings>): Promise<void> {
    const uid  = this.auth.uid();
    if (!uid) return;

    const next = { ...this._settings(), ...patch };
    this._settings.set(next);

    const { error } = await this.supabase
      .from('user_settings')
      .upsert({ user_id: uid, settings: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (error) {
      console.error('[UserSettingsService] update error:', error);
    }
  }
}
