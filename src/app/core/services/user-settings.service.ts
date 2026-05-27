import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_USER_SETTINGS, FitnessGoal, UserSettings } from '../models/user-settings.model';

export interface GoalSnapshot {
  goalMode:            'combined' | 'separate';
  weeklyActivityGoal:  number | null;
  weeklyGymGoal:       number | null;
  weeklySportGoal:     number | null;
}

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _settings    = signal<UserSettings>(DEFAULT_USER_SETTINGS);
  private readonly _loaded      = signal(false);

  readonly settings            = this._settings.asReadonly();
  readonly loaded              = this._loaded.asReadonly();
  readonly metricsEnabled      = computed(() => this._settings().metricsEnabled);
  readonly goalMode            = computed(() => this._settings().goalMode);
  readonly weeklyActivityGoal  = computed(() => this._settings().weeklyActivityGoal ?? null);
  readonly weeklyGymGoal       = computed(() => this._settings().weeklyGymGoal ?? null);
  readonly weeklySportGoal     = computed(() => this._settings().weeklySportGoal ?? null);
  readonly darkMode            = computed(() => this._settings().darkMode);
  readonly weightUnit          = computed(() => this._settings().weightUnit ?? 'kg');
  readonly restTimerSeconds    = computed(() => this._settings().restTimerSeconds ?? 90);
  readonly fitnessGoal         = computed(() => (this._settings().fitnessGoal ?? null) as FitnessGoal | null);

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

    const prev = this._settings();
    const next = { ...prev, ...patch };
    this._settings.set(next);
    this._writeLocalStorage(uid, next);

    const goalFields: (keyof UserSettings)[] = [
      'goalMode', 'weeklyActivityGoal', 'weeklyGymGoal', 'weeklySportGoal',
    ];
    const goalsChanged = goalFields.some(f => (patch as Record<string, unknown>)[f] !== undefined);

    try {
      await this.supabase
        .from('user_settings')
        .upsert({ user_id: uid, settings: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

      if (goalsChanged) {
        const today = new Date().toISOString().split('T')[0];
        await this.supabase.from('goal_history').upsert({
          user_id:              uid,
          effective_from:       today,
          goal_mode:            next.goalMode ?? 'combined',
          weekly_activity_goal: next.weeklyActivityGoal ?? null,
          weekly_gym_goal:      next.weeklyGymGoal ?? null,
          weekly_sport_goal:    next.weeklySportGoal ?? null,
        }, { onConflict: 'user_id,effective_from' });
      }
    } catch { /* best-effort */ }
  }

  /** Returns the goal settings that were active at the start of the given week (monday). */
  async getGoalsForWeek(monday: string): Promise<GoalSnapshot> {
    const uid = this.auth.uid();
    if (!uid) return this._currentGoalSnapshot();

    try {
      const { data } = await this.supabase
        .from('goal_history')
        .select('goal_mode, weekly_activity_goal, weekly_gym_goal, weekly_sport_goal')
        .eq('user_id', uid)
        .lte('effective_from', monday)
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        return {
          goalMode:           (data['goal_mode'] as 'combined' | 'separate') ?? 'combined',
          weeklyActivityGoal: (data['weekly_activity_goal'] as number | null) ?? null,
          weeklyGymGoal:      (data['weekly_gym_goal'] as number | null) ?? null,
          weeklySportGoal:    (data['weekly_sport_goal'] as number | null) ?? null,
        };
      }
    } catch { /* best-effort */ }

    return this._currentGoalSnapshot();
  }

  private _currentGoalSnapshot(): GoalSnapshot {
    const s = this._settings();
    return {
      goalMode:           s.goalMode ?? 'combined',
      weeklyActivityGoal: s.weeklyActivityGoal ?? null,
      weeklyGymGoal:      s.weeklyGymGoal ?? null,
      weeklySportGoal:    s.weeklySportGoal ?? null,
    };
  }
}
