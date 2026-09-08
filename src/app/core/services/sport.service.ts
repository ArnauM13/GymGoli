import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { ActivityFeedService, FeedScope } from './activity-feed.service';
import { RoutineProjectionService, isRoutineProjection } from './routine-projection.service';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';
import { TodayService } from './today.service';
import { SUPABASE_PAGE_SIZE, fetchAllRows } from './supabase-page.util';
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
/** `seq` puja cada cop que s'escriu la cua. Una tanda d'enviaments recorda
 *  quin `seq` va enviar i, si en tornar ja no és el mateix, l'operació s'ha
 *  tornat a tocar mentrestant i no es pot donar per feta. */
interface PendingSportOp { op: SportOpKind; id: string; row: Record<string, unknown>; seq?: number; }

// ── Row mappers ──────────────────────────────────────────────────────────────

/** Les columnes que l'app llegeix de debò d'una sessió d'esport. `select('*')`
 *  hi afegia `user_id` (que ja és el filtre de la consulta) i
 *  `duration_minutes`, la columna que va substituir `duration` i que ningú
 *  llegeix des de fa migracions. */
const SPORT_SESSION_COLUMNS =
  'id,date,sport_id,subtype_id,duration,feeling,metrics,notes,status,planned_source,created_at';

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
  /** Les sessions per tram arriben de la mateixa crida que els entrenaments.
   *  Vegeu `ActivityFeedService`: demanar un mes d'esports ja no és cap
   *  petició — el tram que el calendari o Inici ja han demanat el porta. */
  private activityFeed = inject(ActivityFeedService);
  /** La rutina recurrent, projectada en comptes d'escrita. Vegeu
   *  `RoutineProjectionService`. */
  private routine      = inject(RoutineProjectionService);

  /** Igual que a WorkoutService: avui es mira, no es recorda. */
  private get _todayStr(): string { return this.today.today(); }

  // ── Sport definitions ────────────────────────────────────────────────────
  private readonly _sports = signal<Sport[]>([]);
  readonly sports  = this._sports.asReadonly();
  readonly isLoaded = signal(false);
  private _loadPromise: Promise<void> | null = null;
  /** La consulta del catàleg d'esports que hi ha ara mateix en marxa. */
  private _sportsLoad: Promise<void> | null = null;

  // ── Sessions cache ────────────────────────────────────────────────────────
  private readonly _monthCache = new Map<string, SportSession[]>();
  /** Mesos demanats sencers al servidor: tenir-ne alguna sessió a la cau no
   *  vol dir tenir-les totes. */
  private readonly _fullMonths = new Set<string>();
  /** Peticions de mes en marxa, per no demanar-lo dos cops alhora. */
  private readonly _sessions   = signal<SportSession[]>([]);
  /** Senyal, i no un booleà a seques, perquè qui depèn de tenir *tot*
   *  l'historial a mà (els rècords del detall d'una sessió) se n'assabenti
   *  quan acaba d'arribar, i no ensenyi una fita calculada a mitges. */
  private readonly _allLoaded = signal(false);
  /** Cert quan `loadAllSessions()` ja ha portat l'historial sencer. */
  readonly allSessionsLoaded = this._allLoaded.asReadonly();
  /** La consulta de tot l'historial que hi ha en marxa, si n'hi ha cap. Qui la
   *  demani mentre viatja s'hi enganxa en comptes de llançar-ne una altra. */
  private _allLoad: Promise<void> | null = null;
  private _lastRefreshAt = 0;

  /** Fins on s'han demanat canvis: l'`updated_at` més alt que ha arribat en
   *  una resposta, no l'hora d'aquest dispositiu (vegeu `_pullChanges()`). */
  private _lastPulledAt: string | null = null;
  private _pulledOnce = false;
  private _pullLoad: Promise<void> | null = null;
  /** Fals quan la base de dades encara no té `sport_sessions.updated_at`
   *  (migració 030). Llavors no hi ha consulta de canvis possible i es torna a
   *  la comprovació sencera de sempre. */
  private _canPullChanges = true;

  /** Marge mínim entre refrescos automàtics (tornar a l'app dispara alhora
   *  `focus` i `visibilitychange`). */
  private static readonly REFRESH_THROTTLE_MS = 10_000;
  private _isFlushing = false;
  /** Comptador de versions de la cua d'enviaments. */
  private _opSeq = 0;
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
    // Les sessions d'esport d'un tram arriben amb la mateixa resposta que els
    // entrenaments. Com que cobreix el tram sencer, també és l'única cosa que
    // veu el que s'ha esborrat des d'un altre dispositiu.
    effect(() => {
      const scope = this.activityFeed.lastScope();
      const rows  = this.activityFeed.sportSessions();
      if (!scope) return;
      untracked(() => this._ingestScope(scope, rows));
    });

    effect(() => {
      const uid = this.auth.uid();
      this._sports.set([]);
      this._sportsLoaded.set(false);
      this._monthCache.clear();
      this._fullMonths.clear();
      this._sessions.set([]);
      this._allLoaded.set(false);
      this.isLoaded.set(false);
      this._loadPromise = null;
      // Una consulta de l'usuari anterior no pot quedar-se com la que espera
      // qui demani l'historial ara, ni el seu marcador de canvis com el nostre.
      this._allLoad = null;
      this._sportsLoad = null;
      this._pullLoad = null;
      this._lastPulledAt = null;
      this._pulledOnce = false;
      if (uid) {
        const cached = this._readSportsFromStorage(uid);
        if (cached) {
          this._sports.set(cached);
          this._sportsLoaded.set(true);
        }
        this._loadSports(uid, true);
        this._flushPending();
      }
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this._flushPending(); this.refreshLoaded(true); });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        this._flushPending();
        this.refreshLoaded();
      });
      window.addEventListener('focus', () => this.refreshLoaded());
      window.addEventListener('pagehide', () => this._flushPending());
    }
  }

  /**
   * Torna a demanar els mesos que ja tenim carregats.
   *
   * Les sessions d'esport no tenen realtime: sense això, una pestanya oberta
   * es quedava amb la foto del moment en què la vas obrir i ensenyava una
   * cosa diferent del que veies al mòbil.
   */
  async refreshLoaded(immediate = false): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

    const now = Date.now();
    if (!immediate && now - this._lastRefreshAt < SportService.REFRESH_THROTTLE_MS) return;
    this._lastRefreshAt = now;

    // Els esports en si també: crear-ne un al mòbil deixava la pestanya de
    // l'ordinador amb sessions d'un esport que no sabia dibuixar, perquè
    // `getSportsForDate()` descarta la sessió si no en troba la definició.
    const sports = this._loadSports(uid);

    // Primer el que ha canviat des de l'últim cop. `WorkoutProfileService`
    // demana tot l'historial en entrar, i des d'aquell moment cada tornada a
    // l'app el tornava a baixar **sencer**: cada canvi de pestanya, anys de
    // sessions, per assabentar-se de si n'hi havia una de nova.
    await Promise.all([sports, this._pullChanges(uid)]);

    // El que ha desaparegut el veu el refresc del tram, que és **una** crida
    // per a les dues activitats i el fa `WorkoutService.refreshLoaded()`.
    //
    // Aquí abans hi havia la comprovació sencera cada cinc minuts. Com que
    // `WorkoutProfileService` demanava tot l'historial d'esports en entrar,
    // `_allLoaded()` era cert des del primer segon i cada tornada a l'app —
    // cada canvi de pestanya— en tornava a baixar anys sencers. I quan no,
    // una petició per cada mes que haguessis arribat a mirar.
  }

  /**
   * Demana només les sessions que han canviat des de l'últim cop.
   *
   * Mateixa forma que als entrenaments, i pels mateixos motius: el marcador és
   * l'`updated_at` **més alt que ha arribat de debò en una resposta**, no
   * l'hora d'aquest dispositiu — la taula barreja les hores de tots els seus
   * dispositius i apuntar el marcador a «ara segons jo» deixa per sempre per
   * sota el que hagi escrit un mòbil amb el rellotge endarrerit. Aquí, a més,
   * la marca la posa un disparador del servidor (migració 030), o sigui que
   * tot passa per un sol rellotge.
   *
   * Es demana amb `>=` per no perdre els empats a la frontera d'un tram: una
   * fila repetida només es torna a aplicar a sobre d'ella mateixa.
   */
  private _pullChanges(uid: string): Promise<void> {
    if (!this._canPullChanges) return Promise.resolve();
    if (this._pullLoad) return this._pullLoad;
    const p = this._fetchChanges(uid).finally(() => { this._pullLoad = null; });
    this._pullLoad = p;
    return p;
  }

  private async _fetchChanges(uid: string): Promise<void> {
    let cursor = this._lastPulledAt;
    try {
      // Sense marcador encara no hi ha delta que demanar: qui porta les dades
      // aquest primer cop és la comprovació sencera que ve tot seguit, i
      // baixar-ho tot dues vegades seguides no diria res de nou. N'hi ha prou
      // amb saber per on va el rellotge del servidor, que és una sola fila.
      if (!cursor) {
        const { data, error } = await this.supabase
          .from('sport_sessions')
          .select('updated_at')
          .eq('user_id', uid)
          .order('updated_at', { ascending: false })
          .limit(1);
        if (error) {
          if ((error as { code?: string }).code === '42703') this._canPullChanges = false;
          return;
        }
        const newest = (data ?? [])[0]?.['updated_at'] as string | undefined;
        if (newest) { cursor = newest; this._lastPulledAt = cursor; }
        this._pulledOnce = true;
        return;
      }

      for (let page = 0; page < 20; page++) {
        let q = this.supabase
          .from('sport_sessions')
          .select(`${SPORT_SESSION_COLUMNS},updated_at`)
          .eq('user_id', uid)
          .order('updated_at', { ascending: true })
          .order('id', { ascending: true })
          .limit(SUPABASE_PAGE_SIZE)
          .gte('updated_at', cursor);

        const { data, error } = await q;
        if (error) {
          // La migració 030 encara no hi és: sense columna no hi ha consulta
          // de canvis, i es continua com sempre amb la comprovació sencera.
          if ((error as { code?: string }).code === '42703') this._canPullChanges = false;
          return;
        }

        const rows = (data ?? []) as Record<string, unknown>[];
        this._applyServerSessions(uid, rows.map(r => toSportSession(r)));

        const newest = rows.reduce<string | null>((max, r) => {
          const at = r['updated_at'] as string | undefined;
          return at && (!max || at > max) ? at : max;
        }, null);
        if (newest) { cursor = newest; this._lastPulledAt = cursor; }

        this._pulledOnce = true;
        if (rows.length < SUPABASE_PAGE_SIZE || !newest) return;
      }
    } catch {
      // Sense xarxa: el marcador no es mou i la propera vegada es reprèn aquí.
    }
  }

  /**
   * Incorpora files soltes vingudes del servidor.
   *
   * A diferència d'una resposta d'abast sencer, **no dedueix res del que hi
   * falta**: una consulta de canvis no diu què ha desaparegut, només què s'ha
   * tocat. I el que espera pujar no es toca — és exactament la versió que
   * estem a punt d'enviar-li.
   */
  private _applyServerSessions(uid: string, fetched: SportSession[]): void {
    if (!fetched.length) return;
    const pending = this._readPending(uid);
    const queued  = new Set(pending.filter(o => o.op !== 'delete').map(o => o.id));
    const erased  = new Set(pending.filter(o => o.op === 'delete').map(o => o.id));

    // Els mesos tocats es guarden un cop al final: escriure el mes sencer a
    // cada sessió serialitzaria el mateix una vegada per fila.
    const touched = new Set<string>();
    for (const s of fetched) {
      if (queued.has(s.id) || erased.has(s.id)) continue;

      const key = s.date.substring(0, 7);
      // Un mes que aquest dispositiu no ha demanat mai no s'omple a trossos:
      // tenir-ne una sessió solta faria semblar que ja el té sencer.
      if (!this._monthCache.has(key) && !this._allLoaded()) continue;

      // Pot haver canviat de dia, i llavors ha de marxar del mes on era.
      for (const [k, bucket] of this._monthCache) {
        if (k === key) continue;
        const without = bucket.filter(x => x.id !== s.id);
        if (without.length !== bucket.length) { this._monthCache.set(k, without); touched.add(k); }
      }
      const bucket = (this._monthCache.get(key) ?? []).filter(x => x.id !== s.id);
      this._monthCache.set(key, [...bucket, s]);
      touched.add(key);
    }

    if (!touched.size) return;
    for (const key of touched) this._writeSessionsToStorage(uid, key, this._monthCache.get(key) ?? []);
    this._rebuild();
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
    await this._loadSports(uid, true);
    this.isLoaded.set(true);
  }

  // ── Sport CRUD ────────────────────────────────────────────────────────────

  /** `allowSeed` només el posa la primera càrrega. En un refresc, trobar la
   *  llista buida vol dir que l'usuari ha esborrat tots els esports des d'un
   *  altre dispositiu — tornar-los a sembrar seria desfer-li-ho. */
  private _loadSports(uid: string, allowSeed = false): Promise<void> {
    // Sense aquesta guarda el catàleg es demanava dues vegades a l'arrencada:
    // un cop des de l'efecte d'usuari i un altre des de l'`ensureLoaded()`
    // que fa Inici en muntar-se, que passen amb milisegons de diferència.
    if (this._sportsLoad) return this._sportsLoad;
    const p = this._doLoadSports(uid, allowSeed).finally(() => { this._sportsLoad = null; });
    this._sportsLoad = p;
    return p;
  }

  private async _doLoadSports(uid: string, allowSeed = false): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('sports')
        .select('*')
        .eq('user_id', uid)
        .order('created_at');

      // Una consulta que ha fallat no és «aquest usuari no té esports»: sembrar
      // el catàleg per defecte a cada refresc que topi amb la xarxa caiguda és
      // ressuscitar el que l'usuari havia esborrat.
      if (error) return;

      const sports = (data ?? []).map(r => toSport(r as Record<string, unknown>));
      if (sports.length === 0 && allowSeed) {
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

  /**
   * Carrega un mes.
   *
   * Ja no fa cap consulta pròpia: demana el tram al servei d'activitat, que és
   * el mateix que demanen els entrenaments. Si aquell mes ja hi cau a dins —i
   * hi cau gairebé sempre, perquè en entrar es demanen tres mesos— **no hi ha
   * cap petició**. Abans cada mes visible eren dues: una d'entrenaments i una
   * d'esports.
   */
  async ensureMonthLoaded(year: number, month: number, force = false): Promise<void> {
    if (this._allLoaded() && !force) return;
    const key     = `${year}-${String(month + 1).padStart(2, '0')}`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    // El que hi ha guardat al dispositiu es pot ensenyar ja, i és l'única cosa
    // que hi haurà si ara mateix no hi ha connexió.
    this._primeMonthFromStorage(key);
    await this.activityFeed.ensureRange(
      `${key}-01`, `${key}-${String(lastDay).padStart(2, '0')}`, force,
    );
  }

  /** Posa a la cau el que el dispositiu ja sap d'aquest mes, sense esperar
   *  ningú. */
  private _primeMonthFromStorage(key: string): void {
    const uid = this.auth.uid();
    if (!uid || this._monthCache.has(key)) return;
    const cached = this._readSessionsFromStorage(uid, key);
    this._monthCache.set(key, cached ?? []);
    if (cached?.length) this._rebuild();
  }

  /**
   * Incorpora les sessions d'un tram que ha arribat sencer.
   *
   * La resposta mana, amb tres excepcions, que són les de sempre:
   *
   * - el que espera torn a la cua d'enviament es queda (és el que estem a punt
   *   de pujar);
   * - el que s'ha esborrat aquí i encara no allà no torna;
   * - i el que s'ha registrat **mentre la consulta viatjava** tampoc no marxa:
   *   no podia sortir a la resposta, i prendre-ho per esborrat feia que un
   *   esport registrat just abans desaparegués de la pantalla.
   *
   * La resta —el que teníem d'aquest tram i la resposta no porta— s'ha
   * esborrat des d'un altre dispositiu i se'n va.
   */
  private _ingestScope(scope: FeedScope, rows: SportSession[]): void {
    const uid = this.auth.uid();
    if (!uid) return;

    const pending = this._readPending(uid);
    const queued  = new Set(pending.filter(o => o.op !== 'delete').map(o => o.id));
    const erased  = new Set(pending.filter(o => o.op === 'delete').map(o => o.id));

    const inScope = (d: string) => d >= scope.from && d <= scope.to;

    const byId = new Map<string, SportSession>();
    for (const s of rows) {
      if (erased.has(s.id)) continue;
      byId.set(s.id, s);
    }
    for (const s of [...this._monthCache.values()].flat()) {
      if (erased.has(s.id)) continue;
      if (byId.has(s.id)) continue;
      const survives = !inScope(s.date)
        || queued.has(s.id)
        || s.createdAt.getTime() >= scope.startedAt;
      if (survives) byId.set(s.id, s);
    }

    const touched = new Set<string>(this._monthCache.keys());
    this._monthCache.clear();
    for (const s of byId.values()) {
      const key = s.date.substring(0, 7);
      this._monthCache.set(key, [...(this._monthCache.get(key) ?? []), s]);
      touched.add(key);
    }
    // Els mesos que el tram cobreix del tot ja es poden servir del dispositiu
    // sense preguntar res.
    for (const key of touched) {
      if (!this._monthCache.has(key)) this._monthCache.set(key, []);
      this._writeSessionsToStorage(uid, key, this._monthCache.get(key) ?? []);
      const lastDay = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
      if (inScope(`${key}-01`) && inScope(`${key}-${String(lastDay).padStart(2, '0')}`)) {
        this._fullMonths.add(key);
      }
    }
    this._rebuild();
    this.isLoading.set(false);
  }

  /** Loads the user's entire sport-session history into the cache in a single
   *  query. Needed by features that reason over all-time recency (e.g. the
   *  workout suggestion), which the lazy per-month loading can't guarantee.
   *  Cached after the first successful run. */
  loadAllSessions(): Promise<void> {
    if (this._allLoaded()) return Promise.resolve();
    return this._fetchAllSessions();
  }

  /** La consulta de debò, amb guarda de petició en marxa: qui la demani
   *  mentre una viatja espera aquella en comptes de llançar-ne una altra. */
  private _fetchAllSessions(): Promise<void> {
    if (this._allLoad) return this._allLoad;
    const p = this._runFetchAllSessions().finally(() => { this._allLoad = null; });
    this._allLoad = p;
    return p;
  }

  private async _runFetchAllSessions(): Promise<void> {
    const uid = this.auth.uid();
    if (!uid) return;
    this.isLoading.set(true);
    try {
      const known        = new Set([...this._monthCache.values()].flat().map(s => s.id));
      const queuedBefore = new Set(this._readPending(uid).map(o => o.id));
      // Per trams i amb un ordre total: el que no surti d'aquesta resposta es
      // dóna per esborrat des d'un altre dispositiu i marxa de la cau, així que
      // una resposta tallada pel topall de files de PostgREST buidaria mitja
      // història. Amb l'ordre només per data, a més, dues sessions del mateix
      // dia poden caure entre dos trams i no sortir a cap.
      const { rows, error, complete } = await fetchAllRows<Record<string, unknown>>(() =>
        this.supabase
          .from('sport_sessions')
          .select(SPORT_SESSION_COLUMNS)
          .eq('user_id', uid)
          .order('date',       { ascending: false })
          .order('created_at', { ascending: false })
          .order('id',         { ascending: false })
      );

      if (error || !complete) return; // es manté el que ja teníem

      const fetched = rows.map(r => toSportSession(r));
      const pending = this._readPending(uid);
      const queued  = new Set(pending.filter(o => o.op !== 'delete').map(o => o.id));
      const erased  = new Set(pending.filter(o => o.op === 'delete').map(o => o.id));

      // Igual que a `_mergeMonth`: la resposta mana, i la versió local només
      // es conserva mentre esperi torn per pujar.
      const byId = new Map(fetched.filter(s => !erased.has(s.id)).map(s => [s.id, s]));
      for (const s of [...this._monthCache.values()].flat()) {
        if (erased.has(s.id)) continue;
        if (queued.has(s.id) || queuedBefore.has(s.id) || !known.has(s.id)) byId.set(s.id, s);
      }

      this._monthCache.clear();
      this._fullMonths.clear();
      for (const s of byId.values()) {
        const key = s.date.substring(0, 7);
        this._monthCache.set(key, [...(this._monthCache.get(key) ?? []), s]);
        this._fullMonths.add(key);
      }
      this._rebuild();
      this._allLoaded.set(true);
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

  /**
   * Els esports planificats d'un dia: els que són files de debò i, a sobre, el
   * que proposa la rutina.
   *
   * La rutina no s'escriu (vegeu `RoutineProjectionService`): es calcula. Un
   * esport que aquell dia ja té sessió —feta o planificada a mà— no es proposa
   * dues vegades.
   */
  getPlannedSportSessionsForDate(date: string): Array<{ sport: Sport; session: SportSession }> {
    const real = this._pairsForDate(date, s => s.status === 'planned');
    if (!this.routine.hasRoutine()) return real;

    const proposed = this.routine.projectedFor(date).sport;
    if (!proposed.length) return real;

    const sportsMap = this._sportsById();
    const already   = new Set((this._sessionsByDate().get(date) ?? []).map(s => s.sportId));

    const projected: Array<{ sport: Sport; session: SportSession }> = [];
    for (const p of proposed) {
      if (already.has(p.sportId)) continue;
      const sport = sportsMap.get(p.sportId);
      if (!sport) continue;   // esport esborrat: la regla ja no vol dir res
      projected.push({
        sport,
        session: {
          id: p.id, date, sportId: p.sportId,
          subtypeId: p.subtypeId,
          duration:  p.duration,
          status:    'planned',
          plannedSource: 'routine',
          createdAt: new Date(`${date}T00:00:00`),
        },
      });
    }
    return [...real, ...projected];
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

  /** Una sessió pel seu id, sigui feta o planificada — la pàgina d'una sessió
   *  hi arriba per l'URL i no sap de quin dia és fins que la troba. Només la
   *  veurà si el seu mes és carregat: qui hi entra de nou fa
   *  `loadAllSessions()` abans de donar-la per perduda. */
  getSessionById(id: string): SportSession | undefined {
    return this._sessions().find(s => s.id === id);
  }

  hasSportOnDate(date: string, sportId: string): boolean {
    return (this._sessionsByDate().get(date) ?? []).some(s =>
      s.sportId === sportId && (s.status ?? 'done') !== 'planned');
  }

  hasAnySportOnDate(date: string): boolean {
    return (this._sessionsByDate().get(date) ?? []).some(s => (s.status ?? 'done') !== 'planned');
  }

  // ── Session log / toggle ────────────────────────────────────────────────

  /** Full session create with all metrics. Used when registering a sport and
   *  by weekly routine planning — writes locally first so it works offline,
   *  then syncs to Supabase in the background (queued for retry if offline).
   *  `plannedSource` only matters for status: 'planned' — 'routine' or
   *  'manual', matching WorkoutService.createPlannedWorkout, so a routine
   *  and an ad-hoc plan can be retracted independently of each other.
   *
   *  Retorna l'id de la sessió, com `createWorkoutForDate`: qui la registra hi
   *  vol anar tot seguit, i l'id el posa el client. */
  async logSession(
    date: string, sportId: string,
    data: { subtypeId?: string; duration?: number; feeling?: FeelingLevel; metrics?: Record<string, string | number>; notes?: string },
    status: SportSessionStatus = 'done',
    plannedSource?: PlannedSource,
  ): Promise<string> {
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
    return id;
  }

  /**
   * Converteix una sessió planificada en una de feta.
   *
   * Una sessió projectada de la rutina no és cap fila: començar-la és el
   * moment en què passa a existir. Torna l'id de la sessió de debò, que en
   * aquest cas no és el que se li ha passat.
   */
  async startPlannedSession(id: string, date: string): Promise<string> {
    if (isRoutineProjection(id)) {
      const proposed = this.getPlannedSportSessionsForDate(date).find(p => p.session.id === id);
      const newId = await this.logSession(
        date,
        proposed?.sport.id ?? '',
        { subtypeId: proposed?.session.subtypeId, duration: proposed?.session.duration },
        'done',
      );
      await this.routine.materialized(id);
      return newId;
    }

    const uid = this._uid();

    const key    = date.substring(0, 7);
    const bucket = this._monthCache.get(key) ?? [];
    this._monthCache.set(key, bucket.map(s => s.id === id ? { ...s, status: 'done' } : s));
    this._rebuild();
    this._writeSessionsToStorage(uid, key, this._monthCache.get(key)!);

    await this._pushOrQueue(uid, { op: 'update', id, row: { status: 'done' } });
    return id;
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
    // Una sessió projectada de la rutina no és cap fila: treure-la vol dir dir
    // que aquell dia no compta, o la regla la tornaria a proposar tot seguit.
    if (isRoutineProjection(id)) { await this.routine.dismiss(id); return; }
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
    this._opSeq += 1;
    const stamped = ops.map(o => ({ ...o, seq: o.seq ?? this._opSeq }));
    try { localStorage.setItem(this._lsPendingKey(uid), JSON.stringify(stamped)); } catch { }
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
    this._opSeq += 1;
    op = { ...op, seq: this._opSeq };   // versió nova: cap tanda antiga la tanca
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
      this._writePending(uid, [...others, { ...insert, row: { ...insert.row, ...op.row }, seq: op.seq }]);
      return;
    }
    const update = pending.find(o => o.op === 'update');
    if (op.op === 'update' && update) {
      this._writePending(uid, [...others, { ...update, row: { ...update.row, ...op.row }, seq: op.seq }]);
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

  /**
   * Buida la cua.
   *
   * Al final només es treu el que s'ha pogut enviar i, a més, no s'ha tornat a
   * tocar mentre la petició viatjava (mateix `seq`). Abans es reescrivia la cua
   * amb el que havia fallat, i el que s'hi encuava durant la tanda hi
   * desapareixia sense haver arribat mai al servidor.
   */
  private async _flushPending(): Promise<void> {
    if (this._isFlushing) return;
    const uid = this.auth.uid();
    if (!uid || typeof navigator === 'undefined' || !navigator.onLine) return;
    const ops = this._readPending(uid);
    if (ops.length === 0) return;

    this._isFlushing = true;
    const done = new Map<string, number | undefined>();
    for (const op of ops) {
      try {
        await this._runOp(uid, op);
        done.set(op.id, op.seq);
      } catch {
        // Es queda a la cua: el canvi ja és al dispositiu i es reintentarà.
      }
    }

    const current = this._readPending(uid);
    this._writePending(uid, current.filter(o => !(done.has(o.id) && done.get(o.id) === o.seq)));
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
