import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { Workout } from '../models/workout.model';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

/** Per-item retry state. Persisted: a reload must neither hot-loop a write the
 *  server keeps rejecting nor forget that it was failing. */
interface RetryState {
  attempts:      number;
  nextAttemptAt: number;
  permanent:     boolean;
  lastError?:    string;
}

/** Transient failures (offline, 5xx, a dropped connection) climb this ladder.
 *  Each step gets ±20% jitter so a queue that failed together doesn't come
 *  back all at once. */
const BACKOFF_MS = [5_000, 15_000, 45_000, 120_000, 300_000, 900_000, 1_800_000];

/** A write the server refuses on its own terms — a constraint, a column it
 *  doesn't have, an RLS policy — will not start working within the minute, so
 *  it's parked instead of hammered. It still gets a free attempt every time
 *  the app opens or reconnects, which is what makes a server-side fix (a
 *  migration) heal the queue on its own, with nobody touching the app. */
const PERMANENT_RETRY_MS = 30 * 60_000;

/** How often a non-empty queue is worked through on its own. */
const TICK_MS = 60_000;

/** Writes are coalesced this long — a set logged mid-workout shouldn't cost a
 *  round trip per tap. */
const DEBOUNCE_MS = 3_000;

/**
 * Durable outbox for everything that has to reach the `workouts` table.
 *
 * The app never writes to Supabase directly: it queues an intent (upsert or
 * delete) against localStorage and returns immediately, and this service
 * drains the queue in the background — on a debounce, on a ticker, when the
 * connection comes back, when the tab is looked at again, and once
 * unconditionally on every app start. Every operation is idempotent (upsert by
 * id, delete by id), so replaying one is always safe and nothing needs to know
 * whether a row already exists on the server.
 *
 * The queue is the source of truth for "not stored yet" and it is never
 * dropped on a failure — only on a confirmed write or on proof that the server
 * already holds an equal-or-newer version of the row.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private supabase: SupabaseClient = inject(SupabaseService).client;
  private auth = inject(AuthService);

  /** Diagnostics only — nothing in the UI reads these. Sync is meant to be
   *  invisible; they exist so tests and the console can see what it's doing. */
  readonly status       = signal<SyncStatus>('synced');
  readonly pendingCount = signal<number>(0);
  readonly lastError    = signal<string | null>(null);

  /** Snapshots localStorage refused (quota) still sync within this session. */
  private _memSnapshots = new Map<string, Workout>();
  private _meta         = new Map<string, RetryState>();
  private _resolveSnapshot: ((workoutId: string) => Workout | undefined) | null = null;

  private _debounceTimer: ReturnType<typeof setTimeout>  | null = null;
  private _tickTimer:     ReturnType<typeof setInterval> | null = null;
  private _isFlushRunning = false;
  private _flushAgain     = false;

  constructor() {
    // Only the signed-in user drives this. Everything else runs untracked: the
    // queue's own signals are written from in here, and depending on them
    // would re-run the whole start-up path — reconciliation round trip
    // included — on every single write.
    effect(() => {
      const uid = this.auth.uid();
      untracked(() => {
        if (!uid) {
          this._memSnapshots.clear();
          this._meta.clear();
          this.lastError.set(null);
          this.status.set('synced');
          this._setPendingCount(0);
          return;
        }
        this._hydrate(uid);
        void this._resume(uid);
      });
    });

    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => void this._resume());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.pendingCount() > 0) void this._resume();
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** Lets the queue rebuild a snapshot localStorage lost, from whatever the
   *  app still holds in memory, instead of dropping the workout. */
  setSnapshotResolver(resolve: (workoutId: string) => Workout | undefined): void {
    this._resolveSnapshot = resolve;
  }

  /** Queues the workout's current state. Repeated calls just replace the
   *  snapshot — the queue holds one pending write per workout, always the
   *  latest, so a long editing session costs a single round trip. */
  queueUpsert(workoutId: string, snapshot: Workout): void {
    const uid = this.auth.uid();
    if (!uid) return;

    // Snapshot first, id second: an id in the queue whose snapshot failed to
    // write would be a workout the flush can only drop.
    this._writeSnapshot(uid, workoutId, snapshot);
    this._addTo(this._dirtyKey(uid), workoutId);
    this._removeFrom(this._deleteKey(uid), workoutId);
    this._clearMeta(uid, workoutId);

    this._refreshCount(uid);
    if (this.status() === 'synced') this.status.set('pending');
    this._scheduleDebouncedFlush();
  }

  /** Queues the workout's removal. Deleting a row the server never received is
   *  a no-op there, so this needs no bookkeeping about whether it was ever
   *  stored — it drops any queued write for the same id and tombstones it. */
  queueDelete(workoutId: string): void {
    const uid = this.auth.uid();
    if (!uid) return;

    this._dropQueuedUpsert(uid, workoutId);
    this._addTo(this._deleteKey(uid), workoutId);
    this._clearMeta(uid, workoutId);

    this._refreshCount(uid);
    if (this.status() === 'synced') this.status.set('pending');
    this._scheduleDebouncedFlush();
  }

  /** Ids with a write still queued — the month caches use it to keep local edits
   *  from being overwritten by staler server data. */
  pendingIds(): string[] {
    const uid = this.auth.uid();
    return uid ? this._loadIds(this._dirtyKey(uid)) : [];
  }

  /** Ids already deleted locally but not yet on the server — filtered out of
   *  every fetch so a deletion never flickers back into the lists. */
  pendingDeleteIds(): string[] {
    const uid = this.auth.uid();
    return uid ? this._loadIds(this._deleteKey(uid)) : [];
  }

  getSnapshot(workoutId: string): Workout | null {
    const uid = this.auth.uid();
    if (!uid) return null;

    const inMemory = this._memSnapshots.get(workoutId);
    if (inMemory) return inMemory;

    try {
      const raw = localStorage.getItem(this._snapKey(uid, workoutId));
      if (!raw) return null;
      const w = JSON.parse(raw) as Workout & { createdAt: string; updatedAt?: string };
      return {
        ...w,
        createdAt: new Date(w.createdAt),
        updatedAt: w.updatedAt ? new Date(w.updatedAt) : undefined,
      };
    } catch { return null; }
  }

  /**
   * Works the queue once. `force` ignores every backoff window — used when the
   * app starts and when the connection returns, the two moments where whatever
   * blocked a write has most likely changed.
   */
  async flush(options: { force?: boolean } = {}): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || !this._isOnline()) return;

    // A write queued mid-flush is picked up by the next lap rather than
    // starting a second, overlapping drain.
    if (this._isFlushRunning) { this._flushAgain = true; return; }

    this._isFlushRunning = true;
    try {
      do {
        this._flushAgain = false;
        await this._runPass(uid, options.force === true);
      } while (this._flushAgain && this._isOnline());
    } finally {
      this._isFlushRunning = false;
    }
  }

  // ── Private: one drain pass ────────────────────────────────────────────────

  private async _runPass(uid: string, force: boolean): Promise<void> {
    const upserts = this._loadIds(this._dirtyKey(uid));
    const deletes = this._loadIds(this._deleteKey(uid));
    if (upserts.length === 0 && deletes.length === 0) {
      this._refreshCount(uid);
      return;
    }

    this.status.set('syncing');
    let failures = 0;

    for (const workoutId of upserts) {
      if (!force && !this._isDue(workoutId)) continue;

      const snapshot = this.getSnapshot(workoutId) ?? this._resolveSnapshot?.(workoutId) ?? null;
      if (!snapshot) {
        // Nothing left anywhere to write — keeping the id would retry for ever
        // against a payload that no longer exists.
        console.warn(`[sync] snapshot perdut per a l'entrenament ${workoutId}, es descarta de la cua`);
        this._dropQueuedUpsert(uid, workoutId);
        continue;
      }

      try {
        await this._upsert(uid, snapshot);
        this._dropQueuedUpsert(uid, workoutId);
      } catch (err) {
        failures++;
        this._recordFailure(uid, workoutId, err);
      }
    }

    for (const workoutId of deletes) {
      if (!force && !this._isDue(workoutId)) continue;
      try {
        await this._delete(uid, workoutId);
        this._removeFrom(this._deleteKey(uid), workoutId);
        this._clearMeta(uid, workoutId);
      } catch (err) {
        failures++;
        this._recordFailure(uid, workoutId, err);
      }
    }

    const remaining = this._refreshCount(uid);
    if (remaining === 0) this.lastError.set(null);
    this.status.set(remaining === 0 ? 'synced' : failures > 0 ? 'error' : 'pending');
  }

  /** App start / reconnect: reconcile against the server first (so a stale
   *  snapshot never overwrites a newer row), then attempt everything left. */
  private async _resume(forUid?: string): Promise<void> {
    const uid = forUid ?? this.auth.uid();
    if (!uid || !this._isOnline()) return;
    if (this.pendingCount() === 0) return;

    await this._reconcile(uid);
    await this.flush({ force: true });
  }

  /**
   * Drops queued writes the server already satisfies. Two things get healed:
   * an entry whose write landed but whose acknowledgement was lost (it would
   * otherwise sit in the queue for ever), and an entry whose snapshot is older
   * than what another device has since stored (replaying it would silently
   * roll that edit back).
   */
  private async _reconcile(uid: string): Promise<void> {
    const ids = this._loadIds(this._dirtyKey(uid));
    if (ids.length === 0) return;

    try {
      const { data, error } = await this.supabase
        .from('workouts')
        .select('id, updated_at')
        .eq('user_id', uid)
        .in('id', ids);
      if (error || !data) return;

      for (const row of data as { id: string; updated_at: string | null }[]) {
        const serverTs = row.updated_at ? Date.parse(row.updated_at) : NaN;
        if (Number.isNaN(serverTs)) continue;   // no timestamp to compare — let the write run

        const snapshot = this.getSnapshot(row.id);
        if (!snapshot) continue;
        const localTs = (snapshot.updatedAt ?? snapshot.createdAt)?.getTime() ?? 0;

        if (serverTs >= localTs) this._dropQueuedUpsert(uid, row.id);
      }
      this._refreshCount(uid);
    } catch {
      // Reconciliation is an optimisation: if it can't run, the normal
      // idempotent replay below still gets the data there.
    }
  }

  // ── Private: Supabase ──────────────────────────────────────────────────────

  /** One idempotent write, confirmed by the row the server sends back. The old
   *  insert-vs-update split silently no-opped whenever the app's guess was
   *  wrong: an `update` that matched nothing reported success and the workout
   *  was dropped from the queue without ever being stored. */
  private async _upsert(uid: string, w: Workout): Promise<void> {
    const row: Record<string, unknown> = {
      id:                 w.id,
      user_id:            uid,
      date:               w.date,
      entries:            w.entries,
      categories:         w.categories ?? [],
      notes:              w.notes ?? null,
      feeling:            w.feeling ?? null,
      status:             w.status ?? 'done',
      planned_source:     w.plannedSource ?? null,
      source_proposal_id: w.sourceProposalId ?? null,
      updated_at:         (w.updatedAt ?? new Date()).toISOString(),
    };
    if (w.category) row['category'] = w.category;

    const { data, error } = await this.supabase
      .from('workouts')
      .upsert(row as never, { onConflict: 'id' })
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('el servidor no ha confirmat la fila');
  }

  private async _delete(uid: string, workoutId: string): Promise<void> {
    const { error } = await this.supabase
      .from('workouts')
      .delete()
      .eq('id', workoutId)
      .eq('user_id', uid);
    if (error) throw error;
  }

  // ── Private: retry bookkeeping ─────────────────────────────────────────────

  private _isDue(workoutId: string): boolean {
    return (this._meta.get(workoutId)?.nextAttemptAt ?? 0) <= Date.now();
  }

  private _recordFailure(uid: string, workoutId: string, err: unknown): void {
    const permanent = isPermanentFailure(err);
    const message   = describeSyncError(err);
    const attempts  = (this._meta.get(workoutId)?.attempts ?? 0) + 1;
    const base      = permanent
      ? PERMANENT_RETRY_MS
      : BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)];

    this._meta.set(workoutId, {
      attempts, permanent,
      nextAttemptAt: Date.now() + withJitter(base),
      lastError:     message,
    });
    this._persistMeta(uid);
    this.lastError.set(message);

    // The one thing worth a console line: a rejection no amount of retrying
    // fixes, which means the server (schema, policy) has to change.
    if (permanent) {
      console.warn(`[sync] el servidor rebutja l'entrenament ${workoutId}: ${message}`);
    }
  }

  private _clearMeta(uid: string, workoutId: string): void {
    if (this._meta.delete(workoutId)) this._persistMeta(uid);
  }

  // ── Private: queue storage ─────────────────────────────────────────────────

  private _dirtyKey(uid: string)             { return `gymgoli_sync_dirty_${uid}`; }
  private _deleteKey(uid: string)            { return `gymgoli_sync_deletes_${uid}`; }
  private _metaKey(uid: string)              { return `gymgoli_sync_meta_${uid}`; }
  private _snapKey(uid: string, wid: string) { return `gymgoli_sync_snap_${uid}_${wid}`; }
  /** Written by the pre-outbox versions; the insert/update split is gone. */
  private _legacyInsertKey(uid: string)      { return `gymgoli_sync_inserts_${uid}`; }

  private _loadIds(key: string): string[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch { return []; }
  }

  private _writeIds(key: string, ids: string[]): void {
    try {
      if (ids.length === 0) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(ids));
    } catch { /* quota — the in-memory queue still drains this session */ }
  }

  private _addTo(key: string, id: string): void {
    const ids = this._loadIds(key);
    if (!ids.includes(id)) this._writeIds(key, [...ids, id]);
  }

  private _removeFrom(key: string, id: string): void {
    const ids = this._loadIds(key);
    if (ids.includes(id)) this._writeIds(key, ids.filter(x => x !== id));
  }

  private _writeSnapshot(uid: string, workoutId: string, snapshot: Workout): void {
    try {
      localStorage.setItem(this._snapKey(uid, workoutId), JSON.stringify(snapshot));
      this._memSnapshots.delete(workoutId);
    } catch {
      // Out of quota: keep it in memory so this session can still send it.
      this._memSnapshots.set(workoutId, snapshot);
    }
  }

  private _dropQueuedUpsert(uid: string, workoutId: string): void {
    this._memSnapshots.delete(workoutId);
    try { localStorage.removeItem(this._snapKey(uid, workoutId)); } catch { /* ignore */ }
    this._removeFrom(this._dirtyKey(uid), workoutId);
    this._clearMeta(uid, workoutId);
  }

  private _persistMeta(uid: string): void {
    try {
      if (this._meta.size === 0) localStorage.removeItem(this._metaKey(uid));
      else localStorage.setItem(this._metaKey(uid), JSON.stringify(Object.fromEntries(this._meta)));
    } catch { /* quota — retry state degrades to in-memory */ }
  }

  private _hydrate(uid: string): void {
    this._memSnapshots.clear();
    this._meta.clear();
    try {
      const raw = localStorage.getItem(this._metaKey(uid));
      if (raw) {
        for (const [id, state] of Object.entries(JSON.parse(raw) as Record<string, RetryState>)) {
          this._meta.set(id, state);
        }
      }
    } catch { /* unreadable retry state just means everything is due now */ }

    try { localStorage.removeItem(this._legacyInsertKey(uid)); } catch { /* ignore */ }

    const count = this._refreshCount(uid);
    this.status.set(count > 0 ? 'pending' : 'synced');
    if (count === 0) this.lastError.set(null);
  }

  // ── Private: scheduling ────────────────────────────────────────────────────

  private _refreshCount(uid: string): number {
    const count = this._loadIds(this._dirtyKey(uid)).length + this._loadIds(this._deleteKey(uid)).length;
    this._setPendingCount(count);
    return count;
  }

  /** Single place where `pendingCount` changes, so the ticker is running
   *  exactly while there is something left to send. */
  private _setPendingCount(count: number): void {
    this.pendingCount.set(count);
    if (count > 0) this._startTicker();
    else this._stopTicker();
  }

  private _scheduleDebouncedFlush(): void {
    if (!this._isOnline() || typeof window === 'undefined') return;
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => {
      this._debounceTimer = null;
      void this.flush();
    }, DEBOUNCE_MS);
  }

  private _startTicker(): void {
    if (this._tickTimer !== null || typeof window === 'undefined') return;
    this._tickTimer = setInterval(() => {
      if (this.pendingCount() > 0) void this.flush();
    }, TICK_MS);
  }

  private _stopTicker(): void {
    if (this._tickTimer === null) return;
    clearInterval(this._tickTimer);
    this._tickTimer = null;
  }

  private _isOnline(): boolean {
    return typeof navigator === 'undefined' || navigator.onLine;
  }
}

