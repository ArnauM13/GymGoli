import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_SPORTS, Sport, SportMetricDef, SportSession, SportSubtype } from '../models/sport.model';
import { FeelingLevel } from '../models/workout.model';

// ── Row mappers ──────────────────────────────────────────────────────────────

function toSport(row: Record<string, unknown>): Sport {
  return {
    id:         row['id'] as string,
    name:       row['name'] as string,
    icon:       row['icon'] as string,
    color:      row['color'] as string,
    subtypes:   (row['subtypes'] as SportSubtype[] | null) ?? [],
    metricDefs: (row['metric_defs'] as SportMetricDef[] | null) ?? [],
    createdAt:  new Date(row['created_at'] as string),
  };
}

function toSportSession(row: Record<string, unknown>): SportSession {
  return {
    id:        row['id'] as string,
    date:      row['date'] as string,
    sportId:   row['sport_id'] as string,
    subtypeId: (row['subtype_id'] as string | null) ?? undefined,
    duration:  (row['duration'] as number | null) ?? undefined,
    feeling:   (row['feeling'] as FeelingLevel | null) ?? undefined,
    metrics:   (row['metrics'] as Record<string, string | number> | null) ?? undefined,
    notes:     (row['notes'] as string | null) ?? undefined,
    createdAt: new Date(row['created_at'] as string),
  };
}

