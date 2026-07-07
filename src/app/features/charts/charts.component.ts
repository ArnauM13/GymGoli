import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { setMaxWeight } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { addDays, mondayOf } from '../../shared/utils/calendar-utils';
import { kgToDisplay } from '../../shared/utils/weight.utils';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ExerciseProgressInlineComponent } from '../../shared/components/exercise-progress-inline.component';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, ExerciseProgressInlineComponent, FilterBarComponent],
  template: `
    <div class="page">
      <app-page-header title="Progrés" />

      <!-- Summary strip (only when there is data) -->
      @if (!isLoadingRecords() && totalWorkouts() > 0) {
        <div class="summary-card">
          <div class="summary-block">
            <div class="summary-section">
              <span class="summary-section-title">Resum</span>
              <div class="summary-grid">
                <div class="summary-tile">
                  <span class="summary-val">{{ totalWorkouts() }}</span>
                  <span class="summary-lbl">Entrenaments</span>
                </div>
                <div class="summary-tile">
                  <span class="summary-val">
                    @if (weekStreak() > 0) { 🔥 }{{ weekStreak() }}
                  </span>
                  <span class="summary-lbl">Set. consecutives</span>
                </div>
              </div>
            </div>
            <div class="summary-section">
              <span class="summary-section-title">Setmana actual</span>
              @if (goalMode() === 'separate') {
                <div class="summary-grid">
                  <div class="summary-tile">
                    <span class="summary-val">
                      {{ thisWeekCount() }}
                      @if (weeklyGymGoal()) { <span class="summary-sub">/ {{ weeklyGymGoal() }}</span> }
                    </span>
                    <span class="summary-lbl">Gimnàs</span>
                  </div>
                  <div class="summary-tile">
                    <span class="summary-val">
                      {{ thisWeekSportCount() }}
                      @if (weeklySportGoal()) { <span class="summary-sub">/ {{ weeklySportGoal() }}</span> }
                    </span>
                    <span class="summary-lbl">Esport</span>
                  </div>
                </div>
              } @else {
                <div class="summary-grid">
                  <div class="summary-tile">
                    <span class="summary-val">{{ thisWeekCount() }}</span>
                    <span class="summary-lbl">Gimnàs</span>
                  </div>
                  <div class="summary-tile">
                    <span class="summary-val">{{ thisWeekSportCount() }}</span>
                    <span class="summary-lbl">Esport</span>
                  </div>
                </div>
                @if (weeklyGoal()) {
                  <div class="summary-combined-goal">
                    <div class="scg-track">
                      <div class="scg-fill" [style.width.%]="combinedWeeklyBarPct()"></div>
                    </div>
                    <span class="scg-label">
                      {{ thisWeekCount() + thisWeekSportCount() }}/{{ weeklyGoal() }} activitats
                      @if (combinedWeeklyMet()) { ✓ }
                    </span>
                  </div>
                }
              }
            </div>
          </div>
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
          <div class="pr-section" [style.--pr-g]="group.color">
            <h3 class="pr-title">{{ group.label }}</h3>
            @for (r of group.records; track r.exercise.id) {
              <div class="pr-item" [id]="'ex-' + r.exercise.id">
                <button class="pr-row" [class.expanded]="expandedExerciseId() === r.exercise.id"
                        (click)="toggleExercise(r.exercise.id)">
                  <span class="pr-bar" [style.background]="r.color"></span>
                  <span class="pr-name">{{ r.exercise.name }}</span>
                  @if (r.display !== null) {
                    <span class="pr-weight">{{ r.display }} {{ unit() }}</span>
                  }
                  <span class="material-symbols-outlined pr-chevron"
                        [class.pr-chevron--open]="expandedExerciseId() === r.exercise.id">expand_more</span>
                </button>

                @if (expandedExerciseId() === r.exercise.id) {
                  <app-exercise-progress-inline [exerciseId]="r.exercise.id" [exerciseName]="r.exercise.name" />
                }
              </div>
            }
          </div>
        }
      } @else if (isLoadingRecords()) {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon loading-icon">bar_chart</span>
          <p style="color:var(--c-text-2)">Carregant exercicis...</p>
        </div>
      } @else if (hasActiveFilter()) {
        <div class="filter-empty">
          <span class="material-symbols-outlined">search_off</span>
          <p>Cap exercici trobat</p>
        </div>
      } @else {
        <!-- New user empty state -->
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">fitness_center</span>
          <h2>Comença a entrenar</h2>
          <p>Registra els teus primers entrenaments per veure aquí les gràfiques de progrés</p>
          <a class="btn-cta" routerLink="/train">Anar a Entrena</a>
        </div>
      }
    </div>

  `,
  styles: [`
    .page { padding: 0 0 16px; }

    /* ── Summary card ─────────────────────────────────────── */
    .summary-card {
      margin: 12px 16px 0; padding: 14px 14px 16px;
      background: var(--c-card); border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .summary-block { display: flex; flex-direction: column; gap: 12px; }
    .summary-section { display: flex; flex-direction: column; gap: 6px; }
    .summary-section-title {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .summary-tile {
      background: var(--c-subtle); border: 1px solid var(--c-border-2); border-radius: 12px;
      padding: 12px 8px; text-align: center;
      display: flex; flex-direction: column; gap: 4px;
    }
    .summary-val {
      font-size: 20px; font-weight: 700; color: var(--c-text);
      display: flex; align-items: baseline; justify-content: center; gap: 2px;
    }
    .summary-sub { font-size: 14px; font-weight: 400; color: var(--c-text-2); }
    .summary-lbl { font-size: 10px; color: var(--c-text-2); font-weight: 500; }
    .summary-combined-goal {
      margin-top: 6px; display: flex; align-items: center; gap: 8px;
    }
    .scg-track {
      flex: 1; height: 4px; background: var(--c-border); border-radius: 2px; overflow: hidden;
    }
    .scg-fill {
      height: 100%; background: var(--c-brand); border-radius: 2px; transition: width 0.4s ease;
    }
    .scg-label { font-size: 11px; font-weight: 600; color: var(--c-text-2); white-space: nowrap; }

    /* ── Filter bar spacing (match History's gaps) ───────── */
    app-filter-bar { display: block; margin-top: 14px; margin-bottom: -12px; }

    /* ── Exercise list ────────────────────────────────────── */
    .pr-section {
      margin: 16px 16px 0; background: var(--c-card);
      border-radius: 14px; box-shadow: 0 2px 8px var(--c-shadow);
      overflow: hidden;
    }
    .pr-title {
      margin: 0; padding: 14px 16px 10px;
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
      text-transform: uppercase; letter-spacing: 0.05em;
      border-bottom: 1px solid var(--c-border);
    }
    .pr-item:last-child .pr-row { border-bottom: none; }
    .pr-item:last-child:has(.expanded) .pr-row { border-bottom: 1px solid var(--c-border-2); }
    .pr-row {
      width: 100%; display: flex; align-items: center; gap: 12px;
      padding: 13px 14px 13px 0; background: none; border: none;
      border-bottom: 1px solid var(--c-border-2); cursor: pointer;
      text-align: left; color: var(--c-text);
      transition: background 0.15s;
      &:active { background: var(--c-border-2); }
      &.expanded { background: var(--c-subtle); }
    }
    .pr-bar { width: 5px; min-width: 5px; height: 44px; border-radius: 0 3px 3px 0; }
    .pr-name { flex: 1; font-size: 15px; font-weight: 500; }
    .pr-weight { font-size: 15px; font-weight: 700; color: #d97706; }
    .pr-chevron { font-size: 18px; color: var(--c-text-3); transition: transform 0.2s ease; }
    .pr-chevron--open { transform: rotate(180deg); }

    /* ── Empty / new-user state ──────────────────────────── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 60px 24px; text-align: center;
      .empty-icon { font-size: 64px; color: var(--c-border); }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--c-text); }
      p { margin: 0; color: var(--c-text-2); }
    }
    .loading-icon { animation: pulse-dot 1.2s ease-in-out infinite; }
    @keyframes pulse-dot {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50%       { opacity: 1;   transform: scale(1.2); }
    }

    .filter-empty {
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      gap: 8px; padding: 32px 24px; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 36px; }
      p { margin: 0; font-size: 14px; }
    }

    .btn-cta {
      margin-top: 6px; padding: 12px 28px;
      background: var(--c-brand); color: white;
      border: none; border-radius: 12px;
      font-size: 15px; font-weight: 600;
      cursor: pointer; text-decoration: none;
      display: inline-block;
      &:active { opacity: 0.85; }
    }
  `],
})
export class ChartsComponent {
  private exerciseService = inject(ExerciseService);
  private workoutService  = inject(WorkoutService);
  private settingsService = inject(UserSettingsService);
  private sportService    = inject(SportService);
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

