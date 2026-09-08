import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AuthService } from './auth.service';
import { OfflineService } from './offline.service';
import { SupabaseService } from './supabase.service';
import { UserSettingsService } from './user-settings.service';
import { WorkoutStoreService } from './workout-store.service';
import { SportSession } from '../models/sport.model';
import { FeelingLevel, PlannedSource, Workout, WorkoutStatus } from '../models/workout.model';

/** Un tram de dies, amb els dos extrems inclosos. */
export interface DateRange { from: string; to: string; }

/**
 * El resultat d'una consulta de tram, per a qui hagi de treure el que ja no
 * hi és.
 *
 * Una consulta de canvis mai no diu què ha desaparegut —no hi ha cap fila que
 * ho digui—, però aquesta cobreix el tram sencer: el que hi tenim guardat i no
 * surt aquí, s'ha esborrat des d'un altre dispositiu.
 *
 * `since` és el `store.mark()` pres **just abans de llançar la consulta**: el
 * que es confirmi mentre viatja no pot sortir a la resposta, i aquesta marca
 * és el que evita esborrar-ho.
 */
export interface FeedScope {
  from:       string;
  to:         string;
  workoutIds: Set<string>;
  sportIds:   Set<string>;
  since:      number;
  /** Quan va sortir la consulta. El que s'hagi registrat en aquest dispositiu
   *  després d'aquest instant no podia sortir a la resposta, i no s'ha de
   *  prendre per esborrat — registrar un esport just abans que arribés la
   *  resposta el feia desaparèixer de la pantalla. */
  startedAt:  number;
}

/** Una fila tal com la torna `activity_feed`. */
interface FeedRow {
  kind:            'workout' | 'sport';
  item_id:         string;
  item_date:       string;
  item_status:     string | null;
  planned_source:  string | null;
  feeling:         number | null;
  notes:           string | null;
  created_at:      string;
  updated_at:      string | null;
  category:        string | null;
  categories:      string[] | null;
  exercise_names:  string | null;
  exercise_count:  number | null;
  set_count:       number | null;
  warmup_count:    number | null;
  volume:          number | null;
  sport_id:        string | null;
  subtype_id:      string | null;
  duration:        number | null;
  metrics:         Record<string, string | number> | null;
}

function toSummary(r: FeedRow): Workout {
  return {
    id:            r.item_id,
    date:          r.item_date,
    entries:       [],
    entriesLoaded: false,
    category:      r.category ?? undefined,
    categories:    r.categories ?? [],
    notes:         r.notes ?? undefined,
    feeling:       (r.feeling as FeelingLevel | null) ?? undefined,
    createdAt:     new Date(r.created_at),
    updatedAt:     r.updated_at ? new Date(r.updated_at) : undefined,
    status:        (r.item_status as WorkoutStatus | null) ?? 'done',
    plannedSource: (r.planned_source as PlannedSource | null) ?? undefined,
    exerciseNames: r.exercise_names ?? undefined,
    exerciseCount: r.exercise_count ?? 0,
    setCount:      r.set_count ?? 0,
    warmupCount:   r.warmup_count ?? 0,
    volume:        r.volume ?? 0,
  };
}

function toSession(r: FeedRow): SportSession {
  return {
    id:            r.item_id,
    date:          r.item_date,
    sportId:       r.sport_id as string,
    subtypeId:     r.subtype_id ?? undefined,
    duration:      r.duration ?? undefined,
    feeling:       (r.feeling as FeelingLevel | null) ?? undefined,
    metrics:       r.metrics ?? undefined,
    notes:         r.notes ?? undefined,
    status:        (r.item_status as SportSession['status'] | null) ?? 'done',
    plannedSource: (r.planned_source as PlannedSource | null) ?? undefined,
    createdAt:     new Date(r.created_at),
  };
}

/** Fusiona trams solapats o que es toquen, i els deixa ordenats. Dos trams que
 *  s'acaben i comencen en dies consecutius són un de sol: si no, demanar
 *  gener i després febrer deixaria un forat inexistent entre el 31 i l'1. */
