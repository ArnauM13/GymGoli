import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { ActivityFeedService } from './activity-feed.service';
import { ROUTINE_HORIZON_DAYS, RoutineProjectionService, isRoutineProjection } from './routine-projection.service';
import { ExerciseService } from './exercise.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TodayService } from './today.service';
import { OfflineService } from './offline.service';
import { SyncService } from './sync.service';
import { SUPABASE_PAGE_SIZE, fetchAllRows } from './supabase-page.util';
import { WORKOUT_COLUMNS, WorkoutStoreService, toWorkout } from './workout-store.service';
import { FeelingLevel, PlannedSource, Workout, WorkoutEntry, WorkoutSet, setMaxWeight, workoutExerciseNames } from '../models/workout.model';
import { toDateStr } from '../../shared/utils/date.utils';
import { addDays, workoutCategories } from '../../shared/utils/calendar-utils';

/** Des d'on es busca quan es busca «a tot l'historial». Cap app de gimnàs no
 *  té dades d'abans, i posar-hi una data en comptes de deixar el rang obert fa
 *  que la consulta continuï passant per l'índex de `(user_id, date)`. */
const EPOCH_START = '2000-01-01';

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
    if (!workoutExerciseNames(w).toLowerCase().includes(f.search.toLowerCase())) return false;
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
  /** Qui demana l'activitat per trams al servidor. Vegeu `ActivityFeedService`:
   *  una sola crida per tram, entrenaments i esports junts, sense cap sèrie. */
  private activityFeed    = inject(ActivityFeedService);
  /** La rutina recurrent, projectada al calendari en comptes d'escrita com a
   *  91 files. Vegeu `RoutineProjectionService`. */
  private routine         = inject(RoutineProjectionService);
  /** Tot el que aquest dispositiu sap dels entrenaments. És el primer lloc on
   *  va a parar el que fa l'usuari, i el que llegeix aquest servei. */
  private store           = inject(WorkoutStoreService);

  /** Avui, mirat cada cop: guardar-lo al constructor deixava l'app clavada al
   *  dia d'ahir quan passava la mitjanit amb la pestanya oberta. */
  private get _todayStr(): string { return this.today.today(); }

  private _realtimeChannel: RealtimeChannel | null = null;
  private _lastRefreshAt = 0;
  /** Fins on s'han demanat canvis. És l'`updated_at` **més alt que ha arribat
   *  en una resposta**, no l'hora d'aquest dispositiu: vegeu `_pullChanges()`. */
  private _lastPulledAt: string | null = null;
  /** Si la consulta de canvis ja s'ha fet un cop en aquesta sessió. Separat del
   *  cursor perquè un usuari sense cap entrenament no en té, i sense això
   *  quedava condemnat a la comprovació sencera a cada refresc. */
  private _pulledOnce = false;
  /** La consulta de canvis que hi ha en marxa. Sense això, qualsevol canvi
   *  als senyals mentre una viatjava en disparava una altra. */
  private _pullLoad: Promise<void> | null = null;

  /** Marge mínim entre refrescos automàtics: tornar a l'app dispara alhora
   *  `focus` i `visibilitychange`, i no cal demanar-ho tot dos cops. */
  private static readonly REFRESH_THROTTLE_MS = 10_000;

  /**
   * Quants mesos enrere es demanen en entrar.
   *
   * És el que cobreix les tres pantalles de la portada —el calendari,
   * l'historial i l'activitat recent— sense que cap d'elles hagi de demanar
   * res pel seu compte. Tres mesos perquè la finestra de trenta dies
   * d'Inici se n'endú dos gairebé sempre, i el tercer fa que passar de mes
   * (o mirar el mes passat al calendari) no dispari cap petició.
   *
   * Més enllà d'aquí es demana quan l'usuari hi va: el calendari cap enrere,
   * una cerca a l'historial. Vegeu `ensureRange()`.
   */
  private static readonly RECENT_MONTHS = 3;

  // Per-exercise load tracking (for progress/charts lazy loading)
  private readonly _exLoadedIds      = new Set<string>();
  private readonly _exLoadPromises   = new Map<string, Promise<void>>();

  /**
   * L'historial en mode targeta: el dia, el tipus, la sensació, els noms dels
   * exercicis i les xifres, sense cap sèrie.
   *
   * Viu fora del magatzem a posta. El magatzem és la còpia bona del dispositiu
   * i tot el que hi entra és candidat a pujar-se al servidor: una sessió sense
   * sèries que hi entrés podria acabar sobreescrivint-ne una de plena. Aquí no
   * pot fer cap mal —no es guarda al dispositiu, no es puja, no es pot
   * editar— i, quan es demana sencera, la versió del magatzem la tapa.
   */
  private readonly _summaries = computed((): Map<string, Workout> =>
    new Map(this.activityFeed.workoutSummaries().map(w => [w.id, w]))
  );
  /** Sessions que ara mateix s'estan baixant senceres, per id. */
  private readonly _entryLoads = new Map<string, Promise<void>>();

  /**
   * Hi ha alguna consulta d'entrenaments en marxa.
   *
   * Per a un esquelet de secció val més `hasRange()`: això s'encén per
   * qualsevol consulta, i una pantalla que ja té les seves dades no té cap
   * motiu per parpellejar perquè n'estigui arribant una altra.
   */
  readonly isLoading = computed(() => this.activityFeed.loading());

  /** Cert quan aquest tram ja ha arribat. És el que ha de mirar una secció per
   *  decidir si ensenya l'esquelet: cada secció mira el seu, i les que ja
   *  tenen les dades es pinten de seguida. */
  hasRange(from: string, to: string): boolean {
    return this.activityFeed.covers(from, to);
  }

  /** El mateix per a la finestra que es demana en entrar. */
  readonly hasRecentWindow = computed(() => {
    const { from, to } = this.recentWindow();
    return this.activityFeed.covers(from, to);
  });

  // ── Public signals ───────────────────────────────────────────────────────

  /**
   * Tot el que se sap dels entrenaments, del més recent al més antic: el que
   * hi ha al dispositiu i, per sota, els resums de l'historial que encara no
   * s'ha demanat sencer. El magatzem sempre mana — un resum només surt si
   * d'aquella sessió no en tenim res de millor.
   */
  readonly workouts = computed((): Workout[] => {
    const stored  = this.store.workouts();
    const summary = this._summaries();
    if (!summary.size) return stored;

    const known = new Set(stored.map(w => w.id));
    const extra = [...summary.values()]
      .filter(w => !known.has(w.id) && !this.store.isDeleted(w.id));
    if (!extra.length) return stored;

    return [...stored, ...extra].sort((a, b) => b.date.localeCompare(a.date));
  });

  /** El mateix que `workouts()`, amb el nom que fa servir el codi de sempre. */
  private readonly _historical = this.workouts;

  readonly todayWorkout = computed((): Workout | null =>
    this._historical().find(w => w.date === this._todayStr) ?? null
  );

  readonly pastWorkouts = computed(() =>
    this.workouts().filter(w => w.date !== this._todayStr)
  );

  /** Els planificats que són files de debò: els que l'usuari ha triat dia a
   *  dia. La rutina no n'és cap — vegeu `plannedByDate`. */
  private readonly _realPlanned = computed(() =>
    this._historical().filter(w => w.status === 'planned')
  );

  /** Tots els planificats, els reals i els que proposa la rutina. */
  readonly plannedWorkouts = computed((): Workout[] =>
    [...this.plannedByDate().values()].flat()
  );

  readonly doneWorkouts = computed((): Workout[] =>
    this.workouts().filter(w => (w.status ?? 'done') !== 'planned')
  );

  /**
   * Els planificats de cada dia: els que són files de debò i, a sobre, el que
   * proposa la rutina.
   *
   * La rutina no s'escriu: establir-ne una escrivia 91 entrenaments
   * planificats a la base de dades —tretze setmanes per set dies— i els
   * tornava a escriure a cada canvi, per dir una cosa que ja consta a
   * `user_settings.weeklyPlan`. Aquí es calcula, i el que es guarda de debò és
   * el que l'usuari acaba fent.
   *
   * Un dia que la rutina proposa i que ja té un entrenament d'aquell tipus
   * —fet o planificat a mà— no es proposa dues vegades.
   */
  readonly plannedByDate = computed(() => {
    const map = new Map<string, Workout[]>();
    for (const w of this._realPlanned()) {
      const bucket = map.get(w.date) ?? [];
      bucket.push(w);
      map.set(w.date, bucket);
    }

    if (!this.routine.hasRoutine()) return map;

    const byDate = this.byDate();
    const today  = this._todayStr;
    for (let i = 0; i <= ROUTINE_HORIZON_DAYS; i++) {
      const date = addDays(today, i);
      const proposed = this.routine.projectedFor(date).gym;
      if (!proposed.length) continue;

      const already = byDate.get(date) ?? [];
      const bucket  = map.get(date) ?? [];
      for (const p of proposed) {
        if (already.some(w => workoutCategories(w).includes(p.category))) continue;
        bucket.push({
          id:            p.id,
          date,
          entries:       p.entries,
          category:      p.category,
          categories:    [p.category],
          createdAt:     new Date(`${date}T00:00:00`),
          status:        'planned',
          plannedSource: 'routine',
        });
      }
      if (bucket.length) map.set(date, bucket);
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

  /**
   * Les sessions de cada exercici, de la més recent a la més antiga.
   *
   * Es refà un cop per canvi, com `byDate`, i és el que fa que consultar «què
   * vaig fer l'última vegada» o «tinc rècord» costi el mateix tinguis dues
   * setmanes d'historial o vuit anys.
   *
   * Abans cada consulta recorria l'historial sencer. Sona a poc, però on es
   * fan és mentre entrenes: el marcador de rècord i el plafó de l'última
   * sessió són `computed()` que passen per **cada exercici del dia**, i es
   * refan **a cada sèrie que registres**. Amb deu exercicis i uns quants
   * centenars de sessions carregades, són desenes de milers de comparacions
   * per cada toc a la pantalla — i el toc no és en un moment qualsevol, és amb
   * el mòbil a la mà entre sèrie i sèrie.
   *
   * Els entrenaments planificats també hi entren: `getAllTimeMaxWeight()` els
   * mirava, i encara que no portin sèries, deixar-los fora seria canviar què
   * fa la funció mentre se n'arregla el cost. Qui vol només els fets, ho
   * filtra en llegir el calaix.
   */
  private readonly _byExercise = computed((): Map<string, Workout[]> => {
    const map = new Map<string, Workout[]>();
    // `workouts()` ja ve de la més recent a la més antiga, i els calaixos
    // n'hereten l'ordre: no cal tornar a ordenar res per exercici.
    for (const w of this.workouts()) {
      // Una sessió amb el mateix exercici repetit hi ha de constar un sol cop:
      // qui llegeix el calaix compta sessions, no entrades.
      const seen = new Set<string>();
      for (const e of w.entries) {
        if (seen.has(e.exerciseId)) continue;
        seen.add(e.exerciseId);
        const bucket = map.get(e.exerciseId);
        if (bucket) bucket.push(w); else map.set(e.exerciseId, [w]);
      }
    }
    return map;
  });

  // ── Constructor ──────────────────────────────────────────────────────────
  constructor() {
    effect(() => {
      const uid = this.auth.uid();

      this._realtimeChannel?.unsubscribe();
      this._realtimeChannel = null;
      this._lastPulledAt  = null;
      this._pulledOnce    = false;
      this._exLoadedIds.clear();
      this._exLoadPromises.clear();
      // Cap consulta de l'usuari anterior no pot fer de resposta per a qui
      // demani les dades ara.
      this._pullLoad = null;
      this._entryLoads.clear();

      if (uid) {
        // Primer el dispositiu: l'app queda utilitzable (entrenar, veure els
        // últims dies) abans i independentment que hi hagi connexió.
        this.store.hydrate(uid);
        this._subscribeToChanges(uid);
        this._preloadRecentWindow();
      } else {
        this.store.reset();
      }
    });

    // Una resposta per trams cobreix el tram sencer, o sigui que diu **qui hi
    // ha de ser**. El que aquí consta com a pujat i allà no hi surt s'ha
    // esborrat des d'un altre dispositiu i ha de marxar: és l'única cosa que
    // ho pot veure, perquè una sessió esborrada no surt a cap consulta de
    // canvis (no hi ha cap fila que ho digui).
    effect(() => {
      const scope = this.activityFeed.lastScope();
      if (!scope) return;
      untracked(() =>
        this.store.reconcileScope(scope.workoutIds, scope.from, scope.to, scope.since)
      );
    });

    // Passar de dia amb l'app oberta deixava el dia nou fora de la finestra:
    // l'1 de mes sortia buit fins que no recarregaves la pàgina.
    effect(() => {
      this.today.today();
      if (!this.auth.uid()) return;
      untracked(() => this._preloadRecentWindow());
    });

    // Una edició que no troba la fila vol dir que s'ha esborrat des d'un altre
    // dispositiu: es torna a demanar el mes perquè el fantasma marxi d'aquí.
    effect(() => {
      const gone = this.syncService.vanished();
      if (!gone) return;
      untracked(() => { void this.ensureRange(gone.date, gone.date, true); });
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

    // Dues consultes, sempre dues, tinguis tres mesos o vuit anys carregats:
    //
    //   1. **Què ha canviat** des de l'últim cop (`_pullChanges`). Porta les
    //      sessions senceres de la finestra recent, que és l'única part que
    //      s'ha de poder editar aquí.
    //   2. **Qui hi ha d'haver** al tram carregat (`activityFeed`). Cobreix el
    //      tram sencer en una crida, i per això és l'única que veu el que s'ha
    //      esborrat des d'un altre dispositiu.
    //
    // Abans, aquí hi havia una comprovació sencera cada cinc minuts que
    // rebaixava **tot l'historial amb totes les sèries** —i n'hi havia prou
    // que alguna pantalla n'hagués demanat un cop perquè passés a cada canvi
    // de pestanya— i, si no, una petició per cada mes que haguessis arribat a
    // mirar. Scrollar el calendari mig any enrere deixava l'app fent dotze
    // peticions cada cinc minuts, per sempre.
    const hot = this.recentWindow();
    await Promise.all([
      this._pullChanges(),
      this.activityFeed.refreshLoaded(hot.from, hot.to),
    ]);
  }

  /**
   * Demana només el que ha canviat des de l'últim cop.
   *
   * És el patró que fan servir els sistemes de sincronització provats: un
   * marcador d'on es va quedar (aquí, `updated_at`) i, a partir d'aquí, només
   * les files noves. Tornar a demanar mesos sencers cada cop que tornaves a
   * l'app era car i lent, i sobretot arribava tard.
   *
   * **El marcador surt de les files, no del rellotge d'aquest dispositiu.**
   * `updated_at` l'escriu qui fa el canvi, o sigui que la taula barreja les
   * hores de tots els dispositius de l'usuari. Amb el marcador posat a «ara»
   * segons aquest, un mòbil amb el rellotge dos minuts endarrerit escrivia
   * files amb una hora que ja havíem passat: quedaven per sempre per sota del
   * marcador i la consulta de canvis no les veia mai més. Prenent el
   * `updated_at` més alt que ha arribat de debò, el marcador viu al mateix
   * rellotge que les dades que compara.
   *
   * Es demana amb `gte` i no `gt`: així no es perd res quan diverses files
   * comparteixen el mateix `updated_at` a la frontera d'un tram. Tornar a
   * aplicar una fila que ja teníem no costa res — `applyServerRow()` és
   * idempotent i no toca el que espera pujar.
   */
  private _pullChanges(): Promise<void> {
    if (this._pullLoad) return this._pullLoad;
    const p = this._fetchChanges().finally(() => { this._pullLoad = null; });
    this._pullLoad = p;
    return p;
  }

  private async _fetchChanges(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || this.offline.isOffline()) return;

    let cursor = this._lastPulledAt;
    try {
      // Els canvis d'una estona són pocs, però tornar després d'uns dies sense
      // connexió pot portar-ne molts: es recorren per trams, que si no
      // PostgREST talla la resposta i la resta no arribaria fins al proper cop.
      for (let page = 0; page < 20; page++) {
        let q = this.supabase
          .from('workouts')
          .select(WORKOUT_COLUMNS)
          .eq('user_id', uid)
          .order('updated_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(SUPABASE_PAGE_SIZE);
        if (cursor) q = q.gte('updated_at', cursor);
        else        q = q.gte('date', this._retentionStart());

        const { data, error } = await q;
        if (error) return;

        const rows = (data ?? []) as Record<string, unknown>[];
        this.store.applyServerRows(rows.map(r => toWorkout(r)));

        const newest = rows.reduce<string | null>((max, r) => {
          const at = r['updated_at'] as string | undefined;
          return at && (!max || at > max) ? at : max;
        }, null);
        if (newest) { cursor = newest; this._lastPulledAt = cursor; }

        this._pulledOnce = true;
        // Tram incomplet: ja no en queden. I si un tram ple no ha pogut moure
        // el marcador (totes les files amb la mateixa hora), continuar només
        // seria demanar el mateix un altre cop.
        if (rows.length < SUPABASE_PAGE_SIZE || !newest) return;
      }
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
    // El primer cop, la consulta de canvis ja porta la finestra recent sencera
    // (vegeu `_fetchChanges`): les sessions dels últims mesos amb les seves
    // sèries, que és l'única part que s'ha de poder editar aquí.
    //
    // Abans aquí hi havia una consulta només per a avui. Era redundant —el que
    // porta ja hi cap a dins— i una petició més a l'arrencada, que és
    // justament el moment que se'n volen treure.
    if (!this.offline.isOffline()) void this._pullChanges();

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

  // ── Load API ─────────────────────────────────────────────────────────────

  /** El tram que es demana en entrar: del primer dia de fa `RECENT_MONTHS`
   *  mesos fins avui. Vegeu `RECENT_MONTHS`. */
  recentWindow(): { from: string; to: string } {
    const today = this._todayStr;
    const [y, m] = today.split('-').map(Number);
    const start  = new Date(y, m - 1 - (WorkoutService.RECENT_MONTHS - 1), 1);
    return { from: toDateStr(start), to: today };
  }

  private _preloadRecentWindow(): void {
    const { from, to } = this.recentWindow();
    void this.ensureRange(from, to);
  }

  /**
   * S'assegura que hi ha la finestra recent. És el que crida qui necessita
   * «el que he fet últimament» sense saber quin tram exacte vol.
   */
  ensureRecentWindow(): Promise<void> {
    const { from, to } = this.recentWindow();
    return this.ensureRange(from, to);
  }

  /**
   * Demana l'activitat d'un tram de dies.
   *
   * És **l'única** manera de demanar activitat per data que hi ha a l'app, i
   * serveix igual per a un dia, una setmana, un mes o tres. Qui la crida no ha
   * de pensar en mesos: el servei de trams ja sap què té i només pregunta pel
   * que li falta.
   *
   * No porta cap sèrie. Les sèries d'una sessió es demanen en obrir-la
   * (`ensureWorkoutEntries`) i les de la finestra recent arriben per la
   * consulta de canvis, que és qui manté editable el que s'està entrenant.
   */
  async ensureRange(from: string, to: string, force = false): Promise<void> {
    await this.activityFeed.ensureRange(from, to, force);
  }

  /**
   * Busca a tot l'historial, al servidor.
   *
   * És el que fa la cerca del Calendari. Abans, escriure «dominades» hi
   * baixava **tota la vida de l'usuari amb totes les sèries** per filtrar-la
   * aquí; ara la pregunta la contesta el servidor —amb l'índex trigram de
   * `exercise_names`— i el que viatja són només les coincidències, sense cap
   * sèrie.
   *
   * No cobreix cap tram: una resposta filtrada diu qui coincideix, no qui hi
   * ha d'haver. Vegeu `ActivityFeedService.searchRange()`.
   */
  async searchHistory(filters: { search?: string; category?: string }): Promise<void> {
    await this.activityFeed.searchRange(EPOCH_START, this._todayStr, filters);
  }

  /** Hi ha una cerca en marxa contra el servidor. */
  readonly isSearching = computed(() => this.activityFeed.searching());

  /**
   * Carrega un mes. Es manté pel codi que pensa en mesos (el calendari, el
   * planificador), però per sota ja és una consulta de tram com qualsevol
   * altra: dos mesos consecutius no són dues peticions, són un tram més gran.
   */
  async ensureMonthLoaded(year: number, month: number, force = false): Promise<void> {
    const start   = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    await this.ensureRange(toDateStr(start), toDateStr(lastDay), force);
  }

  // Loads only the workouts that contain a specific exercise, merging them
  // into the month cache so getWorkoutsForExercise() and exercisesWithData()
  // stay consistent.
  async loadWorkoutsForExercise(exerciseId: string): Promise<void> {
    if (this._exLoadedIds.has(exerciseId)) return;
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
    const uid = this._uid();
    try {
      // Contenció de jsonb (`entries @> [{"exerciseId": …}]`), no un `ilike`
      // sobre `entries::text`. És la mateixa trampa que va treure la migració
      // 020 de la cerca de l'historial: convertir tot el blob a text obliga
      // el servidor a llegir i convertir *cada* entrenament de l'usuari a
      // cada consulta, i no hi ha cap índex que hi pugui ajudar. Amb la
      // contenció, l'índex GIN de la migració 029 va directe a les files que
      // el porten. La cadena es passa ja feta perquè `.contains()` amb un
      // array el tradueix a literal d'array de Postgres — bo per a
      // `categories`, però no per a una columna jsonb.
      const { rows, error } = await fetchAllRows<Record<string, unknown>>(() =>
        this.supabase
          .from('workouts')
          .select(WORKOUT_COLUMNS)
          .eq('user_id', uid)
          .neq('status', 'planned')
          .contains('entries', JSON.stringify([{ exerciseId }]))
          .order('date',       { ascending: true })
          .order('created_at', { ascending: true })
          .order('id',         { ascending: true })
      );

      if (error) {
        this._exLoadedIds.add(exerciseId); // prevent retry storm on repeated Supabase errors
        return;
      }

      const fetched = rows
        .map(r => toWorkout(r))
        .filter(w => w.entries.some(e => e.exerciseId === exerciseId));

      // Files soltes, no un mes sencer: només s'incorporen, no es dedueix
      // res del que hi falta. La versió del servidor mana llevat que la
      // d'aquí encara esperi pujar.
      this.store.applyServerRows(fetched);
      this._exLoadedIds.add(exerciseId);
    } catch {
      this._exLoadedIds.add(exerciseId); // prevent retry storm; will refresh on next app session
    }
  }

  /**
   * Baixa les sèries d'una sessió que només tenim en mode targeta.
   *
   * És el segon temps del carregat: la targeta es pinta amb el resum i, en
   * obrir-la, es demana la sessió sencera. A partir d'aquí entra al magatzem
   * com qualsevol altra i ja es pot editar.
   */
  async ensureWorkoutEntries(id: string): Promise<void> {
    if (this.store.has(id) || this.store.isDeleted(id)) return;
    const inFlight = this._entryLoads.get(id);
    if (inFlight) return inFlight;
    const p = this._fetchWorkoutEntries(id).finally(() => this._entryLoads.delete(id));
    this._entryLoads.set(id, p);
    return p;
  }

  private async _fetchWorkoutEntries(id: string): Promise<void> {
    const uid = this.auth.uid();
    if (!uid || this.offline.isOffline()) return;
    try {
      const { data, error } = await this.supabase
        .from('workouts')
        .select(WORKOUT_COLUMNS)
        .eq('user_id', uid)
        .eq('id', id)
        .maybeSingle();

      if (error || !data) return;
      this.store.applyServerRow(toWorkout(data as Record<string, unknown>));
    } catch {
      // Sense xarxa: la targeta es queda amb el resum, que ja diu què va ser.
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
      // `exercise_names` es filtra però no es porta: existeix per cercar-hi al
      // servidor, i el client ja té els noms dins d'`entries`.
      .select(WORKOUT_COLUMNS, { count: 'exact' })
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

  /** Les sessions fetes d'aquest exercici, de la més antiga a la més recent
   *  (l'ordre que volen les gràfiques de progrés). */
  getWorkoutsForExercise(exerciseId: string): Workout[] {
    const bucket = this._byExercise().get(exerciseId);
    if (!bucket) return [];
    // El calaix ja ve ordenat de la més recent a la més antiga: invertir-lo
    // costa menys que tornar a ordenar, i sobretot no toca l'historial sencer.
    const out: Workout[] = [];
    for (let i = bucket.length - 1; i >= 0; i--) {
      if ((bucket[i].status ?? 'done') !== 'planned') out.push(bucket[i]);
    }
    return out;
  }

  getAllTimeMaxWeight(exerciseId: string, excludeWorkoutId?: string): number {
    let max = 0;
    for (const w of this._byExercise().get(exerciseId) ?? []) {
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
    // El calaix de l'exercici ja ve de la més recent a la més antiga, així que
    // la primera que serveixi és la resposta: no cal filtrar ni ordenar
    // l'historial sencer per saber què vas fer l'última vegada.
    const last = (this._byExercise().get(exerciseId) ?? []).find(w =>
      w.id !== excludeWorkoutId &&
      (w.status ?? 'done') !== 'planned' &&
      w.entries.some(e => e.exerciseId === exerciseId && e.sets.length > 0)
    );
    if (!last) return null;
    const entry       = last.entries.find(e => e.exerciseId === exerciseId)!;
    const workingSets = entry.sets.filter(s => !s.warmup);
    const maxWeight   = Math.max(...(workingSets.length ? workingSets : entry.sets).map(s => setMaxWeight(s)));
    return {
      date:        last.date,
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

  /**
   * Comença un planificat. Torna l'id de l'entrenament que s'ha de obrir, que
   * no sempre és el que se li ha passat.
   *
   * Un planificat de la rutina no és cap fila: és el que la rutina proposa per
   * aquell dia. Començar-lo és **el moment** en què passa a existir — es crea
   * l'entrenament amb els seus exercicis i es guarda, i el dia queda retirat
   * de la proposta perquè no surti dues vegades. És tot el sentit de no
   * materialitzar la rutina: a la base de dades hi va el que has fet.
   */
  async startPlannedWorkout(workoutId: string): Promise<string> {
    if (!isRoutineProjection(workoutId)) {
      this._updateWorkout(workoutId, { status: 'done' });
      return workoutId;
    }

    const proposed = this._find(workoutId) ?? this._findPlanned(workoutId);
    const id = await this.createWorkoutForDate(proposed?.date ?? this._todayStr, proposed?.category);
    if (proposed?.entries.length) {
      this._updateWorkout(id, {
        entries:    proposed.entries.map(e => ({ ...e, sets: [...e.sets] })),
        categories: proposed.categories ?? (proposed.category ? [proposed.category] : []),
      });
    }
    await this.routine.materialized(workoutId);
    return id;
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
    // Un planificat de la rutina no és cap fila: treure'l vol dir dir que
    // aquell dia no compta. Si només desaparegués de la pantalla, la regla que
    // el genera el tornaria a proposar tot seguit.
    if (isRoutineProjection(id)) { await this.routine.dismiss(id); return; }

    // D'una sessió que només tenim en mode targeta el magatzem no en sap res,
    // i treure-la d'allà no faria res. Es demana sencera primer, i així
    // l'esborrat viatja per la mateixa cua que la resta.
    if (!this.store.has(id)) await this.ensureWorkoutEntries(id);
    // Si no s'ha pogut baixar (sense connexió), no hi ha res a esborrar: fer-la
    // desaparèixer de la pantalla sense treure-la d'enlloc seria pitjor, que
    // tornaria a sortir sola a la propera càrrega.
    if (!this.store.has(id)) return;
    this.store.remove(id);
    // El resum és una foto del servidor: si no es treu, la targeta esborrada
    // continuaria sortint fins al proper refresc del tram.
    this.activityFeed.forget(id);
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

  private _find(id: string): Workout | undefined {
    return this.store.get(id);
  }

  /** Busca entre els planificats, projeccions incloses. Una projecció no és a
   *  cap magatzem: només existeix a `plannedByDate()`. */
  private _findPlanned(id: string): Workout | undefined {
    for (const bucket of this.plannedByDate().values()) {
      const found = bucket.find(w => w.id === id);
      if (found) return found;
    }
    return undefined;
  }

}