  readonly thisWeekCount = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    const monday = mondayOf(today);
    const sunday = addDays(monday, 6);
    return this.workoutService.doneWorkouts().filter(w => w.date >= monday && w.date <= sunday).length;
  });

  readonly goalMode        = computed(() => this.settingsService.goalMode());
  readonly weeklyGoal      = computed(() => this.settingsService.weeklyActivityGoal());
  readonly weeklyGymGoal   = computed(() => this.settingsService.weeklyGymGoal());
  readonly weeklySportGoal = computed(() => this.settingsService.weeklySportGoal());

  readonly thisWeekSportCount = computed(() => {
    const today  = new Date().toISOString().slice(0, 10);
    const monday = mondayOf(today);
    const sunday = addDays(monday, 6);
    return this.sportService.sessions().filter(s => s.date >= monday && s.date <= sunday).length;
  });

  readonly combinedWeeklyBarPct = computed(() => {
    const g = this.weeklyGoal();
    if (!g) return 0;
    return Math.min(100, Math.round(((this.thisWeekCount() + this.thisWeekSportCount()) / g) * 100));
  });
  readonly combinedWeeklyMet = computed(() => {
    const g = this.weeklyGoal();
    return !!g && (this.thisWeekCount() + this.thisWeekSportCount()) >= g;
  });

  readonly weekStreak = computed(() => {
    const workouts = this.workoutService.doneWorkouts();
    if (workouts.length === 0) return 0;
    const today = new Date().toISOString().slice(0, 10);
    let streak = 0;
    let weekStart = mondayOf(today);
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
          .flatMap(w => w.entries.filter(e => e.exerciseId === ex.id).flatMap(e => e.sets.map(s => setMaxWeight(s))))
          .filter(w => w > 0);
        const display = allWeights.length ? kgToDisplay(Math.max(...allWeights), unit) : null;
        return { exercise: ex, display, color: CATEGORY_COLORS[ex.category] };
      });

    const catFilter = this.filterCat();
    const cats = catFilter ? [catFilter] : (['push', 'pull', 'legs'] as ExerciseCategory[]);
    return cats
      .map(cat => ({
        cat,
        label: CATEGORY_LABELS[cat],
        color: CATEGORY_COLORS[cat],
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