export function mergeRanges(ranges: DateRange[]): DateRange[] {
  const sorted = [...ranges].sort((a, b) => a.from.localeCompare(b.from));
  const out: DateRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= nextDay(last.to)) {
      if (r.to > last.to) last.to = r.to;
    } else {
      out.push({ ...r });
    }
  }
  return out;
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * L'activitat per trams de dies, en una sola crida.
 *
 * ── Per què existeix ────────────────────────────────────────────────────────
 * Abans, ensenyar el calendari, l'historial i l'activitat recent volia dir
 * demanar mes a mes i, de cada mes, dues consultes (els entrenaments viuen a
 * una taula i els esports a una altra) amb **totes les sèries** de cada
 * sessió — perquè per pintar «6 exerc · 21 sèr · 4.2t» calia el `jsonb`
 * sencer. Obrir l'app i moure's tres mesos enrere eren dotze peticions i uns
 * quants centenars de quilobytes per ensenyar tres números per targeta.
 *
 * Aquí hi ha una sola pregunta: **què va passar entre aquests dos dies?** La
 * resposta porta entrenaments i esports barrejats, ja ordenats, amb el que
 * necessita la targeta plegada i cap sèrie. Les sèries es demanen quan
 * l'usuari obre la sessió, que és quan es miren.
 *
 * ── Com evita demanar dues vegades el mateix ────────────────────────────────
 * Es recorda quins trams ja han arribat (`_loaded`) i es fusionen els que es
 * toquen. `ensureRange()` mira si el que li demanen ja hi cap i, si hi cap, no
 * pregunta res. Quan no hi cap, demana **un sol tram** que cobreix tot el que
 * falta, encara que el forat estigui partit: val més una consulta d'un dia de
 * més que dues de justes.
 *
 * I mentre una consulta viatja, qualsevol altra petició espera i torna a
 * mirar. Sense això, l'arrencada —on Inici, el calendari i el perfil demanen
 * trams solapats el mateix milisegon— tornava a engegar la mateixa descàrrega
 * tres vegades.
 */
