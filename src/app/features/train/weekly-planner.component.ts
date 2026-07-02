import { Component, computed, inject, signal } from '@angular/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { addDays, mondayOf, workoutCategories } from '../../shared/utils/calendar-utils';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { EMPTY_WEEKLY_PLAN, WEEKDAY_LABELS, WeeklyPlan, WeeklyPlanItem } from '../../core/models/weekly-plan.model';

const TODAY = (): string => new Date().toISOString().split('T')[0];
const GYM_CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs'];
const WEEKS_SINGLE    = 1;
const WEEKS_RECURRING = 8;

@Component({
  selector: 'app-weekly-planner',
  standalone: true,
  imports: [MatSlideToggleModule, PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header title="Planificació setmanal" [showBack]="true" />

      <div class="card-section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">event_repeat</span>
          <h2 class="section-title">Repetició</h2>
        </div>
        <div class="recurring-row">
          <div class="recurring-info">
            <span class="recurring-label">Repeteix cada setmana</span>
            <span class="recurring-desc">
              @if (plan().recurring) {
                El pla s'aplicarà automàticament durant les properes {{ weeksRecurring }} setmanes.
              } @else {
                El pla només s'aplicarà a la setmana actual.
              }
            </span>
          </div>
          <mat-slide-toggle [checked]="plan().recurring" (change)="setRecurring($event.checked)" />
        </div>
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
          }

          @if (itemCount(day.index) === 0) {
            <span class="rest-hint">Descans</span>
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
          Desar planificació
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

    .recurring-row { display: flex; align-items: center; gap: 12px; }
    .recurring-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .recurring-label { font-size: 13px; font-weight: 700; color: var(--c-text); }
    .recurring-desc { font-size: 11px; color: var(--c-text-3); line-height: 1.4; }

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

    .rest-hint {
      display: block; font-size: 11px; font-weight: 600; color: var(--c-text-3);
      font-style: italic; margin-top: 2px;
    }

    .save-bar {
      position: fixed; left: 16px; right: 16px;
      bottom: calc(var(--nav-height) + 16px);
      z-index: 89;
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
  `],
})
export class WeeklyPlannerComponent {
  private settingsService = inject(UserSettingsService);
  private workoutService  = inject(WorkoutService);
  readonly sportService   = inject(SportService);
  private snackBar        = inject(MatSnackBar);

  readonly gymCategories  = GYM_CATEGORIES;
  readonly weeksRecurring = WEEKS_RECURRING;
  readonly days = WEEKDAY_LABELS.map((label, index) => ({ label, index }));

  readonly saving = signal(false);
  readonly plan = signal<WeeklyPlan>(this._clone(this.settingsService.weeklyPlan() ?? EMPTY_WEEKLY_PLAN));

  constructor() {
    this.sportService.ensureLoaded();
  }

  private _clone(plan: WeeklyPlan): WeeklyPlan {
    return { recurring: plan.recurring, days: plan.days.map(items => [...items]) };
  }

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

  setRecurring(recurring: boolean): void {
    this.plan.update(p => ({ ...p, recurring }));
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

  async save(): Promise<void> {
    this.saving.set(true);
    try {
      const plan = this.plan();
      await this.settingsService.updateWeeklyPlan(plan);
      await this._applyPlan(plan);
      this.snackBar.open('Planificació desada', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en desar la planificació', '', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }

  /** Materializes the weekly template into real planned workouts / sport sessions. */
  private async _applyPlan(plan: WeeklyPlan): Promise<void> {
    const hasAnyItem = plan.days.some(items => items.length > 0);
    if (!hasAnyItem) return;

    const today   = TODAY();
    const monday  = mondayOf(today);
    const weeks   = plan.recurring ? WEEKS_RECURRING : WEEKS_SINGLE;

    const months = new Set<string>();
    for (let i = 0; i < weeks * 7; i++) months.add(addDays(monday, i).substring(0, 7));

    await Promise.all([...months].flatMap(key => {
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
          if (item.type === 'gym') {
            const already =
              this.workoutService.getPlannedForDate(date).some(x => workoutCategories(x).includes(item.category)) ||
              this.workoutService.getDoneWorkoutsForDate(date).some(x => workoutCategories(x).includes(item.category));
            if (!already) await this.workoutService.createPlannedWorkout(date, item.category, []);
          } else {
            const existing = this.sportService.getSessionForDate(date, item.sportId);
            if (!existing) await this.sportService.logSession(date, item.sportId, {}, 'planned');
          }
        }
      }
    }
  }
}
