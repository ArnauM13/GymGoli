import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { ExerciseService } from './exercise.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TodayService } from './today.service';
import { OfflineService } from './offline.service';
import { SyncService } from './sync.service';
import { WorkoutStoreService, toWorkout } from './workout-store.service';
import { FeelingLevel, PlannedSource, Workout, WorkoutEntry, WorkoutSet, setMaxWeight } from '../models/workout.model';

/** The filters the Historial list can have active at once. */
export interface HistoryFilters {
  category?: string;
  date?:     string;
  search?:   string;
}

/**
 * Client-side twin of `loadWorkoutPage()`'s server filters, so a workout that
 * only exists locally can be matched against the same criteria and merged
 * into the paginated list.
 */
export function matchesHistoryFilters(w: Workout, f: HistoryFilters): boolean {
  if ((w.status ?? 'done') === 'planned') return false;
  if (f.date && w.date !== f.date) return false;
  if (f.category) {
    const cats = w.categories?.length ? w.categories : (w.category ? [w.category] : []);
    if (!cats.includes(f.category)) return false;
  }
  if (f.search) {
    const names = w.entries.map(e => e.exerciseName).join(' ').toLowerCase();
    if (!names.includes(f.search.toLowerCase())) return false;
  }
  return true;
}

/** Read-only snapshot of an exercise's most recent completed session. */
export interface LastSessionEntry {
  date:        string;
  maxWeight:   number;
  feeling?:    FeelingLevel;
  notes?:      string;
  sets:        WorkoutSet[];
  workingSets: number;
  warmupSets:  number;
  totalReps:   number;
}

@Injectable({ providedIn: 'root' })
export class WorkoutService {
  private supabase        = inject(SupabaseService).client;
  private today           = inject(TodayService);
  private auth            = inject(AuthService);
  private exerciseService = inject(ExerciseService);
  private syncService     = inject(SyncService);
  private offline         = inject(OfflineService);
  /** Tot el que aquest dispositiu sap dels entrenaments. És el primer lloc on
   *  va a parar el que fa l'usuari, i el que llegeix aquest servei. */
  private store           = inject(WorkoutStoreService);

  /** Avui, mirat cada cop: guardar-lo al constructor deixava l'app clavada al
   *  dia d'ahir quan passava la mitjanit amb la pestanya oberta. */
  private get _todayStr(): string { return this.today.today(); }

  /** Mesos demanats sencers al servidor. Un mes pot tenir sessions al
   *  magatzem sense estar carregat del tot (una càrrega per exercici, un canvi
   *  rebut per realtime): comptar-lo com a carregat deixava el calendari a
   *  mitges. */
  private readonly _fullMonths = new Set<string>();
  /** Peticions de mes en marxa, per no demanar el mateix mes dos cops alhora
   *  quan dues pantalles (o dos efectes) el demanen a la vegada. */
  private readonly _monthLoads = new Map<string, Promise<void>>();
  /** Mesos que ja s'han mirat al dispositiu, tinguessin res o no. */
  private readonly _monthsSeen = new Set<string>();
  private _allLoaded = false;
  private _realtimeChannel: RealtimeChannel | null = null;
  private _lastRefreshAt = 0;
  /** Fins on s'han demanat canvis (`updated_at` del servidor). */
  private _lastPulledAt: string | null = null;
  private _lastFullPullAt = 0;

  /** Marge mínim entre refrescos automàtics: tornar a l'app dispara alhora
   *  `focus` i `visibilitychange`, i no cal demanar-ho tot dos cops. */
  private static readonly REFRESH_THROTTLE_MS = 10_000;
  /** Cada quant es fa la comprovació sencera, l'única que veu els esborrats
   *  fets des d'un altre dispositiu. */
  private static readonly FULL_PULL_EVERY_MS = 5 * 60_000;

  // Per-exercise load tracking (for progress/charts lazy loading)
  private readonly _exLoadedIds      = new Set<string>();
  private readonly _exLoadPromises   = new Map<string, Promise<void>>();

  readonly isLoading = signal(false);

  // ── Public signals ───────────────────────────────────────────────────────

  /** Tot el que hi ha al dispositiu, ja ordenat del més recent al més antic. */
  private readonly _historical = this.store.workouts;

  readonly todayWorkout = computed((): Workout | null =>
    this._historical().find(w => w.date === this._todayStr) ?? null
  );

