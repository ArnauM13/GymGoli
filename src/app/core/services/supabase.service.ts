import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';

/**
 * Pany entre pestanyes per al refresc del testimoni de sessió.
 *
 * Supabase rota el testimoni de refresc cada cop que el fa servir: el vell
 * deixa de valdre. Amb dues pestanyes obertes (o l'app i el mòbil al mateix
 * navegador), les dues arriben al moment de refrescar alhora, les dues envien
 * el mateix testimoni i la segona el troba ja gastat — la sessió cau i
 * l'usuari es troba fora sense haver tocat res. Abans aquí hi havia un pany
 * fals que executava la crida directament i no coordinava res.
 *
 * `navigator.locks` és exactament l'eina per a això: la primera pestanya
 * refresca i la resta esperen i es troben la feina feta. Es fa a mà, i no amb
 * el pany que porta la llibreria, perquè el seu escriu a la consola en camins
 * que aquí no interessen.
 *
 * `acquireTimeout === 0` vol dir «si el té algú altre, no esperis»: és el
 * refresc automàtic de fons, i saltar-se'l quan una altra pestanya ja hi és
 * és el comportament correcte. `isAcquireTimeout` és la marca que hi busca la
 * llibreria per distingir-ho d'un error de debò.
 */
async function crossTabLock<R>(name: string, acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) return fn();

  if (acquireTimeout === 0) {
    return locks.request(name, { mode: 'exclusive', ifAvailable: true }, lock => {
      if (lock) return fn();
      const busy = new Error(`el pany "${name}" el té una altra pestanya`) as Error & { isAcquireTimeout: boolean };
      busy.isAcquireTimeout = true;
      throw busy;
    }) as Promise<R>;
  }

  return locks.request(name, { mode: 'exclusive' }, () => fn()) as Promise<R>;
}

@Injectable({ providedIn: 'root' })
export class SupabaseService {
  readonly client: SupabaseClient = createClient(
    environment.supabase.url,
    environment.supabase.anonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        lock: crossTabLock,
      },
    }
  );
}
