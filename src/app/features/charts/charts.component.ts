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

import { Exercise } from '../../core/models/exercise.model';
import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
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
  imports: [FormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Progrés</h1>
      </header>

      <!-- Exercise selector -->
      <div class="section">
        <label class="select-label">Exercici</label>
        <div class="select-wrap">
          <select class="exercise-select" [(ngModel)]="selectedExerciseId" (ngModelChange)="onExerciseChange()">
            <option value="">Selecciona un exercici...</option>
            @for (ex of exercises(); track ex.id) {
              <option [value]="ex.id">{{ ex.name }}</option>
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
      } @else {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">bar_chart</span>
          <h2>Visualitza el teu progrés</h2>
          <p>Selecciona un exercici per veure les gràfiques d'evolució</p>
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

    .section { padding: 8px 16px; }

    .select-label { display: block; font-size: 12px; color: var(--c-text-2); font-weight: 500; margin-bottom: 6px; }

    .select-wrap { position: relative; }

    .select-loading {
      position: absolute; right: 36px; top: 50%; transform: translateY(-50%);
      pointer-events: none;
    }
    .loading-dot {
      display: block; width: 8px; height: 8px; border-radius: 50%;
      background: var(--c-brand);
      animation: pulse-dot 1s ease-in-out infinite;
    }
    @keyframes pulse-dot {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50%       { opacity: 1;   transform: scale(1.2); }
    }

    .exercise-select {
      width: 100%;
      padding: 10px 12px;
      border: 1.5px solid var(--c-border);
      border-radius: 10px;
      font-size: 15px;
      background: var(--c-card);
      color: var(--c-text);
      outline: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%23888' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 36px;
      cursor: pointer;

      &:focus { border-color: var(--c-brand); }
    }

    .metric-tabs {
      display: flex;
      gap: 6px;
      padding: 4px 16px 12px;
    }

    .metric-tab {
      flex: 1;
      padding: 8px 4px;
      border: 1.5px solid var(--c-border);
      border-radius: 8px;
      background: var(--c-card);
      font-size: 13px;
      font-weight: 500;
      color: var(--c-text-2);
      cursor: pointer;
      transition: all 0.2s;

      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }

    .chart-container {
      margin: 0 16px;
      background: var(--c-card);
      border-radius: 14px;
      box-shadow: 0 2px 8px var(--c-shadow);
      padding: 16px;
      height: 240px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chart-canvas { max-height: 208px; }

    .no-data {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      color: var(--c-text-3);
      text-align: center;

      .material-symbols-outlined { font-size: 48px; }
      p { margin: 0; font-size: 14px; }
    }

    .stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 8px;
      padding: 12px 16px;
    }

    .stat-card {
      background: var(--c-card);
      border-radius: 10px;
      padding: 12px 8px;
      text-align: center;
      box-shadow: 0 1px 4px var(--c-shadow);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-value { font-size: 18px; font-weight: 700; color: var(--c-text); }
    .stat-label { font-size: 11px; color: var(--c-text-2); }
    .positive { color: #4caf50; }
    .negative { color: #ef5350; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 60px 24px;
      text-align: center;

      .empty-icon { font-size: 64px; color: var(--c-border); }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: var(--c-text); }
      p { margin: 0; color: var(--c-text-2); }
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

  /** Only show exercises that have at least one set recorded in loaded workouts */
  readonly exercises = computed(() => {
    const withData = this.workoutService.exercisesWithData();
    return this.exerciseService.exercises().filter(e => withData.has(e.id));
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

  // ── Sport chart ─────────────────────────────────────────────────────────────

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
    const max = Math.max(...values);
    const last = values.at(-1) ?? 0;
    const first = values[0] ?? 0;
    const trend = first === 0 ? 0 : Math.round(((last - first) / first) * 100);

    return { total: data.length, max, last, trend };
  });

  constructor() {
    // Load all workout history once (lazy, cached — no-op if already loaded)
    this.workoutService.loadAllWorkouts();

    effect(() => {
      const data   = this.chartData();
      const metric = this.selectedMetric();
      this.settingsService.darkMode(); // track so chart re-colours on theme change
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
    // Feeling is now an entry-level property (not per-set)
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
    // Canvas may not be in DOM yet (rendered by @if after data arrives) — retry after render
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
    const s       = getComputedStyle(document.documentElement);
    const brand   = s.getPropertyValue('--c-brand').trim()     || '#006874';
    const rgb     = s.getPropertyValue('--c-brand-rgb').trim() || '0,104,116';
    const text    = s.getPropertyValue('--c-text').trim()      || '#1a1a1a';
    const muted   = s.getPropertyValue('--c-text-3').trim()    || '#888';
    const grid    = s.getPropertyValue('--c-border-2').trim()  || '#f0f0f0';
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
          borderColor: brand,
          backgroundColor: brandAlpha,
          borderWidth: 2.5,
          pointBackgroundColor: brand,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: text,
            padding: 10,
            callbacks: {
              title: items => items[0]?.label ?? '',
              label: item => ` ${item.formattedValue}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              font: { size: 11 },
              color: muted,
              maxRotation: 40,
              // Always show all labels (important for single-point charts)
              autoSkip: false,
            },
          },
          y: {
            grid: { color: grid },
            ticks: { font: { size: 11 }, color: muted },
            // Ensure Y axis has visible range even with a single data point
            beginAtZero: false,
          },
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
    const colorAlpha = `rgba(${r},${g},${b},0.1)`;

    this.sportChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => this.formatDate(d.date)),
        datasets: [{
          label: this.getSportMetricLabel(metric),
          data: data.map(d => d.value),
          borderColor: color,
          backgroundColor: colorAlpha,
          borderWidth: 2.5,
          pointBackgroundColor: color,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: text,
            padding: 10,
            callbacks: {
              title: items => items[0]?.label ?? '',
              label: item  => ` ${item.formattedValue}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 }, color: muted, maxRotation: 40, autoSkip: false },
          },
          y: {
            grid: { color: grid },
            ticks: { font: { size: 11 }, color: muted },
            beginAtZero: false,
          },
        },
      },
    });
  }

  private getSportMetricLabel(metric: SportMetric): string {
    return metric === 'duration' ? 'Durada (min)' : 'Sensació (1-5)';
  }

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    // "3 feb" → readable day label on X axis
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
  }
}
