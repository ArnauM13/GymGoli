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
import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { addDays, mondayOf } from '../../shared/utils/calendar-utils';
import { kgToDisplay } from '../../shared/utils/weight.utils';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Title, Tooltip, Legend);

type Metric      = 'weight' | 'volume' | 'feeling';
type SportMetric = 'duration' | 'feeling';

interface ChartPoint {
  date: string;
  value: number;
}

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Progrés</h1>
      </header>

      <!-- Summary strip (only when there is data) -->
      @if (!isLoading() && totalWorkouts() > 0) {
        <div class="summary-strip">
          <div class="summary-tile">
            <span class="summary-val">{{ totalWorkouts() }}</span>
            <span class="summary-lbl">Entrenaments</span>
          </div>
          <div class="summary-tile">
            <span class="summary-val">
              {{ thisWeekCount() }}
              @if (weeklyGoal()) {
                <span class="summary-sub">/ {{ weeklyGoal() }}</span>
              }
            </span>
            <span class="summary-lbl">Aquesta setmana</span>
          </div>
          <div class="summary-tile">
            <span class="summary-val">
              @if (weekStreak() > 0) { 🔥 }{{ weekStreak() }}
            </span>
            <span class="summary-lbl">Set. consecutives</span>
          </div>
        </div>
      }

      <!-- Exercise selector -->
      <div class="section">
        <label class="select-label">Exercici</label>
        <div class="select-wrap">
          <select class="exercise-select" [(ngModel)]="selectedExerciseId" (ngModelChange)="onExerciseChange()">
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
      } @else if (personalRecords().length > 0) {
        <!-- Personal records -->
        <div class="pr-section">
          <h3 class="pr-title">Records personals</h3>
          @for (r of personalRecords(); track r.exercise.id) {
            <button class="pr-row" (click)="selectRecord(r.exercise.id)">
              <span class="pr-bar" [style.background]="r.color"></span>
              <span class="pr-name">{{ r.exercise.name }}</span>
              <span class="pr-weight">{{ r.display }} {{ unit() }}</span>
              <span class="material-symbols-outlined pr-chevron">chevron_right</span>
            </button>
          }
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

    <!-- ══ SECCIÓ ESPORTS ══ -->
    @if (sports().length > 0) {
      <header class="page-header">
        <h1>Esports</h1>
      </header>

      <div class="section">
        <label class="select-label">Esport</label>
        <div class="select-wrap">
          <select class="exercise-select" [(ngModel)]="selectedSportId" (ngModelChange)="onSportChange()">
            <option value="">Selecciona un esport...</option>
            @for (s of sports(); track s.id) {
              <option [value]="s.id">{{ s.name }}</option>
            }
          </select>
        </div>
      </div>

      @if (selectedSportId) {
        <div class="metric-tabs">
          @for (m of sportMetrics; track m.value) {
            <button class="metric-tab"
                    [class.active]="selectedSportMetric() === m.value"
                    (click)="selectedSportMetric.set(m.value)">{{ m.label }}</button>
          }
        </div>

        <div class="chart-container" [style.--sport-c]="selectedSportColor()">
          @if (sportChartData().length === 0) {
            <div class="no-data">
              <span class="material-symbols-outlined">show_chart</span>
              <p>Cap dada per a aquest esport</p>
            </div>
          } @else {
            <canvas #sportChartCanvas class="chart-canvas"></canvas>
          }
        </div>

        @if (sportChartData().length > 0) {
          <div class="stats-grid">
            <div class="stat-card">
              <span class="stat-value">{{ sportStats().total }}</span>
              <span class="stat-label">Sessions</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ sportStats().avg }}</span>
              <span class="stat-label">{{ selectedSportMetric() === 'duration' ? 'Mitjana (min)' : 'Sensació mit.' }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-value">{{ sportStats().max }}</span>
              <span class="stat-label">{{ selectedSportMetric() === 'duration' ? 'Màxim (min)' : 'Millor' }}</span>
            </div>
            <div class="stat-card">
              <span class="stat-value" [class.positive]="sportStats().trend > 0" [class.negative]="sportStats().trend < 0">
                {{ sportStats().trend > 0 ? '+' : '' }}{{ sportStats().trend }}%
              </span>
              <span class="stat-label">Tendència</span>
            </div>
          </div>
        }
      }
    }
  `,
  styles: [`
    .page { padding: 0 0 80px; }

    .page-header {
      padding: 16px 16px 8px;
      h1 { margin: 0; font-size: 22px; font-weight: 600; }
    }

    /* ── Summary strip ───────────────────────────────────── */
    .summary-strip {
      display: grid; grid-template-columns: 1fr 1fr 1fr;
      gap: 8px; padding: 4px 16px 8px;
    }
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
      margin: 4px 16px 0; background: var(--c-card);
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
    .pr-weight { font-size: 15px; font-weight: 700; color: var(--c-brand); min-width: 64px; text-align: right; }
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
  @ViewChild('chartCanvas')      canvasRef!:     ElementRef<HTMLCanvasElement>;
  @ViewChild('sportChartCanvas') sportCanvasRef!: ElementRef<HTMLCanvasElement>;

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

  readonly totalWorkouts = computed(() => this.workoutService.workouts().length);

  readonly thisWeekCount = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    const monday = mondayOf(today);
    const sunday = addDays(monday, 6);
    return this.workoutService.workouts().filter(w => w.date >= monday && w.date <= sunday).length;
  });

  readonly weeklyGoal = computed(() => this.settingsService.weeklyActivityGoal());

  readonly weekStreak = computed(() => {
    const workouts = this.workoutService.workouts();
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

  selectRecord(exerciseId: string): void {
    this._selectedExerciseId.set(exerciseId);
    this.chart?.destroy();
    this.chart = null;
  }

  // ── Sport chart ──────────────────────────────────────────────────────────

  readonly sports = computed(() => this.sportService.sports());

  private _selectedSportId = signal('');
  get selectedSportId(): string { return this._selectedSportId(); }
  set selectedSportId(v: string) { this._selectedSportId.set(v); }

  readonly selectedSportMetric = signal<SportMetric>('duration');

  readonly sportMetrics: { value: SportMetric; label: string }[] = [
    { value: 'duration', label: 'Durada' },
    { value: 'feeling',  label: 'Sensació' },
  ];

  private sportChart: Chart | null = null;

  readonly selectedSportColor = computed(() =>
    this.sports().find(s => s.id === this._selectedSportId())?.color ?? 'var(--c-brand)'
  );

  readonly sportChartData = computed<ChartPoint[]>(() => {
    const sportId = this._selectedSportId();
    if (!sportId) return [];
    const metric = this.selectedSportMetric();
    return this.sportService.sessions()
      .filter(s => s.sportId === sportId)
      .filter(s => metric === 'feeling' ? s.feeling != null : s.duration != null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => ({
        date:  s.date,
        value: metric === 'duration' ? (s.duration ?? 0) : (s.feeling ?? 0),
      }));
  });

  readonly sportStats = computed(() => {
    const data = this.sportChartData();
    if (data.length === 0) return { total: 0, avg: 0, max: 0, trend: 0 };
    const values = data.map(d => d.value);
    const max    = Math.max(...values);
    const avg    = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    const last   = values.at(-1) ?? 0;
    const first  = values[0] ?? 0;
    const trend  = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
    return { total: data.length, avg, max, trend };
  });

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

    effect(() => {
      const data   = this.sportChartData();
      const metric = this.selectedSportMetric();
      const color  = this.selectedSportColor();
      this.settingsService.darkMode();
      this.updateSportChart(data, metric, color);
    });
  }

  ngAfterViewInit(): void {
    if (this.chartData().length > 0) {
      this.createChart(this.chartData(), this.selectedMetric());
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.sportChart?.destroy();
  }

  onExerciseChange(): void {
    this.chart?.destroy();
    this.chart = null;
  }

  onSportChange(): void {
    this.sportChart?.destroy();
    this.sportChart = null;
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

  private updateSportChart(data: ChartPoint[], metric: SportMetric, color: string): void {
    if (data.length === 0) { this.sportChart?.destroy(); this.sportChart = null; return; }
    if (!this.sportCanvasRef) {
      setTimeout(() => this.updateSportChart(data, metric, color), 0);
      return;
    }
    if (this.sportChart) {
      this.sportChart.data.labels = data.map(d => this.formatDate(d.date));
      this.sportChart.data.datasets[0].data  = data.map(d => d.value);
      this.sportChart.data.datasets[0].label = this.getSportMetricLabel(metric);
      (this.sportChart.data.datasets[0] as { borderColor: string }).borderColor = color;
      (this.sportChart.data.datasets[0] as { pointBackgroundColor: string }).pointBackgroundColor = color;
      this.sportChart.update();
    } else {
      this.createSportChart(data, metric, color);
    }
  }

  private createSportChart(data: ChartPoint[], metric: SportMetric, color: string): void {
    if (!this.sportCanvasRef) return;
    this.sportChart?.destroy();
    const ctx = this.sportCanvasRef.nativeElement.getContext('2d');
    if (!ctx) return;
    const { text, muted, grid } = this._chartColors();
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const colorAlpha = isNaN(r) ? 'rgba(0,104,116,0.1)' : `rgba(${r},${g},${b},0.1)`;
    this.sportChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => this.formatDate(d.date)),
        datasets: [{
          label: this.getSportMetricLabel(metric),
          data: data.map(d => d.value),
          borderColor: color, backgroundColor: colorAlpha,
          borderWidth: 2.5,
          pointBackgroundColor: color, pointRadius: 5, pointHoverRadius: 7,
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

  private getSportMetricLabel(metric: SportMetric): string {
    return metric === 'duration' ? 'Durada (min)' : 'Sensació (1-5)';
  }

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
  }
}
