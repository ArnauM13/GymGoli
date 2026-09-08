import { Injectable, computed, inject } from '@angular/core';

import { TemplateService } from './template.service';
import { TodayService } from './today.service';
import { UserSettingsService } from './user-settings.service';
import { WeeklyPlanItem } from '../models/weekly-plan.model';
import { WorkoutEntry } from '../models/workout.model';
import { TemplateEntry } from '../models/template.model';
import { addDays, mondayOf } from '../../shared/utils/calendar-utils';

/** Fins on endavant es projecta la rutina: ~3 mesos, el mateix horitzó que
 *  abans es materialitzava a la base de dades. */
export const ROUTINE_HORIZON_DAYS = 13 * 7;

/** El prefix que fa reconeixible un planificat projectat. Vegeu
 *  `isRoutineProjection()`. */
const ROUTINE_ID_PREFIX = 'routine:';

/** Cert si aquest id és una projecció de la rutina i no una fila de debò.
 *  Qui l'hagi de començar o esborrar ho ha de mirar: no hi ha res a editar
 *  ni a esborrar al servidor. */
export function isRoutineProjection(id: string): boolean {
  return id.startsWith(ROUTINE_ID_PREFIX);
}

export function routineGymId(date: string, category: string): string {
  return `${ROUTINE_ID_PREFIX}${date}:gym:${category}`;
}

export function routineSportId(date: string, sportId: string): string {
  return `${ROUTINE_ID_PREFIX}${date}:sport:${sportId}`;
}

/** Una activitat de gimnàs que la rutina diu que toca aquell dia. */
export interface ProjectedGym {
  id:       string;
  date:     string;
  category: string;
  entries:  WorkoutEntry[];
}

/** El mateix per a un esport. */
export interface ProjectedSport {
  id:         string;
  date:       string;
  sportId:    string;
  subtypeId?: string;
  duration?:  number;
}

/**
 * La rutina, projectada al calendari en comptes de materialitzada.
 *
 * ── Per què ─────────────────────────────────────────────────────────────────
 * Establir una rutina escrivia **91 entrenaments planificats** a la base de
 * dades: tretze setmanes per set dies, cada dia amb els seus exercicis. Cada
 * cop que en canviaves un dia s'esborraven i es tornaven a escriure. I com que
 * són files com qualsevol altra, viatjaven a cada consulta, ocupaven espai al
 * dispositiu i s'havien de sincronitzar entre dispositius — tot per dir una
 * cosa que ja se sabia: que els dilluns fas empenta.
 *
 * Perquè la rutina ja és a `user_settings.weeklyPlan`: **un sol jsonb**, petit,
 * que ja se sincronitza sol. Les 91 files no hi afegien cap informació. Eren
 * una còpia desplegada d'un càlcul que es pot fer aquí, i que a més es podia
 * desaparellar de l'original.
 *
 * ── Què continua sent una fila ──────────────────────────────────────────────
 * Les planificacions **manuals** —un dia concret que tries a mà— no surten de
 * cap regla i no es poden deduir de res: aquelles es guarden com sempre. I
 * quan comences un dia projectat, aquell sí que es converteix en entrenament
 * de debò i es guarda: la base de dades es queda amb el que has fet, no amb
 * el que et proposaves fer.
 *
 * ── Com se sap què hi ha d'haver ────────────────────────────────────────────
 * Aquest servei només diu **què proposa la rutina** per a un dia. Si aquell
 * dia ja hi ha un entrenament de debò d'aquell tipus, qui ho ha de saber és
 * qui té els entrenaments — `WorkoutService` i `SportService` filtren la
 * projecció amb el que ja tenen. Fer-ho aquí voldria dir que aquest servei
 * depengués d'ells i ells d'aquest.
 */
@Injectable({ providedIn: 'root' })
export class RoutineProjectionService {
  private settings  = inject(UserSettingsService);
  private templates = inject(TemplateService);
  private today     = inject(TodayService);

  /** Els dies que l'usuari ha tret de la rutina un per un («avui no»). Sense
   *  això, esborrar un planificat projectat no faria res: tornaria a sortir
   *  al següent càlcul, perquè la regla que el genera no ha canviat. */
  private readonly _dismissed = computed(() =>
    new Set(this.settings.dismissedRoutinePlans())
  );

