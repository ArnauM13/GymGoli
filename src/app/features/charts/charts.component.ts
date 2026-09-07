import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { setMaxWeight } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { SportService } from '../../core/services/sport.service';
import { TodayService } from '../../core/services/today.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { addDays, mondayOf } from '../../shared/utils/calendar-utils';
import { kgToDisplay } from '../../shared/utils/weight.utils';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ExerciseProgressInlineComponent } from '../../shared/components/exercise-progress-inline.component';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';

/** Una fila de «Setmana actual». `target` a `null` = recompte sense objectiu. */
interface WeekBar {
  icon: string;
  label: string;
  count: number;
  target: number | null;
  pct: number;
  done: boolean;
  /** Desglossa la fila de sobre en comptes de dir una cosa nova. */
  sub: boolean;
}

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, ExerciseProgressInlineComponent, FilterBarComponent],
  template: `
    <div class="page">
      <app-page-header title="Progrés" [showBack]="true" />

      @if (!isLoadingRecords() && totalWorkouts() > 0) {
        <!-- ── Resum ── -->
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon" aria-hidden="true">insights</span>
            <h2 class="section-title">Resum</h2>
          </div>
          <div class="stat-grid">
            <div class="stat-tile">
              <span class="stat-val">{{ totalWorkouts() }}</span>
              <span class="stat-lbl">Entrenaments</span>
            </div>
            <div class="stat-tile">
              <span class="stat-val">
                @if (weekStreak() > 0) {
                  <span class="material-symbols-outlined stat-flame" aria-hidden="true">local_fire_department</span>
                }
                {{ weekStreak() }}
              </span>
              <span class="stat-lbl">Setmanes seguides</span>
            </div>
          </div>
        </div>

        <!-- ── Setmana actual ── -->
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon" aria-hidden="true">calendar_view_week</span>
            <h2 class="section-title">Setmana actual</h2>
          </div>
          @for (bar of weekBars(); track bar.label) {
            <div class="goal-row" [class.goal-row--done]="bar.done" [class.goal-row--sub]="bar.sub">
              <span class="material-symbols-outlined goal-icon" aria-hidden="true">{{ bar.icon }}</span>
              <span class="goal-name">{{ bar.label }}</span>
              @if (bar.target) {
                <div class="goal-track">
                  <div class="goal-fill" [style.width.%]="bar.pct"></div>
                </div>
              }
              <span class="goal-badge">
                {{ bar.count }}@if (bar.target) {<span class="goal-target">/{{ bar.target }}</span>}
              </span>
            </div>
          }
        </div>
      }

      <!-- Cerca i filtres (ordenació desactivada de moment) -->
      @if (exerciseGroups().length > 0 || hasActiveFilter()) {
        <app-filter-bar
          searchPlaceholder="Cerca per exercici..."
          [showSort]="false"
          [(searchQuery)]="searchQuery"
          [(category)]="filterCat" />
      }

      <!-- Exercise list: all exercises with data load up-front, expand inline for stats -->
      @if (exerciseGroups().length > 0) {
        @for (group of exerciseGroups(); track group.cat) {
          <div class="card-section">
            <div class="section-header">
              <span class="material-symbols-outlined section-icon"
                    [style.color]="group.color" aria-hidden="true">{{ group.icon }}</span>
              <h2 class="section-title">{{ group.label }}</h2>
              <span class="section-count">{{ group.records.length }}</span>
            </div>

            @for (r of group.records; track r.exercise.id) {
              <div class="item-card" [class.item-card--open]="expandedExerciseId() === r.exercise.id"
                   [id]="'ex-' + r.exercise.id">
                <button class="ic-row" (click)="toggleExercise(r.exercise.id)"
                        [attr.aria-expanded]="expandedExerciseId() === r.exercise.id">
                  <span class="ic-bar" [style.background]="r.color" aria-hidden="true"></span>
                  <span class="ic-name">{{ r.exercise.name }}</span>
                  @if (r.display !== null) {
                    <span class="ic-pr">{{ r.display }} {{ unit() }}</span>
                  }
                  <span class="material-symbols-outlined ic-chevron" aria-hidden="true">expand_more</span>
                </button>

                @if (expandedExerciseId() === r.exercise.id) {
                  <div class="ic-panel">
                    <app-exercise-progress-inline
                      [exerciseId]="r.exercise.id" [exerciseName]="r.exercise.name" />
                  </div>
                }
              </div>
            }
          </div>
        }
      } @else if (isLoadingRecords()) {
        <!-- Skeleton: same shape as the real list, so nothing jumps on arrival -->
        <div class="card-section">
          <div class="section-header">
            <div class="sk sk-icon"></div>
            <div class="sk sk-title"></div>
            <div class="sk sk-count"></div>
          </div>
          @for (sk of [1,2,3,4]; track sk) {
            <div class="item-card sk-card">
              <div class="ic-bar sk"></div>
              <div class="sk-body"><div class="sk sk-line"></div></div>
            </div>
          }
        </div>
      } @else if (hasActiveFilter()) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon" aria-hidden="true">search_off</span>
            <p>Cap exercici trobat</p>
          </div>
        </div>
      } @else {
        <!-- New user empty state -->
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon" aria-hidden="true">monitoring</span>
            <p>Registra els teus primers entrenaments i aquí hi sortirà com evoluciones</p>
            <div class="empty-actions">
              <a class="btn-primary" routerLink="/train">Anar a Entrena</a>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 0 0 88px; }

    /* ── Section card ── */
    .card-section {
      margin: 12px 16px 0; padding: 14px 14px 10px;
      background: var(--c-card); border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
    .section-icon {
      font-size: 18px; color: var(--c-text-2);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .section-title {
      margin: 0; flex: 1;
      font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px;
    }
    .section-count {
      font-size: 11px; font-weight: 700; color: var(--c-text-2);
      background: var(--c-border-2); border-radius: 10px; padding: 2px 8px;
    }

    /* ── Resum ── */
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding-bottom: 4px; }
    .stat-tile {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      padding: 12px 8px; text-align: center;
      background: var(--c-subtle); border: 1.5px solid var(--c-border-2); border-radius: 14px;
    }
    .stat-val {
      display: flex; align-items: center; justify-content: center; gap: 3px;
      font-size: 22px; font-weight: 700; color: var(--c-text); line-height: 1;
    }
    .stat-flame {
      font-size: 19px; color: #f57c00;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .stat-lbl { font-size: 11px; font-weight: 500; color: var(--c-text-2); }

    /* ── Setmana actual ── */
    .goal-row {
      display: flex; align-items: center; gap: 9px;
      padding: 9px 2px;
    }
    .goal-row + .goal-row:not(.goal-row--sub) { border-top: 1px solid var(--c-border-2); }
    /* El desglossament s'arrenglera sota el nom de la barra i afluixa el pes:
       no és un objectiu més, és d'on surt la xifra de dalt. */
    .goal-row--sub {
      padding: 4px 2px 4px 26px;
      .goal-icon  { font-size: 15px; }
      .goal-name  { font-size: 12px; font-weight: 500; color: var(--c-text-2); }
      .goal-badge { font-size: 12px; font-weight: 600; color: var(--c-text-2); }
    }
    .goal-row--sub:first-of-type { padding-top: 8px; }
    .goal-icon {
      font-size: 17px; color: var(--c-text-3); flex-shrink: 0;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .goal-name { font-size: 13px; font-weight: 600; color: var(--c-text); flex-shrink: 0; }
    .goal-track {
      flex: 1; height: 5px; border-radius: 3px; overflow: hidden;
      background: var(--c-border);
    }
    .goal-fill {
      height: 100%; border-radius: 3px; max-width: 100%;
      background: linear-gradient(90deg, var(--c-brand) 0%, color-mix(in srgb, var(--c-brand) 75%, white) 100%);
      transition: width 0.4s ease;
    }
    .goal-badge {
      margin-left: auto; flex-shrink: 0;
      font-size: 13px; font-weight: 700; color: var(--c-text);
    }
    .goal-target { font-size: 12px; font-weight: 500; color: var(--c-text-3); }
    /* Assolit: el verd va a la barra i a la xifra, i la icona s'omple —el
       color mai és l'únic senyal. */
    .goal-row--done {
      .goal-icon  { color: #43a047; font-variation-settings: 'FILL' 1, 'wght' 400; }
      .goal-fill  { background: #43a047; }
      .goal-badge { color: #43a047; }
    }

    /* ── Filter bar ── */
    app-filter-bar { display: block; margin-top: 14px; margin-bottom: -12px; }

    /* ── Exercise item card ── */
    .item-card {
      margin-bottom: 6px; overflow: hidden;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card);
      transition: box-shadow 0.15s, border-color 0.15s;
      &:last-child { margin-bottom: 4px; }
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
      &--open { border-color: var(--c-border); }
    }
    .ic-row {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 0 10px 0 0;
      border: none; background: none; font: inherit; text-align: left;
      cursor: pointer; touch-action: manipulation;
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: -2px; }
    }
    .ic-bar { width: 5px; align-self: stretch; min-height: 44px; flex-shrink: 0; }
    .ic-name {
      flex: 1; min-width: 0; padding: 12px 0;
      font-size: 13px; font-weight: 700; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* La marca personal és la xifra que es ve a buscar: xapa ambre, com la
       nota a la resta de l'app. */
    .ic-pr {
      flex-shrink: 0;
      font-size: 12px; font-weight: 700; color: var(--c-act-note);
      background: color-mix(in srgb, var(--c-amber) 14%, var(--c-card));
      border-radius: 7px; padding: 2px 7px;
    }
    .ic-chevron {
      font-size: 18px; color: var(--c-text-3); flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    .item-card--open .ic-chevron { transform: rotate(180deg); }
    .ic-panel {
      padding: 2px 10px 10px;
      border-top: 1px solid var(--c-border-2);
      animation: panel-in 0.18s ease-out;
    }
    @keyframes panel-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: none; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      padding: 28px 16px; text-align: center; color: var(--c-text-2);
      .empty-icon {
        font-size: 48px; color: var(--c-border);
        font-variation-settings: 'FILL' 0, 'wght' 200;
      }
      p { margin: 0; font-size: 14px; font-weight: 500; max-width: 32ch; line-height: 1.4; }
    }
    .empty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .btn-primary {
      padding: 9px 18px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white; text-decoration: none;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
      &:active { transform: scale(0.97); }
    }

    /* ── Skeleton ── */
    @keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .sk { background: var(--c-border-2); animation: sk-pulse 1.4s ease-in-out infinite; }
    .sk-icon  { width: 18px; height: 18px; border-radius: 4px; }
    .sk-title { flex: 1; max-width: 120px; height: 13px; border-radius: 6px; }
    .sk-count { width: 28px; height: 18px; border-radius: 10px; }
    .sk-card  { display: flex; align-items: stretch; pointer-events: none; }
    .sk-body  { flex: 1; padding: 15px 10px; }
    .sk-line  { height: 13px; width: 52%; border-radius: 6px; }

    @media (prefers-reduced-motion: reduce) {
      .goal-fill, .ic-chevron { transition: none; }
      .ic-panel { animation: none; }
      .sk { animation: none; }
    }
  `],
})
export class ChartsComponent {
  private exerciseService = inject(ExerciseService);
  private workoutService  = inject(WorkoutService);
  private settingsService = inject(UserSettingsService);
  private sportService    = inject(SportService);
  private typeService     = inject(TrainingTypeService);
  private todayService    = inject(TodayService);
  private route           = inject(ActivatedRoute);

