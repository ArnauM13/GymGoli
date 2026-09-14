import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';

import { AuthService } from './auth.service';
import { OfflineService } from './offline.service';
import { SupabaseService } from './supabase.service';

/** Una activitat —un tipus d'entrenament o un esport— mirada de tota la vida. */
export interface ActivityCadence {
  kind:      'gym' | 'sport';
  /** El tipus d'entrenament (`push`, `bodypump`…) o l'id de l'esport. */
  key:       string;
  /** Quantes n'ha fet, de sempre. */
  sessions:  number;
  firstDate: string | null;
  lastDate:  string | null;
}

/** La clau amb què es busca dins del mapa. */
export function cadenceKey(kind: 'gym' | 'sport', key: string): string {
  return `${kind}:${key}`;
}

/**
 * Què fa temps que no fas, i cada quant ho feies.
 *
 * ── Per què existeix ────────────────────────────────────────────────────────
 * El dispositiu té la **finestra recent** —tres mesos— i això és el que ha de
 * tenir: vegeu `SYNC.md` §«Res no baixa tot». Però dins d'aquella finestra una
 * activitat dorment («el pàdel que feies cada dimarts fins al març») i una que
 * no has fet mai es llegeixen igual: cap sessió. I són dues coses molt
 * diferents de dir-li a algú.
 *
 * Per saber-ho no cal més historial al dispositiu, cal **una pregunta ben
 * feta**: `activity_cadence()` (migració 038) torna una fila per activitat amb
 * quantes n'ha fet, la primera i l'última. Una desena llarga de files per a qui
 * porta vuit anys entrenant igual que per a qui en porta dos, sense cap sèrie.
 *
 * ── Què no és ───────────────────────────────────────────────────────────────
 * No és una altra manera de llegir l'activitat: no porta sessions ni cobreix
 * cap tram, i qui vulgui saber què va passar un dia continua passant per
 * `WorkoutService.ensureRange()`. Aquí només hi ha el resum per activitat.
 *
 * Si la migració encara no s'ha executat, la crida falla i el mapa es queda
 * buit: el suggeriment perd el «hi tornem?» i continua funcionant amb la
 * finestra recent.
 */
@Injectable({ providedIn: 'root' })
export class ActivityCadenceService {
  private supabase = inject(SupabaseService).client;
  private auth     = inject(AuthService);
  private offline  = inject(OfflineService);

  private readonly _byKey = signal<Map<string, ActivityCadence>>(new Map());
  private _load: Promise<void> | null = null;
  private _loaded = false;

  /** El resum de cada activitat, per `cadenceKey()`. Buit mentre no ha
   *  arribat, i buit també si la migració no hi és. */
  readonly byKey = this._byKey.asReadonly();
  readonly loaded = computed(() => this._byKey().size > 0);

  constructor() {
    effect(() => {
      this.auth.uid();
      untracked(() => this.reset());
    });
  }

  reset(): void {
    this._byKey.set(new Map());
    this._load  = null;
    this._loaded = false;
  }

  get(kind: 'gym' | 'sport', key: string): ActivityCadence | undefined {
    return this._byKey().get(cadenceKey(kind, key));
  }

  ensureLoaded(): Promise<void> {
    if (this._loaded) return Promise.resolve();
    if (this._load) return this._load;
    const p = this._fetch().finally(() => { this._load = null; });
    this._load = p;
    return p;
  }

  private async _fetch(): Promise<void> {
    const forUid = this.auth.uid();
    if (!forUid || this.offline.isOffline()) return;

    try {
      const { data, error } = await this.supabase.rpc('activity_cadence');
      if (error) return;                        // es manté el que teníem
      if (this.auth.uid() !== forUid) return;   // ja no és el mateix usuari

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const map  = new Map<string, ActivityCadence>();
      for (const r of rows) {
        const kind = r['kind'] === 'sport' ? 'sport' : 'gym';
        const key  = String(r['activity_key'] ?? '');
        if (!key) continue;
        map.set(cadenceKey(kind, key), {
          kind, key,
          sessions:  Number(r['sessions'] ?? 0),
          firstDate: (r['first_date'] as string | null) ?? null,
          lastDate:  (r['last_date']  as string | null) ?? null,
        });
      }
      this._byKey.set(map);
      this._loaded = true;
    } catch {
      // Sense xarxa o sense migració: es torna a provar el proper cop.
    }
  }
}
