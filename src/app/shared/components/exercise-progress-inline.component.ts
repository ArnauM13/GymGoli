import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
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

import { Workout } from '../../core/models/workout.model';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Title, Tooltip, Legend);

type Metric = 'weight' | 'volume' | 'feeling';

interface ChartPoint { date: string; value: number; }

@Component({
  selector: 'app-exercise-progress-inline',
  standalone: true,
  template: `
    @if (exerciseId()) {
      <!-- Metric tabs -->
      <div class="epi-tabs">
        @for (m of metrics; track m.value) {
          <button class="epi-tab"
            [class.active]="selectedMetric() === m.value"
            (click)="selectedMetric.set(m.value)">
            {{ m.label }}
          </button>
        }
      </div>

      <!-- Chart -->
      <div class="epi-chart-wrap">
        @if (chartData().length === 0) {
          <div class="epi-no-data">
            <span class="material-symbols-outlined">show_chart</span>
            <p>Cap dada registrada</p>
          </div>
        } @else {
          <canvas #chartCanvas></canvas>
        }
      </div>

      <!-- Stats grid -->
      @if (chartData().length > 0) {
        <div class="epi-stats">
          <div class="epi-stat">
            <span class="epi-stat-val">{{ stats().total }}</span>
            <span class="epi-stat-lbl">Sessions</span>
          </div>
          <div class="epi-stat">
            <span class="epi-stat-val">{{ stats().max }}</span>
            <span class="epi-stat-lbl">Màxim</span>
          </div>
          <div class="epi-stat">
            <span class="epi-stat-val">{{ stats().last }}</span>
            <span class="epi-stat-lbl">Últim</span>
          </div>
          <div class="epi-stat">
            <span class="epi-stat-val"
              [class.positive]="stats().trend > 0"
              [class.negative]="stats().trend < 0">
              {{ stats().trend > 0 ? '+' : '' }}{{ stats().trend }}%
            </span>
            <span class="epi-stat-lbl">Tendència</span>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; }

    /* ── Tabs ── */
    .epi-tabs {
      display: flex; gap: 6px; padding: 12px 14px 8px;
    }
    .epi-tab {
      flex: 1; padding: 7px 4px;
      border: 1.5px solid var(--c-border-2); border-radius: 8px;
      background: var(--c-card); font-size: 12px; font-weight: 600; color: var(--c-text-3);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: var(--c-card); border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }

    /* ── Chart ── */
    .epi-chart-wrap {
      margin: 0 14px;
      background: var(--c-card); border-radius: 12px;
      box-shadow: 0 1px 6px var(--c-shadow);
      padding: 12px 12px 8px;
      height: 200px;
      display: flex; align-items: center; justify-content: center;
    }
    canvas { max-height: 176px; width: 100% !important; }

    .epi-no-data {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      color: var(--c-border); text-align: center;
      .material-symbols-outlined { font-size: 36px; }
      p { margin: 0; font-size: 13px; }
    }

    /* ── Stats ── */
    .epi-stats {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 6px; padding: 10px 14px 14px;
    }
    .epi-stat {
      background: var(--c-card); border-radius: 10px;
      padding: 10px 6px; text-align: center;
      box-shadow: 0 1px 4px var(--c-shadow);
      display: flex; flex-direction: column; gap: 3px;
    }
    .epi-stat-val { font-size: 16px; font-weight: 700; color: var(--c-text); }
    .epi-stat-lbl { font-size: 10px; color: var(--c-text-3); }
    .positive { color: #4caf50; }
    .negative { color: #ef5350; }
  `],
})
export class ExerciseProgressInlineComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private workoutService  = inject(WorkoutService);
  private settingsService = inject(UserSettingsService);

  readonly exerciseId   = input<string | null>(null);
  readonly exerciseName = input<string | null>(null);

  readonly selectedMetric = signal<Metric>('weight');

  readonly metrics: { value: Metric; label: string }[] = [
    { value: 'weight', label: 'Pes màx' },
    { value: 'volume', label: 'Volum' },
    { value: 'feeling', label: 'Fatiga' },
  ];

  private chart: Chart | null = null;

  readonly chartData = computed<ChartPoint[]>(() => {
    const exId = this.exerciseId();
    if (!exId) return [];
    const metric = this.selectedMetric();
    return this.workoutService.getWorkoutsForExercise(exId)
      .map(w => ({ date: w.date, value: this._extractMetric(w, exId, metric) }))
      .filter(p => p.value > 0);
  });

  readonly stats = computed(() => {
    const data = this.chartData();
    if (!data.length) return { total: 0, max: 0, last: 0, trend: 0 };
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
      this.settingsService.darkMode(); // track so chart re-colours on theme change
      this._update(data, metric);
    });
  }

  ngAfterViewInit(): void {
    const data = this.chartData();
    if (data.length > 0) this._create(data, this.selectedMetric());
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  private _extractMetric(w: Workout, exId: string, metric: Metric): number {
    const entry = w.entries.find(e => e.exerciseId === exId);
    if (!entry) return 0;
    if (metric === 'feeling') return entry.feeling ?? 0;
    if (!entry.sets.length) return 0;
    if (metric === 'weight') return Math.max(...entry.sets.map(s => s.weight));
    return entry.sets.reduce((sum, s) => sum + s.weight * s.reps, 0);
  }

  private _label(metric: Metric): string {
    return { weight: 'Pes màxim (kg)', volume: 'Volum (kg)', feeling: 'Fatiga (1-5)' }[metric];
  }

  private _fmt(dateStr: string): string {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
  }

  private _update(data: ChartPoint[], metric: Metric): void {
    if (!data.length) { this.chart?.destroy(); this.chart = null; return; }
    if (!this.canvasRef) { setTimeout(() => this._update(data, metric), 0); return; }
    if (this.chart) {
      this.chart.data.labels                  = data.map(d => this._fmt(d.date));
      this.chart.data.datasets[0].data        = data.map(d => d.value);
      this.chart.data.datasets[0].label       = this._label(metric);
      this.chart.update();
    } else {
      this._create(data, metric);
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

  private _create(data: ChartPoint[], metric: Metric): void {
    if (!this.canvasRef) return;
    this.chart?.destroy();
    const ctx = this.canvasRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const { brand, brandAlpha, text, muted, grid } = this._chartColors();

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => this._fmt(d.date)),
        datasets: [{
          label: this._label(metric),
          data: data.map(d => d.value),
          borderColor: brand,
          backgroundColor: brandAlpha,
          borderWidth: 2.5,
          pointBackgroundColor: brand,
          pointRadius: 4,
          pointHoverRadius: 6,
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
            backgroundColor: text, padding: 10,
            callbacks: {
              title: items => items[0]?.label ?? '',
              label: item  => ` ${item.formattedValue}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 10 }, color: muted, maxRotation: 40, autoSkip: true, maxTicksLimit: 8 },
          },
          y: {
            grid: { color: grid },
            ticks: { font: { size: 10 }, color: muted },
            beginAtZero: false,
          },
        },
      },
    });
  }
}
