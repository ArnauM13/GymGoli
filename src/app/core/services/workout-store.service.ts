import { Injectable, computed, inject, signal } from '@angular/core';

import { SyncLogService } from './sync-log.service';
import { FeelingLevel, PlannedSource, Workout, WorkoutEntry, WorkoutStatus } from '../models/workout.model';

/**
 * Un entrenament tal com viu al dispositiu.
 *
 * `rev` puja a cada canvi fet aquí; `syncedRev` és l'últim que el servidor ha
 * confirmat. Que `rev > syncedRev` vol dir «encara no ha pujat», i és l'única
 * definició de pendent que hi ha a tota l'app: no hi ha cap llista paral·lela
 * que se'n pugui desaparellar.
 */
export interface WorkoutRecord {
  workout:   Workout;
  rev:       number;
  syncedRev: number;
  /** Ordre en què el servidor va confirmar `syncedRev`. Serveix per no
   *  esborrar una sessió confirmada mentre una consulta viatjava; és un
   *  comptador i no un rellotge perquè dues coses en el mateix mil·lisegon
   *  s'han de poder distingir igualment. */
  syncedTick: number;
}

/** Un esborrat que encara no ha arribat al servidor. Sense això, tornar a
 *  demanar el mes ressuscitaria una sessió esborrada sense cobertura. */
export interface Tombstone { id: string; date: string; at: number; }

/** Mesos que es guarden al dispositiu. La resta viu només a la base de dades i
 *  es torna a demanar quan es necessita: el local no ha de ser una còpia
 *  sencera de l'historial, només la finestra que fa servir l'app sense
 *  connexió (Inici i Entrenar treballen amb els últims 30 dies). */
export const RETAINED_MONTHS = 3;

// ── Serialització ───────────────────────────────────────────────────────────

/** Una entrada d'un JSON antic pot venir sense `sets`. Normalitzar-ho aquí
 *  garanteix que cap consumidor pugui petar a `entry.sets.length`. */
export function normalizeEntries(raw: unknown): WorkoutEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e): WorkoutEntry => ({
    ...(e as WorkoutEntry),
    sets: Array.isArray((e as WorkoutEntry)?.sets) ? (e as WorkoutEntry).sets : [],
  }));
}

/** Fila de Supabase (snake_case) → entrenament. */
export function toWorkout(row: Record<string, unknown>): Workout {
  return {
    id:               row['id'] as string,
    date:             row['date'] as string,
    category:         (row['category'] as string | undefined) ?? undefined,
    categories:       (row['categories'] as string[] | undefined) ?? [],
    entries:          normalizeEntries(row['entries']),
    notes:            (row['notes'] as string | undefined) ?? undefined,
    feeling:          (row['feeling'] as FeelingLevel | undefined) ?? undefined,
    sourceProposalId: (row['source_proposal_id'] as string | null | undefined) ?? undefined,
    createdAt:        new Date(row['created_at'] as string),
    updatedAt:        row['updated_at'] ? new Date(row['updated_at'] as string) : undefined,
    status:           (row['status'] as WorkoutStatus | undefined) ?? 'done',
    plannedSource:    (row['planned_source'] as PlannedSource | undefined) ?? undefined,
  };
}

/** Entrenament → fila de Supabase. */
export function toRow(w: Workout, uid: string): Record<string, unknown> {
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
  return row;
}

function recordFromJson(raw: Record<string, unknown>): WorkoutRecord | null {
  const w = raw['workout'] ? raw['workout'] as Record<string, unknown> : raw;
  if (!w['id'] || !w['date']) return null;
  return {
    workout: {
      id:               w['id'] as string,
      date:             w['date'] as string,
      category:         (w['category'] as string | undefined) ?? undefined,
      categories:       (w['categories'] as string[] | undefined) ?? [],
      entries:          normalizeEntries(w['entries']),
      notes:            (w['notes'] as string | undefined) ?? undefined,
      feeling:          (w['feeling'] as FeelingLevel | undefined) ?? undefined,
      sourceProposalId: (w['sourceProposalId'] as string | null | undefined) ?? undefined,
      createdAt:        new Date(w['createdAt'] as string),
      updatedAt:        w['updatedAt'] ? new Date(w['updatedAt'] as string) : undefined,
      status:           (w['status'] as WorkoutStatus | undefined) ?? 'done',
      plannedSource:    (w['plannedSource'] as PlannedSource | undefined) ?? undefined,
    },
    // Les cauen antigues eren llistes d'entrenaments pelats, sense revisions.
    // Venien del servidor, o sigui que ja estaven sincronitzades.
    rev:       (raw['rev']       as number | undefined) ?? 0,
    syncedRev: (raw['syncedRev'] as number | undefined) ?? 0,
    syncedTick: 0,
  };
}

