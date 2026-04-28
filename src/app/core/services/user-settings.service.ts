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

  readonly settings            = this._settings.asReadonly();
  readonly loaded              = this._loaded.asReadonly();
  readonly metricsEnabled      = computed(() => this._settings().metricsEnabled);
  readonly goalMode            = computed(() => this._settings().goalMode);
  readonly weeklyActivityGoal  = computed(() => this._settings().weeklyActivityGoal ?? null);
  readonly weeklyGymGoal       = computed(() => this._settings().weeklyGymGoal ?? null);
  readonly weeklySportGoal     = computed(() => this._settings().weeklySportGoal ?? null);
  readonly darkMode            = computed(() => this._settings().darkMode);
  readonly weightUnit          = computed(() => this._settings().weightUnit ?? 'kg');

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      this._settings.set(DEFAULT_USER_SETTINGS);
      this._loaded.set(false);
      if (uid) this._load(uid);
    });
  }

  private _lsKey(uid: string): string {
    return `gymgoli_settings_${uid}`;
  }

  private _readLocalStorage(uid: string): Partial<UserSettings> | null {
    try {
      const raw = localStorage.getItem(this._lsKey(uid));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private _writeLocalStorage(uid: string, s: UserSettings): void {
    try { localStorage.setItem(this._lsKey(uid), JSON.stringify(s)); } catch { }
  }

  private async _load(uid: string): Promise<void> {
    // Restore from localStorage synchronously so the UI never waits for the network
    const local = this._readLocalStorage(uid);
    if (local) this._settings.set({ ...DEFAULT_USER_SETTINGS, ...local });
    this._loaded.set(true);

    // Sync with Supabase in the background and update if it has fresher data
    try {
      const { data, error } = await this.supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', uid)
        .maybeSingle();

      if (!error && data?.settings) {
        const merged = { ...DEFAULT_USER_SETTINGS, ...(data.settings as Partial<UserSettings>) };
        this._settings.set(merged);
        this._writeLocalStorage(uid, merged);
      }
    } catch { /* table may not exist yet */ }
  }

  async update(patch: Partial<UserSettings>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const next = { ...this._settings(), ...patch };
    this._settings.set(next);
    this._writeLocalStorage(uid, next);

    try {
      await this.supabase
        .from('user_settings')
        .upsert({ user_id: uid, settings: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    } catch { /* best-effort */ }
  }
}
