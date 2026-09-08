import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AuthService } from './auth.service';
import { OfflineService } from './offline.service';
import { SupabaseService } from './supabase.service';
import { UserSettingsService } from './user-settings.service';

/** El que se sap d'un exercici mirant tot l'historial, comptat al servidor. */
export interface ExerciseRecord {
  exerciseId: string;
  /** Quantes sessions hi porta. */
  sessions:   number;
  /** El pes més alt que hi has mogut, en sèries de feina, amb el pes corporal
   *  i el tipus de càrrega ja aplicats. */
  maxWeight:  number;
  lastDate:   string | null;
}

/** Els totals de tota la vida de l'usuari. */
export interface WorkoutTotals {
  totalDone: number;
  firstDate: string | null;
  lastDate:  string | null;
}

/**
 * Les xifres que només tenen sentit mirant tot l'historial.
 *
 * ── Per què existeix ────────────────────────────────────────────────────────
 * La pàgina de Gràfiques ensenya, de cada exercici, el rècord — i un rècord
 * calculat amb mitja història no és un rècord. Per treure'l es baixava **tota
 * la vida de l'usuari amb totes les sèries**, cada pes i cada repetició de
 * cada exercici, per acabar quedant-se amb un sol número de cadascun.
 *
 * La pregunta era bona; qui la contestava, no. Agregar és feina del servidor:
 * sap fer-ho amb índexs i torna el resultat, no les dades per calcular-lo.
 * Aquí hi ha dues consultes que tornen números —`exercise_records` i
 * `workout_totals` (migració 033)— i que no creixen amb l'historial: qui porta
 * vuit anys entrenant en rep tants com qui en porta dos, perquè el que torna
 * és una fila per exercici.
 *
 * Els rècords depenen del pes corporal (unes dominades amb +5 kg són el teu
 * cos més 5), així que es tornen a demanar si el canvies.
 */
@Injectable({ providedIn: 'root' })
export class WorkoutStatsService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);
  private offline  = inject(OfflineService);
  private settings = inject(UserSettingsService);

  private readonly _records = signal<Map<string, ExerciseRecord>>(new Map());
  private readonly _totals  = signal<WorkoutTotals | null>(null);
  private _load: Promise<void> | null = null;
  /** El pes corporal amb què es van demanar els rècords que tenim. */
  private _loadedFor: number | null | undefined = undefined;

  readonly loading = signal(false);

  /** Els rècords per exercici. Buit mentre no han arribat: qui en depèn val
   *  més que no digui res que no una xifra a mitges. */
  readonly records = this._records.asReadonly();
  readonly totals  = this._totals.asReadonly();
  readonly loaded  = computed(() => this._totals() !== null);

  constructor() {
    effect(() => {
      this.auth.uid();
      untracked(() => this.reset());
    });

    // Canviar-se el pes al perfil canvia el rècord de les dominades i dels
    // fons assistits: si no es tornessin a demanar, la pàgina ensenyaria els
    // d'abans fins a la propera visita.
    effect(() => {
      const bw = this.settings.bodyweightKg();
      if (this._loadedFor === undefined || this._loadedFor === bw) return;
      untracked(() => { this._loadedFor = undefined; void this.ensureLoaded(); });
    });
  }

  reset(): void {
    this._records.set(new Map());
    this._totals.set(null);
    this._load = null;
    this._loadedFor = undefined;
    this.loading.set(false);
  }

  /** Un exercici, o `undefined` si encara no ha arribat res o no en té dades. */
  recordFor(exerciseId: string): ExerciseRecord | undefined {
    return this._records().get(exerciseId);
  }

  ensureLoaded(): Promise<void> {
    if (this._loadedFor !== undefined) return Promise.resolve();
    if (this._load) return this._load;
    this.loading.set(true);
    const p = this._fetch().finally(() => { this._load = null; this.loading.set(false); });
    this._load = p;
    return p;
  }

  private async _fetch(): Promise<void> {
    const forUid = this.auth.uid();
    if (!forUid || this.offline.isOffline()) return;
    const bodyweight = this.settings.bodyweightKg();

    try {
      const [recordsRes, totalsRes] = await Promise.all([
        this.supabase.rpc('exercise_records', { p_bodyweight: bodyweight }),
        this.supabase.rpc('workout_totals'),
      ]);
      if (recordsRes.error || totalsRes.error) return;   // es manté el que teníem
      if (this.auth.uid() !== forUid) return;            // ja no és el mateix usuari

      const rows = (recordsRes.data ?? []) as Array<Record<string, unknown>>;
      this._records.set(new Map(rows.map(r => [
        r['exercise_id'] as string,
        {
          exerciseId: r['exercise_id'] as string,
          sessions:   Number(r['sessions'] ?? 0),
          maxWeight:  Number(r['max_weight'] ?? 0),
          lastDate:   (r['last_date'] as string | null) ?? null,
        },
      ])));

      const t = ((totalsRes.data ?? []) as Array<Record<string, unknown>>)[0];
      this._totals.set({
        totalDone: Number(t?.['total_done'] ?? 0),
        firstDate: (t?.['first_date'] as string | null) ?? null,
        lastDate:  (t?.['last_date']  as string | null) ?? null,
      });
      this._loadedFor = bodyweight;
    } catch {
      // Sense xarxa: es manté el que hi ha, i el proper cop es torna a provar.
    }
  }
}