export function countSets(w: Workout): number {
  return w.entries.reduce((sum, e) => sum + e.sets.length, 0);
}

/**
 * El que aquest dispositiu sap dels entrenaments.
 *
 * És l'única cosa que escriu i llegeix el `localStorage` d'entrenaments, i el
 * primer lloc on va a parar tot el que fa l'usuari: registrar una sèrie no
 * depèn de la xarxa ni de cap resposta, es guarda i ja està. La pujada al
 * servidor la fa `SyncService` després, amb el que hi hagi aquí.
 *
 * La regla de qui mana és una sola: mentre una sessió tingui canvis sense
 * pujar (`rev > syncedRev`) mana la local; quan ja està pujada, mana el
 * servidor. Així el que entrenes sense cobertura no es perd, i el que has
 * registrat des d'un altre mòbil arriba igualment.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutStoreService {
  private readonly syncLog = inject(SyncLogService);

  private uid: string | null = null;
  private readonly _byId = new Map<string, WorkoutRecord>();
  private readonly _tombstones = new Map<string, Tombstone>();
  /** Avança a cada confirmació del servidor. `mark()` en pren una foto abans
   *  de llançar una consulta, i la fusió sap què ha passat mentrestant. */
  private _tick = 0;

  /** Puja a cada canvi perquè els `computed()` de sobre es refacin. */
  private readonly _version = signal(0);

  /** Tots els entrenaments del dispositiu, del més recent al més antic. */
  readonly workouts = computed((): Workout[] => {
    this._version();
    return [...this._byId.values()]
      .map(r => r.workout)
      .sort((a, b) => b.date.localeCompare(a.date));
  });

  readonly pendingIds = computed((): string[] => {
    this._version();
    return [...this._byId.values()]
      .filter(r => r.rev > r.syncedRev)
      .map(r => r.workout.id)
      .concat([...this._tombstones.keys()]);
  });

  readonly pendingCount = computed(() => this.pendingIds().length);

  // ── Cicle de vida ─────────────────────────────────────────────────────────

  /** Carrega del dispositiu tot el que hi tingui aquest usuari. Es fa un cop
   *  en entrar, i deixa l'app utilitzable abans de parlar amb ningú. */
  hydrate(uid: string): void {
    this.uid = uid;
    this._byId.clear();
    this._tombstones.clear();

    for (const key of this._monthKeys(uid)) {
      for (const raw of this._readJson<Record<string, unknown>[]>(key) ?? []) {
        const rec = recordFromJson(raw);
        if (rec) this._byId.set(rec.workout.id, rec);
      }
    }
    for (const t of this._readJson<Tombstone[]>(this._tombKey(uid)) ?? []) {
      this._tombstones.set(t.id, t);
    }
    this._bump();
  }

  reset(): void {
    this.uid = null;
    this._byId.clear();
    this._tombstones.clear();
    this._bump();
  }

  // ── Lectura ───────────────────────────────────────────────────────────────

  get(id: string): Workout | undefined { return this._byId.get(id)?.workout; }
  record(id: string): WorkoutRecord | undefined { return this._byId.get(id); }
  has(id: string): boolean { return this._byId.has(id); }
  isPending(id: string): boolean {
    const r = this._byId.get(id);
    return !!r && r.rev > r.syncedRev;
  }
  isDeleted(id: string): boolean { return this._tombstones.has(id); }

  /** Les sessions que esperen pujar, de la més antiga a la més nova: el
   *  servidor les ha de rebre en el mateix ordre en què han passat. */
  pendingRecords(): WorkoutRecord[] {
    return [...this._byId.values()]
      .filter(r => r.rev > r.syncedRev)
      .sort((a, b) => a.workout.date.localeCompare(b.workout.date));
  }

  tombstones(): Tombstone[] { return [...this._tombstones.values()]; }

  /** Foto del comptador de confirmacions, per passar-la després a
   *  `mergeServerScope()`. Prendre-la just abans de llançar la consulta és el
   *  que distingeix «això encara no existia» de «això ja no hi és». */
  mark(): number { return this._tick; }

  // ── Escriptura local (sempre primer, sempre sense xarxa) ──────────────────

  /**
   * Guarda una sessió al dispositiu i la marca per pujar.
   *
   * Torna la revisió resultant. Passa-la a `ackUpsert()` quan el servidor la
   * confirmi: si mentrestant ha canviat, l'ack no la donarà per pujada i es
   * tornarà a enviar. Aquesta comparació és el que impedeix que una resposta
   * lenta s'empassi les sèries registrades mentre viatjava.
   */
  put(workout: Workout): number {
    const prev = this._byId.get(workout.id);
    const rev  = (prev?.rev ?? 0) + 1;
    this._byId.set(workout.id, {
      workout,
      rev,
      syncedRev:  prev?.syncedRev ?? 0,
      syncedTick: prev?.syncedTick ?? 0,
    });
    this._tombstones.delete(workout.id); // tornar a crear-la desfà l'esborrat
    this._persist(workout.date);
    this._persistTombstones();
    this._bump();
    this.syncLog.log('local-write', { id: workout.id, rev, sets: countSets(workout) });
    return rev;
  }

  /** Aplica un canvi parcial sobre el que ja hi ha. */
  patch(id: string, changes: Partial<Workout>): Workout | undefined {
    const prev = this._byId.get(id);
    if (!prev) return undefined;
    const next = { ...prev.workout, ...changes };
    this.put(next);
    return next;
  }

  /** Esborra la sessió del dispositiu. Si el servidor l'havia arribat a veure
   *  queda una làpida perquè l'esborrat hi arribi encara que ara no hi hagi
   *  cobertura. */
  remove(id: string): void {
    const rec = this._byId.get(id);
    if (!rec) return;
    this._byId.delete(id);

    const everSynced = rec.syncedRev > 0 || (rec.rev === 0 && rec.syncedRev === 0);
    if (everSynced) {
      this._tombstones.set(id, { id, date: rec.workout.date, at: Date.now() });
      this._persistTombstones();
    }
    this._persist(rec.workout.date);
    this._bump();
    this.syncLog.log('local-delete', { id, note: everSynced ? 'cal avisar el servidor' : 'no hi havia arribat mai' });
  }

  // ── Confirmacions del servidor ────────────────────────────────────────────

  /**
   * El servidor ha acceptat la revisió `rev` d'aquesta sessió.
   *
   * Només es dóna per sincronitzada si des de llavors no s'ha tornat a tocar.
   * Si s'ha tocat, es queda pendent i tornarà a sortir a la propera tanda: no
   * hi ha cap moment en què una edició deixi de constar com a pendent sense
   * haver arribat al servidor.
   */
  ackUpsert(id: string, rev: number): void {
    const rec = this._byId.get(id);
    if (!rec) return;
    if (rec.rev > rev) {
      this.syncLog.log('push-stale', { id, rev, note: `ara va per la revisió ${rec.rev}` });
      return;
    }
    rec.syncedRev  = rev;
    rec.syncedTick = ++this._tick;
    this._persist(rec.workout.date);
    this._bump();
    this.syncLog.log('push-ok', { id, rev, sets: countSets(rec.workout) });
  }

  ackDelete(id: string): void {
    if (!this._tombstones.delete(id)) return;
    this._persistTombstones();
    this._bump();
    this.syncLog.log('delete-ok', { id });
  }

  // ── Fusió amb el servidor ─────────────────────────────────────────────────

  /**
   * Una fila que arriba del servidor (realtime, o una consulta d'un exercici).
   *
   * Mai trepitja una sessió amb canvis sense pujar: aquesta és exactament la
   * versió que estem a punt d'enviar-li, i acceptar-la voldria dir perdre-la.
   */
  applyServerRow(w: Workout): void {
    if (this._tombstones.has(w.id)) return; // esborrada aquí, encara no allà
    const rec = this._byId.get(w.id);
    if (rec && rec.rev > rec.syncedRev) {
      this.syncLog.log('pull-keep', { id: w.id, rev: rec.rev, sets: countSets(rec.workout) });
      return;
    }
    // `syncedTick` només el marca una pujada nostra: és el que protegeix una
    // sessió confirmada mentre una consulta viatjava. Una fila que ve del
    // servidor ja surt a les seves respostes i no necessita cap protecció.
    const rev = rec?.rev ?? 0;
    this._byId.set(w.id, { workout: w, rev, syncedRev: rev, syncedTick: rec?.syncedTick ?? 0 });
    this._persist(w.date);
    this._bump();
    if (!rec) this.syncLog.log('pull-adopt', { id: w.id, sets: countSets(w), note: 'nova en aquest dispositiu' });
  }

  /**
   * Ha desaparegut del servidor (esborrada des d'un altre dispositiu).
   *
   * No deixa làpida: l'esborrat ja s'ha fet allà. El que espera pujar no es
   * toca — és una edició posterior que encara no ha tingut ocasió d'arribar-hi.
   */
  removeFromServer(id: string): void {
    const rec = this._byId.get(id);
    if (!rec || rec.rev > rec.syncedRev) return;
    this._byId.delete(id);
    this._persist(rec.workout.date);
    this._bump();
    this.syncLog.log('pull-remove', { id, note: 'esborrada des d\'un altre dispositiu' });
  }

  /**
   * Tota la resposta d'una consulta que cobreix un abast sencer (un mes, o tot
   * l'historial).
   *
   * Com que la resposta és completa, el que hi falta i aquí consta com a
   * sincronitzat s'ha esborrat des d'un altre dispositiu i ha de marxar. El
   * que espera pujar es queda, i el que s'ha confirmat mentre la consulta
   * viatjava també — `since` és el `mark()` pres just abans de llançar-la.
   */
  mergeServerScope(rows: Workout[], scope: (w: Workout) => boolean, since: number): void {
    const fetched = new Map(rows.filter(w => !this._tombstones.has(w.id)).map(w => [w.id, w]));

    for (const rec of [...this._byId.values()]) {
      const w = rec.workout;
      if (!scope(w)) continue;
      if (fetched.has(w.id)) continue;
      if (rec.rev > rec.syncedRev) continue;  // espera torn per pujar
      if (rec.syncedTick > since) continue;   // confirmada mentre preguntàvem
      this._byId.delete(w.id);
      this._persist(w.date);
      this.syncLog.log('pull-remove', { id: w.id, note: 'ja no hi és al servidor' });
    }

    for (const w of fetched.values()) this.applyServerRow(w);
    this._bump();
  }

  // ── Espai ─────────────────────────────────────────────────────────────────

  /**
   * Allibera del dispositiu els mesos vells que ja són a la base de dades.
   *
   * El local no és una còpia de tot l'historial: n'hi ha prou amb la finestra
   * que l'app fa servir sense connexió. El que encara no ha pujat no es toca
   * mai, tingui l'edat que tingui.
   */
  prune(): void {
    const uid = this.uid;
    if (!uid) return;
    const keep = this._retainedMonths();

    for (const key of this._monthKeys(uid)) {
      const month = key.slice(`gymgoli_month_${uid}_`.length);
      if (keep.has(month)) continue;
      const stillNeeded = [...this._byId.values()].some(
        r => r.workout.date.startsWith(month) && r.rev > r.syncedRev
      );
      if (stillNeeded) continue;
      try { localStorage.removeItem(key); } catch { /* res a fer */ }
      this.syncLog.log('prune', { note: month });
    }
  }

  // ── Privat ────────────────────────────────────────────────────────────────

  private _bump(): void { this._version.update(n => n + 1); }

  private _retainedMonths(): Set<string> {
    const out = new Date();
    const keep = new Set<string>();
    for (let i = 0; i < RETAINED_MONTHS; i++) {
      const d = new Date(out.getFullYear(), out.getMonth() - i, 1);
      keep.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return keep;
  }

  private _monthKey(uid: string, month: string): string { return `gymgoli_month_${uid}_${month}`; }
  private _tombKey(uid: string): string { return `gymgoli_deleted_${uid}`; }

  private _monthKeys(uid: string): string[] {
    const prefix = `gymgoli_month_${uid}_`;
    const out: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) out.push(key);
    }
    return out;
  }

  /**
   * Escriu al dispositiu el mes que conté aquesta data.
   *
   * Els mesos fora de la finestra només es guarden si hi queda res per pujar:
   * la resta ja és a la base de dades i no cal duplicar-la aquí.
   */
  private _persist(date: string): void {
    const uid = this.uid;
    if (!uid) return;
    const month   = date.substring(0, 7);
    const records = [...this._byId.values()].filter(r => r.workout.date.startsWith(month));
    const key     = this._monthKey(uid, month);

    const inWindow = this._retainedMonths().has(month);
    const pending  = records.some(r => r.rev > r.syncedRev);
    if (!inWindow && !pending) {
      try { localStorage.removeItem(key); } catch { /* res a fer */ }
      return;
    }
    if (!records.length) {
      try { localStorage.removeItem(key); } catch { /* res a fer */ }
      return;
    }
    try { localStorage.setItem(key, JSON.stringify(records)); }
    catch { /* sense espai: el que hi ha a memòria continua sent bo */ }
  }

  private _persistTombstones(): void {
    const uid = this.uid;
    if (!uid) return;
    try {
      const all = [...this._tombstones.values()];
      if (all.length) localStorage.setItem(this._tombKey(uid), JSON.stringify(all));
      else localStorage.removeItem(this._tombKey(uid));
    } catch { /* res a fer */ }
  }

  private _readJson<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch { return null; }
  }
}
