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
import { Workout } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { WorkoutService } from '../../core/services/workout.service';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Title, Tooltip, Legend);

type Metric = 'weight' | 'volume' | 'feeling';

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
        <select class="exercise-select" [(ngModel)]="selectedExerciseId" (ngModelChange)="onExerciseChange()">
          <option value="">Selecciona un exercici...</option>
          @for (ex of exercises(); track ex.id) {
            <option [value]="ex.id">{{ ex.name }}</option>
          }
        </select>
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
  `,
  styles: [`
    .page { padding: 0 0 80px; }

    .page-header {
      padding: 16px 16px 8px;
      h1 { margin: 0; font-size: 22px; font-weight: 600; }
    }

    .section { padding: 8px 16px; }

    .select-label { display: block; font-size: 12px; color: #666; font-weight: 500; margin-bottom: 6px; }

    .exercise-select {
      width: 100%;
      padding: 10px 12px;
      border: 1.5px solid #e0e0e0;
      border-radius: 10px;
      font-size: 15px;
      background: white;
      color: #1a1a1a;
      outline: none;
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24'%3E%3Cpath fill='%23888' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 36px;
      cursor: pointer;

      &:focus { border-color: #006874; }
    }

    .metric-tabs {
      display: flex;
      gap: 6px;
      padding: 4px 16px 12px;
    }

    .metric-tab {
      flex: 1;
      padding: 8px 4px;
      border: 1.5px solid #e0e0e0;
      border-radius: 8px;
      background: white;
      font-size: 13px;
      font-weight: 500;
      color: #666;
      cursor: pointer;
      transition: all 0.2s;

      &.active { background: #006874; color: white; border-color: #006874; }
      &:hover:not(.active) { border-color: #006874; color: #006874; }
    }

    .chart-container {
      margin: 0 16px;
      background: white;
      border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
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
      color: #bbb;
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
      background: white;
      border-radius: 10px;
      padding: 12px 8px;
      text-align: center;
      box-shadow: 0 1px 4px rgba(0,0,0,0.07);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .stat-value { font-size: 18px; font-weight: 700; color: #1a1a1a; }
    .stat-label { font-size: 11px; color: #888; }
    .positive { color: #4caf50; }
    .negative { color: #ef5350; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 60px 24px;
      text-align: center;

      .empty-icon { font-size: 64px; color: #ddd; }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: #444; }
      p { margin: 0; color: #888; }
    }
  `],
})
export class ChartsComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private exerciseService = inject(ExerciseService);
  private workoutService = inject(WorkoutService);

  readonly exercises = this.exerciseService.exercises;
  selectedExerciseId = '';
  readonly selectedMetric = signal<Metric>('weight');

  readonly metrics: { value: Metric; label: string }[] = [
    { value: 'weight', label: 'Pes màx' },
    { value: 'volume', label: 'Volum' },
    { value: 'feeling', label: 'Fatiga' },
  ];

  private chart: Chart | null = null;

  readonly chartData = computed<ChartPoint[]>(() => {
    if (!this.selectedExerciseId) return [];
    const workouts = this.workoutService.getWorkoutsForExercise(this.selectedExerciseId);
    const metric = this.selectedMetric();
    return workouts
      .map(w => ({ date: w.date, value: this.extractMetric(w, this.selectedExerciseId, metric) }))
      // For 'feeling', skip workouts where no feeling was set (value=0)
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
    effect(() => {
      const data = this.chartData();
      const metric = this.selectedMetric();
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
    // Feeling is now an entry-level property (not per-set)
    if (metric === 'feeling') return entry.feeling ?? 0;
    if (entry.sets.length === 0) return 0;
    if (metric === 'weight') return Math.max(...entry.sets.map(s => s.weight));
    if (metric === 'volume') return entry.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
    return 0;
  }

  private getMetricLabel(metric: Metric): string {
    return { weight: 'Pes màxim (kg)', volume: 'Volum total (kg)', feeling: 'Sensació (1-5)' }[metric];
  }

  private updateChart(data: ChartPoint[], metric: Metric): void {
    if (!this.canvasRef) return;
    if (data.length === 0) { this.chart?.destroy(); this.chart = null; return; }

    if (this.chart) {
      this.chart.data.labels = data.map(d => this.formatDate(d.date));
      this.chart.data.datasets[0].data = data.map(d => d.value);
      this.chart.data.datasets[0].label = this.getMetricLabel(metric);
      this.chart.update();
    } else {
      this.createChart(data, metric);
    }
  }

  private createChart(data: ChartPoint[], metric: Metric): void {
    if (!this.canvasRef) return;
    this.chart?.destroy();

    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => this.formatDate(d.date)),
        datasets: [{
          label: this.getMetricLabel(metric),
          data: data.map(d => d.value),
          borderColor: '#006874',
          backgroundColor: 'rgba(0, 104, 116, 0.1)',
          borderWidth: 2.5,
          pointBackgroundColor: '#006874',
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
            backgroundColor: '#1a1a1a',
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
              color: '#888',
              maxRotation: 40,
              // Always show all labels (important for single-point charts)
              autoSkip: false,
            },
          },
          y: {
            grid: { color: '#f0f0f0' },
            ticks: { font: { size: 11 }, color: '#888' },
            // Ensure Y axis has visible range even with a single data point
            beginAtZero: false,
          },
        },
      },
    });
  }

  private formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    // "3 feb" → readable day label on X axis
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
  }
}
