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

/**
 * Les columnes que l'app llegeix de debò d'un entrenament.
 *
 * Amb `select('*')` cada fila arribava també amb `exercise_names` — la columna
 * generada que repeteix, en text pla, tots els noms d'exercicis que ja venen
 * dins d'`entries`. Existeix perquè el servidor hi pugui cercar (migració
 * 020), no perquè ningú se l'endugui: `toWorkout()` ni la mira. En una
 * consulta d'un mes són uns quants centenars de bytes; en la de tot
 * l'historial, que és la que fan el progrés i el calendari, són desenes de
 * kilobytes de xarxa i de memòria per no res. `user_id` tampoc: ja sabem de
 * qui són, que és el filtre de la consulta.
 */
export const WORKOUT_COLUMNS =
  'id,date,category,categories,entries,notes,feeling,source_proposal_id,created_at,started_at,updated_at,status,planned_source,session_group_id';

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
    startedAt:        row['started_at'] ? new Date(row['started_at'] as string) : undefined,
    updatedAt:        row['updated_at'] ? new Date(row['updated_at'] as string) : undefined,
    status:           (row['status'] as WorkoutStatus | undefined) ?? 'done',
    plannedSource:    (row['planned_source'] as PlannedSource | undefined) ?? undefined,
    sessionGroupId:   (row['session_group_id'] as string | null | undefined) ?? undefined,
  };
}

/** Les columnes d'una sessió sense les sèries: prou per pintar-ne la targeta i
 *  per a tot el que mira enrere (quant fa que no toques empenta, quantes
 *  setmanes seguides), sense baixar el gruix de l'historial. */
export const WORKOUT_SUMMARY_COLUMNS =
  'id,date,category,categories,notes,feeling,status,planned_source,source_proposal_id,created_at,started_at,updated_at,exercise_names,session_group_id';

/** Fila de Supabase demanada en mode targeta → entrenament sense sèries. */
export function toWorkoutSummary(row: Record<string, unknown>): Workout {
  return {
    ...toWorkout({ ...row, entries: [] }),
    entriesLoaded: false,
    exerciseNames: (row['exercise_names'] as string | null | undefined) ?? undefined,
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
    session_group_id:   w.sessionGroupId ?? null,
    // Quan es va començar de debò, si no és quan es va crear la fila: un pla
    // apuntat dilluns i fet dimecres. És el que ordena el dia.
    started_at:         w.startedAt ? w.startedAt.toISOString() : null,
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
      startedAt:        w['startedAt'] ? new Date(w['startedAt'] as string) : undefined,
      updatedAt:        w['updatedAt'] ? new Date(w['updatedAt'] as string) : undefined,
      status:           (w['status'] as WorkoutStatus | undefined) ?? 'done',
      plannedSource:    (w['plannedSource'] as PlannedSource | undefined) ?? undefined,
      sessionGroupId:   (w['sessionGroupId'] as string | undefined) ?? undefined,
    },
    // Les cauen antigues eren llistes d'entrenaments pelats, sense revisions.
    // Venien del servidor, o sigui que ja estaven sincronitzades.
    rev:       (raw['rev']       as number | undefined) ?? 0,
    syncedRev: (raw['syncedRev'] as number | undefined) ?? 0,
    syncedTick: 0,
  };
}

/**
 * Fusiona dues versions del mateix entrenament sense perdre cap sèrie.
 *
 * Passa quan dos dispositius han tocat la mateixa sessió sense veure's: el
 * mòbil sense cobertura al gimnàs i la tauleta a casa. Agafar-ne una i llençar
 * l'altra vol dir perdre entrenament fet, així que:
 *
 * - **Exercicis**: la unió dels dos costats. Si tots dos tenen el mateix
 *   exercici, es queda el que porta més sèries — ningú entrena per treure-se'n.
 * - **La resta** (notes, sensació, categories, estat): mana la versió
 *   modificada més tard.
 *
 * És la mateixa idea que fan servir els sistemes de sincronització provats:
 * el servidor mana per defecte, però no en allò que aquest dispositiu ha
 * canviat des de l'última vegada que es van veure.
 */
