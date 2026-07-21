import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { DEFAULT_SPORTS, Sport, SportMetricDef, SportSession, SportSessionStatus, SportSubtype } from '../models/sport.model';
import { FeelingLevel, PlannedSource } from '../models/workout.model';

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
    status:    (row['status'] as SportSessionStatus | undefined) ?? 'done',
    plannedSource: (row['planned_source'] as PlannedSource | null) ?? undefined,
    createdAt: new Date(row['created_at'] as string),
  };
}

// ── localStorage cache row (camelCase keys) → typed SportSession ────────────
function sportSessionFromCache(raw: Record<string, unknown>): SportSession {
  return {
    id:        raw['id'] as string,
    date:      raw['date'] as string,
    sportId:   raw['sportId'] as string,
    subtypeId: (raw['subtypeId'] as string | undefined) ?? undefined,
    duration:  (raw['duration'] as number | undefined) ?? undefined,
    feeling:   (raw['feeling'] as FeelingLevel | undefined) ?? undefined,
    metrics:   (raw['metrics'] as Record<string, string | number> | undefined) ?? undefined,
    notes:     (raw['notes'] as string | undefined) ?? undefined,
    status:    (raw['status'] as SportSessionStatus | undefined) ?? 'done',
    plannedSource: (raw['plannedSource'] as PlannedSource | undefined) ?? undefined,
    createdAt: new Date(raw['createdAt'] as string),
  };
}