  private readonly queryExerciseId = toSignal(
    this.route.queryParams.pipe(map(p => (p['exerciseId'] as string) ?? '')),
    { initialValue: '' },
  );

  readonly unit = this.settingsService.weightUnit;

  readonly isLoadingRecords = this.workoutService.isLoading;

  readonly expandedExerciseId = signal<string | null>(null);

  readonly searchQuery = signal('');
  readonly filterCat   = signal<ExerciseCategory | null>(null);
  readonly hasActiveFilter = computed(() => !!this.searchQuery() || !!this.filterCat());

  // ── Summary strip ────────────────────────────────────────────────────────

  readonly totalWorkouts = computed(() => this.workoutService.doneWorkouts().length);

  /** El dilluns i el diumenge de la setmana en curs, en hora local. */
  private readonly thisWeek = computed(() => {
    const monday = mondayOf(this.todayService.today());
    return { monday, sunday: addDays(monday, 6) };
  });

  readonly thisWeekCount = computed(() => {
    const { monday, sunday } = this.thisWeek();
    return this.workoutService.doneWorkouts().filter(w => w.date >= monday && w.date <= sunday).length;
  });

  readonly goalMode        = computed(() => this.settingsService.goalMode());
  readonly weeklyGoal      = computed(() => this.settingsService.weeklyActivityGoal());
  readonly weeklyGymGoal   = computed(() => this.settingsService.weeklyGymGoal());
  readonly weeklySportGoal = computed(() => this.settingsService.weeklySportGoal());