@Injectable({ providedIn: 'root' })
export class SportService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _todayStr = new Date().toISOString().split('T')[0];

  // ── Sport definitions ────────────────────────────────────────────────────
  private readonly _sports = signal<Sport[]>([]);
  readonly sports = this._sports.asReadonly();

  // ── Sessions cache ────────────────────────────────────────────────────────
  private readonly _monthCache = new Map<string, SportSession[]>();
  private readonly _sessions   = signal<SportSession[]>([]);
  readonly isLoading = signal(false);
  readonly sessions  = this._sessions.asReadonly();

  readonly todaySessions = computed(() =>
    this._sessions().filter(s => s.date === this._todayStr)
  );

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      this._sports.set([]);
      this._monthCache.clear();
      this._sessions.set([]);
      if (uid) {
        this._loadSports(uid);
        this._preloadRecentMonths();
      }
    });
  }

  // ── Sport CRUD ────────────────────────────────────────────────────────────

  private async _loadSports(uid: string): Promise<void> {
    const { data } = await this.supabase
      .from('sports')
      .select('*')
      .eq('user_id', uid)
      .order('created_at');

    const sports = (data ?? []).map(r => toSport(r as Record<string, unknown>));
    if (sports.length === 0) {
      await this._seedDefaults(uid);
    } else {
      this._sports.set(sports);
    }
  }

  private async _seedDefaults(uid: string): Promise<void> {
    for (const s of DEFAULT_SPORTS) {
      await this.supabase.from('sports').insert({
        user_id: uid, name: s.name, icon: s.icon, color: s.color,
        subtypes: s.subtypes, metric_defs: s.metricDefs,
      });
    }
    const { data } = await this.supabase
      .from('sports').select('*').eq('user_id', uid).order('created_at');
    this._sports.set((data ?? []).map(r => toSport(r as Record<string, unknown>)));
  }

  async createSport(payload: Pick<Sport, 'name' | 'icon' | 'color' | 'subtypes' | 'metricDefs'>): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase.from('sports').insert({
      user_id: uid, name: payload.name, icon: payload.icon,
      color: payload.color, subtypes: payload.subtypes,
      metric_defs: payload.metricDefs,
    });
    if (error) throw error;
    await this._loadSports(uid);
  }

  async updateSport(id: string, payload: Partial<Pick<Sport, 'name' | 'icon' | 'color' | 'subtypes' | 'metricDefs'>>): Promise<void> {
    const uid = this._uid();
    const dbPayload: Record<string, unknown> = {};
    if (payload.name       !== undefined) dbPayload['name']        = payload.name;
    if (payload.icon       !== undefined) dbPayload['icon']        = payload.icon;
    if (payload.color      !== undefined) dbPayload['color']       = payload.color;
    if (payload.subtypes   !== undefined) dbPayload['subtypes']    = payload.subtypes;
    if (payload.metricDefs !== undefined) dbPayload['metric_defs'] = payload.metricDefs;

    const { error } = await this.supabase.from('sports').update(dbPayload)
      .eq('id', id).eq('user_id', uid);
    if (error) throw error;
    await this._loadSports(uid);
  }

  async deleteSport(id: string): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase
      .from('sports')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;
    this._sports.set(this._sports().filter(s => s.id !== id));
    for (const [key, sessions] of this._monthCache) {
      this._monthCache.set(key, sessions.filter(s => s.sportId !== id));
    }
    this._rebuild();
  }

  // ── Sessions load ─────────────────────────────────────────────────────────

  private _preloadRecentMonths(): void {
    const now  = new Date();
    this.ensureMonthLoaded(now.getFullYear(), now.getMonth());
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    this.ensureMonthLoaded(prev.getFullYear(), prev.getMonth());
  }

  async ensureMonthLoaded(year: number, month: number): Promise<void> {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (this._monthCache.has(key)) return;

    this._monthCache.set(key, []); // mark loading

    this.isLoading.set(true);
    try {
      const start   = `${key}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end     = `${key}-${String(lastDay).padStart(2, '0')}`;

      const { data } = await this.supabase
        .from('sport_sessions')
        .select('*')
        .eq('user_id', this._uid())
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      this._monthCache.set(key, (data ?? []).map(r => toSportSession(r as Record<string, unknown>)));
      this._rebuild();
    } catch (err) {
      console.warn('[SportService] ensureMonthLoaded error:', err);
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  todayDateString(): string { return this._todayStr; }

  /** Returns full Sport objects for a given date (sorted by creation order). */
  getSportsForDate(date: string): Sport[] {
    const sessions  = this._sessions().filter(s => s.date === date);
    const sportsMap = new Map(this._sports().map(s => [s.id, s]));
    return sessions
      .map(s => sportsMap.get(s.sportId))
      .filter((s): s is Sport => !!s);
  }

  /** Returns sport + full session pairs for a given date. */
  getSportSessionsForDate(date: string): Array<{ sport: Sport; session: SportSession }> {
    const sessions  = this._sessions().filter(s => s.date === date);
    const sportsMap = new Map(this._sports().map(s => [s.id, s]));
    const result: Array<{ sport: Sport; session: SportSession }> = [];
    for (const s of sessions) {
      const sport = sportsMap.get(s.sportId);
      if (sport) result.push({ sport, session: s });
    }
    return result;
  }

  /** Returns the session for a specific sport on a specific date. */
  getSessionForDate(date: string, sportId: string): SportSession | undefined {
    return this._sessions().find(s => s.date === date && s.sportId === sportId);
  }

  hasSportOnDate(date: string, sportId: string): boolean {
    return this._sessions().some(s => s.date === date && s.sportId === sportId);
  }

  hasAnySportOnDate(date: string): boolean {
    return this._sessions().some(s => s.date === date);
  }

  // ── Session log / toggle ────────────────────────────────────────────────

  /** Full session create with all metrics. Used by the session logger UI. */
  async logSession(
    date: string, sportId: string,
    data: { subtypeId?: string; duration?: number; feeling?: FeelingLevel; metrics?: Record<string, string | number>; notes?: string }
  ): Promise<void> {
    const uid = this._uid();
    const { data: row, error } = await this.supabase.from('sport_sessions').insert({
      user_id: uid, date, sport_id: sportId,
      subtype_id: data.subtypeId ?? null,
      duration:   data.duration  ?? null,
      feeling:    data.feeling   ?? null,
      metrics:    data.metrics   ?? null,
      notes:      data.notes     ?? null,
    }).select().single();
    if (error) throw error;

    const session = toSportSession(row as Record<string, unknown>);
    const key     = date.substring(0, 7);
    const bucket  = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, [...bucket, session]);
    this._rebuild();
  }

  /** Update an existing session's data. */
  async updateSession(
    id: string, date: string,
    data: { subtypeId?: string; duration?: number; feeling?: FeelingLevel; metrics?: Record<string, string | number>; notes?: string }
  ): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase.from('sport_sessions').update({
      subtype_id: data.subtypeId ?? null,
      duration:   data.duration  ?? null,
      feeling:    data.feeling   ?? null,
      metrics:    data.metrics   ?? null,
      notes:      data.notes     ?? null,
    }).eq('id', id).eq('user_id', uid);
    if (error) throw error;

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.map(s => s.id === id
      ? { ...s, subtypeId: data.subtypeId, duration: data.duration, feeling: data.feeling, metrics: data.metrics, notes: data.notes }
      : s
    ));
    this._rebuild();
  }

  async deleteSession(id: string, date: string): Promise<void> {
    await this._deleteSession(id, date);
  }

  /** Backward-compatible toggle (no metrics). */
  async toggleSport(date: string, sportId: string): Promise<void> {
    const existing = this._sessions().find(s => s.date === date && s.sportId === sportId);
    if (existing) {
      await this._deleteSession(existing.id, date);
    } else {
      await this._createSession(date, sportId);
    }
  }

  async setSessionSubtype(sessionId: string, date: string, subtypeId: string | null): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase.from('sport_sessions')
      .update({ subtype_id: subtypeId }).eq('id', sessionId).eq('user_id', uid);
    if (error) throw error;

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.map(s =>
      s.id === sessionId ? { ...s, subtypeId: subtypeId ?? undefined } : s
    ));
    this._rebuild();
  }

  // ── Private mutations ─────────────────────────────────────────────────────

  private async _createSession(date: string, sportId: string): Promise<void> {
    const uid = this._uid();
    const { data, error } = await this.supabase
      .from('sport_sessions')
      .insert({ user_id: uid, date, sport_id: sportId })
      .select()
      .single();
    if (error) throw error;

    const session = toSportSession(data as Record<string, unknown>);
    const key     = date.substring(0, 7);
    const bucket  = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, [...bucket, session]);
    this._rebuild();
  }

  private async _deleteSession(id: string, date: string): Promise<void> {
    const { error } = await this.supabase
      .from('sport_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', this._uid());
    if (error) throw error;

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.filter(s => s.id !== id));
    this._rebuild();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _rebuild(): void {
    const all = Array.from(this._monthCache.values()).flat();
    all.sort((a, b) => b.date.localeCompare(a.date));
    this._sessions.set(all);
  }

  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }
}