  readonly workouts = this.store.workouts;

  readonly pastWorkouts = computed(() =>
    this.workouts().filter(w => w.date !== this._todayStr)
  );

  readonly plannedWorkouts = computed(() =>
    this._historical().filter(w => w.status === 'planned')
  );

  readonly doneWorkouts = computed((): Workout[] =>
    this.workouts().filter(w => (w.status ?? 'done') !== 'planned')
  );

  readonly plannedByDate = computed(() => {
    const map = new Map<string, Workout[]>();
    for (const w of this.plannedWorkouts()) {
      const bucket = map.get(w.date) ?? [];
      bucket.push(w);
      map.set(w.date, bucket);
    }
    return map;
  });

  /** All workouts indexed by date, rebuilt once per change — so per-date
   *  lookups in day-loops (home feed, calendar) are O(1) instead of scanning
   *  the whole (now full-history) list on every call. */
  readonly byDate = computed(() => {
    const map = new Map<string, Workout[]>();
    for (const w of this.workouts()) {
      const bucket = map.get(w.date) ?? [];
      bucket.push(w);
      map.set(w.date, bucket);
    }
    return map;
  });

  readonly exercisesWithData = computed((): Set<string> =>
    new Set(
      this.doneWorkouts()
        .flatMap(w => w.entries.filter(e => e.sets.length > 0).map(e => e.exerciseId))
    )
  );

