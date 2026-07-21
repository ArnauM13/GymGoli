import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_USER_SETTINGS, DifficultyScale, FitnessGoal, ThemeMode, UserSettings } from '../models/user-settings.model';
import { EMPTY_WEEKLY_PLAN, WeeklyPlan } from '../models/weekly-plan.model';

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _settings    = signal<UserSettings>(DEFAULT_USER_SETTINGS);
  private readonly _loaded      = signal(false);
  private readonly _systemDark  = signal(
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  readonly settings            = this._settings.asReadonly();
  readonly loaded              = this._loaded.asReadonly();
  readonly metricsEnabled      = computed(() => this._settings().metricsEnabled);
  readonly goalMode            = computed(() => this._settings().goalMode);
  readonly weeklyActivityGoal  = computed(() => this._settings().weeklyActivityGoal ?? null);
  readonly weeklyGymGoal       = computed(() => this._settings().weeklyGymGoal ?? null);
  readonly weeklySportGoal     = computed(() => this._settings().weeklySportGoal ?? null);
  readonly themeMode           = computed(() => this._settings().themeMode ?? 'system' as ThemeMode);
  readonly darkMode            = computed(() => {
    const mode = this.themeMode();
    if (mode === 'dark')   return true;
    if (mode === 'light')  return false;
    return this._systemDark();
  });
  readonly weightUnit          = computed(() => this._settings().weightUnit ?? 'kg');
  readonly restTimerSeconds    = computed(() => this._settings().restTimerSeconds ?? 90);
  readonly fitnessGoal         = computed(() => (this._settings().fitnessGoal ?? null) as FitnessGoal | null);
  readonly weeklyPlan          = computed(() => this._settings().weeklyPlan ?? EMPTY_WEEKLY_PLAN);
  readonly supersetsEnabled    = computed(() => this._settings().supersetsEnabled ?? false);
  readonly dropsetsEnabled     = computed(() => this._settings().dropsetsEnabled ?? false);
  readonly rirEnabled          = computed(() => this._settings().rirEnabled ?? false);
  readonly difficultyScale     = computed(() => (this._settings().difficultyScale ?? 'emoji') as DifficultyScale);
  readonly dismissedBuiltInTemplateIds = computed(() => this._settings().dismissedBuiltInTemplateIds ?? []);

  constructor() {
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', e => this._systemDark.set(e.matches));

      // Settings are a single last-write-wins document, so a failed upsert
      // just leaves a dirty flag behind and gets retried here.
      window.addEventListener('online', () => this._pushPendingIfAny());
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this._pushPendingIfAny();
      });
    }

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

  private _dirtyKey(uid: string): string {
    return `gymgoli_settings_dirty_${uid}`;
  }

  private _isDirty(uid: string): boolean {
    try { return localStorage.getItem(this._dirtyKey(uid)) === 'true'; } catch { return false; }
  }

  private _setDirty(uid: string, dirty: boolean): void {
    try {
      if (dirty) localStorage.setItem(this._dirtyKey(uid), 'true');
      else       localStorage.removeItem(this._dirtyKey(uid));
    } catch { }
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
    const local = this._readLocalStorage(uid);

    if (local) {
      this._settings.set({ ...DEFAULT_USER_SETTINGS, ...local });
      this._loaded.set(true);
    }

    try {
      const { data, error } = await this.supabase
        .from('user_settings')
        .select('settings')
        .eq('user_id', uid)
        .maybeSingle();

      if (!error && data?.settings) {
        if (this._isDirty(uid)) {
          // Unsent local changes win over the server copy — push them
          // instead of silently overwriting them with older data.
          await this._push(uid);
        } else {
          const merged = { ...DEFAULT_USER_SETTINGS, ...(data.settings as Partial<UserSettings>) };
          this._settings.set(merged);
          this._writeLocalStorage(uid, merged);
        }
      }
    } catch { /* best-effort */ }

    this._loaded.set(true);
  }

  async update(patch: Partial<UserSettings>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const next = { ...this._settings(), ...patch };
    this._settings.set(next);
    this._writeLocalStorage(uid, next);
    await this._push(uid);
  }

  /** Upserts the current settings; on failure leaves a dirty flag that is
   *  retried when the app comes back online / to the foreground. */
  private async _push(uid: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('user_settings')
        .upsert(
          { user_id: uid, settings: this._settings(), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        );
      if (error) throw error;
      this._setDirty(uid, false);
    } catch {
      this._setDirty(uid, true);
    }
  }

  private _pushPendingIfAny(): void {
    const uid = this.auth.uid();
    if (uid && this._isDirty(uid)) this._push(uid);
  }

  async updateWeeklyPlan(plan: WeeklyPlan): Promise<void> {
    await this.update({ weeklyPlan: plan });
  }
}
