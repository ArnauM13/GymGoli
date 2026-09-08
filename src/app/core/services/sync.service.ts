import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';

import { AuthService } from './auth.service';
import { Workout } from '../models/workout.model';
import { OfflineService } from './offline.service';
import { SupabaseService } from './supabase.service';
import { SyncLogService } from './sync-log.service';
import { WORKOUT_COLUMNS, WorkoutStoreService, countSets, toRow, toWorkout } from './workout-store.service';

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'error';

interface BackoffState { retryCount: number; nextRetryAt: number; }

/**
 * Puja al servidor el que ja està guardat al dispositiu.
 *
 * Aquest servei no és mai el camí d'anada de res: quan arriba aquí, el que
 * l'usuari ha fet ja és a `WorkoutStoreService` i no es pot perdre. La seva
 * única feina és anar buidant el que queda pendent, i tornar-ho a intentar
 * tantes vegades com calgui.
 *
 * La peça que ho fa segur és la revisió: s'envia la revisió N, i només es
 * dóna per pujada si en tornar la resposta la sessió continua a la revisió N.
 * Si mentrestant s'hi ha registrat una sèrie més, es queda pendent i torna a
 * sortir. Abans es donava per pujada per id, sense mirar la versió, i tot el
 * que s'escrivia mentre la petició viatjava desapareixia de la cua sense
 * haver arribat enlloc.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private supabase: SupabaseClient = inject(SupabaseService).client;
  private auth    = inject(AuthService);
  private store   = inject(WorkoutStoreService);
  private syncLog = inject(SyncLogService);
  private offline = inject(OfflineService);

  private readonly _status = signal<SyncStatus>('synced');
  readonly status = this._status.asReadonly();

  /** Quantes coses esperen pujar. Surt del propi magatzem, així que no pot
   *  desaparellar-se del que hi ha guardat de veritat. */
  readonly pendingCount = computed(() => this.store.pendingCount());

  /** L'última edició que no ha trobat la fila al servidor: l'entrenament
   *  s'havia esborrat des d'un altre dispositiu. */
  readonly vanished = signal<{ id: string; date: string; at: number } | null>(null);

  private _backoff       = new Map<string, BackoffState>();
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _retryTimer: ReturnType<typeof setInterval> | null = null;
  private _isFlushRunning = false;

  /** Mentre quedi res pendent es reintenta sol, sense esperar que l'usuari
   *  torni a obrir res. */
  private static readonly RETRY_MS = 20_000;
  /** Tandes seguides com a màxim: cada tanda puja el que hi havia i pot
   *  deixar-ne de nou (una sèrie registrada mentrestant), i això convergeix
   *  de seguida. El límit evita donar voltes si el servidor no accepta res. */
  private static readonly MAX_PASSES = 4;

  constructor() {
    effect(() => {
      const uid = this.auth.uid();
      if (!uid) { this._status.set('synced'); this._stopRetry(); return; }
      this._refreshStatus();
      if (this._online() && this.pendingCount() > 0) this._triggerFlush();
    });

    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => this._triggerFlush());
    document.addEventListener('visibilitychange', () => {
      if (this.pendingCount() === 0 || !this._online()) return;
      // En amagar-se (canvi d'app al mòbil) s'envia ja, sense el debounce: si
      // el sistema mata la pestanya, el que s'ha entrenat ja és al servidor.
      if (document.hidden) this._flushNow(); else this._triggerFlush();
    });
    window.addEventListener('pagehide', () => { if (this.pendingCount() > 0) this._flushNow(); });
  }

  // ── API pública ────────────────────────────────────────────────────────────

  /**
   * Hi ha feina nova a pujar. El canvi ja és guardat: això només decideix
   * quan s'intenta enviar.
   *
   * Una alta surt de seguida — és el moment en què l'entrenament encara no
   * existeix enlloc més. Les edicions s'agrupen, que en arriben moltes
   * seguides mentre s'omplen sèries.
   */
  notifyPending(isNew = false): void {
    this._refreshStatus();
    this._armRetry();
    if (!this._online()) return;
    if (isNew) { this._flushNow(); return; }
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => { this._debounceTimer = null; this.flush(); }, 1500);
  }

  pendingIds(): string[] { return this.store.pendingIds(); }

  /** Buida la cua: primer els esborrats, després les altes i edicions. */
  async flush(): Promise<void> {
    if (this._isFlushRunning || !this._online()) return;
    const uid = this.auth.uid();
    if (!uid) return;
    if (this.pendingCount() === 0) return;

    this._isFlushRunning = true;
    this._status.set('syncing');
    let anyError = false;

    try {
      for (let pass = 0; pass < SyncService.MAX_PASSES; pass++) {
        const tombs   = this.store.tombstones().filter(t => this._ready(t.id));
        const records = this.store.pendingRecords().filter(r => this._ready(r.workout.id));
        if (!tombs.length && !records.length) break;

        this.syncLog.log('flush-start', { note: `${records.length} per pujar, ${tombs.length} per esborrar` });

        for (const t of tombs) {
          try {
            const { error } = await this.supabase
              .from('workouts').delete().eq('id', t.id).eq('user_id', uid);
            if (error) throw error;
            this.store.ackDelete(t.id);
            this._backoff.delete(t.id);
          } catch (e) {
            anyError = true;
            this._failed(t.id, e);
          }
        }

        for (const rec of records) {
          const rev = rec.rev;
          try {
            const outcome = await this._push(uid, rec.workout, rec.syncedRev === 0);
            if (outcome === 'conflict') {
              // El servidor té una versió que aquest dispositiu no havia vist.
              // Es fusiona i queda pendent: la propera passada hi torna amb el
              // que inclou les dues bandes.
              continue;
            }
            if (outcome === 'missing') {
              // La fila ja no hi és: s'ha esborrat des d'un altre dispositiu.
              // Es dóna per tancada aquí i qui l'ensenyi que la tregui.
              this.store.ackUpsert(rec.workout.id, rev);
              this.syncLog.log('push-missing', { id: rec.workout.id, rev });
              this.vanished.set({ id: rec.workout.id, date: rec.workout.date, at: Date.now() });
            } else {
              this.store.ackUpsert(rec.workout.id, rev);
            }
            this._backoff.delete(rec.workout.id);
          } catch (e) {
            anyError = true;
            this._failed(rec.workout.id, e, rev, countSets(rec.workout));
          }
        }

        if (anyError) break;
      }
    } finally {
      this._isFlushRunning = false;
      this._refreshStatus(anyError);
      if (this.pendingCount() > 0) this._armRetry(); else { this._stopRetry(); this.store.prune(); }
    }
  }

  // ── Privat ─────────────────────────────────────────────────────────────────

  /**
   * Envia una sessió, sense trepitjar mai una versió més nova.
   *
   * Una sessió que el servidor no ha vist mai va per `upsert`, que un reintent
   * d'una alta que sí que havia arribat no ha de petar per clau duplicada.
   *
   * Les edicions van amb guarda: només substitueixen la fila si la que hi ha
   * és més antiga que la nostra. Si no en canvia cap, o bé la fila ja no hi és
   * (`missing`) o bé un altre dispositiu l'ha tocada després (`conflict`), i
   * llavors es fusionen les dues en comptes de descartar-ne una. Abans
   * l'edició s'escrivia a sobre sense mirar res, i el que havies registrat des
   * de l'altre dispositiu desapareixia.
   */
  private async _push(uid: string, w: Workout, isNew: boolean): Promise<'ok' | 'missing' | 'conflict'> {
    const row = toRow(w, uid);

    if (isNew) {
      const { error } = await this.supabase
        .from('workouts')
        .upsert(row as never, { onConflict: 'id' });
      if (error) throw error;
      return 'ok';
    }

    const { data, error } = await this.supabase
      .from('workouts')
      .update(row)
      .eq('id', w.id)
      .eq('user_id', uid)
      .lt('updated_at', row['updated_at'] as string)
      .select('id');
    if (error) throw error;
    if ((data ?? []).length > 0) return 'ok';

    // Cap fila canviada: cal saber si és que ja no hi és o que és més nova.
    const { data: current, error: readError } = await this.supabase
      .from('workouts')
      .select(WORKOUT_COLUMNS)
      .eq('id', w.id)
      .eq('user_id', uid)
      .maybeSingle();
    if (readError) throw readError;
    if (!current) return 'missing';

    this.store.resolveConflict(w.id, toWorkout(current as Record<string, unknown>));
    return 'conflict';
  }

  /** Ha fallat: es guarda quan es pot tornar a provar i es deixa constar. El
   *  canvi continua guardat al dispositiu i a la cua. */
  private _failed(id: string, e: unknown, rev?: number, sets?: number): void {
    const count = (this._backoff.get(id)?.retryCount ?? 0) + 1;
    const delay = [5_000, 10_000, 30_000, 60_000][Math.min(count - 1, 3)];
    this._backoff.set(id, { retryCount: count, nextRetryAt: Date.now() + delay });
    this.syncLog.log('push-fail', { id, rev, sets, note: (e as Error)?.message ?? 'error desconegut' });
  }

  private _ready(id: string): boolean {
    const b = this._backoff.get(id);
    return !b || Date.now() >= b.nextRetryAt;
  }

  private _refreshStatus(anyError = false): void {
    const pending = this.pendingCount();
    if (pending === 0) { this._status.set('synced'); return; }
    this._status.set(anyError ? 'error' : 'pending');
  }

  /** El commutador de Paràmetres avançats compta com estar sense cobertura,
   *  perquè provar el mode sense connexió provi el mateix camí de debò. */
  private _online(): boolean {
    if (this.offline.isOffline()) return false;
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }

  private _triggerFlush(): void {
    setTimeout(() => this.flush(), 1000);
  }

  /** Envia ara mateix, saltant-se el debounce pendent. */
  private _flushNow(): void {
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    this.flush();
  }

  private _armRetry(): void {
    if (this._retryTimer || typeof window === 'undefined') return;
    this._retryTimer = setInterval(() => {
      if (this.pendingCount() === 0) { this._stopRetry(); return; }
      if (this._online()) this.flush();
    }, SyncService.RETRY_MS);
  }

  private _stopRetry(): void {
    if (!this._retryTimer) return;
    clearInterval(this._retryTimer);
    this._retryTimer = null;
  }
}
