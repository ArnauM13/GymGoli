import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { Workout } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { addDays, mondayOf } from '../../shared/utils/calendar-utils';
import { kgToDisplay } from '../../shared/utils/weight.utils';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Title, Tooltip, Legend);

type Metric = 'weight' | 'volume' | 'feeling';

interface ChartPoint {
  date: string;
  value: number;
}

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header title="Progrés" />

      <!-- Summary strip (only when there is data) -->
      @if (!isLoading() && totalWorkouts() > 0) {
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
      }

      <!-- Exercise selector -->
      <div class="section">
        <label class="select-label" for="exercise-select">Exercici</label>
        <div class="select-wrap">
          <select id="exercise-select" class="exercise-select" [(ngModel)]="selectedExerciseId" (ngModelChange)="onExerciseChange()">
            <option value="">Selecciona un exercici...</option>
            @for (group of exercisesByCategory(); track group.cat) {
              <optgroup [label]="group.label">
                @for (ex of group.exercises; track ex.id) {
                  <option [value]="ex.id">{{ ex.name }}</option>
                }
              </optgroup>
            }
          </select>
          @if (isLoading()) {
            <span class="select-loading" title="Carregant historial...">
              <span class="loading-dot"></span>
            </span>
          }
          @if (selectedExerciseId) {
            <button class="clear-exercise-btn" (click)="clearExercise()" aria-label="Canviar exercici">
              <span class="material-symbols-outlined">close</span>
            </button>
          }
        </div>
      </div>

      @if (selectedExerciseId) {
        <!-- Metric tabs -->
        <div class="metric-tabs">
          @for (m of metrics; track m.value) {
            <button
              class="metric-tab"
              [class.active]="selectedMetric() === m.value"
              (click)="selectedMetric.set(m.value)"
            >{{ m.label }}</button>
          }
        </div>

        <!-- Chart -->
        <div class="chart-container">
          @if (chartData().length === 0) {
            <div class="no-data">
              <span class="material-symbols-outlined">show_chart</span>
              <p>Cap dada per a aquest exercici</p>
            </div>
          } @else {
            <canvas #chartCanvas class="chart-canvas"></canvas>
          }
        </div>

        <!-- Stats summary -->
        @if (chartData().length > 0) {
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ stats().total }}</span>
              <span class="stat-label">Sessions</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ stats().max }}</span>
              <span class="stat-label">Màxim</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ stats().last }}</span>
              <span class="stat-label">Últim</span>
            </div>
            <div class="stat-card">
              <span class="stat-value" [class.positive]="stats().trend > 0" [class.negative]="stats().trend < 0">
                {{ stats().trend > 0 ? '+' : '' }}{{ stats().trend }}%
              </span>
              <span class="stat-label">Tendència</span>
            </div>
          </div>
        }
      } @else if (isLoading()) {
        <!-- Loading skeleton -->
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon loading-icon">bar_chart</span>
          <p style="color:var(--c-text-2)">Carregant historial...</p>
        </div>
      } @else if (!isLoading() && personalRecordGroups().length > 0) {
        <!-- Personal records grouped -->
        @for (group of personalRecordGroups(); track group.cat) {
          <div class="pr-section" [style.--pr-g]="group.color">
            <h3 class="pr-title">{{ group.label }}</h3>
            @for (r of group.records; track r.exercise.id) {
              <button class="pr-row" (click)="selectRecord(r.exercise.id)">
                <span class="pr-bar" [style.background]="r.color"></span>
                <span class="pr-name">{{ r.exercise.name }}</span>
                <span class="pr-weight">{{ r.display }} {{ unit() }}</span>
                <span class="material-symbols-outlined pr-chevron">chevron_right</span>
              </button>
            }
          </div>
        }
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

    /* ── Summary block ───────────────────────────────────── */
    .summary-block { display: flex; flex-direction: column; gap: 12px; padding: 8px 16px 4px; }
    .summary-section { display: flex; flex-direction: column; gap: 6px; }
    .summary-section-title {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      text-transform: uppercase; letter-spacing: 0.05em;
    }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .summary-tile {
      background: var(--c-card); border-radius: 12px;
      box-shadow: 0 1px 4px var(--c-shadow);
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

    /* ── Section / select ────────────────────────────────── */
    .section { padding: 8px 16px; }
    .select-label { display: block; font-size: 12px; color: var(--c-text-2); font-weight: 500; margin-bottom: 6px; }
    .select-wrap { position: relative; }

    .select-loading {
      position: absolute; right: 36px; top: 50%; transform: translateY(-50%);
      pointer-events: none;
    }
    .loading-dot {
      display: block; width: 8px; height: 8px; border-radius: 50%;
      background: var(--c-brand); animation: pulse-dot 1s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50%       { opacity: 1;   transform: scale(1.2); }
    }

    .exercise-select {
      width: 100%; padding: 10px 12px;
      border: 1.5px solid var(--c-border); border-radius: 10px;
      font-size: 15px; background: var(--c-card); color: var(--c-text);
      outline: none; appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%23888' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center;
      padding-right: 36px; cursor: pointer;
      &:focus { border-color: var(--c-brand); }
    }

    .clear-exercise-btn {
      position: absolute; right: 36px; top: 50%; transform: translateY(-50%);
      width: 28px; height: 28px; border-radius: 50%;
      border: none; background: var(--c-border-2); color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: var(--c-brand); color: #fff; }
    }

    /* ── Metric tabs ─────────────────────────────────────── */
    .metric-tabs { display: flex; gap: 6px; padding: 4px 16px 12px; }
    .metric-tab {
      flex: 1; padding: 8px 4px;
      border: 1.5px solid var(--c-border); border-radius: 8px;
      background: var(--c-card); font-size: 13px; font-weight: 500;
      color: var(--c-text-2); cursor: pointer; transition: all 0.2s;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }

    /* ── Chart ───────────────────────────────────────────── */
    .chart-container {
      margin: 0 16px; background: var(--c-card);
      border-radius: 14px; box-shadow: 0 2px 8px var(--c-shadow);
      padding: 16px; height: 240px;
      display: flex; align-items: center; justify-content: center;
    }
    .chart-canvas { max-height: 208px; }

    .no-data {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; color: var(--c-text-3); text-align: center;
      .material-symbols-outlined { font-size: 48px; }
      p { margin: 0; font-size: 14px; }
    }

    /* ── Stats grid ──────────────────────────────────────── */
    .stats-grid {
      display: grid; grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 8px; padding: 12px 16px;
    }
    .stat-card {
      background: var(--c-card); border-radius: 10px;
      padding: 12px 8px; text-align: center;
      box-shadow: 0 1px 4px var(--c-shadow);
      display: flex; flex-direction: column; gap: 4px;
    }
    .stat-value { font-size: 18px; font-weight: 700; color: var(--c-text); }
    .stat-label { font-size: 11px; color: var(--c-text-2); }
    .positive { color: #4caf50; }
    .negative { color: #ef5350; }

    /* ── Personal records ────────────────────────────────── */
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
    .pr-row {
      width: 100%; display: flex; align-items: center; gap: 12px;
      padding: 13px 14px 13px 0; background: none; border: none;
      border-bottom: 1px solid var(--c-border-2); cursor: pointer;
      text-align: left; color: var(--c-text);
      transition: background 0.15s;
      &:last-child { border-bottom: none; }
      &:active { background: var(--c-border-2); }
    }
    .pr-bar { width: 5px; min-width: 5px; height: 44px; border-radius: 0 3px 3px 0; }
    .pr-name { flex: 1; font-size: 15px; font-weight: 500; }
    .pr-weight { font-size: 15px; font-weight: 700; color: #d97706; min-width: 64px; text-align: right; }
    .pr-chevron { font-size: 18px; color: var(--c-text-3); }

    /* ── Empty / new-user state ──────────────────────────── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 60px 24px; text-align: center;
      .empty-icon { font-size: 64px; color: var(--c-border); }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--c-text); }
      p { margin: 0; color: var(--c-text-2); }
    }
    .loading-icon { animation: pulse-dot 1.2s ease-in-out infinite; }

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
export class ChartsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private exerciseService = inject(ExerciseService);
  private workoutService  = inject(WorkoutService);
  private settingsService = inject(UserSettingsService);
  private sportService    = inject(SportService);

  readonly unit = this.settingsService.weightUnit;

  readonly exercises = computed(() => {
    const withData = this.workoutService.exercisesWithData();
    return this.exerciseService.exercises().filter(e => withData.has(e.id));
  });

  readonly exercisesByCategory = computed(() => {
    const exList = this.exercises();
    return (['push', 'pull', 'legs'] as ExerciseCategory[])
      .map(cat => ({
        cat,
        label: CATEGORY_LABELS[cat],
        exercises: exList.filter(e => e.category === cat),
      }))
      .filter(g => g.exercises.length > 0);
  });
  readonly isLoading  = this.workoutService.isLoading;

  private _selectedExerciseId = signal('');
  get selectedExerciseId(): string { return this._selectedExerciseId(); }
  set selectedExerciseId(v: string) { this._selectedExerciseId.set(v); }
  readonly selectedMetric = signal<Metric>('weight');

  readonly metrics: { value: Metric; label: string }[] = [
    { value: 'weight', label: 'Pes màx' },
    { value: 'volume', label: 'Volum' },
    { value: 'feeling', label: 'Fatiga' },
  ];

  private chart: Chart | null = null;

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

  // ── Personal records ─────────────────────────────────────────────────────

  readonly personalRecords = computed(() => {
    const exercises = this.exerciseService.exercises();
    const withData  = this.workoutService.exercisesWithData();
    const unit      = this.unit();
    return exercises
      .filter(e => withData.has(e.id))
      .map(ex => {
        const allWeights = this.workoutService.getWorkoutsForExercise(ex.id)
          .flatMap(w => w.entries.filter(e => e.exerciseId === ex.id).flatMap(e => e.sets.map(s => s.weight)))
          .filter(w => w > 0);
        if (allWeights.length === 0) return null;
        const maxKg  = Math.max(...allWeights);
        const display = kgToDisplay(maxKg, unit);
        return { exercise: ex, maxKg, display, color: CATEGORY_COLORS[ex.category] };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
      .sort((a, b) => b.display - a.display);
  });

  readonly personalRecordGroups = computed(() => {
    const exercises = this.exerciseService.exercises();
    const withData  = this.workoutService.exercisesWithData();
    const unit      = this.unit();
    const allRecords = exercises
      .filter(e => withData.has(e.id))
      .map(ex => {
        const allWeights = this.workoutService.getWorkoutsForExercise(ex.id)
          .flatMap(w => w.entries.filter(e => e.exerciseId === ex.id).flatMap(e => e.sets.map(s => s.weight)))
          .filter(w => w > 0);
        if (allWeights.length === 0) return null;
        const maxKg  = Math.max(...allWeights);
        const display = kgToDisplay(maxKg, unit);
        return { exercise: ex, maxKg, display, color: CATEGORY_COLORS[ex.category] };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return (['push', 'pull', 'legs'] as ExerciseCategory[])
      .map(cat => ({
        cat,
        label: CATEGORY_LABELS[cat],
        color: CATEGORY_COLORS[cat],
        records: allRecords.filter(r => r.exercise.category === cat),
      }))
      .filter(g => g.records.length > 0);
  });

  selectRecord(exerciseId: string): void {
    this._selectedExerciseId.set(exerciseId);
    this.chart?.destroy();
    this.chart = null;
  }

  clearExercise(): void {
    this._selectedExerciseId.set('');
    this.chart?.destroy();
    this.chart = null;
  }

  readonly chartData = computed<ChartPoint[]>(() => {
    const exId = this._selectedExerciseId();
    if (!exId) return [];
    const workouts = this.workoutService.getWorkoutsForExercise(exId);
    const metric = this.selectedMetric();
    const unit   = this.unit();
    return workouts
      .map(w => {
        let value = this.extractMetric(w, exId, metric);
        if (metric === 'weight' || metric === 'volume') value = kgToDisplay(value, unit);
        return { date: w.date, value };
      })
      .filter(p => metric !== 'feeling' || p.value > 0);
  });

  readonly stats = computed(() => {
    const data = this.chartData();
    if (data.length === 0) return { total: 0, max: 0, last: 0, trend: 0 };
    const values = data.map(d => d.value);
    const max    = Math.max(...values);
    const last   = values.at(-1) ?? 0;
    const first  = values[0] ?? 0;
    const trend  = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
    return { total: data.length, max, last, trend };
  });

  constructor() {
    this.workoutService.loadAllWorkouts();

    effect(() => {
      const data   = this.chartData();
      const metric = this.selectedMetric();
      this.settingsService.darkMode();
      this.updateChart(data, metric);
    });
  }

  ngAfterViewInit(): void {
    if (this.chartData().length > 0) {
      this.createChart(this.chartData(), this.selectedMetric());
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  onExerciseChange(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  private extractMetric(workout: Workout, exerciseId: string, metric: Metric): number {
    const entry = workout.entries.find(e => e.exerciseId === exerciseId);
    if (!entry) return 0;
    if (metric === 'feeling') return entry.feeling ?? 0;
    if (entry.sets.length === 0) return 0;
    if (metric === 'weight') return Math.max(...entry.sets.map(s => s.weight));
    if (metric === 'volume') return entry.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    return 0;
  }

  private getMetricLabel(metric: Metric): string {
    const u = this.unit();
    return { weight: `Pes màxim (${u})`, volume: `Volum total (${u})`, feeling: 'Sensació (1-5)' }[metric];
  }

  private updateChart(data: ChartPoint[], metric: Metric): void {
    if (data.length === 0) { this.chart?.destroy(); this.chart = null; return; }
    if (!this.canvasRef) {
      setTimeout(() => this.updateChart(data, metric), 0);
      return;
    }
    if (this.chart) {
      this.chart.data.labels = data.map(d => this.formatDate(d.date));
      this.chart.data.datasets[0].data = data.map(d => d.value);
      this.chart.data.datasets[0].label = this.getMetricLabel(metric);
      this.chart.update();
    } else {
      this.createChart(data, metric);
    }
  }

  private _chartColors() {
    const s     = getComputedStyle(document.documentElement);
    const brand = s.getPropertyValue('--c-brand').trim()     || '#006874';
    const rgb   = s.getPropertyValue('--c-brand-rgb').trim() || '0,104,116';
    const text  = s.getPropertyValue('--c-text').trim()      || '#1a1a1a';
    const muted = s.getPropertyValue('--c-text-3').trim()    || '#888';
    const grid  = s.getPropertyValue('--c-border-2').trim()  || '#f0f0f0';
    return { brand, brandAlpha: `rgba(${rgb},0.1)`, text, muted, grid };
  }

  private createChart(data: ChartPoint[], metric: Metric): void {
    if (!this.canvasRef) return;
    this.chart?.destroy();
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const { brand, brandAlpha, text, muted, grid } = this._chartColors();
    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => this.formatDate(d.date)),
        datasets: [{
          label: this.getMetricLabel(metric),
          data: data.map(d => d.value),
          borderColor: brand, backgroundColor: brandAlpha,
          borderWidth: 2.5,
          pointBackgroundColor: brand, pointRadius: 5, pointHoverRadius: 7,
          fill: true, tension: 0.3,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: text, padding: 10,
            callbacks: { title: items => items[0]?.label ?? '', label: item => ` ${item.formattedValue}` },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, color: muted, maxRotation: 40, autoSkip: false } },
          y: { grid: { color: grid }, ticks: { font: { size: 11 }, color: muted }, beginAtZero: false },
        },
      },
    });
  }

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
  }
}