/**
 * Whether retrying is pointless without something changing on the server.
 * Postgres answers with a SQLSTATE — class 22 (data exception, e.g. a value
 * outside an enum), 23 (constraint), 42 (undefined column, RLS denial) — and
 * PostgREST with its own PGRSTxxx codes for a request it can't map. Everything
 * else (no network, 5xx, 408, 429) is assumed transient and worth another go.
 */
function isPermanentFailure(err: unknown): boolean {
  const code = typeof err === 'object' && err !== null && 'code' in err
    ? String((err as { code?: unknown }).code ?? '')
    : '';
  if (/^(22|23|42|3F|P0)/.test(code) || code.startsWith('PGRST')) return true;

  const status = typeof err === 'object' && err !== null && 'status' in err
    ? (err as { status?: unknown }).status
    : undefined;
  if (typeof status === 'number') {
    return status >= 400 && status < 500 && status !== 408 && status !== 429;
  }
  return false;
}

/** Supabase rejections arrive as `PostgrestError` (a plain object with
 *  `message`), network ones as `Error` — both are kept verbatim so a stuck
 *  queue is diagnosable from the console. */
function describeSyncError(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'message' in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return 'error desconegut';
}

/** ±20% so a queue that failed together doesn't retry in lockstep. */
function withJitter(delay: number): number {
  return Math.round(delay * (0.8 + Math.random() * 0.4));
}