  // ── Constructor ──────────────────────────────────────────────────────────
  constructor() {
    effect(() => {
      const uid = this.auth.uid();

      this._realtimeChannel?.unsubscribe();
      this._realtimeChannel = null;
      this._fullMonths.clear();
      this._monthLoads.clear();
      this._monthsSeen.clear();
      this._lastPulledAt  = null;
      this._lastFullPullAt = 0;
      this._allLoaded = false;
      this._exLoadedIds.clear();
      this._exLoadPromises.clear();

      if (uid) {
        // Primer el dispositiu: l'app queda utilitzable (entrenar, veure els
        // últims dies) abans i independentment que hi hagi connexió.
        this.store.hydrate(uid);
        this._subscribeToChanges(uid);
        this._preloadCurrentMonth();
      } else {
        this.store.reset();
      }
    });

    // Passar de mes amb l'app oberta deixava el mes nou sense demanar mai:
    // el dia 1 sortia buit fins que no recarregaves la pàgina.
    effect(() => {
      const today = this.today.today();
      if (!this.auth.uid()) return;
      untracked(() => {
        const [y, m] = today.split('-').map(Number);
        this.ensureMonthLoaded(y, m - 1);
      });
    });

    // Una edició que no troba la fila vol dir que s'ha esborrat des d'un altre
    // dispositiu: es torna a demanar el mes perquè el fantasma marxi d'aquí.
    effect(() => {
      const gone = this.syncService.vanished();
      if (!gone) return;
      untracked(() => {
        const [y, m] = gone.date.split('-').map(Number);
        this.ensureMonthLoaded(y, m - 1, true);
      });
    });

    // Tornar a l'app torna a demanar el que tenim carregat: una pestanya
    // oberta des del matí es quedava amb les dades del matí i ensenyava una
    // cosa diferent del que acabaves de registrar al mòbil.
    if (typeof window !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.refreshLoaded();
      });
      window.addEventListener('focus', () => this.refreshLoaded());
      window.addEventListener('online', () => this.refreshLoaded(true));
    }
  }

  /**
   * Torna a demanar al servidor tot el que ja tenim carregat.
   *
   * El realtime cobreix l'app oberta i desperta, però no el que ha passat
   * mentre la pestanya dormia o estava sense cobertura. Sense això, la cau
   * d'un mes no es refrescava mai en tota la sessió.
   */
  async refreshLoaded(immediate = false): Promise<void> {
    if (!this.auth.uid()) return;
    if (this.offline.isOffline()) return;

    const now = Date.now();
    if (!immediate && now - this._lastRefreshAt < WorkoutService.REFRESH_THROTTLE_MS) return;
    this._lastRefreshAt = now;

    // Primer el que ha canviat des de l'últim cop: és una consulta petita i
    // porta de seguida el que s'ha registrat des d'un altre dispositiu.
    await this._pullChanges();

    // I de tant en tant, la comprovació sencera. És l'única que veu el que ha
    // desaparegut: una sessió esborrada des d'un altre dispositiu ja no surt a
    // cap consulta de canvis, perquè no hi ha cap fila que ho digui.
    const dueFullPull = now - this._lastFullPullAt > WorkoutService.FULL_PULL_EVERY_MS;
    if (!dueFullPull && this._lastPulledAt) return;
    this._lastFullPullAt = now;

    if (this._allLoaded) { await this._fetchAll(true); return; }

    await Promise.all([...this._monthsSeen].map(key => {
      const [y, m] = key.split('-').map(Number);
      return this.ensureMonthLoaded(y, m - 1, true);
    }));
  }

  /**
   * Demana només el que ha canviat des de l'últim cop.
   *
   * És el patró que fan servir els sistemes de sincronització provats: un
   * marcador d'on es va quedar (aquí, `updated_at`) i, a partir d'aquí, només
   * les files noves. Tornar a demanar mesos sencers cada cop que tornaves a
   * l'app era car i lent, i sobretot arribava tard.
   */
  private async _pullChanges(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    const since = this._lastPulledAt;
    const askedAt = new Date().toISOString();
    try {
      let q = this.supabase
        .from('workouts')
        .select('*')
        .eq('user_id', uid)
        .order('updated_at', { ascending: true });
      if (since) q = q.gt('updated_at', since);
      else       q = q.gte('date', this._retentionStart());

      const { data, error } = await q;
      if (error) return;

      for (const r of data ?? []) this.store.applyServerRow(toWorkout(r as Record<string, unknown>));
      this._lastPulledAt = askedAt;
    } catch {
      // Sense xarxa: el marcador no es mou i la propera vegada es reprèn aquí.
    }
  }

  /** Des de quan es demanen canvis el primer cop: la finestra que l'app fa
   *  servir sense connexió, no tot l'historial. */
  private _retentionStart(): string {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth() - 2, 1);
    return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-01`;
  }

  // ── Realtime subscription (every date, not just today) ──────────────────
  private _subscribeToChanges(uid: string): void {
    if (!this.offline.isOffline()) this._fetchToday(uid);

    this._realtimeChannel = this.supabase
      .channel(`workouts-${uid}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workouts', filter: `user_id=eq.${uid}` },
        payload => this._applyRemoteChange(payload as RealtimePostgresChangesPayload<Record<string, unknown>>)
      )
      .subscribe();
  }

  /**
   * Aplica un canvi rebut per realtime a la data que toqui.
   *
   * Abans el callback només tornava a demanar «avui», així que editar
   * l'entrenament de dilluns des del mòbil no arribava mai a l'ordinador per
   * molt que l'esdeveniment hi fos.
   */
  private _applyRemoteChange(payload: RealtimePostgresChangesPayload<Record<string, unknown>>): void {
    const row   = payload.new as Record<string, unknown> | undefined;
    const oldId = (payload.old as Record<string, unknown> | undefined)?.['id'] as string | undefined;

    if (payload.eventType === 'DELETE') {
      // Sense id (la taula no replica la fila sencera) no sabem quina ha
      // marxat: es torna a demanar el que tenim carregat.
      if (!oldId) { this.refreshLoaded(true); return; }
      this.store.removeFromServer(oldId);
      return;
    }

    if (!row?.['id'] || !row?.['date']) { this.refreshLoaded(true); return; }
    // El magatzem ja protegeix el que espera pujar: aquest esdeveniment també
    // arriba pels canvis fets aquí mateix, i acceptar-lo tornaria a posar la
    // versió d'abans d'acabar d'editar.
    this.store.applyServerRow(toWorkout(row));
  }

  private async _fetchToday(uid: string): Promise<void> {
    const today = this._todayStr;
    const since = this.store.mark();

    const { data, error } = await this.supabase
      .from('workouts')
      .select('*')
      .eq('user_id', uid)
      .eq('date', today);

    if (error) return; // xarxa o servidor KO: millor el que tenim que no res

    const fresh = (data ?? []).map(r => toWorkout(r as Record<string, unknown>));
    this.store.mergeServerScope(fresh, w => w.date === today, since);
  }

  // ── Load API ─────────────────────────────────────────────────────────────
  private _preloadCurrentMonth(): void {
    const now = new Date();
    this.ensureMonthLoaded(now.getFullYear(), now.getMonth());
  }

  /**
   * Carrega un mes, i el torna a demanar si `force`.
   *
   * Sense `force` un mes només es demanava un cop per sessió: una pestanya
   * oberta tot el dia no veia mai el que havies registrat des del mòbil.
   */
  async ensureMonthLoaded(year: number, month: number, force = false): Promise<void> {
    const key = this._monthKey(year, month);
    if (!force && (this._fullMonths.has(key) || this._allLoaded)) return;

    const inFlight = this._monthLoads.get(key);
    if (inFlight) return inFlight;

    const load = this._loadMonth(year, month, key).finally(() => this._monthLoads.delete(key));
    this._monthLoads.set(key, load);
    return load;
  }

  private async _loadMonth(year: number, month: number, key: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;

    // ── Pas 1: el dispositiu, a l'instant ───────────────────────────────────
    // El que hi ha guardat aquí ja es pot ensenyar sense esperar ningú, i és
    // l'única cosa que hi haurà si ara mateix no hi ha connexió.
    const first = !this._monthsSeen.has(key);
    this._monthsSeen.add(key);
    if (first && !this.store.workouts().some(w => w.date.startsWith(key))) {
      this.isLoading.set(true);
    }

    if (this.offline.isOffline()) { this.isLoading.set(false); return; }

    // ── Pas 2: el servidor, de fons ─────────────────────────────────────────
    // `since` marca quan surt la consulta: el que es confirmi mentre viatja no
    // pot sortir a la resposta, i el magatzem el conserva per això.
    const since = this.store.mark();
    try {
      const start   = `${key}-01`;
      const lastDay = new Date(year, month + 1, 0).getDate();
      const end     = `${key}-${String(lastDay).padStart(2, '0')}`;

      const { data, error } = await this.supabase
        .from('workouts')
        .select('*')
        .eq('user_id', uid)
        .gte('date', start)
        .lte('date', end)
        .order('date', { ascending: false });

      if (error) return; // xarxa o servidor KO: es manté el que ja teníem

      const fetched = (data ?? []).map(r => toWorkout(r as Record<string, unknown>));
      this.store.mergeServerScope(fetched, w => w.date.startsWith(key), since);
      this.store.markReconciled(key);
      this._fullMonths.add(key);
    } catch {
      // Sense xarxa: es manté el que hi ha al dispositiu, que és el que val.
    } finally {
      this.isLoading.set(false);
    }
  }

  // Loads only the workouts that contain a specific exercise, merging them
  // into the month cache so getWorkoutsForExercise() and exercisesWithData()
  // stay consistent.
  async loadWorkoutsForExercise(exerciseId: string): Promise<void> {
    if (this._allLoaded || this._exLoadedIds.has(exerciseId)) return;
    const inFlight = this._exLoadPromises.get(exerciseId);
    if (inFlight) return inFlight;
    const p = this._fetchForExercise(exerciseId).finally(() =>
      this._exLoadPromises.delete(exerciseId)
    );
    this._exLoadPromises.set(exerciseId, p);
    return p;
  }

  private async _fetchForExercise(exerciseId: string): Promise<void> {
    // Sense connexió no es marca com a carregat: quan torni la xarxa, el
    // progrés d'aquest exercici s'ha de poder demanar de veritat.
    if (this.offline.isOffline()) return;
    try {
      const { data, error } = await this.supabase
        .from('workouts')
        .select('*')
        .eq('user_id', this._uid())
        .neq('status', 'planned')
        .filter('entries::text', 'ilike', `%"exerciseId":"${exerciseId}"%`)
        .order('date', { ascending: true });

      if (error) {
        this._exLoadedIds.add(exerciseId); // prevent retry storm on repeated Supabase errors
        return;
      }

      const fetched = (data ?? [])
        .map(r => toWorkout(r as Record<string, unknown>))
        .filter(w => w.entries.some(e => e.exerciseId === exerciseId));

      // Files soltes, no un mes sencer: només s'incorporen, no es dedueix
      // res del que hi falta. La versió del servidor mana llevat que la
      // d'aquí encara esperi pujar.
      for (const w of fetched) this.store.applyServerRow(w);
      this._exLoadedIds.add(exerciseId);
    } catch {
      this._exLoadedIds.add(exerciseId); // prevent retry storm; will refresh on next app session
    }
  }

  async loadAllWorkouts(): Promise<void> {
    if (this._allLoaded) return;
    await this._fetchAll(false);
  }

  /** `silent` per als refrescos de fons: no encén l'indicador de càrrega, que
   *  tornar a l'app no ha de fer parpellejar tota la pantalla. */
  private async _fetchAll(silent: boolean): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || this.offline.isOffline()) return;
    if (!silent) this.isLoading.set(true);

    const since = this.store.mark();
    try {
      const { data, error } = await this.supabase
        .from('workouts')
        .select('*')
        .eq('user_id', uid)
        .order('date', { ascending: false });

      if (error) return; // es manté el que ja teníem

      const fetched = (data ?? []).map(r => toWorkout(r as Record<string, unknown>));
      this.store.mergeServerScope(fetched, () => true, since);
      for (const w of fetched) this._monthsSeen.add(w.date.substring(0, 7));
      for (const key of this._monthsSeen) { this._fullMonths.add(key); this.store.markReconciled(key); }
      this._allLoaded = true;
    } finally {
      if (!silent) this.isLoading.set(false);
    }
  }

  // ── Paginated query ──────────────────────────────────────────────────────
  async loadWorkoutPage(opts: {
    page: number;
    pageSize: number;
    category?: string;
    date?: string;
    search?: string;
    ascending?: boolean;
  }): Promise<{ workouts: Workout[]; total: number }> {
    const { page, pageSize, category, date, search, ascending = false } = opts;
    const from = page * pageSize;
    const to   = from + pageSize - 1;

    // `date` alone is not a unique key — a user can log several workouts on the
    // same day. Paginating (a separate `range()` query per page) over a
    // non-unique sort lets PostgreSQL resolve ties differently between pages,
    // which silently drops some rows at the page boundaries (and duplicates
    // others). Add stable secondary keys so the total order is deterministic
    // across every page and no workout goes missing from the history list.
    let q = this.supabase
      .from('workouts')
      .select('*', { count: 'exact' })
      .eq('user_id', this._uid())
      .neq('status', 'planned')
      .order('date', { ascending })
      .order('created_at', { ascending })
      .order('id', { ascending });

    if (category) q = q.contains('categories', [category]);
    if (date)     q = q.eq('date', date);
    if (search) {
      const escaped = search.replace(/%/g, '\\%').replace(/_/g, '\\_');
      q = q.ilike('exercise_names', `%${escaped}%`);
    }

    const { data, count, error } = await q.range(from, to);
    if (error) throw error;

    return {
      workouts: (data ?? []).map(r => toWorkout(r as Record<string, unknown>)),
      total: count ?? 0,
    };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  todayDateString(): string { return this._todayStr; }

  getWorkoutForDate(date: string): Workout | null {
    return this.byDate().get(date)?.[0] ?? null;
  }

  getWorkoutsForDate(date: string): Workout[] {
    return this.byDate().get(date) ?? [];
  }

  getPlannedForDate(date: string): Workout[] {
    return this.plannedByDate().get(date) ?? [];
  }

  getDoneWorkoutsForDate(date: string): Workout[] {
    return this.getWorkoutsForDate(date).filter(w => (w.status ?? 'done') !== 'planned');
  }

  getWorkoutsForExercise(exerciseId: string): Workout[] {
    return this.doneWorkouts()
      .filter(w => w.entries.some(e => e.exerciseId === exerciseId))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  getAllTimeMaxWeight(exerciseId: string, excludeWorkoutId?: string): number {
    let max = 0;
    for (const w of this._historical()) {
      if (w.id === excludeWorkoutId) continue;
      const entry = w.entries.find(e => e.exerciseId === exerciseId);
      if (entry) for (const s of entry.sets) { if (s.warmup) continue; const m = setMaxWeight(s); if (m > max) max = m; }
    }
    return max;
  }

  getLastSessionInfo(exerciseId: string, excludeWorkoutId?: string): { date: string; maxWeight: number; feeling?: FeelingLevel } | null {
    const full = this.getLastSessionEntry(exerciseId, excludeWorkoutId);
    if (!full) return null;
    return { date: full.date, maxWeight: full.maxWeight, feeling: full.feeling };
  }

  /** Everything the "last session" consultation panel needs about the most
   *  recent completed session for an exercise: its sets, note and feeling
   *  plus the derived summary (max weight, set counts, total reps). */
  getLastSessionEntry(exerciseId: string, excludeWorkoutId?: string): LastSessionEntry | null {
    const past = this.doneWorkouts()
      .filter(w =>
        w.id !== excludeWorkoutId &&
        w.entries.some(e => e.exerciseId === exerciseId && e.sets.length > 0)
      )
      .sort((a, b) => b.date.localeCompare(a.date));
    if (!past.length) return null;
    const entry       = past[0].entries.find(e => e.exerciseId === exerciseId)!;
    const workingSets = entry.sets.filter(s => !s.warmup);
    const maxWeight   = Math.max(...(workingSets.length ? workingSets : entry.sets).map(s => setMaxWeight(s)));
    return {
      date:        past[0].date,
      maxWeight,
      feeling:     entry.feeling,
      notes:       entry.notes,
      sets:        entry.sets,
      workingSets: workingSets.length,
      warmupSets:  entry.sets.length - workingSets.length,
      totalReps:   workingSets.reduce((sum, s) => sum + s.reps, 0),
    };
  }

  // ── Query helpers ────────────────────────────────────────────────────────
  getLastWorkoutByCategory(category: string): Workout | null {
    return this.doneWorkouts().find(w =>
      w.categories?.includes(category) || w.category === category
    ) ?? null;
  }

  // ── Create ───────────────────────────────────────────────────────────────
  async createWorkoutForDate(date: string, category?: string): Promise<string> {
    const id         = crypto.randomUUID();
    const newWorkout: Workout = {
      id, date,
      entries:    [],
      categories: category ? [category] : [],
      category,
      createdAt:  new Date(),
      status:     'done',
    };
    this.store.put(newWorkout);
    this.syncService.notifyPending(true);
    return id;
  }

  async createTodayWorkout(category?: string): Promise<string> {
    return this.createWorkoutForDate(this._todayStr, category);
  }

  async createWorkoutFromProposal(date: string, proposalId: string, entries: WorkoutEntry[]): Promise<string> {
    const id         = crypto.randomUUID();
    const newWorkout: Workout = {
      id, date,
      entries:         entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: [] })),
      categories:      [],
      sourceProposalId: proposalId,
      createdAt:       new Date(),
      status:          'done',
    };
    this.store.put(newWorkout);
    this.syncService.notifyPending(true);
    return id;
  }

  /** `plannedSource` defaults to 'manual' — the user planning a day directly
   *  on Train. WeeklyPlanService passes 'routine' or 'manual' explicitly
   *  depending on whether it's materializing the persistent routine or a
   *  one-off single-week plan, so the two can be edited independently. */
  async createPlannedWorkout(
    date: string, category?: string, entries: WorkoutEntry[] = [],
    plannedSource: PlannedSource = 'manual',
  ): Promise<string> {
    const id         = crypto.randomUUID();
    const newWorkout: Workout = {
      id, date,
      entries:       entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: [] })),
      categories:    category ? [category] : [],
      category,
      createdAt:     new Date(),
      status:        'planned',
      plannedSource,
    };
    this.store.put(newWorkout);
    this.syncService.notifyPending(true);
    return id;
  }

  async createPlannedFromProposal(date: string, proposalId: string, entries: WorkoutEntry[]): Promise<string> {
    const id         = crypto.randomUUID();
    const newWorkout: Workout = {
      id, date,
      entries:         entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, sets: [] })),
      categories:      [],
      sourceProposalId: proposalId,
      createdAt:       new Date(),
      status:          'planned',
      plannedSource:   'trainer',
    };
    this.store.put(newWorkout);
    this.syncService.notifyPending(true);
    return id;
  }

  async startPlannedWorkout(workoutId: string): Promise<void> {
    await this._updateWorkout(workoutId, { status: 'done' });
  }

  async createWorkoutFromTemplate(date: string, category: string, templateEntries: WorkoutEntry[]): Promise<string> {
    const entries: WorkoutEntry[] = templateEntries.map(e => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      sets: [],
    }));
    const id = await this.createWorkoutForDate(date, category);
    if (entries.length > 0) {
      await this._updateWorkout(id, { entries });
    }
    return id;
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  async addExerciseToWorkout(workoutId: string, entry: WorkoutEntry): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries     = [...workout.entries, entry];
    const exerciseCat = this.exerciseService.getById(entry.exerciseId)?.category;
    const categories  = this._mergeCategories(workout.categories ?? (workout.category ? [workout.category] : []), exerciseCat);
    await this._updateWorkout(workoutId, { entries, categories });
  }

  async addSetsToEntry(workoutId: string, exerciseId: string, sets: WorkoutSet[]): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId === exerciseId ? { ...e, sets: [...e.sets, ...sets] } : e
    );
    await this._updateWorkout(workoutId, { entries });
  }

  /** Swaps every set of an entry for a new list in a single write — used by
   *  "sobreescriure amb l'última sessió", where removing set by set would
   *  fire one persist round-trip per set. */
  async replaceEntrySets(workoutId: string, exerciseId: string, sets: WorkoutSet[]): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId === exerciseId ? { ...e, sets: [...sets] } : e
    );
    await this._updateWorkout(workoutId, { entries });
  }

  async updateSetInEntry(workoutId: string, exerciseId: string, setIndex: number, updated: WorkoutSet): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      const sets = [...e.sets]; sets[setIndex] = updated; return { ...e, sets };
    });
    await this._updateWorkout(workoutId, { entries });
  }

  async removeSetFromEntry(workoutId: string, exerciseId: string, setIndex: number): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e =>
      e.exerciseId !== exerciseId ? e : { ...e, sets: e.sets.filter((_, i) => i !== setIndex) }
    );
    await this._updateWorkout(workoutId, { entries });
  }

  async removeEntryFromWorkout(workoutId: string, exerciseId: string): Promise<void> {
    const workout    = this._find(workoutId);
    if (!workout) return;
    const entries    = workout.entries.filter(e => e.exerciseId !== exerciseId);
    const categories = this._computeCategories(entries, workout.category);
    await this._updateWorkout(workoutId, { entries, categories });
  }

  async updateEntryFeeling(workoutId: string, exerciseId: string, feeling: FeelingLevel | undefined): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;

    const allHadFeelingBefore = workout.entries.length > 0 && workout.entries.every(e => e.feeling != null);

    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      if (feeling === undefined) {
        const { feeling: _f, ...rest } = e as WorkoutEntry & { feeling?: FeelingLevel };
        return rest as WorkoutEntry;
      }
      return { ...e, feeling };
    });

    const allHaveFeelingNow = entries.length > 0 && entries.every(e => e.feeling != null);
    const updates: Partial<Workout> = { entries };

    // Auto-set workout feeling when the last entry gets its feeling and no feeling is set yet
    if (!allHadFeelingBefore && allHaveFeelingNow && workout.feeling == null) {
      const total = entries.reduce((sum, e) => sum + (e.feeling as number), 0);
      updates.feeling = Math.min(5, Math.max(1, Math.round(total / entries.length))) as FeelingLevel;
    }

    await this._updateWorkout(workoutId, updates);
  }

  async updateEntryNotes(workoutId: string, exerciseId: string, notes: string | undefined): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const entries = workout.entries.map(e => {
      if (e.exerciseId !== exerciseId) return e;
      const { notes: _n, ...rest } = e as WorkoutEntry & { notes?: string };
      return notes ? { ...rest, notes } : rest as WorkoutEntry;
    });
    await this._updateWorkout(workoutId, { entries });
  }

  async updateWorkoutFeeling(workoutId: string, feeling: FeelingLevel | undefined): Promise<void> {
    await this._updateWorkout(workoutId, { feeling });
  }

  async reorderEntries(workoutId: string, entries: WorkoutEntry[]): Promise<void> {
    await this._updateWorkout(workoutId, { entries: this._normalizeSupersetOrder(entries) });
  }

  /** Groups 2+ entries into a superset — performed back-to-back with no
   *  rest, rendered as one connected block. Always kept contiguous, anchored
   *  at the earliest selected entry's position. */
  async groupIntoSuperset(workoutId: string, exerciseIds: string[]): Promise<void> {
    if (exerciseIds.length < 2) return;
    const workout = this._find(workoutId);
    if (!workout) return;
    const groupId = crypto.randomUUID();
    const idSet   = new Set(exerciseIds);
    const tagged  = workout.entries.map(e => idSet.has(e.exerciseId) ? { ...e, supersetGroupId: groupId } : e);
    await this._updateWorkout(workoutId, { entries: this._normalizeSupersetOrder(tagged) });
  }

  /** Removes a single exercise from its superset; dissolves the group
   *  entirely if fewer than 2 members would remain. */
  async removeFromSuperset(workoutId: string, exerciseId: string): Promise<void> {
    const workout = this._find(workoutId);
    if (!workout) return;
    const groupId = workout.entries.find(e => e.exerciseId === exerciseId)?.supersetGroupId;
    if (!groupId) return;
    const remaining = workout.entries.filter(e => e.supersetGroupId === groupId && e.exerciseId !== exerciseId);
    const dissolve  = remaining.length < 2;
    const entries = workout.entries.map(e => {
      const clears = e.exerciseId === exerciseId || (dissolve && e.supersetGroupId === groupId);
      if (!clears) return e;
      const { supersetGroupId: _g, ...rest } = e;
      return rest as WorkoutEntry;
    });
    await this._updateWorkout(workoutId, { entries });
  }

  /** Re-groups entries so every superset's members sit next to each other,
   *  anchored at the position of the first member encountered in the given
   *  order — used after reordering and after creating a new group. */
  private _normalizeSupersetOrder(entries: WorkoutEntry[]): WorkoutEntry[] {
    const placed = new Set<string>();
    const result: WorkoutEntry[] = [];
    for (const e of entries) {
      const gid = e.supersetGroupId;
      if (!gid) { result.push(e); continue; }
      if (placed.has(gid)) continue;
      placed.add(gid);
      result.push(...entries.filter(x => x.supersetGroupId === gid));
    }
    return result;
  }

  /** Esborra la sessió del dispositiu ara mateix. Si el servidor l'havia
   *  arribat a veure, l'esborrat hi va per la mateixa cua que la resta: sense
   *  cobertura no falla, s'envia quan torni. */
  async deleteWorkout(id: string): Promise<void> {
    this.store.remove(id);
    this.syncService.notifyPending();
  }

  /**
   * Removes a single exercise's logged data across all its sessions, optionally
   * limited to an inclusive date range (`from`/`to`, 'YYYY-MM-DD'). A session
   * left with no remaining exercises is deleted entirely; otherwise just that
   * exercise's entry is stripped and the session's categories recomputed.
   *
   * Returns how many sessions were touched and how many of those were removed
   * because they became empty — so callers can give precise feedback.
   */
  async deleteExerciseData(
    exerciseId: string,
    range?: { from?: string; to?: string },
  ): Promise<{ sessions: number; removedWorkouts: number }> {
    // Make sure the whole history for this exercise is in the cache first —
    // otherwise a range like "everything" would only touch the loaded months.
    await this.loadWorkoutsForExercise(exerciseId);

    const affected = this.doneWorkouts().filter(w =>
      w.entries.some(e => e.exerciseId === exerciseId) &&
      (!range?.from || w.date >= range.from) &&
      (!range?.to   || w.date <= range.to)
    );

    let removedWorkouts = 0;
    for (const w of affected) {
      const entries = w.entries.filter(e => e.exerciseId !== exerciseId);
      if (entries.length === 0) {
        await this.deleteWorkout(w.id);
        removedWorkouts++;
      } else {
        const categories = this._computeCategories(entries, w.category);
        await this._updateWorkout(w.id, { entries, categories });
      }
    }
    return { sessions: affected.length, removedWorkouts };
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private _uid(): string {
    const uid = this.auth.uid();
    if (!uid) throw new Error('Not authenticated');
    return uid;
  }

  /**
   * Escriu un canvi. Primer al dispositiu — això no falla ni depèn de res — i
   * després s'avisa que hi ha feina per pujar.
   */
  private _updateWorkout(id: string, changes: Partial<Workout>): void {
    // Qualsevol canvi de contingut refresca la marca d'activitat, per poder
    // distingir una sessió que s'està entrenant ara d'una d'abandonada.
    const next = this.store.patch(id, { ...changes, updatedAt: new Date() });
    if (next) this.syncService.notifyPending();
  }

  private _mergeCategories(existing: string[], newCat?: string): string[] {
    if (!newCat) return existing;
    return existing.includes(newCat) ? existing : [...existing, newCat];
  }

  private _computeCategories(entries: WorkoutEntry[], primaryCategory?: string): string[] {
    const fromEntries: string[] = entries
      .map(e => this.exerciseService.getById(e.exerciseId)?.category as string | undefined)
      .filter((c): c is string => c !== undefined && c !== '');
    const all: string[] = primaryCategory ? [primaryCategory, ...fromEntries] : fromEntries;
    return [...new Set(all)];
  }

  private _monthKey(y: number, m: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}`;
  }

  private _find(id: string): Workout | undefined {
    return this.store.get(id);
  }

}
