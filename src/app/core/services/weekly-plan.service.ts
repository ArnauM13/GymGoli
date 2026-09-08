import { Injectable, inject } from '@angular/core';

import { WorkoutService } from './workout.service';
import { SportService } from './sport.service';
import { RoutineProjectionService } from './routine-projection.service';
import { TemplateService } from './template.service';
import { addDays, mondayOf, workoutCategories } from '../../shared/utils/calendar-utils';
import { WeeklyPlan } from '../models/weekly-plan.model';
import { WorkoutEntry } from '../models/workout.model';
import { ExerciseCategory } from '../models/exercise.model';
import { TemplateEntry } from '../models/template.model';
import { todayStr } from '../../shared/utils/date.utils';

export const WEEKS_SINGLE    = 1;
/** Fins on arriba la rutina recurrent. Ja no s'escriu res: és l'horitzó fins
 *  al qual es **projecta** (vegeu `RoutineProjectionService`). */
export const WEEKS_RECURRING = 13;

/**
 * 'routine' = the persistent recurring routine (Configuració > Estableix
 * rutines); 'manual' = the user's own ad-hoc planning, whether a single
 * week planned from the calendar's "Planificar" action or a single day
 * planned directly on Train. Threaded through apply()/retractRemoved() so
 * editing or deleting one never touches items created by the other.
 */
export type PlanSource = 'routine' | 'manual';

const TODAY = (): string => todayStr();

/**
 * Converteix un pla setmanal en planificacions de debò.
 *
 * **Només per a les manuals.** La rutina recurrent ja no s'escriu: desar-la
 * escrivia 91 entrenaments planificats a la base de dades i els tornava a
 * escriure a cada canvi, per dir una cosa que ja consta a
 * `user_settings.weeklyPlan`. Ara es projecta al calendari des d'allà
 * (`RoutineProjectionService`) i el que es guarda és el que l'usuari acaba
 * fent. Una planificació manual —un dia concret triat a mà— no surt de cap
 * regla i no es pot deduir de res, així que aquella sí que és una fila.
 */
@Injectable({ providedIn: 'root' })
export class WeeklyPlanService {
  private workoutService  = inject(WorkoutService);
  private sportService    = inject(SportService);
  private templateService = inject(TemplateService);
  private routine         = inject(RoutineProjectionService);

  /** `startMonday` lets a caller target a specific week (e.g. "plan the week
   *  I'm viewing right now") instead of always anchoring to the current one.
   *  `source` tags every workout/session this creates so it can later be
   *  retracted independently of the other source (see `PlanSource`). */
  async apply(plan: WeeklyPlan, weeks: number, startMonday?: string, source: PlanSource = 'manual'): Promise<void> {
    if (source === 'routine') return;   // la rutina es projecta, no s'escriu
    const hasAnyItem = plan.days.some(items => items.length > 0);
    if (!hasAnyItem) return;

    const today  = TODAY();
    const monday = startMonday ?? mondayOf(today);

    const months = new Set<string>();
    for (let i = 0; i < weeks * 7; i++) months.add(addDays(monday, i).substring(0, 7));

    await Promise.allSettled([...months].flatMap(key => {
      const [year, month] = key.split('-').map(Number);
      return [
        this.workoutService.ensureMonthLoaded(year, month - 1),
        this.sportService.ensureMonthLoaded(year, month - 1),
      ];
    }));

    for (let w = 0; w < weeks; w++) {
      for (let dow = 0; dow < 7; dow++) {
        const date = addDays(monday, w * 7 + dow);
        if (date < today) continue;

        for (const item of plan.days[dow]) {
          try {
            if (item.type === 'gym') {
              const already =
                this.workoutService.getPlannedForDate(date).some(x => workoutCategories(x).includes(item.category)) ||
                this.workoutService.getDoneWorkoutsForDate(date).some(x => workoutCategories(x).includes(item.category));
              if (!already) {
                const entries = this._resolveEntries(item.entries, item.templateId);
                await this.workoutService.createPlannedWorkout(date, item.category, entries, source);
              }
            } else {
              const existing = this.sportService.getSessionForDate(date, item.sportId);
              if (!existing) {
                await this.sportService.logSession(
                  date, item.sportId, { subtypeId: item.subtypeId, duration: item.duration }, 'planned', source);
              }
            }
          } catch {
            // One item's creation failing (e.g. transient network error) shouldn't
            // abort the rest of the plan — gym/sport creation are already local-first.
          }
        }
      }
    }
  }