  readonly thisWeekSportCount = computed(() => {
    const { monday, sunday } = this.thisWeek();
    return this.sportService.sessions().filter(s => s.date >= monday && s.date <= sunday).length;
  });

  /**
   * Les files de «Setmana actual», amb la mateixa forma tant si l'objectiu és
   * combinat com si va per separat: icona, nom, barra i xifra. Sense objectiu
   * la barra desapareix i queda el recompte, que segueix dient alguna cosa.
   */
  readonly weekBars = computed((): WeekBar[] => {
    const gym   = this.thisWeekCount();
    const sport = this.thisWeekSportCount();

    const bar = (icon: string, label: string, count: number, target: number | null, sub = false): WeekBar => ({
      icon, label, count, target, sub,
      pct:  target ? Math.min(100, Math.round((count / target) * 100)) : 0,
      done: !!target && count >= target,
    });

    if (this.goalMode() === 'separate') {
      return [
        bar('fitness_center', 'Gimnàs', gym,   this.weeklyGymGoal()),
        bar('sports_soccer',  'Esport', sport, this.weeklySportGoal()),
      ];
    }
    // Objectiu combinat: una sola barra, i el gimnàs i l'esport a sota com el
    // que són —el desglossament de la xifra de dalt, no dos objectius més.
    return [
      bar('bolt',           'Activitats', gym + sport, this.weeklyGoal()),
      bar('fitness_center', 'Gimnàs',     gym,   null, true),
      bar('sports_soccer',  'Esport',     sport, null, true),
    ];
  });

