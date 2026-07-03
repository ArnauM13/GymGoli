import { Component, computed, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { WeeklyPlanService, WEEKS_RECURRING, WEEKS_SINGLE } from '../../core/services/weekly-plan.service';
import { TemplateService } from '../../core/services/template.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, Exercise, ExerciseCategory } from '../../core/models/exercise.model';
import { EMPTY_WEEKLY_PLAN, WEEKDAY_LABELS, WeeklyPlan, WeeklyPlanItem } from '../../core/models/weekly-plan.model';
import { TemplateEntry, WorkoutTemplate } from '../../core/models/template.model';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';
import { addDays, weekRangeLabel } from '../../shared/utils/calendar-utils';

const GYM_CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs'];

@Component({
  selector: 'app-weekly-planner',
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header [title]="weekMonday ? 'Planifica la setmana' : 'Planificació setmanal'" [showBack]="true">
        @if (!weekMonday && hasSavedPlan()) {
          <button class="ph-delete-btn" (click)="deletePlan()" title="Eliminar planificació" aria-label="Eliminar planificació">
            <span class="material-symbols-outlined">delete</span>
          </button>
        }
      </app-page-header>

      <div class="mode-banner">
        <span class="material-symbols-outlined mode-banner-icon">{{ weekMonday ? 'event' : 'event_repeat' }}</span>
        <span class="mode-banner-text">
          @if (weekMonday; as monday) {
            Només per a la setmana del {{ weekRange(monday) }}. La resta de setmanes no es veuran afectades.
          } @else {
            Aquesta configuració s'aplica cada setmana, de manera indefinida.
          }
        </span>
      </div>

      @for (day of days; track day.index) {
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">today</span>
            <h2 class="section-title">{{ day.label }}</h2>
            @if (itemCount(day.index) > 0) {
              <span class="section-count">{{ itemCount(day.index) }}</span>
            }
          </div>

          <div class="chip-group-label">Gym</div>
          <div class="filter-bar">
            @for (cat of gymCategories; track cat) {
              <button class="filter-chip"
                      [class.active]="isGymSelected(day.index, cat)"
                      [style.--cat-color]="categoryColor(cat)"
                      (click)="toggleGym(day.index, cat)">
                <span class="material-symbols-outlined">{{ categoryIcon(cat) }}</span>
                {{ categoryLabel(cat) }}
              </button>
            }
          </div>

          @for (cat of gymCategories; track cat) {
            @if (isGymSelected(day.index, cat)) {
              <div class="tpl-row">
                <span class="tpl-row-label">{{ categoryLabel(cat) }}, en detall</span>

                @if (templatesFor(cat).length > 0) {
                  <div class="filter-bar tpl-chips">
                    <button class="filter-chip tpl-chip"
                            [class.active]="!gymTemplate(day.index, cat)"
                            (click)="setGymTemplate(day.index, cat, undefined)">
                      Buit
                    </button>
                    @for (t of templatesFor(cat); track t.id) {
                      <button class="filter-chip tpl-chip"
                              [class.active]="gymTemplate(day.index, cat) === t.id"
                              (click)="setGymTemplate(day.index, cat, t.id)">
                        <span class="material-symbols-outlined">bookmark</span>
                        {{ t.name }}
                      </button>
                    }
                  </div>
                }

                <div class="custom-ex-row">
                  <div class="custom-ex-chips">
                    @for (e of gymEntries(day.index, cat); track e.exerciseId) {
                      <span class="custom-ex-chip">
                        {{ e.exerciseName }}
                        <button type="button" class="custom-ex-remove"
                                (click)="removeGymEntry(day.index, cat, e.exerciseId)"
                                aria-label="Treure exercici">
                          <span class="material-symbols-outlined">close</span>
                        </button>
                      </span>
                    }
                    <button type="button" class="add-ex-btn" (click)="openExercisePicker(day.index, cat)">
                      <span class="material-symbols-outlined">add</span>
                      Afegir exercici
                    </button>
                  </div>
                </div>
              </div>
            }
          }

          @if (sportService.sports().length > 0) {
            <div class="chip-group-label">Esport</div>
            <div class="filter-bar">
              @for (sport of sportService.sports(); track sport.id) {
                <button class="filter-chip"
                        [class.active]="isSportSelected(day.index, sport.id)"
                        [style.--cat-color]="sport.color"
                        (click)="toggleSport(day.index, sport.id)">
                  <span class="material-symbols-outlined">{{ sport.icon }}</span>
                  {{ sport.name }}
                </button>
              }
            </div>

            @for (sport of sportService.sports(); track sport.id) {
              @if (isSportSelected(day.index, sport.id)) {
                <div class="tpl-row">
                  <span class="tpl-row-label">{{ sport.name }}, en detall</span>

                  @if (sport.subtypes.length > 0) {
                    <div class="filter-bar tpl-chips">
                      <button class="filter-chip tpl-chip"
                              [class.active]="!sportSubtype(day.index, sport.id)"
                              (click)="setSportSubtype(day.index, sport.id, undefined)">
                        Cap
                      </button>
                      @for (st of sport.subtypes; track st.id) {
                        <button class="filter-chip tpl-chip"
                                [class.active]="sportSubtype(day.index, sport.id) === st.id"
                                (click)="setSportSubtype(day.index, sport.id, st.id)">
                          {{ st.name }}
                        </button>
                      }
                    </div>
                  }

                  <div class="sport-duration-row">
                    <span class="sport-duration-label">Durada (min)</span>
                    <input class="sport-duration-input" type="number" min="0" step="5"
                           [value]="sportDuration(day.index, sport.id) ?? ''"
                           (change)="setSportDuration(day.index, sport.id, numFromEvent($event))"
                           placeholder="Opcional">
                  </div>
                </div>
              }
            }
          }

        </div>
      }

      <div class="save-bar">
        <button class="btn-primary save-btn" (click)="save()" [disabled]="saving()">
          @if (saving()) {
            <span class="material-symbols-outlined spin">sync</span>
          } @else {
            <span class="material-symbols-outlined">check</span>
          }
          {{ weekMonday ? 'Planificar la setmana' : 'Desar planificació' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 0 0 100px; }

    .card-section {
      margin: 12px 16px 0;
      padding: 14px 14px 16px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
    .section-icon  { font-size: 18px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }
    .section-count {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      background: var(--c-subtle); border-radius: 10px; padding: 2px 8px;
    }

    .mode-banner {
      display: flex; align-items: flex-start; gap: 8px;
      margin: 12px 16px 0; padding: 10px 12px;
      background: rgba(var(--c-brand-rgb), 0.06); border-radius: 12px;
      border: 1px solid rgba(var(--c-brand-rgb), 0.15);
    }
    .mode-banner-icon {
      font-size: 16px; color: var(--c-brand); flex-shrink: 0; margin-top: 1px;
      font-variation-settings: 'FILL' 1;
    }
    .mode-banner-text { font-size: 12px; color: var(--c-text-2); line-height: 1.4; }

    .chip-group-label {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px;
      margin: 0 0 6px;
    }
    .filter-bar {
      display: flex; gap: 6px; flex-wrap: wrap;
      padding: 0 0 12px;
    }
    .filter-bar:last-of-type { padding-bottom: 0; }
    .filter-chip {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 12px;
      border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card);
      font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; white-space: nowrap; touch-action: manipulation;
      transition: all 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover:not(.active) { border-color: var(--cat-color, var(--c-brand)); color: var(--cat-color, var(--c-brand)); }
      &.active { background: var(--cat-color, var(--c-brand)); border-color: var(--cat-color, var(--c-brand)); color: white; }
    }

    .tpl-row { margin: 10px 0 12px; padding-left: 4px; }
    .tpl-row-label {
      display: block; font-size: 10.5px; font-weight: 600; color: var(--c-text-3);
      margin-bottom: 6px;
    }
    .tpl-chips { padding: 0 0 8px; }
    .tpl-chip {
      padding: 4px 10px; font-size: 11px;
      .material-symbols-outlined { font-size: 13px; }
    }

    .custom-ex-row { }
    .custom-ex-chips { display: flex; flex-wrap: wrap; gap: 6px; }
    .custom-ex-chip {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 4px 4px 10px;
      border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-subtle);
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
    }
    .custom-ex-remove {
      display: flex; align-items: center; justify-content: center;
      width: 16px; height: 16px; border-radius: 50%; border: none; flex-shrink: 0;
      background: var(--c-border-2); color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation;
      .material-symbols-outlined { font-size: 12px; }
      &:hover { background: #ef5350; color: white; }
    }
    .add-ex-btn {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 10px 4px 8px;
      border: 1.5px dashed var(--c-border); border-radius: 20px;
      background: transparent; color: var(--c-brand);
      font-size: 11px; font-weight: 600; cursor: pointer; touch-action: manipulation;
      transition: all 0.15s;
      .material-symbols-outlined { font-size: 14px; }
      &:hover { background: rgba(var(--c-brand-rgb), 0.06); border-style: solid; }
    }

    .sport-duration-row { display: flex; align-items: center; gap: 8px; }
    .sport-duration-label { font-size: 11px; font-weight: 600; color: var(--c-text-3); }
    .sport-duration-input {
      width: 76px; padding: 6px 10px;
      border: 1.5px solid var(--c-border); border-radius: 10px;
      background: var(--c-card); font-size: 12px; color: var(--c-text); outline: none;
      box-sizing: border-box;
      &:focus { border-color: var(--c-brand); }
    }

    .save-bar {
      position: fixed; left: 16px; right: 16px;
      bottom: calc(var(--nav-height) + 16px);
      z-index: 89;
    }
    .btn-primary {
      padding: 8px 16px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
    }
    .save-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 13px 16px; font-size: 14px;
      box-shadow: 0 4px 16px var(--c-shadow-md);
      .material-symbols-outlined { font-size: 18px; }
      &:disabled { opacity: 0.6; cursor: default; }
    }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }

    .ph-delete-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none; flex-shrink: 0;
      background: var(--c-subtle); color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: background 0.15s, color 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(239,83,80,0.1); color: #ef5350; }
    }
  `],
})
export class WeeklyPlannerComponent {
  private settingsService  = inject(UserSettingsService);
  private weeklyPlanService = inject(WeeklyPlanService);
  private workoutService   = inject(WorkoutService);
  readonly sportService    = inject(SportService);
  private templateService  = inject(TemplateService);
  private snackBar         = inject(MatSnackBar);
  private confirmDialog    = inject(ConfirmDialogService);
  private dialog           = inject(MatDialog);
  private route            = inject(ActivatedRoute);

  readonly gymCategories  = GYM_CATEGORIES;
  readonly days = WEEKDAY_LABELS.map((label, index) => ({ label, index }));

  /** Monday of a single week to plan (from the calendar's "Planificar" action),
   *  or null when editing the persistent routine from Configuració. */
  readonly weekMonday = this.route.snapshot.queryParamMap.get('week');

  readonly saving = signal(false);
  readonly plan = signal<WeeklyPlan>(this._clone(this.settingsService.weeklyPlan() ?? EMPTY_WEEKLY_PLAN));

  readonly hasSavedPlan = computed(() => {
    const p = this.settingsService.weeklyPlan();
    return p.recurring || p.days.some(items => items.length > 0);
  });

  constructor() {
    this.sportService.ensureLoaded();
  }

  private _clone(plan: WeeklyPlan): WeeklyPlan {
    return { recurring: plan.recurring, days: plan.days.map(items => [...items]) };
  }

  weekRange(monday: string): string { return weekRangeLabel(monday); }

  categoryLabel(cat: ExerciseCategory): string { return CATEGORY_LABELS[cat]; }
  categoryIcon(cat: ExerciseCategory): string { return CATEGORY_ICONS[cat]; }
  categoryColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat]; }

  itemCount(dayIndex: number): number {
    return this.plan().days[dayIndex].length;
  }

  isGymSelected(dayIndex: number, cat: ExerciseCategory): boolean {
    return this.plan().days[dayIndex].some(i => i.type === 'gym' && i.category === cat);
  }

  isSportSelected(dayIndex: number, sportId: string): boolean {
    return this.plan().days[dayIndex].some(i => i.type === 'sport' && i.sportId === sportId);
  }

  templatesFor(cat: ExerciseCategory): WorkoutTemplate[] {
    return this.templateService.forCategory(cat);
  }

  gymTemplate(dayIndex: number, cat: ExerciseCategory): string | undefined {
    const item = this.plan().days[dayIndex].find(i => i.type === 'gym' && i.category === cat);
    return item?.type === 'gym' ? item.templateId : undefined;
  }

  setGymTemplate(dayIndex: number, cat: ExerciseCategory, templateId: string | undefined): void {
    this.plan.update(p => {
      const days = p.days.map((items, i) => {
        if (i !== dayIndex) return items;
        return items.map(it => (it.type === 'gym' && it.category === cat)
          ? { ...it, templateId, entries: undefined } : it);
      });
      return { ...p, days };
    });
  }

  gymEntries(dayIndex: number, cat: ExerciseCategory): TemplateEntry[] {
    const item = this.plan().days[dayIndex].find(i => i.type === 'gym' && i.category === cat);
    return item?.type === 'gym' ? (item.entries ?? []) : [];
  }

  openExercisePicker(dayIndex: number, cat: ExerciseCategory): void {
    const excludeIds = this.gymEntries(dayIndex, cat).map(e => e.exerciseId);
    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds, defaultCategory: cat }, width: '400px', maxHeight: '90vh',
    });
    ref.afterClosed().subscribe((exercise: Exercise | undefined) => {
      if (exercise) this.addGymEntry(dayIndex, cat, exercise);
    });
  }

  addGymEntry(dayIndex: number, cat: ExerciseCategory, exercise: Exercise): void {
    this.plan.update(p => {
      const days = p.days.map((items, i) => {
        if (i !== dayIndex) return items;
        return items.map(it => {
          if (it.type !== 'gym' || it.category !== cat) return it;
          const entries = [...(it.entries ?? []), { exerciseId: exercise.id, exerciseName: exercise.name }];
          return { ...it, entries, templateId: undefined };
        });
      });
      return { ...p, days };
    });
  }

  removeGymEntry(dayIndex: number, cat: ExerciseCategory, exerciseId: string): void {
    this.plan.update(p => {
      const days = p.days.map((items, i) => {
        if (i !== dayIndex) return items;
        return items.map(it => {
          if (it.type !== 'gym' || it.category !== cat) return it;
          const entries = (it.entries ?? []).filter(e => e.exerciseId !== exerciseId);
          return { ...it, entries: entries.length > 0 ? entries : undefined };
        });
      });
      return { ...p, days };
    });
  }

  sportSubtype(dayIndex: number, sportId: string): string | undefined {
    const item = this.plan().days[dayIndex].find(i => i.type === 'sport' && i.sportId === sportId);
    return item?.type === 'sport' ? item.subtypeId : undefined;
  }

  setSportSubtype(dayIndex: number, sportId: string, subtypeId: string | undefined): void {
    this.plan.update(p => {
      const days = p.days.map((items, i) => {
        if (i !== dayIndex) return items;
        return items.map(it => (it.type === 'sport' && it.sportId === sportId) ? { ...it, subtypeId } : it);
      });
      return { ...p, days };
    });
  }

  sportDuration(dayIndex: number, sportId: string): number | undefined {
    const item = this.plan().days[dayIndex].find(i => i.type === 'sport' && i.sportId === sportId);
    return item?.type === 'sport' ? item.duration : undefined;
  }

  setSportDuration(dayIndex: number, sportId: string, duration: number | undefined): void {
    this.plan.update(p => {
      const days = p.days.map((items, i) => {
        if (i !== dayIndex) return items;
        return items.map(it => (it.type === 'sport' && it.sportId === sportId) ? { ...it, duration } : it);
      });
      return { ...p, days };
    });
  }

  numFromEvent(ev: Event): number | undefined {
    const value = (ev.target as HTMLInputElement).value;
    return value === '' ? undefined : Number(value);
  }

  toggleGym(dayIndex: number, cat: ExerciseCategory): void {
    this._toggle(dayIndex, i => i.type === 'gym' && i.category === cat, { type: 'gym', category: cat });
  }

  toggleSport(dayIndex: number, sportId: string): void {
    this._toggle(dayIndex, i => i.type === 'sport' && i.sportId === sportId, { type: 'sport', sportId });
  }

  private _toggle(dayIndex: number, match: (i: WeeklyPlanItem) => boolean, item: WeeklyPlanItem): void {
    this.plan.update(p => {
      const days = p.days.map((items, i) => {
        if (i !== dayIndex) return items;
        return items.some(match) ? items.filter(x => !match(x)) : [...items, item];
      });
      return { ...p, days };
    });
  }

  /** Whether the persistent routine already has something planned for any
   *  day of the given week — decides whether save() needs to ask the user
   *  how to reconcile it with the ad-hoc plan being saved. */
  private _weekHasRoutinePlan(monday: string): boolean {
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      if (this.workoutService.getPlannedForDate(date).some(w => w.plannedSource === 'routine')) return true;
      if (this.sportService.getPlannedSportSessionsForDate(date).some(({ session }) => session.plannedSource === 'routine')) return true;
    }
    return false;
  }

  /** When `weekMonday` is set, only that single week is affected — the
   *  persistent routine in Configuració is never touched unless the user
   *  chose to overwrite it for that one week. Otherwise this always saves
   *  as the recurring routine that applies to every week. */
  async save(): Promise<void> {
    const plan   = this.plan();
    const monday = this.weekMonday;

    if (!monday) {
      await this._saveRoutine(plan);
      return;
    }

    if (this._weekHasRoutinePlan(monday)) {
      const choice = await this.confirmDialog.chooseAction(
        `Ja tens la rutina fixa planificada per a la setmana del ${this.weekRange(monday)}. Vols sobreescriure-la amb aquest pla o afegir-lo per sobre?`,
        [
          { label: 'Sobreescriure', value: 'overwrite' as const, variant: 'danger' as const },
          { label: 'Afegir per sobre', value: 'add' as const },
        ],
      );
      if (!choice) return;
      await this._saveWeek(plan, monday, choice === 'overwrite');
      return;
    }

    await this._saveWeek(plan, monday, false);
  }

  private async _saveWeek(plan: WeeklyPlan, monday: string, overwriteRoutine: boolean): Promise<void> {
    this.saving.set(true);
    try {
      if (overwriteRoutine) {
        await this.weeklyPlanService.retractRemoved(EMPTY_WEEKLY_PLAN, WEEKS_SINGLE, monday, 'routine');
      }
      await this.weeklyPlanService.retractRemoved(plan, WEEKS_SINGLE, monday, 'manual');
      await this.weeklyPlanService.apply(plan, WEEKS_SINGLE, monday, 'manual');
      this.snackBar.open('Setmana planificada', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en desar la planificació', '', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }

  private async _saveRoutine(plan: WeeklyPlan): Promise<void> {
    this.saving.set(true);
    try {
      const recurringPlan: WeeklyPlan = { ...plan, recurring: true };
      await this.settingsService.updateWeeklyPlan(recurringPlan);
      await this.weeklyPlanService.retractRemoved(recurringPlan, WEEKS_RECURRING, undefined, 'routine');
      await this.weeklyPlanService.apply(recurringPlan, WEEKS_RECURRING, undefined, 'routine');
      this.snackBar.open('Planificació desada', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en desar la planificació', '', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }

  async deletePlan(): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Eliminar la planificació setmanal? Els entrenaments futurs que encara no has fet s\'eliminaran del calendari; els que ja has completat es mantindran.',
      { variant: 'danger', confirmLabel: 'Eliminar' },
    );
    if (!ok) return;

    this.plan.set(this._clone(EMPTY_WEEKLY_PLAN));
    try {
      await this.settingsService.updateWeeklyPlan(EMPTY_WEEKLY_PLAN);
      await this.weeklyPlanService.retractRemoved(EMPTY_WEEKLY_PLAN, WEEKS_RECURRING, undefined, 'routine');
      this.snackBar.open('Planificació eliminada', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en eliminar la planificació', '', { duration: 3000 });
    }
  }
}
