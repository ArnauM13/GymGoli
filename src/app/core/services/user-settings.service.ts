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
  readonly bodyweightKg        = computed(() => this._settings().bodyweightKg ?? null);
  readonly bodyweightFactorEnabled = computed(() => this._settings().bodyweightFactorEnabled ?? false);
  readonly catalogUpdateDismissed  = computed(() => this._settings().catalogUpdateDismissed ?? false);
  readonly dismissedBuiltInTemplateIds = computed(() => this._settings().dismissedBuiltInTemplateIds ?? []);
  readonly dismissedHints              = computed(() => this._settings().dismissedHints ?? []);

  constructor() {
    if (typeof window !== 'undefined') {
      window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', e => this._systemDark.set(e.matches));
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
        const merged = { ...DEFAULT_USER_SETTINGS, ...(data.settings as Partial<UserSettings>) };
        this._settings.set(merged);
        this._writeLocalStorage(uid, merged);
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

    try {
      await this.supabase
        .from('user_settings')
        .upsert({ user_id: uid, settings: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    } catch { /* best-effort */ }
  }

  async updateWeeklyPlan(plan: WeeklyPlan): Promise<void> {
    await this.update({ weeklyPlan: plan });
  }
}
