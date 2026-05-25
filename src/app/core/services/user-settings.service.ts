import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_USER_SETTINGS, FitnessGoal, UserSettings } from '../models/user-settings.model';

export interface GoalSnapshot {
  effectiveFrom: string;
  goalMode: string;
  weeklyActivityGoal: number | null;
  weeklyGymGoal:      number | null;
  weeklySportGoal:    number | null;
}

const GOAL_KEYS: (keyof UserSettings)[] = [
  'goalMode', 'weeklyActivityGoal', 'weeklyGymGoal', 'weeklySportGoal',
];

@Injectable({ providedIn: 'root' })
export class UserSettingsService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _settings    = signal<UserSettings>(DEFAULT_USER_SETTINGS);
  private readonly _loaded      = signal(false);
  private readonly _goalHistory = signal<GoalSnapshot[]>([]);

  readonly settings            = this._settings.asReadonly();
  readonly loaded              = this._loaded.asReadonly();
  readonly goalHistory         = this._goalHistory.asReadonly();
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
      // Known device: serve from cache immediately so the UI is instant
      this._settings.set({ ...DEFAULT_USER_SETTINGS, ...local });
      this._loaded.set(true);
    }
    // New device: keep loaded=false until Supabase responds so the app
    // never shows onboarding before confirming the user's real settings

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

      // Load goal history (best-effort; table may not exist yet)
      try {
        const { data: hist } = await this.supabase
          .from('goal_history')
          .select('effective_from,goal_mode,weekly_activity_goal,weekly_gym_goal,weekly_sport_goal')
          .eq('user_id', uid)
          .order('effective_from', { ascending: false });
        if (hist) {
          this._goalHistory.set(hist.map(r => ({
            effectiveFrom:       r['effective_from'] as string,
            goalMode:            r['goal_mode'] as string,
            weeklyActivityGoal:  r['weekly_activity_goal'] as number | null,
            weeklyGymGoal:       r['weekly_gym_goal'] as number | null,
            weeklySportGoal:     r['weekly_sport_goal'] as number | null,
          })));
        }
      } catch { /* table may not exist yet */ }
    } catch { /* table may not exist yet */ }

    // Mark loaded once Supabase has responded (no-op if already set from cache)
    this._loaded.set(true);
  }

  async saveGoalSnapshot(effectiveFrom: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    const s = this._settings();
    const row = {
      user_id:              uid,
      effective_from:       effectiveFrom,
      goal_mode:            s.goalMode ?? 'combined',
      weekly_activity_goal: s.weeklyActivityGoal ?? null,
      weekly_gym_goal:      s.weeklyGymGoal ?? null,
      weekly_sport_goal:    s.weeklySportGoal ?? null,
    };
    try {
      await this.supabase
        .from('goal_history')
        .upsert(row, { onConflict: 'user_id,effective_from' });
      const entry: GoalSnapshot = {
        effectiveFrom,
        goalMode:           row.goal_mode,
        weeklyActivityGoal: row.weekly_activity_goal,
        weeklyGymGoal:      row.weekly_gym_goal,
        weeklySportGoal:    row.weekly_sport_goal,
      };
      const existing = this._goalHistory();
      const idx = existing.findIndex(g => g.effectiveFrom === effectiveFrom);
      if (idx >= 0) {
        const updated = [...existing]; updated[idx] = entry;
        this._goalHistory.set(updated);
      } else {
        this._goalHistory.set(
          [entry, ...existing].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))
        );
      }
    } catch { /* best-effort */ }
  }

  getGoalForDate(date: string): GoalSnapshot {
    const match = this._goalHistory().find(g => g.effectiveFrom <= date);
    if (match) return match;
    const s = this._settings();
    return {
      effectiveFrom:       date,
      goalMode:            s.goalMode ?? 'combined',
      weeklyActivityGoal:  s.weeklyActivityGoal ?? null,
      weeklyGymGoal:       s.weeklyGymGoal ?? null,
      weeklySportGoal:     s.weeklySportGoal ?? null,
    };
  }

  async update(patch: Partial<UserSettings>): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const hasGoalChange = GOAL_KEYS.some(k => k in patch);
    const next = { ...this._settings(), ...patch };
    this._settings.set(next);
    this._writeLocalStorage(uid, next);

    try {
      await this.supabase
        .from('user_settings')
        .upsert({ user_id: uid, settings: next, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (hasGoalChange) {
        await this.saveGoalSnapshot(new Date().toISOString().split('T')[0]);
      }
    } catch { /* best-effort */ }
  }
}