@Injectable({ providedIn: 'root' })
export class ActivityFeedService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);
  private offline  = inject(OfflineService);
  private settings = inject(UserSettingsService);
  /** Només per prendre la marca abans de preguntar (vegeu `FeedScope`). */
  private store    = inject(WorkoutStoreService);

  /** Trams ja rebuts del servidor, fusionats i ordenats. */
  private _loaded: DateRange[] = [];
  /** La consulta que hi ha ara mateix en marxa, si n'hi ha cap. */
  private _inFlight: Promise<void> | null = null;
  private _lastFullRefreshAt = 0;

  /** Cada quant el refresc cobreix tot el que s'ha arribat a demanar, i no
   *  només el tram calent. Vegeu `refreshLoaded()`. */
  private static readonly FULL_REFRESH_EVERY_MS = 5 * 60_000;

  private readonly _summaries = signal<Map<string, Workout>>(new Map());
  private readonly _sessions  = signal<Map<string, SportSession>>(new Map());
  private readonly _version   = signal(0);

  /** Hi ha una consulta de tram en marxa. Les seccions n'encenen el seu
   *  esquelet mentre esperen. */
  readonly loading = signal(false);

  /** L'últim tram que ha arribat sencer. Els dos magatzems s'hi enganxen per
   *  treure el que ja no hi és al servidor. */
  readonly lastScope = signal<FeedScope | null>(null);

  /** Les targetes dels entrenaments del que s'ha demanat, sense sèries. */
  readonly workoutSummaries = computed((): Workout[] => [...this._summaries().values()]);
  /** Les sessions d'esport del que s'ha demanat. */
  readonly sportSessions    = computed((): SportSession[] => [...this._sessions().values()]);

  /** Qui vulgui saber si un tram ja hi és sense demanar-lo (per ensenyar un
   *  esquelet o no) mira aquí. Depèn de `_version` a posta: és un senyal, i ha
   *  de tornar a mirar-s'ho quan arriba un tram nou. */
  readonly coverage = computed((): DateRange[] => { this._version(); return this._loaded; });

  constructor() {
    // Canviar d'usuari ho invalida tot: ni els trams ni les targetes de
    // l'anterior poden fer de resposta per a qui pregunti ara.
    effect(() => {
      this.auth.uid();
      untracked(() => this.reset());
    });
  }

  reset(): void {
    this._loaded = [];
    this._inFlight = null;
    this._lastFullRefreshAt = 0;
    this._summaries.set(new Map());
    this._sessions.set(new Map());
    this._version.update(v => v + 1);
    this.lastScope.set(null);
    this.loading.set(false);
  }

  /** Cert si tot el tram ja ha arribat. */
  covers(from: string, to: string): boolean {
    return this.coverage().some(r => r.from <= from && r.to >= to);
  }

  /**
   * Demana un tram, si no el tenim ja.
   *
   * `force` el torna a demanar encara que hi sigui: és el camí del refresc,
   * i l'únic que veu el que s'ha esborrat des d'un altre dispositiu — una
   * sessió que ja no hi és no surt a cap consulta de canvis, perquè no hi ha
   * cap fila que ho digui.
   */
  async ensureRange(from: string, to: string, force = false): Promise<void> {
    if (!this.auth.uid() || this.offline.isOffline()) return;

    // Una consulta en marxa pot ser justament la que ens falta: s'espera i es
    // torna a mirar abans de decidir res. El topall hi és perquè, si en van
    // entrant de noves sense parar, aquesta petició no es quedi esperant per
    // sempre — a la quarta ja pregunta pel seu compte.
    for (let i = 0; i < 4 && this._inFlight; i++) {
      await this._inFlight;
      if (!force && this.covers(from, to)) return;
    }
    if (!force && this.covers(from, to)) return;

    const p = this._fetch(from, to).finally(() => {
      this._inFlight = null;
      this.loading.set(false);
    });
    this._inFlight = p;
    this.loading.set(true);
    return p;
  }

  /**
   * El refresc en tornar a l'app.
   *
   * Es demana el tram **calent** —el que l'usuari té a la portada, i on passa
   * pràcticament tot el que canvia—, i el tram sencer només de tant en tant.
   * La diferència importa quan algú ha anat enrere al calendari: la seva
   * cobertura pot ser de dos anys, i tornar-la a demanar a cada canvi de
   * pestanya seria una resposta grossa per assabentar-se, gairebé sempre, que
   * no ha canviat res. Sigui com sigui és **una** consulta, no una per mes.
   */
  async refreshLoaded(hotFrom: string, hotTo: string): Promise<void> {
    const cov = this._loaded;
    if (!cov.length) return;

    const now  = Date.now();
    const full = now - this._lastFullRefreshAt > ActivityFeedService.FULL_REFRESH_EVERY_MS;
    if (full) this._lastFullRefreshAt = now;

    const from = full ? cov[0].from : hotFrom;
    const to   = full ? cov[cov.length - 1].to : hotTo;
    await this.ensureRange(from, to, true);
  }

  private async _fetch(from: string, to: string): Promise<void> {
    const since     = this.store.mark();
    const startedAt = Date.now();
    // De qui són les dades que estem demanant. Tancar la sessió i entrar-hi
    // amb un altre compte mentre la consulta viatja faria que la resposta de
    // l'anterior s'apliqués a sobre del nou.
    const forUid    = this.auth.uid();

    const { data, error } = await this.supabase.rpc('activity_feed', {
      p_from:       from,
      p_to:         to,
      p_bodyweight: this.settings.bodyweightKg(),
    });

    // Xarxa o servidor KO: es manté el que ja teníem i el tram no consta com
    // a rebut, així que la propera visita el tornarà a demanar.
    if (error) return;
    if (this.auth.uid() !== forUid) return;   // ja no és el mateix usuari

    const rows = (data ?? []) as FeedRow[];

    const summaries = new Map(this._summaries());
    const sessions  = new Map(this._sessions());

    // La resposta cobreix el tram sencer: el que hi falta i que teníem d'aquí
    // dins ja no hi és al servidor, i ha de marxar. Sense això, esborrar una
    // sessió des del mòbil la deixava per sempre a la pestanya de l'ordinador.
    for (const [id, w] of summaries) if (w.date >= from && w.date <= to) summaries.delete(id);
    for (const [id, s] of sessions)  if (s.date >= from && s.date <= to) sessions.delete(id);

    for (const r of rows) {
      if (r.kind === 'workout') summaries.set(r.item_id, toSummary(r));
      else if (r.sport_id)      sessions.set(r.item_id, toSession(r));
    }

    this._summaries.set(summaries);
    this._sessions.set(sessions);
    this._loaded = mergeRanges([...this._loaded, { from, to }]);
    this._version.update(v => v + 1);
    this.lastScope.set({
      from, to, since, startedAt,
      workoutIds: new Set(rows.filter(r => r.kind === 'workout').map(r => r.item_id)),
      sportIds:   new Set(rows.filter(r => r.kind === 'sport').map(r => r.item_id)),
    });
  }

  /**
   * Treu una sessió de les targetes.
   *
   * La crida qui la té de debò —el magatzem d'entrenaments o la cua d'esports—
   * quan l'usuari l'esborra: el resum és una foto del servidor i, si no es
   * treu, la targeta esborrada continuaria sortint fins al proper refresc.
   */
  forget(id: string): void {
    const summaries = this._summaries();
    if (summaries.has(id)) {
      const next = new Map(summaries);
      next.delete(id);
      this._summaries.set(next);
    }
    const sessions = this._sessions();
    if (sessions.has(id)) {
      const next = new Map(sessions);
      next.delete(id);
      this._sessions.set(next);
    }
  }
}