  /** La rutina recurrent, si n'hi ha. Un pla desat però no recurrent és una
   *  setmana solta que ja s'ha materialitzat com a manual. */
  private readonly _plan = computed(() => {
    const plan = this.settings.weeklyPlan();
    return plan?.recurring ? plan : null;
  });

  /** Cert si la rutina proposa alguna cosa. */
  readonly hasRoutine = computed(() => {
    const plan = this._plan();
    return !!plan && plan.days.some(items => items.length > 0);
  });

  /**
   * Què proposa la rutina per a aquest dia.
   *
   * Només endavant: una rutina que no vas complir el mes passat no és un
   * planificat pendent, és un dia que no vas entrenar, i omplir l'historial
   * de fantasmes seria pitjor que no dir res.
   */
  projectedFor(date: string): { gym: ProjectedGym[]; sport: ProjectedSport[] } {
    const empty = { gym: [], sport: [] };
    const plan  = this._plan();
    if (!plan) return empty;

    const today = this.today.today();
    if (date < today) return empty;
    if (date > addDays(today, ROUTINE_HORIZON_DAYS)) return empty;

    const items = plan.days[this._weekday(date)] ?? [];
    if (!items.length) return empty;

    const dismissed = this._dismissed();
    const gym:   ProjectedGym[]   = [];
    const sport: ProjectedSport[] = [];

    for (const item of items) {
      if (item.type === 'gym') {
        const id = routineGymId(date, item.category);
        if (dismissed.has(id)) continue;
        gym.push({ id, date, category: item.category, entries: this._resolveEntries(item) });
      } else {
        const id = routineSportId(date, item.sportId);
        if (dismissed.has(id)) continue;
        sport.push({ id, date, sportId: item.sportId, subtypeId: item.subtypeId, duration: item.duration });
      }
    }
    return { gym, sport };
  }

  /** Treu un dia concret de la rutina, sense tocar la regla. */
  async dismiss(id: string): Promise<void> {
    const current = this.settings.dismissedRoutinePlans();
    if (current.includes(id)) return;
    // Es talla per quantitat i es netegen els que ja han passat: un dia tret
    // fa mig any no filtra res, i la llista viu dins `user_settings`.
    const today = this.today.today();
    const kept  = current.filter(key => this._dateOf(key) >= today);
    await this.settings.update({ dismissedRoutinePlans: [...kept, id].slice(-200) });
  }

  /** Un dia projectat que es converteix en entrenament de debò ja no s'ha de
   *  tornar a proposar: qui el materialitza també l'ha de retirar. */
  materialized(id: string): Promise<void> { return this.dismiss(id); }

  /** 0 = dilluns … 6 = diumenge, que és com està indexat `plan.days`. */
  private _weekday(date: string): number {
    const monday = mondayOf(date);
    for (let i = 0; i < 7; i++) if (addDays(monday, i) === date) return i;
    return 0;
  }

  /** La data que porta l'id d'una projecció (`routine:<data>:…`). */
  private _dateOf(id: string): string {
    return id.slice(ROUTINE_ID_PREFIX.length, ROUTINE_ID_PREFIX.length + 10);
  }

  /** Una llista d'exercicis feta a mà al planificador mana sobre la plantilla,
   *  igual que quan es materialitzava. */
  private _resolveEntries(item: Extract<WeeklyPlanItem, { type: 'gym' }>): WorkoutEntry[] {
    if (item.entries?.length) return this._mapEntries(item.entries);
    if (!item.templateId) return [];
    const t = this.templates.templates().find(x => x.id === item.templateId);
    return t ? this._mapEntries(t.entries) : [];
  }

  private _mapEntries(entries: TemplateEntry[]): WorkoutEntry[] {
    return entries.map(e => ({
      exerciseId:   e.exerciseId,
      exerciseName: e.exerciseName,
      sets: (e.sets && e.reps && e.sets > 0 && e.reps > 0)
        ? Array.from({ length: e.sets }, () => ({ weight: e.weight ?? 0, reps: e.reps! }))
        : [],
    }));
  }
}
