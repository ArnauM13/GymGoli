import { Injectable, signal } from '@angular/core';

/**
 * Què ha passat amb un entrenament, pas a pas.
 *
 * `local-write` és l'únic que passa sempre; la resta depèn de si hi ha
 * connexió. Llegint-los en ordre es veu tot el viatge d'una sessió: es guarda
 * al dispositiu, s'encua, s'envia, i el servidor la confirma.
 */
export type SyncLogEvent =
  | 'local-write'   // s'ha guardat al dispositiu (això no falla mai)
  | 'local-delete'  // esborrat al dispositiu, pendent de dir-ho al servidor
  | 'flush-start'   // comença una tanda d'enviaments
  | 'push-ok'       // el servidor ha acceptat la sessió
  | 'push-fail'     // no ha pogut sortir (sense xarxa, servidor KO)
  | 'push-stale'    // ha sortit, però mentrestant s'ha tornat a editar: es reenviarà
  | 'push-missing'  // el servidor ja no té la fila: esborrada des d'un altre lloc
  | 'delete-ok'     // esborrat confirmat al servidor
  | 'pull-adopt'    // ens quedem la versió del servidor
  | 'pull-keep'     // ens quedem la local, que encara no ha pujat
  | 'pull-remove'   // ha desaparegut del servidor: fora d'aquí també
  | 'prune';        // s'allibera espai d'un mes ja sincronitzat

export interface SyncLogEntry {
  /** Hora local en ISO, que és com es mira contra el que veus a la pantalla. */
  at:      string;
  event:   SyncLogEvent;
  /** Id de l'entrenament, quan l'esdeveniment en té un. */
  id?:     string;
  /** Revisió local implicada — la peça que fa que un ack no esborri una edició
   *  més nova. */
  rev?:    number;
  /** Nombre de sèries en joc: el que fa evident una pèrdua de dades. */
  sets?:   number;
  /** Text lliure per al detall que no encaixa als camps de sobre. */
  note?:   string;
}

const MAX_ENTRIES = 400;

/**
 * Diari de la sincronització, guardat al propi dispositiu.
 *
 * Quan un entrenament arriba buit a la base de dades, sense rastre només es
 * pot deduir què ha passat. Amb el diari es llegeix: aquí es va guardar amb 12
 * sèries, aquí va sortir cap al servidor, i aquí el servidor va contestar.
 *
 * És un anell de mida fixa: escriu-hi tant com calgui, que mai passarà d'uns
 * quants KB ni deixarà el dispositiu sense espai.
 */
@Injectable({ providedIn: 'root' })
export class SyncLogService {
  private static readonly LS_KEY = 'gymgoli_sync_log';

  private readonly _entries = signal<SyncLogEntry[]>(this._read());

  /** Del més recent al més antic, que és l'ordre en què es mira. */
  readonly entries = this._entries.asReadonly();

  log(event: SyncLogEvent, detail: Omit<SyncLogEntry, 'at' | 'event'> = {}): void {
    const entry: SyncLogEntry = { at: new Date().toISOString(), event, ...detail };
    const next = [entry, ...this._entries()].slice(0, MAX_ENTRIES);
    this._entries.set(next);
    this._write(next);
  }

  clear(): void {
    this._entries.set([]);
    try { localStorage.removeItem(SyncLogService.LS_KEY); } catch { /* res a fer */ }
  }

  private _read(): SyncLogEntry[] {
    try {
      const raw = localStorage.getItem(SyncLogService.LS_KEY);
      return raw ? (JSON.parse(raw) as SyncLogEntry[]) : [];
    } catch { return []; }
  }

  private _write(entries: SyncLogEntry[]): void {
    try { localStorage.setItem(SyncLogService.LS_KEY, JSON.stringify(entries)); }
    catch { /* sense espai: el diari és el primer que es pot perdre */ }
  }
}
