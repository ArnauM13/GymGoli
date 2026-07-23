import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute } from '@angular/router';

import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { WeeklyPlanService, WEEKS_RECURRING, WEEKS_SINGLE } from '../../core/services/weekly-plan.service';
import { TemplateService } from '../../core/services/template.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, Exercise, ExerciseCategory } from '../../core/models/exercise.model';
import { EMPTY_WEEKLY_PLAN, WEEKDAY_LABELS, WeeklyPlan, WeeklyPlanItem } from '../../core/models/weekly-plan.model';
import { TemplateEntry, WorkoutTemplate } from '../../core/models/template.model';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';
import { addDays, weekRangeLabel } from '../../shared/utils/calendar-utils';

const GYM_CATEGORIES: ExerciseCategory[] = ['push', 'pull', 'legs'];

const TODAY = (): string => new Date().toISOString().split('T')[0];

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
            @if (weekHasPastDays()) {
              Els dies ja passats no es poden modificar.
            }
          } @else {
            Aquesta configuració s'aplica cada setmana, de manera indefinida, a partir d'avui — els dies ja passats no es modifiquen.
          }
        </span>
      </div>

      @for (day of days; track day.index) {
        <div class="card-section" [class.day-open]="isDayExpanded(day.index)" [class.day-locked]="isDayLocked(day.index)">
          <button type="button" class="day-toggle" (click)="toggleDay(day.index)" [disabled]="isDayLocked(day.index)">
            <span class="material-symbols-outlined section-icon">today</span>
            <h2 class="section-title">{{ day.label }}</h2>
            @if (itemCount(day.index) > 0) {
              <span class="section-count">{{ itemCount(day.index) }}</span>
            }
            @if (isDayLocked(day.index)) {
              <span class="material-symbols-outlined day-chevron">lock</span>
            } @else {
              <span class="material-symbols-outlined day-chevron">{{ isDayExpanded(day.index) ? 'expand_less' : 'expand_more' }}</span>
            }
          </button>

          @if (!isDayExpanded(day.index)) {
            @if (daySummary(day.index); as summary) {
              @if (summary.length > 0) {
                <div class="day-summary">
                  @for (s of summary; track s.key) {
                    <span class="day-summary-chip" [style.--sc]="s.color">
                      <span class="material-symbols-outlined">{{ s.icon }}</span>
                      {{ s.label }}
                    </span>
                  }
                </div>
              } @else if (isDayLocked(day.index)) {
                <span class="day-summary-rest">Dia ja passat</span>
              } @else {
                <span class="day-summary-rest">Dia de descans</span>
              }
            }
          } @else {
          <div class="day-body">

          <div class="plan-group">
            <div class="plan-group-header">
              <span class="material-symbols-outlined plan-group-icon">fitness_center</span>
              <span class="plan-group-title">Gym</span>
            </div>
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
                <div class="plan-detail-card" [style.--pc]="categoryColor(cat)">
                  <div class="plan-detail-bar"></div>
                  <div class="plan-detail-body">
                    <span class="plan-detail-title">{{ categoryLabel(cat) }}</span>

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
          </div>

          @if (sportService.sports().length > 0) {
            <div class="plan-group-divider"></div>

            <div class="plan-group">
              <div class="plan-group-header">
                <span class="material-symbols-outlined plan-group-icon">directions_run</span>
                <span class="plan-group-title">Esport</span>
              </div>
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
                  <div class="plan-detail-card" [style.--pc]="sport.color">
                    <div class="plan-detail-bar"></div>
                    <div class="plan-detail-body">
                      <span class="plan-detail-title">{{ sport.name }}</span>

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
                  </div>
                }
              }
            </div>
          }

          </div>
          }
        </div>
      }

      <div class="save-bar">
        <button class="cancel-btn" (click)="cancel()" [disabled]="saving()">Cancel·lar</button>
        <button class="save-btn" (click)="save()" [disabled]="saving()">
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
      padding: 12px 14px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .card-section.day-open { padding-bottom: 16px; }
    .card-section.day-locked { opacity: 0.55; }
    .card-section.day-locked .day-toggle { cursor: default; }

    /* ── Collapsible day header ── */
    .day-toggle {
      display: flex; align-items: center; gap: 7px; width: 100%;
      padding: 0; border: none; background: transparent;
      cursor: pointer; touch-action: manipulation; text-align: left;
    }
    .section-icon  { font-size: 18px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }
    .section-count {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      background: var(--c-subtle); border-radius: 10px; padding: 2px 8px;
    }
    .day-chevron { font-size: 20px; color: var(--c-text-3); flex-shrink: 0; }

    .day-body { margin-top: 12px; }

    /* ── Collapsed-day summary ── */
    .day-summary { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .day-summary-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 20px;
      background: color-mix(in srgb, var(--sc, var(--c-brand)) 12%, var(--c-card));
      border: 1px solid color-mix(in srgb, var(--sc, var(--c-brand)) 30%, transparent);
      color: var(--sc, var(--c-brand));
      font-size: 12px; font-weight: 600;
      .material-symbols-outlined { font-size: 14px; }
    }
    .day-summary-rest {
      display: inline-block; margin-top: 10px;
      font-size: 12px; color: var(--c-text-3); font-style: italic;
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

    /* ── Gym / Esport groups (kept visually separate within each day) ── */
    .plan-group + .plan-group { margin-top: 4px; }
    .plan-group-header { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
    .plan-group-icon { font-size: 15px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 400; }
    .plan-group-title {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px;
    }
    .plan-group-divider { height: 1px; background: var(--c-border-2); margin: 16px 0 14px; }

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

    /* ── Selected category/sport detail, as its own accented item-card ── */
    .plan-detail-card {
      display: flex; align-items: stretch;
      margin: 8px 0 4px;
      border: 1.5px solid color-mix(in srgb, var(--pc, var(--c-border-2)) 30%, var(--c-border-2));
      border-radius: 14px; overflow: hidden;
      background: color-mix(in srgb, var(--pc, var(--c-card)) 5%, var(--c-card));
    }
    .plan-detail-bar { width: 4px; flex-shrink: 0; background: var(--pc, var(--c-border)); }
    .plan-detail-body {
      flex: 1; min-width: 0; padding: 10px 12px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .plan-detail-title { font-size: 12.5px; font-weight: 700; color: var(--c-text); }
    .tpl-chips { padding: 0; }
    .tpl-chip {
      padding: 4px 10px; font-size: 11px;
      .material-symbols-outlined { font-size: 13px; }
    }

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
      display: flex; justify-content: flex-end; gap: 8px;
    }
    .cancel-btn {
      display: inline-flex; align-items: center;
      padding: 10px 16px; border-radius: 12px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      color: var(--c-text-2); font-size: 13.5px; font-weight: 600; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      box-shadow: 0 4px 16px var(--c-shadow-md);
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
      &:disabled { opacity: 0.6; cursor: default; }
    }
    .save-btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 16px; border: none; border-radius: 12px;
      background: var(--c-brand); color: white;
      font-size: 13.5px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      box-shadow: 0 4px 16px var(--c-shadow-md);
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-brand-dk); }
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
  private feedback         = inject(FeedbackService);
  private confirmDialog    = inject(ConfirmDialogService);
  private dialog           = inject(MatDialog);
  private route            = inject(ActivatedRoute);
  private navHistory       = inject(NavigationHistoryService);

  readonly gymCategories  = GYM_CATEGORIES;
  readonly days = WEEKDAY_LABELS.map((label, index) => ({ label, index }));

  /** Days shown expanded (collapsed by default so the week is easy to scan
   *  and plan one day at a time). */
  private readonly expandedDays = signal<ReadonlySet<number>>(new Set());

  /** Monday of a single week to plan (from the calendar's "Planificar" action),
   *  or null when editing the persistent routine from Configuració. */
  readonly weekMonday = this.route.snapshot.queryParamMap.get('week');

  /** Frozen at construction so every lock/save decision within the visit
   *  agrees on what "avui" means. */
  private readonly _today = TODAY();

  readonly saving = signal(false);
  readonly plan = signal<WeeklyPlan>(this._initialPlan());

  /** Snapshot of the plan as it was when the page opened, so "Cancel·lar"
   *  can discard every edit and restore exactly that state. */
  private readonly _originalPlan = this._clone(this.plan());

  readonly hasSavedPlan = computed(() => {
    const p = this.settingsService.weeklyPlan();
    return p.recurring || p.days.some(items => items.length > 0);
  });

  constructor() {
    this.sportService.ensureLoaded();
  }

  /** Planning is only allowed from today onward: in week mode, days of the
   *  target week that are already behind are shown as history and can't be
   *  edited (WeeklyPlanService skips them on apply/retract too). Routine
   *  mode plans abstract weekdays, so nothing is ever locked there. */
  isDayLocked(dayIndex: number): boolean {
    return !!this.weekMonday && addDays(this.weekMonday, dayIndex) < this._today;
  }

  weekHasPastDays(): boolean {
    return !!this.weekMonday && this.weekMonday < this._today;
  }

  isDayExpanded(dayIndex: number): boolean {
    return !this.isDayLocked(dayIndex) && this.expandedDays().has(dayIndex);
  }

  toggleDay(dayIndex: number): void {
    if (this.isDayLocked(dayIndex)) return;
    this.expandedDays.update(set => {
      const next = new Set(set);
      if (next.has(dayIndex)) next.delete(dayIndex); else next.add(dayIndex);
      return next;
    });
  }

  /** Compact list of what's planned for a collapsed day (gym categories +
   *  sports), so the user can scan the week without expanding every day. */
  daySummary(dayIndex: number): { key: string; label: string; icon: string; color: string }[] {
    const items = this.plan().days[dayIndex];
    const out: { key: string; label: string; icon: string; color: string }[] = [];
    for (const cat of this.gymCategories) {
      if (items.some(i => i.type === 'gym' && i.category === cat)) {
        out.push({ key: 'gym-' + cat, label: this.categoryLabel(cat), icon: this.categoryIcon(cat), color: this.categoryColor(cat) });
      }
    }
    for (const sport of this.sportService.sports()) {
      if (items.some(i => i.type === 'sport' && i.sportId === sport.id)) {
        out.push({ key: 'sport-' + sport.id, label: sport.name, icon: sport.icon, color: sport.color });
      }
    }
    return out;
  }

  /** Discards every edit made since opening and leaves the planner. */
  cancel(): void {
    this.plan.set(this._clone(this._originalPlan));
    this.navHistory.goBack('/train');
  }

  private _clone(plan: WeeklyPlan): WeeklyPlan {
    return { recurring: plan.recurring, days: plan.days.map(items => [...items]) };
  }

  /** Week-mode starts from what's actually planned for that specific week
   *  (so editing shows the real state, not the persistent routine);
   *  settings-mode keeps editing the persistent routine as before. */
  private _initialPlan(): WeeklyPlan {
    if (this.weekMonday) return this._reconstructWeekPlan(this.weekMonday);
    return this._clone(this.settingsService.weeklyPlan() ?? EMPTY_WEEKLY_PLAN);
  }

  /** Reads every workout/session created by planning (any `plannedSource`)
   *  regardless of whether it's still `planned` or already marked done —
   *  a day the user already completed is still part of "this week's plan"
   *  and must show up checked when re-opening the editor. */
  private _reconstructWeekPlan(monday: string): WeeklyPlan {
    const days: WeeklyPlanItem[][] = [];
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      const items: WeeklyPlanItem[] = [];

      for (const workout of this.workoutService.getWorkoutsForDate(date)) {
        if (!workout.plannedSource) continue;
        const category = workout.category as ExerciseCategory | undefined;
        if (!category) continue;
        const entries: TemplateEntry[] = workout.entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName }));
        items.push({ type: 'gym', category, entries: entries.length > 0 ? entries : undefined });
      }

      const sportPairs = [
        ...this.sportService.getSportSessionsForDate(date),
        ...this.sportService.getPlannedSportSessionsForDate(date),
      ];
      for (const { sport, session } of sportPairs) {
        if (!session.plannedSource) continue;
        items.push({ type: 'sport', sportId: sport.id, subtypeId: session.subtypeId, duration: session.duration });
      }

      days.push(items);
    }
    return { recurring: false, days };
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
   *  remaining day (today onward) of the given week — decides whether save()
   *  needs to ask the user how to reconcile it with the ad-hoc plan being
   *  saved. Past days don't count: they can't be overwritten anyway. */
  private _weekHasRoutinePlan(monday: string): boolean {
    for (let i = 0; i < 7; i++) {
      const date = addDays(monday, i);
      if (date < this._today) continue;
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
      this.feedback.success('Setmana planificada', 2000);
    } catch {
      this.feedback.error('Error en desar la planificació', 3000);
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
      this.feedback.success('Planificació desada', 2000);
    } catch {
      this.feedback.error('Error en desar la planificació', 3000);
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
      this.feedback.success('Planificació eliminada', 2000);
    } catch {
      this.feedback.error('Error en eliminar la planificació', 3000);
    }
  }
}