  readonly weekStreak = computed(() => {
    const workouts = this.workoutService.doneWorkouts();
    if (workouts.length === 0) return 0;
    let streak = 0;
    let weekStart = this.thisWeek().monday;
    for (let i = 0; i < 52; i++) {
      const weekEnd = addDays(weekStart, 6);
      if (!workouts.some(w => w.date >= weekStart && w.date <= weekEnd)) break;
      streak++;
      weekStart = addDays(weekStart, -7);
    }
    return streak;
  });

  // ── Exercise list (all exercises with logged data, grouped by category) ───

  readonly exerciseGroups = computed(() => {
    const exercises = this.exerciseService.exercises();
    const withData  = this.workoutService.exercisesWithData();
    const unit      = this.unit();
    const query     = this.searchQuery().trim().toLowerCase();
    const records = exercises
      .filter(e => withData.has(e.id))
      .filter(e => !query || e.name.toLowerCase().includes(query))
      .map(ex => {
        const allWeights = this.workoutService.getWorkoutsForExercise(ex.id)
          .flatMap(w => w.entries.filter(e => e.exerciseId === ex.id).flatMap(e => e.sets.filter(s => !s.warmup).map(s => setMaxWeight(s))))
          .filter(w => w > 0);
        const display = allWeights.length ? kgToDisplay(Math.max(...allWeights), unit) : null;
        return { exercise: ex, display, color: CATEGORY_COLORS[ex.category] };
      });

    const catFilter = this.filterCat();
    // User's types plus any category still present in the data (orphans from
    // deleted types), so no record ever becomes invisible.
    const typeIds  = this.typeService.types().map(t => t.id);
    const present  = [...new Set(records.map(r => r.exercise.category))];
    const cats = catFilter
      ? [catFilter]
      : [...typeIds, ...present.filter(c => !typeIds.includes(c))];
    return cats
      .map(cat => ({
        cat,
        label: CATEGORY_LABELS[cat],
        color: CATEGORY_COLORS[cat],
        icon:  CATEGORY_ICONS[cat] ?? 'fitness_center',
        records: records.filter(r => r.exercise.category === cat),
      }))
      .filter(g => g.records.length > 0);
  });

  toggleExercise(exerciseId: string): void {
    this.expandedExerciseId.update(current => current === exerciseId ? null : exerciseId);
  }

  constructor() {
    this.exerciseService.ensureLoaded();
    this.sportService.ensureLoaded();
    // Load full workout history up-front — the exercise list always shows
    // everything, there's no "load more" step.
    this.workoutService.loadAllWorkouts();

    // Deep-link support: expand the requested exercise when navigated here
    // via ?exerciseId=... (e.g. from the "veure gràfiques avançades" button).
    effect(() => {
      const exId = this.queryExerciseId();
      if (!exId) return;
      const found = this.exerciseGroups().some(g => g.records.some(r => r.exercise.id === exId));
      if (found) {
        this.expandedExerciseId.set(exId);
        queueMicrotask(() =>
          document.getElementById('ex-' + exId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        );
      }
    });
  }
}
