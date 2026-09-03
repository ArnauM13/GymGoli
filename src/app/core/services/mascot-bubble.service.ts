import { Injectable, signal } from '@angular/core';
import { todayStr } from '../../shared/utils/date.utils';

const LS_KEY = 'gymgoli_mascot_bubble';

const TODAY = (): string => todayStr();

interface Stored {
  /** Dia al qual pertanyen les claus desades. Si canvia, es buida tot. */
  date: string;
  keys: string[];
}

/**
 * Recorda quines bafarades has tancat avui.
 *
 * La regla que evita que siguin invasives: una bafarada tancada no torna en
 * tot el dia, però l'endemà sí. Prou perquè no molesti i prou perquè els
 * gossos segueixin apareixent.
 *
 * Es guarda a `localStorage` i no a `sessionStorage` a posta: si tanques la
 * bafarada i tornes a obrir l'app mitja hora després, no ha de tornar a sortir.
 */
@Injectable({ providedIn: 'root' })
export class MascotBubbleService {
  private readonly dismissed = signal<Set<string>>(MascotBubbleService._load());

  private static _load(): Set<string> {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return new Set();
      const parsed = JSON.parse(raw) as Stored;
      return parsed?.date === TODAY() ? new Set(parsed.keys ?? []) : new Set();
    } catch {
      return new Set();
    }
  }

  /** `true` mentre la bafarada d'aquesta clau no s'hagi tancat avui. */
  isOpen(key: string): boolean {
    return !this.dismissed().has(key);
  }

  dismiss(key: string): void {
    if (this.dismissed().has(key)) return;
    this.dismissed.update(prev => {
      const next = new Set([...prev, key]);
      try {
        const payload: Stored = { date: TODAY(), keys: [...next] };
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
      } catch { /* mode privat o quota plena: només perdem la persistència */ }
      return next;
    });
  }
}
