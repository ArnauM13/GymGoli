import { Injectable, effect, inject, signal } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { Workout } from '../models/workout.model';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

interface BackoffState { retryCount: number; nextRetryAt: number; }

@Injectable({ providedIn: 'root' })
export class SyncService {
  private supabase: SupabaseClient = inject(SupabaseService).client;
  private auth = inject(AuthService);

  readonly status       = signal<SyncStatus>('synced');
  readonly pendingCount = signal<number>(0);

  private _backoff       = new Map<string, BackoffState>();
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryTimer: ReturnType<typeof setInterval> | null = null;
  private _isFlushRunning = false;

  /** Un entrenament no ha de quedar-se mai al mòbil: mentre hi hagi res
   *  pendent es reintenta sol, sense esperar que l'usuari torni a obrir res. */
  private static readonly RETRY_MS = 20_000;

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      if (uid) {
        this._hydrate(uid);
        if (navigator.onLine && this._loadDirtyIds(uid).length > 0) this._triggerFlush();
      } else {
        this.status.set('synced');
        this.pendingCount.set(0);
        this._stopRetry();
      }
    });

    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this._triggerFlush());
    document.addEventListener('visibilitychange', () => {
      if (this.pendingCount() === 0 || !navigator.onLine) return;
      // En amagar-se (canvi d'app al mòbil) s'envia ja, sense el debounce: si
      // el sistema mata la pestanya, el que s'ha entrenat ja és al servidor.
      if (document.hidden) this._flushNow(); else this._triggerFlush();
    });
    window.addEventListener('pagehide', () => { if (this.pendingCount() > 0) this._flushNow(); });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  markDirty(workoutId: string, snapshot: Workout, isInsert = false): void {
    const uid = this.auth.uid();
    if (!uid) return;

    this._writeSnap(uid, workoutId, snapshot);
    const ids = this._loadDirtyIds(uid);
    if (!ids.includes(workoutId)) {
      ids.push(workoutId);
      this._writeDirtyIds(uid, ids);
    }
    if (isInsert) {
      const inserts = this._loadInsertIds(uid);
      if (!inserts.includes(workoutId)) {
        inserts.push(workoutId);
        this._writeInsertIds(uid, inserts);
      }
    }
    this.pendingCount.set(ids.length);
    if (this.status() === 'synced') this.status.set('pending');

    this._armRetry();

    if (!navigator.onLine) return;
    // Una alta va al servidor de seguida: és el moment en què l'entrenament
    // encara no existeix enlloc més i el que fa que es vegi des d'un altre
    // dispositiu. Les edicions s'agrupen, que en arriben moltes seguides
    // mentre s'omplen sèries.
    if (isInsert) { this._flushNow(); return; }
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => { this._debounceTimer = null; this.flush(); }, 1500);
  }

  markClean(workoutId: string): void {
    const uid = this.auth.uid();
    if (!uid) return;

    this._removeSnap(uid, workoutId);
    const ids = this._loadDirtyIds(uid).filter(id => id !== workoutId);
    this._writeDirtyIds(uid, ids);
    const inserts = this._loadInsertIds(uid).filter(id => id !== workoutId);
    this._writeInsertIds(uid, inserts);
    this._backoff.delete(workoutId);

    this.pendingCount.set(ids.length);
    if (ids.length === 0) {
      this._stopRetry();
      if (!this._isFlushRunning) this.status.set('synced');
    }
  }

  cancelDirty(workoutId: string): void {
    this.markClean(workoutId);
  }

  isInsert(workoutId: string): boolean {
    const uid = this.auth.uid();
    if (!uid) return false;
    return this._loadInsertIds(uid).includes(workoutId);
  }

  pendingIds(): string[] {
    const uid = this.auth.uid();
    if (!uid) return [];
    return this._loadDirtyIds(uid);
  }

  getSnapshot(workoutId: string): Workout | null {
    const uid = this.auth.uid();
    if (!uid) return null;
    try {
      const raw = localStorage.getItem(this._snapKey(uid, workoutId));
      if (!raw) return null;
      const w = JSON.parse(raw) as Workout & { createdAt: string };
      return { ...w, createdAt: new Date(w.createdAt) };
    } catch { return null; }
  }

  async flush(): Promise<void> {
    if (this._isFlushRunning || !navigator.onLine) return;
    const uid = this.auth.uid();
    if (!uid) return;
    const ids = this.pendingIds();
    if (ids.length === 0) return;

    this._isFlushRunning = true;
    this.status.set('syncing');

    let anyError = false;
    for (const workoutId of ids) {
      const backoff = this._backoff.get(workoutId);
      if (backoff && Date.now() < backoff.nextRetryAt) continue;

      const snap = this.getSnapshot(workoutId);
      if (!snap) { this.markClean(workoutId); continue; }

      try {
        await this._upsertToSupabase(uid, snap, this.isInsert(workoutId));
        this.markClean(workoutId);
      } catch {
        anyError = true;
        const count = (this._backoff.get(workoutId)?.retryCount ?? 0) + 1;
        const delay = [5_000, 10_000, 30_000, 60_000][Math.min(count - 1, 3)];
        this._backoff.set(workoutId, { retryCount: count, nextRetryAt: Date.now() + delay });
      }
    }

    this._isFlushRunning = false;
    const remaining = this.pendingIds().length;
    this.pendingCount.set(remaining);
    this.status.set(remaining === 0 ? 'synced' : anyError ? 'error' : 'pending');
    if (remaining > 0) this._armRetry(); else this._stopRetry();
  }

  // ── Private: Supabase ──────────────────────────────────────────────────────

  private async _upsertToSupabase(uid: string, w: Workout, isInsert: boolean): Promise<void> {
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

    if (isInsert) {
      const { error } = await this.supabase
        .from('workouts')
        .upsert(row as unknown as Parameters<typeof this.supabase.from>[0], { onConflict: 'id' });
      if (error) throw error;
    } else {
      const { error } = await this.supabase
        .from('workouts')
        .update(row)
        .eq('id', w.id)
        .eq('user_id', uid);
      if (error) throw error;
    }
  }

  // ── Private: localStorage ──────────────────────────────────────────────────

  private _dirtyKey(uid: string)                     { return `gymgoli_sync_dirty_${uid}`; }
  private _insertKey(uid: string)                    { return `gymgoli_sync_inserts_${uid}`; }
  private _snapKey(uid: string, wid: string)         { return `gymgoli_sync_snap_${uid}_${wid}`; }

  private _loadDirtyIds(uid: string): string[] {
    try { return JSON.parse(localStorage.getItem(this._dirtyKey(uid)) ?? '[]'); } catch { return []; }
  }
  private _writeDirtyIds(uid: string, ids: string[]): void {
    try { localStorage.setItem(this._dirtyKey(uid), JSON.stringify(ids)); } catch { }
  }
  private _loadInsertIds(uid: string): string[] {
    try { return JSON.parse(localStorage.getItem(this._insertKey(uid)) ?? '[]'); } catch { return []; }
  }
  private _writeInsertIds(uid: string, ids: string[]): void {
    try { localStorage.setItem(this._insertKey(uid), JSON.stringify(ids)); } catch { }
  }
  private _writeSnap(uid: string, wid: string, snap: Workout): void {
    try { localStorage.setItem(this._snapKey(uid, wid), JSON.stringify(snap)); } catch { }
  }
  private _removeSnap(uid: string, wid: string): void {
    try { localStorage.removeItem(this._snapKey(uid, wid)); } catch { }
  }

  private _hydrate(uid: string): void {
    const count = this._loadDirtyIds(uid).length;
    this.pendingCount.set(count);
    this.status.set(count > 0 ? 'pending' : 'synced');
    if (count > 0) this._armRetry(); else this._stopRetry();
  }

  private _triggerFlush(): void {
    setTimeout(() => this.flush(), 1000);
  }

  /** Envia ara mateix, saltant-se el debounce pendent. */
  private _flushNow(): void {
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    this.flush();
  }

  /**
   * Mentre quedi res per enviar, es reintenta sol cada 20s.
   *
   * Abans només es reintentava en tornar la connexió o en tornar a l'app, així
   * que un error del servidor amb l'app oberta i quieta es quedava encallat
   * fins a la propera vegada que la tanquessis i l'obrissis.
   */
  private _armRetry(): void {
    if (this._retryTimer || typeof window === 'undefined') return;
    this._retryTimer = setInterval(() => {
      if (this.pendingCount() === 0) { this._stopRetry(); return; }
      if (navigator.onLine) this.flush();
    }, SyncService.RETRY_MS);
  }

  private _stopRetry(): void {
    if (!this._retryTimer) return;
    clearInterval(this._retryTimer);
    this._retryTimer = null;
  }
}
