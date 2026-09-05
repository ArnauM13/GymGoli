import { Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TodayService } from './today.service';
import { DEFAULT_SPORTS, Sport, SportMetricDef, SportSession, SportSessionStatus, SportSubtype } from '../models/sport.model';
import { FeelingLevel, PlannedSource } from '../models/workout.model';

/**
 * Una escriptura que encara no ha arribat a Supabase.
 *
 * Les sessions es guarden primer al dispositiu i s'envien després, així que
 * qualsevol canvi — alta, edició o esborrat — ha de poder esperar a la cua.
 * Abans només hi esperaven les altes: una edició feta sense cobertura petava
 * i es perdia, i l'entrenament es veia diferent segons el mòbil des d'on
 * miressis.
 */
type SportOpKind = 'insert' | 'update' | 'delete';
interface PendingSportOp { op: SportOpKind; id: string; row: Record<string, unknown>; }

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
  private today    = inject(TodayService);

  /** Igual que a WorkoutService: avui es mira, no es recorda. */
  private get _todayStr(): string { return this.today.today(); }

  // ── Sport definitions ────────────────────────────────────────────────────
  private readonly _sports = signal<Sport[]>([]);
  readonly sports  = this._sports.asReadonly();
  readonly isLoaded = signal(false);
  private _loadPromise: Promise<void> | null = null;

  // ── Sessions cache ────────────────────────────────────────────────────────
  private readonly _monthCache = new Map<string, SportSession[]>();
  private readonly _sessions   = signal<SportSession[]>([]);
  private _allLoaded = false;
  private _isFlushing = false;
  private _retryTimer: ReturnType<typeof setInterval> | null = null;

  /** Cada quant es reintenta la cua d'escriptures pendents. */
  private static readonly RETRY_MS = 20_000;
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

  /** Sport definitions indexed by id, and all sessions indexed by date —
   *  rebuilt once per change so the per-date helpers (called in calendar and
   *  home day-loops) don't rebuild a lookup map and scan every session on
   *  each call. */
  private readonly _sportsById = computed(() => new Map(this._sports().map(s => [s.id, s])));
  private readonly _sessionsByDate = computed(() => {
    const map = new Map<string, SportSession[]>();
    for (const s of this._sessions()) {
      const bucket = map.get(s.date) ?? [];
      bucket.push(s);
      map.set(s.date, bucket);
    }
    return map;
  });

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
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this._flushPending(); });
      window.addEventListener('pagehide', () => this._flushPending());
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

  private _metricKeys(defs: SportMetricDef[]): string {
    return defs.map(d => d.key).sort().join(',');
  }

  /** How many catalog default sports the user is missing OR has with outdated
   *  metrics — so existing users can pull in new sports and tailored metrics. */
  readonly missingDefaultCount = computed(() => {
    const mine = this._sports();
    return DEFAULT_SPORTS.filter(d => {
      const have = mine.find(s => s.name.trim().toLowerCase() === d.name.trim().toLowerCase());
      return !have || this._metricKeys(have.metricDefs) !== this._metricKeys(d.metricDefs);
    }).length;
  });

  /** Adds missing catalog sports and refreshes the metrics of the ones the user
   *  already has to the sport-specific catalog set (overwriting), merging in any
   *  new catalog subtypes (e.g. Yoga styles) without dropping the user's own.
   *  Never touches sports the user created. Returns how many changed. */
  async addMissingDefaults(): Promise<number> {
    const uid = this._uid();
    const mine = this._sports();
    let changed = 0;
    for (const d of DEFAULT_SPORTS) {
      const have = mine.find(s => s.name.trim().toLowerCase() === d.name.trim().toLowerCase());
      if (!have) {
        await this.supabase.from('sports').insert({
          user_id: uid, name: d.name, icon: d.icon, color: d.color,
          subtypes: d.subtypes, metric_defs: d.metricDefs,
        });
        changed++;
      } else if (this._metricKeys(have.metricDefs) !== this._metricKeys(d.metricDefs)) {
        const haveIds = new Set(have.subtypes.map(s => s.id));
        const subtypes = [...have.subtypes, ...d.subtypes.filter(s => !haveIds.has(s.id))];
        await this.supabase.from('sports')
          .update({ metric_defs: d.metricDefs, subtypes })
          .eq('id', have.id).eq('user_id', uid);
        changed++;
      }
    }
    if (changed) await this._loadSports(uid);
    return changed;
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

      // Què hi havia abans de demanar-ho: el que aparegui mentre la consulta
      // viatja s'ha registrat ara mateix i encara no pot sortir a la resposta.
      const known = new Set((this._monthCache.get(key) ?? []).map(s => s.id));

      const { data } = await this.supabase
        .from('sport_sessions')
        .select('*')
        .eq('user_id', uid)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      const fetched    = (data ?? []).map(r => toSportSession(r as Record<string, unknown>));
      const fetchedIds = new Set(fetched.map(s => s.id));
      // Registrar un esport d'un mes que s'estava carregant feia desaparèixer
      // la sessió de la pantalla: la resposta arribava després i s'ho enduia
      // tot. Ara les altes fetes mentrestant es conserven.
      const justAdded = (this._monthCache.get(key) ?? [])
        .filter(s => !known.has(s.id) && !fetchedIds.has(s.id));
      this._monthCache.set(key, [...fetched, ...justAdded]);
      this._rebuild();
      this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);
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
    const sportsMap = this._sportsById();
    return (this._sessionsByDate().get(date) ?? [])
      .filter(s => (s.status ?? 'done') !== 'planned')
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
    const sportsMap = this._sportsById();
    const result: Array<{ sport: Sport; session: SportSession }> = [];
    for (const s of this._sessionsByDate().get(date) ?? []) {
      if (!predicate(s)) continue;
      const sport = sportsMap.get(s.sportId);
      if (sport) result.push({ sport, session: s });
    }
    return result;
  }

  /** Returns the session for a specific sport on a specific date (any status). */
  getSessionForDate(date: string, sportId: string): SportSession | undefined {
    return (this._sessionsByDate().get(date) ?? []).find(s => s.sportId === sportId);
  }

  hasSportOnDate(date: string, sportId: string): boolean {
    return (this._sessionsByDate().get(date) ?? []).some(s =>
      s.sportId === sportId && (s.status ?? 'done') !== 'planned');
  }

  hasAnySportOnDate(date: string): boolean {
    return (this._sessionsByDate().get(date) ?? []).some(s => (s.status ?? 'done') !== 'planned');
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
    await this._pushOrQueue(uid, { op: 'insert', id, row });
  }

  /** Convert a planned sport session into a done one. */
  async startPlannedSession(id: string, date: string): Promise<void> {
    const uid = this._uid();

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.map(s => s.id === id ? { ...s, status: 'done' } : s));
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);

    await this._pushOrQueue(uid, { op: 'update', id, row: { status: 'done' } });
  }

  /**
   * Update an existing session's data.
   *
   * `status` només es toca quan qui edita ho demana: omplir les dades d'un
   * pàdel que tenies planificat i que ja has jugat és registrar-lo, i si
   * l'estat es quedava a 'planned' la sessió no comptava enlloc — ni al
   * calendari ni a les estadístiques — per molt que la guardessis.
   */
  async updateSession(
    id: string, date: string,
    data: { subtypeId?: string; duration?: number; feeling?: FeelingLevel; metrics?: Record<string, string | number>; notes?: string },
    status?: SportSessionStatus,
  ): Promise<void> {
    const uid = this._uid();

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.map(s => s.id === id
      ? {
          ...s, subtypeId: data.subtypeId, duration: data.duration,
          feeling: data.feeling, metrics: data.metrics, notes: data.notes,
          status: status ?? s.status,
        }
      : s
    ));
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);

    const row: Record<string, unknown> = {
      subtype_id: data.subtypeId ?? null,
      duration:   data.duration  ?? null,
      feeling:    data.feeling   ?? null,
      metrics:    data.metrics   ?? null,
      notes:      data.notes     ?? null,
    };
    if (status) row['status'] = status;
    await this._pushOrQueue(uid, { op: 'update', id, row });
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

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.map(s =>
      s.id === sessionId ? { ...s, subtypeId: subtypeId ?? undefined } : s
    ));
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);

    await this._pushOrQueue(uid, { op: 'update', id: sessionId, row: { subtype_id: subtypeId } });
  }

  // ── Private mutations ─────────────────────────────────────────────────────

  private async _createSession(date: string, sportId: string): Promise<void> {
    const uid = this._uid();
    // L'id el posa el client perquè la sessió existeixi al dispositiu abans
    // d'arribar al servidor — si no hi ha xarxa, l'alta espera a la cua.
    const id      = crypto.randomUUID();
    const session: SportSession = { id, date, sportId, status: 'done', createdAt: new Date() };
    const key     = date.substring(0, 7);
    const bucket  = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, [...bucket, session]);
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);

    await this._pushOrQueue(uid, {
      op: 'insert', id,
      row: { id, user_id: uid, date, sport_id: sportId, status: 'done' },
    });
  }

  private async _deleteSession(id: string, date: string): Promise<void> {
    const uid = this._uid();

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.filter(s => s.id !== id));
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);

    await this._pushOrQueue(uid, { op: 'delete', id, row: {} });
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

  /** Les entrades antigues eren files d'alta pelades, sense `op`. */
  private _readPending(uid: string): PendingSportOp[] {
    try {
      const raw = JSON.parse(localStorage.getItem(this._lsPendingKey(uid)) ?? '[]') as unknown[];
      return raw.map(e => {
        const entry = e as Record<string, unknown>;
        if (entry['op']) return entry as unknown as PendingSportOp;
        return { op: 'insert' as const, id: entry['id'] as string, row: entry };
      });
    } catch { return []; }
  }

  private _writePending(uid: string, ops: PendingSportOp[]): void {
    try { localStorage.setItem(this._lsPendingKey(uid), JSON.stringify(ops)); } catch { }
    if (ops.length) this._armRetry(); else this._stopRetry();
  }

  /**
   * Mentre quedi res per enviar, es reintenta sol cada 20s.
   *
   * Sense això una escriptura fallida es quedava encallada amb l'app oberta
   * fins que la tancaves i la tornaves a obrir, i mentrestant la sessió només
   * existia en aquell dispositiu.
   */
  private _armRetry(): void {
    if (this._retryTimer || typeof window === 'undefined') return;
    this._retryTimer = setInterval(() => this._flushPending(), SportService.RETRY_MS);
  }

  private _stopRetry(): void {
    if (!this._retryTimer) return;
    clearInterval(this._retryTimer);
    this._retryTimer = null;
  }

  /**
   * Encua una escriptura, plegant-la amb el que ja hi hagi d'aquesta sessió.
   *
   * Una edició sobre una alta que encara no ha sortit es fon amb l'alta, i un
   * esborrat les elimina totes dues: al servidor no li ha d'arribar el rastre
   * de coses que mai hi van ser.
   */
  private _queuePending(uid: string, op: PendingSportOp): void {
    const ops     = this._readPending(uid);
    const pending = ops.filter(o => o.id === op.id);
    const others  = ops.filter(o => o.id !== op.id);

    if (op.op === 'delete') {
      // Mai va arribar al servidor: prou amb oblidar-la.
      if (pending.some(o => o.op === 'insert')) { this._writePending(uid, others); return; }
      this._writePending(uid, [...others, op]);
      return;
    }

    const insert = pending.find(o => o.op === 'insert');
    if (insert) {
      this._writePending(uid, [...others, { ...insert, row: { ...insert.row, ...op.row } }]);
      return;
    }
    const update = pending.find(o => o.op === 'update');
    if (op.op === 'update' && update) {
      this._writePending(uid, [...others, { ...update, row: { ...update.row, ...op.row } }]);
      return;
    }
    this._writePending(uid, [...ops, op]);
  }

  /** Prova d'escriure ara; si falla (sense xarxa, servidor caigut), espera a
   *  la cua. El canvi ja és al dispositiu, així que no es perd. */
  private async _pushOrQueue(uid: string, op: PendingSportOp): Promise<void> {
    try {
      await this._runOp(uid, op);
    } catch {
      this._queuePending(uid, op);
    }
  }

  private async _runOp(uid: string, op: PendingSportOp): Promise<void> {
    const table = this.supabase.from('sport_sessions');
    if (op.op === 'insert') {
      // `upsert` i no `insert`: un reintent d'una alta que sí que havia
      // arribat no ha de petar per clau duplicada.
      const { error } = await table.upsert(op.row, { onConflict: 'id' });
      if (error) throw error;
      return;
    }
    if (op.op === 'update') {
      const { error } = await table.update(op.row).eq('id', op.id).eq('user_id', uid);
      if (error) throw error;
      return;
    }
    const { error } = await table.delete().eq('id', op.id).eq('user_id', uid);
    if (error) throw error;
  }

  private async _flushPending(): Promise<void> {
    if (this._isFlushing) return;
    const uid = this.auth.uid();
    if (!uid || typeof navigator === 'undefined' || !navigator.onLine) return;
    const ops = this._readPending(uid);
    if (ops.length === 0) return;

    this._isFlushing = true;
    const remaining: PendingSportOp[] = [];
    for (const op of ops) {
      try {
        await this._runOp(uid, op);
      } catch {
        remaining.push(op);
      }
    }
    this._writePending(uid, remaining);
    this._isFlushing = false;
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