export function mergeWorkouts(mine: Workout, theirs: Workout): Workout {
  const mineNewer = (mine.updatedAt?.getTime() ?? 0) >= (theirs.updatedAt?.getTime() ?? 0);
  const base      = mineNewer ? mine : theirs;

  const byExercise = new Map<string, WorkoutEntry>();
  for (const e of [...theirs.entries, ...mine.entries]) {
    const prev = byExercise.get(e.exerciseId);
    if (!prev || e.sets.length > prev.sets.length) byExercise.set(e.exerciseId, e);
  }

  // L'ordre el marca la versió més nova, i el que només és a l'altra va al final.
  const ordered: WorkoutEntry[] = [];
  const seen = new Set<string>();
  for (const e of base.entries) {
    const best = byExercise.get(e.exerciseId);
    if (best && !seen.has(e.exerciseId)) { ordered.push(best); seen.add(e.exerciseId); }
  }
  for (const [id, e] of byExercise) if (!seen.has(id)) ordered.push(e);

  // La marca ha de quedar per davant de les dues, no només de l'hora d'aquest
  // dispositiu: si té el rellotge endarrerit respecte de l'altre, la pujada
  // tornaria a topar amb la mateixa versió i el conflicte no s'acabaria mai.
  const ahead = Math.max(
    Date.now(),
    (mine.updatedAt?.getTime()   ?? 0) + 1,
    (theirs.updatedAt?.getTime() ?? 0) + 1,
  );
  return { ...base, entries: ordered, updatedAt: new Date(ahead) };
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

  /** El dispositiu s'ha quedat sense espai i hi ha coses que només són a
   *  memòria. Qui ho ensenyi ha d'avisar: tancar l'app ara sí que perdria
   *  alguna cosa. */
  readonly storageFull = signal(false);

  /** Mesos que s'han comprovat contra una resposta sencera del servidor en
   *  aquesta sessió. Només d'aquests se sap del cert que el que hi ha aquí ja
   *  és a dalt, i per tant només aquests es poden alliberar. */
  private readonly _reconciled = new Set<string>();

  /** Profunditat de `batch()`. Mentre sigui > 0, les escriptures al dispositiu
   *  i els avisos als senyals s'ajornen fins al final. */
  private _batchDepth = 0;
  private readonly _pendingMonths = new Set<string>();
  private _pendingBump = false;

  constructor() {
    // Sense això el navegador pot alliberar l'espai d'aquest lloc quan el
    // dispositiu va just, i s'endú l'entrenament que encara no ha pujat. Els
    // navegadors només ho concedeixen a llocs que l'usuari fa servir de debò,
    // que és exactament el cas.
    void navigator.storage?.persist?.().catch(() => { /* no passa res */ });
  }

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
    this._reconciled.clear();
    this._bump();
  }

  /** El servidor ha contestat sencer per aquest mes i el que hi ha aquí ja
   *  quadra amb el que hi ha allà. */
  markReconciled(monthKey: string): void { this._reconciled.add(monthKey); }

  /**
   * Agrupa moltes escriptures en una de sola.
   *
   * Cada entrenament que s'incorpora tocava el disc i avisava els senyals pel
   * seu compte, i una resposta de dos-cents entrenaments volien dir dos-cents
   * `JSON.stringify` del mes sencer, dos-cents `localStorage.setItem` —que són
   * síncrons i bloquegen la pàgina— i dos-centes recomposicions de tota la
   * interfície. D'aquí venien les pampallugues mentre carregava: la pantalla es
   * repintava una vegada per fila que arribava.
   *
   * Aquí dins l'escriptura és una per mes tocat i l'avís, un de sol al final.
   * Fora d'aquí res no canvia: registrar una sèrie continua guardant-se a
   * l'instant, que és la regla que aguanta tot el sistema.
   */
  batch<T>(fn: () => T): T {
    this._batchDepth++;
    try {
      return fn();
    } finally {
      this._batchDepth--;
      if (this._batchDepth === 0) this._flushBatch();
    }
  }

  private _flushBatch(): void {
    const months = [...this._pendingMonths];
    this._pendingMonths.clear();
    for (const month of months) this._persistMonth(month);
    if (this._pendingBump) { this._pendingBump = false; this._bump(); }
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

  /**
   * El servidor tenia una versió que aquest dispositiu no havia vist. Es
   * fusionen les dues i el resultat queda pendent, per tornar-hi amb el que
   * inclou el que hi havia als dos costats.
   */
  resolveConflict(id: string, theirs: Workout): void {
    const rec = this._byId.get(id);
    if (!rec) { this.applyServerRow(theirs); return; }
    const merged = mergeWorkouts(rec.workout, theirs);
    this.syncLog.log('conflict', {
      id, sets: countSets(merged),
      note: `local ${countSets(rec.workout)} + servidor ${countSets(theirs)}`,
    });
    this.put(merged);
  }

  /**
   * Torna a marcar per pujar una sessió que ja constava com a sincronitzada.
   *
   * És per a la recuperació manual: quan el que hi ha al dispositiu és bo i el
   * que hi ha a la base de dades no (per exemple, entrenaments que hi van
   * arribar buits), això els torna a posar a la cua. La marca de temps es
   * refresca perquè aquesta versió guanyi al servidor.
   */
  forceResync(id: string): boolean {
    const rec = this._byId.get(id);
    if (!rec) return false;
    this.put({ ...rec.workout, updatedAt: new Date() });
    return true;
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
    // Una sessió demanada en mode targeta no té sèries, i tot el que entra
    // aquí és candidat a pujar-se: deixar-la passar voldria dir pujar-la
    // buida i esborrar del servidor l'entrenament de debò. Les targetes
    // d'aquestes sessions es pinten fora del magatzem.
    if (w.entriesLoaded === false) return;
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
    this.batch(() => {
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
    });
  }

  /**
   * Treu del dispositiu el que un tram sencer del servidor ja no porta.
   *
   * És el bessó de `mergeServerScope()` per a la consulta per rangs
   * (`activity_feed`): aquella resposta no porta cap sèrie, o sigui que no s'hi
   * pot incorporar res —una sessió sense sèries que entrés aquí es pujaria
   * buida i esborraria l'entrenament de debò—, però **sí** que diu qui hi ha
   * de ser. El que aquí consta com a pujat i allà no hi és, s'ha esborrat des
   * d'un altre dispositiu.
   *
   * Les tres guardes són les de sempre: el que espera pujar es queda, el que
   * s'ha confirmat mentre la consulta viatjava també (`since`), i el que ja
   * està marcat per esborrar no s'hi torna a mirar.
   */
  reconcileScope(ids: Set<string>, from: string, to: string, since: number): void {
    this.batch(() => {
      for (const rec of [...this._byId.values()]) {
        const w = rec.workout;
        if (w.date < from || w.date > to) continue;
        if (ids.has(w.id)) continue;
        if (rec.rev > rec.syncedRev) continue;  // espera torn per pujar
        if (rec.syncedTick > since) continue;   // confirmada mentre preguntàvem
        this._byId.delete(w.id);
        this._persist(w.date);
        this.syncLog.log('pull-remove', { id: w.id, note: 'ja no hi és al servidor (tram)' });
      }
      this._bump();
    });
  }

  /** Un grapat de files soltes del servidor, en una sola escriptura i un sol
   *  avís. És el camí del pull incremental, que pot portar-ne moltes de cop. */
  applyServerRows(rows: Workout[]): void {
    if (!rows.length) return;
    this.batch(() => { for (const w of rows) this.applyServerRow(w); });
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
      // Mai es tira res que no s'hagi comprovat contra el servidor en aquesta
      // sessió. Suposar que un mes vell «ja hi és» i alliberar-lo és la manera
      // més fàcil d'esborrar l'única còpia bona que quedava d'un entrenament
      // que mai va pujar del tot.
      if (!this._reconciled.has(month)) continue;
      const stillNeeded = [...this._byId.values()].some(
        r => r.workout.date.startsWith(month) && r.rev > r.syncedRev
      );
      if (stillNeeded) continue;
      try { localStorage.removeItem(key); } catch { /* res a fer */ }
      this.syncLog.log('prune', { note: month });
    }
  }

  // ── Privat ────────────────────────────────────────────────────────────────

  private _bump(): void {
    if (this._batchDepth > 0) { this._pendingBump = true; return; }
    this._version.update(n => n + 1);
  }

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
    const month = date.substring(0, 7);
    if (this._batchDepth > 0) { this._pendingMonths.add(month); return; }
    this._persistMonth(month);
  }

  private _persistMonth(month: string): void {
    const uid = this.uid;
    if (!uid) return;
    const records = [...this._byId.values()].filter(r => r.workout.date.startsWith(month));
    const key     = this._monthKey(uid, month);

    const inWindow = this._retainedMonths().has(month) || !this._reconciled.has(month);
    const pending  = records.some(r => r.rev > r.syncedRev);
    if (!inWindow && !pending) {
      try { localStorage.removeItem(key); } catch { /* res a fer */ }
      return;
    }
    if (!records.length) {
      try { localStorage.removeItem(key); } catch { /* res a fer */ }
      return;
    }
    this._write(key, JSON.stringify(records), month);
  }

  /**
   * Escriu al dispositiu, i si no hi cap fa lloc i ho torna a provar.
   *
   * En un sistema on el dispositiu és la còpia bona, empassar-se un error
   * d'espai en silenci és perdre dades sense assabentar-se'n: el que hi ha a
   * memòria sembla guardat i no ho està. Primer s'allibera el que ja és a la
   * base de dades (mesos vells sincronitzats, i el diari), i si tot i així no
   * hi cap queda anotat i marcat.
   */
  private _write(key: string, value: string, month: string): void {
    try { localStorage.setItem(key, value); this.storageFull.set(false); return; }
    catch { /* provem de fer lloc */ }

    this.prune();
    try { localStorage.setItem(key, value); this.storageFull.set(false); return; }
    catch { /* encara no hi cap */ }

    this.syncLog.clear(); // el diari és el primer que es pot sacrificar
    try { localStorage.setItem(key, value); this.storageFull.set(false); }
    catch {
      this.storageFull.set(true);
      this.syncLog.log('storage-full', { note: month });
    }
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
