import { Injectable, computed, signal } from '@angular/core';

const LS_KEY = 'gymgoli_ongoing_workouts';

/**
 * Un entrenament que ha començat i encara no s'ha donat per acabat.
 *
 * Passa una hora entre la primera sèrie i l'última, i durant tota aquella
 * estona l'entrenament s'obre per **fer-lo**: un tap des d'Inici i ets a
 * dins, sense desplegar res. Quan el marques com a acabat passa a llegir-se
 * com qualsevol altre del teu historial.
 *
 * **Només viu en aquest dispositiu.** No es puja, no es sincronitza i no és
 * cap camp de l'entrenament: és l'estat d'una estona, no una dada de la
 * sessió. Per això, si no en tenim res —una altra pantalla, un altre
 * dispositiu, l'emmagatzematge buidat—, l'entrenament es dona per acabat: és
 * el que és cert gairebé sempre, i equivocar-s'hi només costa un tap de més.
 *
 * Un entrenament que ningú no ha marcat com a acabat tampoc no es queda «en
 * marxa» per sempre: passat un dia s'oblida sol, perquè un entrenament es fa
 * en hores.
 */
@Injectable({ providedIn: 'root' })
export class OngoingWorkoutService {
  /** Un entrenament dura hores, no dies: passat aquest temps, s'ha acabat. */
  static readonly MAX_AGE_MS = 24 * 60 * 60 * 1000;
  /** Prou per a qualsevol dia de debò; talla si alguna cosa s'encalla. */
  private static readonly MAX_KEPT = 20;

  /** Els que estan en marxa, amb quan van començar. */
  private readonly started = signal<Record<string, number>>(OngoingWorkoutService._load());

  /** Els ids en marxa ara mateix, ja sense els que s'han fet vells. */
  readonly ongoingIds = computed((): Set<string> => {
    const cutoff = Date.now() - OngoingWorkoutService.MAX_AGE_MS;
    return new Set(Object.entries(this.started()).filter(([, at]) => at > cutoff).map(([id]) => id));
  });

  /** Cert mentre l'entrenament no s'hagi donat per acabat. */
  isOngoing(id: string): boolean {
    return this.ongoingIds().has(id);
  }

  /** Comença: tot entrenament acabat de crear està en marxa. */
  start(id: string): void {
    this.started.update(prev => this._persist({ ...prev, [id]: Date.now() }));
  }

  /** Acabat. A partir d'aquí es llegeix com qualsevol altre. */
  finish(id: string): void {
    this.forget(id);
  }

  /** Se n'ha anat (esborrat, o ja no ens interessa): fora del registre. */
  forget(id: string): void {
    if (!(id in this.started())) return;
    this.started.update(prev => {
      const next = { ...prev };
      delete next[id];
      return this._persist(next);
    });
  }

  /** Es guarda ja podat: el que és vell no ha de tornar mai més. */
  private _persist(entries: Record<string, number>): Record<string, number> {
    const cutoff = Date.now() - OngoingWorkoutService.MAX_AGE_MS;
    const kept = Object.entries(entries)
      .filter(([, at]) => at > cutoff)
      .sort((a, b) => b[1] - a[1])
      .slice(0, OngoingWorkoutService.MAX_KEPT);
    const next = Object.fromEntries(kept);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); }
    catch { /* mode privat o quota plena: només perdem la persistència */ }
    return next;
  }

  private static _load(): Record<string, number> {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const cutoff = Date.now() - OngoingWorkoutService.MAX_AGE_MS;
      return Object.fromEntries(
        Object.entries(parsed ?? {})
          .filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > cutoff)
      );
    } catch {
      return {};
    }
  }
}