  /**
   * Removes future, still-`planned` workouts/sessions that this service
   * created but that the plan no longer wants for their weekday — e.g. the
   * user unchecked a category/sport, or deleted the whole plan. Only ever
   * touches items still in `planned` status (never a completed workout),
   * and only workouts/sessions whose `plannedSource` exactly matches
   * `source` — editing or deleting the routine never retracts a manually
   * planned item and vice versa. Legacy `plannedSource: 'self'` rows (from
   * before the routine/manual split existed) are left alone either way,
   * since there's no way to know which of the two they came from.
   */
  async retractRemoved(plan: WeeklyPlan, weeks: number, startMonday?: string, source: PlanSource = 'manual'): Promise<void> {
    if (source === 'routine') return;   // la rutina no té cap fila a retirar
    const today  = TODAY();
    const monday = startMonday ?? mondayOf(today);

    for (let w = 0; w < weeks; w++) {
      for (let dow = 0; dow < 7; dow++) {
        const date = addDays(monday, w * 7 + dow);
        if (date < today) continue;

        const desiredCats = new Set(
          plan.days[dow].filter(i => i.type === 'gym').map(i => (i as { category: ExerciseCategory }).category));
        const desiredSportIds = new Set(
          plan.days[dow].filter(i => i.type === 'sport').map(i => (i as { sportId: string }).sportId));

        for (const workout of this.workoutService.getPlannedForDate(date)) {
          if (workout.plannedSource !== source) continue;
          const stillWanted = workoutCategories(workout).some(c => desiredCats.has(c as ExerciseCategory));
          if (!stillWanted) {
            try { await this.workoutService.deleteWorkout(workout.id); } catch { /* retried on next save */ }
          }
        }

        for (const { sport, session } of this.sportService.getPlannedSportSessionsForDate(date)) {
          if (session.plannedSource !== source) continue;
          if (!desiredSportIds.has(sport.id)) {
            try { await this.sportService.deleteSession(session.id, date); } catch { /* retried on next save */ }
          }
        }
      }
    }
  }

  /**
   * Treu la rutina d'una setmana sencera, dia a dia.
   *
   * Ho fa el planificador quan l'usuari tria sobreescriure la rutina fixa amb
   * un pla d'una setmana. Com que la rutina no són files, «treure-la» vol dir
   * apuntar que aquells dies no compten — o la regla els tornaria a proposar.
   */
  async dismissRoutineWeek(monday: string): Promise<void> {
    const today = TODAY();
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      if (date < today) continue;
      const { gym, sport } = this.routine.projectedFor(date);
      for (const item of [...gym, ...sport]) await this.routine.dismiss(item.id);
    }
  }

  /** Resolves a gym item's exercises into WorkoutEntry[] — a custom, one-off
   *  list built directly in the planner takes priority over a saved
   *  template, same mapping used when starting a workout from a template
   *  on the Train page. */
  private _resolveEntries(customEntries: TemplateEntry[] | undefined, templateId: string | undefined): WorkoutEntry[] {
    if (customEntries && customEntries.length > 0) return this._mapEntries(customEntries);
    if (!templateId) return [];
    const t = this.templateService.templates().find(x => x.id === templateId);
    return t ? this._mapEntries(t.entries) : [];
  }

  private _mapEntries(entries: TemplateEntry[]): WorkoutEntry[] {
    return entries.map(e => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      sets: (e.sets && e.reps && e.sets > 0 && e.reps > 0)
        ? Array.from({ length: e.sets }, () => ({ weight: e.weight ?? 0, reps: e.reps! }))
        : [],
    }));
  }
}