@Injectable({ providedIn: 'root' })
export class SportService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);

  private readonly _todayStr = new Date().toISOString().split('T')[0];

  // ── Sport definitions ────────────────────────────────────────────────────
  private readonly _sports = signal<Sport[]>([]);
  readonly sports  = this._sports.asReadonly();
  readonly isLoaded = signal(false);
  private _loadPromise: Promise<void> | null = null;

  // ── Sessions cache ────────────────────────────────────────────────────────
  private readonly _monthCache = new Map<string, SportSession[]>();
  private readonly _sessions   = signal<SportSession[]>([]);
  private _allLoaded = false;
  readonly isLoading = signal(false);

  private readonly _sportsLoaded = signal(false);
  /** True once the user's sport definitions have been fetched at least once. */
  readonly sportsLoaded = this._sportsLoaded.asReadonly();

  /** Public sessions are DONE-only so stats/charts/calendar never count plans. */
  readonly sessions = computed(() =>
    this._sessions().filter(s => (s.status ?? 'done') !== 'planned')
  );
  /** Planned (future) sport sessions. */
  readonly plannedSessions = computed(() =>
    this._sessions().filter(s => s.status === 'planned')
  );

  readonly todaySessions = computed(() =>
    this.sessions().filter(s => s.date === this._todayStr)
  );

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      this._sports.set([]);
      this._sportsLoaded.set(false);
      this._monthCache.clear();
      this._sessions.set([]);
      this._allLoaded = false;
      this.isLoaded.set(false);
      this._loadPromise = null;
      if (uid) {
        const cached = this._readSportsFromStorage(uid);
        if (cached) {
          this._sports.set(cached);
          this._sportsLoaded.set(true);
        }
        this._loadSports(uid);
        this._preloadCurrentMonth();
        this._flushPending();
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._flushPending());
    }
  }

  // ── Lazy initialisation — call once per feature that needs sport definitions
  ensureLoaded(): Promise<void> {
    if (this.isLoaded()) return Promise.resolve();
    if (this._loadPromise)  return this._loadPromise;
    this._loadPromise = this._initLoad().finally(() => { this._loadPromise = null; });
    return this._loadPromise;
  }

  private async _initLoad(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    await this._loadSports(uid);
    this.isLoaded.set(true);
  }

  // ── Sport CRUD ────────────────────────────────────────────────────────────

  private async _loadSports(uid: string): Promise<void> {
    try {
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
        this._writeSportsToStorage(uid, sports);
      }
    } finally {
      this._sportsLoaded.set(true);
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
    const sports = (data ?? []).map(r => toSport(r as Record<string, unknown>));
    this._sports.set(sports);
    this._writeSportsToStorage(uid, sports);
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
    const updated = this._sports().filter(s => s.id !== id);
    this._sports.set(updated);
    this._writeSportsToStorage(uid, updated);
    for (const [key, sessions] of this._monthCache) {
      this._monthCache.set(key, sessions.filter(s => s.sportId !== id));
      this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);
    }
    this._rebuild();
  }

  // ── Sessions load ─────────────────────────────────────────────────────────

  private _preloadCurrentMonth(): void {
    const now = new Date();
    this.ensureMonthLoaded(now.getFullYear(), now.getMonth());
  }

  async ensureMonthLoaded(year: number, month: number): Promise<void> {
    const key = `${year}-${String(month + 1).padStart(2, '0')}`;
    if (this._monthCache.has(key) || this._allLoaded) return;

    const uid = this._uid();

    // ── Step 1: serve from localStorage immediately (no spinner if cached) ──
    const cached = this._readSessionsFromStorage(uid, key);
    if (cached) {
      this._monthCache.set(key, cached);
      this._rebuild();
    } else {
      this._monthCache.set(key, []); // mark loading
      this.isLoading.set(true);
    }

    // ── Step 2: background refresh from Supabase ────────────────────────────
    try {
      const start   = `${key}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end     = `${key}-${String(lastDay).padStart(2, '0')}`;

      const { data } = await this.supabase
        .from('sport_sessions')
        .select('*')
        .eq('user_id', uid)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      const fetched = (data ?? []).map(r => toSportSession(r as Record<string, unknown>));
      this._monthCache.set(key, fetched);
      this._rebuild();
      this._writeSessionsToStorage(uid, key, fetched);
    } catch {
      // Network failure — keep whatever we have from localStorage/local state
    } finally {
      this.isLoading.set(false);
    }
  }

  /** Loads the user's entire sport-session history into the cache in a single
   *  query. Needed by features that reason over all-time recency (e.g. the
   *  workout suggestion), which the lazy per-month loading can't guarantee.
   *  Cached after the first successful run. */
  async loadAllSessions(): Promise<void> {
    if (this._allLoaded) return;
    const uid = this.auth.uid();
    if (!uid) return;
    this.isLoading.set(true);
    try {
      const { data } = await this.supabase
        .from('sport_sessions')
        .select('*')
        .eq('user_id', uid)
        .order('date', { ascending: false });

      for (const row of data ?? []) {
        const s   = toSportSession(row as Record<string, unknown>);
        const key = s.date.substring(0, 7);
        const bucket = this._monthCache.get(key) ?? [];
        if (!bucket.find(x => x.id === s.id)) bucket.push(s);
        this._monthCache.set(key, bucket);
      }
      this._rebuild();
      this._allLoaded = true;
    } catch {
      // best-effort; keep whatever we already have
    } finally {
      this.isLoading.set(false);
    }
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  todayDateString(): string { return this._todayStr; }

  /** Returns full Sport objects (DONE sessions) for a given date. */
  getSportsForDate(date: string): Sport[] {
    const sessions  = this._sessions().filter(s => s.date === date && (s.status ?? 'done') !== 'planned');
    const sportsMap = new Map(this._sports().map(s => [s.id, s]));
    return sessions
      .map(s => sportsMap.get(s.sportId))
      .filter((s): s is Sport => !!s);
  }

  /** Returns sport + DONE session pairs for a given date. */
  getSportSessionsForDate(date: string): Array<{ sport: Sport; session: SportSession }> {
    return this._pairsForDate(date, s => (s.status ?? 'done') !== 'planned');
  }

  /** Returns sport + PLANNED session pairs for a given date. */
  getPlannedSportSessionsForDate(date: string): Array<{ sport: Sport; session: SportSession }> {
    return this._pairsForDate(date, s => s.status === 'planned');
  }

  private _pairsForDate(
    date: string, predicate: (s: SportSession) => boolean,
  ): Array<{ sport: Sport; session: SportSession }> {
    const sessions  = this._sessions().filter(s => s.date === date && predicate(s));
    const sportsMap = new Map(this._sports().map(s => [s.id, s]));
    const result: Array<{ sport: Sport; session: SportSession }> = [];
    for (const s of sessions) {
      const sport = sportsMap.get(s.sportId);
      if (sport) result.push({ sport, session: s });
    }
    return result;
  }

  /** Returns the session for a specific sport on a specific date (any status). */
  getSessionForDate(date: string, sportId: string): SportSession | undefined {
    return this._sessions().find(s => s.date === date && s.sportId === sportId);
  }

  hasSportOnDate(date: string, sportId: string): boolean {
    return this._sessions().some(s =>
      s.date === date && s.sportId === sportId && (s.status ?? 'done') !== 'planned');
  }

  hasAnySportOnDate(date: string): boolean {
    return this._sessions().some(s => s.date === date && (s.status ?? 'done') !== 'planned');
  }

  // ── Session log / toggle ────────────────────────────────────────────────

  /** Full session create with all metrics. Used by the session logger UI and
   *  by weekly routine planning — writes locally first so it works offline,
   *  then syncs to Supabase in the background (queued for retry if offline).
   *  `plannedSource` only matters for status: 'planned' — 'routine' or
   *  'manual', matching WorkoutService.createPlannedWorkout, so a routine
   *  and an ad-hoc plan can be retracted independently of each other. */
  async logSession(
    date: string, sportId: string,
    data: { subtypeId?: string; duration?: number; feeling?: FeelingLevel; metrics?: Record<string, string | number>; notes?: string },
    status: SportSessionStatus = 'done',
    plannedSource?: PlannedSource,
  ): Promise<void> {
    const uid = this._uid();
    const id  = crypto.randomUUID();
    const session: SportSession = {
      id, date, sportId,
      subtypeId: data.subtypeId,
      duration:  data.duration,
      feeling:   data.feeling,
      metrics:   data.metrics,
      notes:     data.notes,
      status,
      plannedSource,
      createdAt: new Date(),
    };

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, [...bucket, session]);
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);

    const row = {
      id, user_id: uid, date, sport_id: sportId,
      subtype_id: data.subtypeId ?? null,
      duration:   data.duration  ?? null,
      feeling:    data.feeling   ?? null,
      metrics:    data.metrics   ?? null,
      notes:      data.notes     ?? null,
      status,
      planned_source: plannedSource ?? null,
    };
    try {
      const { error } = await this.supabase.from('sport_sessions').insert(row);
      if (error) throw error;
    } catch {
      this._queuePending(uid, row);
    }
  }

  /** Convert a planned sport session into a done one. */
  async startPlannedSession(id: string, date: string): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase.from('sport_sessions')
      .update({ status: 'done' }).eq('id', id).eq('user_id', uid);
    if (error) throw error;

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.map(s => s.id === id ? { ...s, status: 'done' } : s));
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);
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
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);
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
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);
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
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);
  }

  private async _deleteSession(id: string, date: string): Promise<void> {
    const uid = this._uid();
    const { error } = await this.supabase
      .from('sport_sessions')
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) throw error;

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.filter(s => s.id !== id));
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);
  }

  // ── localStorage cache ────────────────────────────────────────────────────

  private _lsSportsKey(uid: string): string { return `gymgoli_sports_${uid}`; }

  private _writeSportsToStorage(uid: string, sports: Sport[]): void {
    try { localStorage.setItem(this._lsSportsKey(uid), JSON.stringify(sports)); } catch { }
  }

  private _readSportsFromStorage(uid: string): Sport[] | null {
    try {
      const raw = localStorage.getItem(this._lsSportsKey(uid));
      if (!raw) return null;
      return (JSON.parse(raw) as Record<string, unknown>[]).map(r => toSport(r));
    } catch { return null; }
  }

  private _lsSessionsKey(uid: string, monthKey: string): string {
    return `gymgoli_sport_sessions_${uid}_${monthKey}`;
  }

  private _writeSessionsToStorage(uid: string, monthKey: string, sessions: SportSession[]): void {
    try { localStorage.setItem(this._lsSessionsKey(uid, monthKey), JSON.stringify(sessions)); } catch { /* quota exceeded — non-fatal */ }
  }

  private _readSessionsFromStorage(uid: string, monthKey: string): SportSession[] | null {
    try {
      const raw = localStorage.getItem(this._lsSessionsKey(uid, monthKey));
      if (!raw) return null;
      return (JSON.parse(raw) as Record<string, unknown>[]).map(sportSessionFromCache);
    } catch { return null; }
  }

  // ── Offline sync queue (logSession writes locally first, retried here) ─────

  private _lsPendingKey(uid: string): string { return `gymgoli_sport_pending_${uid}`; }

  private _readPending(uid: string): Record<string, unknown>[] {
    try { return JSON.parse(localStorage.getItem(this._lsPendingKey(uid)) ?? '[]'); } catch { return []; }
  }

  private _writePending(uid: string, rows: Record<string, unknown>[]): void {
    try { localStorage.setItem(this._lsPendingKey(uid), JSON.stringify(rows)); } catch { }
  }

  private _queuePending(uid: string, row: Record<string, unknown>): void {
    const rows = this._readPending(uid);
    rows.push(row);
    this._writePending(uid, rows);
  }

  private async _flushPending(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || typeof navigator === 'undefined' || !navigator.onLine) return;
    const rows = this._readPending(uid);
    if (rows.length === 0) return;

    const remaining: Record<string, unknown>[] = [];
    for (const row of rows) {
      try {
        const { error } = await this.supabase.from('sport_sessions').insert(row);
        if (error) throw error;
      } catch {
        remaining.push(row);
      }
    }
    this._writePending(uid, remaining);
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
