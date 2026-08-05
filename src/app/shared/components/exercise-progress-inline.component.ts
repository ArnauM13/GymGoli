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

import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { Workout, setMaxWeight, setVolume } from '../../core/models/workout.model';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { FeedbackService } from '../services/feedback.service';
import {
  DeleteExerciseDataDialogComponent,
  DeleteExerciseDataRange,
} from './delete-exercise-data-dialog.component';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Title, Tooltip, Legend);

type Metric = 'weight' | 'volume' | 'feeling' | 'reps';

interface ChartPoint { date: string; value: number; }

@Component({
  selector: 'app-exercise-progress-inline',
  standalone: true,
  template: `
    @if (exerciseId()) {
      <!-- Metric tabs — bodyweight exercises get a 2×2 grid (reps progression
           + added weight), weighted ones the single-row weight/volume/fatiga. -->
      <div class="epi-tabs" [class.epi-tabs--grid]="isBodyweight()">
        @for (m of metrics(); track m.value) {
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
      } @else {
        <div class="epi-bottom-pad"></div>
      }

      <!-- Danger zone: wipe this exercise's logged data (all / a time range) -->
      @if (sessionCount() > 0) {
        <div class="epi-danger">
          <button class="epi-delete-btn" [disabled]="isDeleting()"
                  (click)="openDeleteDialog()">
            <span class="material-symbols-outlined">delete_sweep</span>
            {{ isDeleting() ? 'Eliminant…' : "Eliminar dades d'aquest exercici" }}
          </button>
        </div>
      }
    }
  `,
  styles: [`
    /* The drawer gets its own tinted background + top divider so it reads as
       a distinct, expanded region rather than blending into the section
       above (which shares the same --c-card as the elements inside here). */
    :host {
      display: block;
      background: var(--c-subtle);
      border-top: 1px solid var(--c-border-2);
      padding-bottom: 6px;
    }

    /* ── Tabs ── */
    .epi-tabs {
      display: flex; gap: 6px; padding: 12px 14px 8px;
    }
    /* Bodyweight: 4 metrics laid out in 2 rows of 2. */
    .epi-tabs--grid { display: grid; grid-template-columns: 1fr 1fr; }
    .epi-tab {
      flex: 1; padding: 7px 4px;
      border: 1.5px solid var(--c-border); border-radius: 8px;
      background: var(--c-card); font-size: 12px; font-weight: 600; color: var(--c-text-3);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: var(--c-card); border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }

    /* ── Chart ── */
    .epi-chart-wrap {
      margin: 0 14px;
      background: var(--c-card); border-radius: 12px;
      border: 1.5px solid var(--c-border);
      padding: 12px 12px 8px;
      height: 200px;
      display: flex; align-items: center; justify-content: center;
    }
    canvas { max-height: 176px; width: 100% !important; }

    .epi-no-data {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      color: var(--c-text-3); text-align: center;
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
      border: 1.5px solid var(--c-border);
      padding: 10px 6px; text-align: center;
      display: flex; flex-direction: column; gap: 3px;
    }
    .epi-stat-val { font-size: 16px; font-weight: 700; color: var(--c-text); }
    .epi-stat-lbl { font-size: 10px; color: var(--c-text-3); }
    .positive { color: #4caf50; }
    .negative { color: #ef5350; }
    .epi-bottom-pad { height: 14px; }

    /* ── Danger zone ── */
    .epi-danger { padding: 2px 14px 14px; }
    .epi-delete-btn {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 10px; border-radius: 10px;
      border: 1.5px solid color-mix(in srgb, #ef5350 38%, var(--c-border));
      background: color-mix(in srgb, #ef5350 6%, var(--c-card));
      color: #e04b48; font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover:not(:disabled) { background: color-mix(in srgb, #ef5350 12%, var(--c-card)); border-color: #ef5350; }
      &:active:not(:disabled) { transform: scale(0.98); }
      &:disabled { opacity: 0.6; cursor: default; }
    }
  `],
})
export class ExerciseProgressInlineComponent implements AfterViewInit, OnDestroy {
  @ViewChild('chartCanvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  private workoutService  = inject(WorkoutService);
  private settingsService = inject(UserSettingsService);
  private exerciseService = inject(ExerciseService);
  private dialog          = inject(MatDialog);
  private feedback        = inject(FeedbackService);

  readonly exerciseId   = input<string | null>(null);
  readonly exerciseName = input<string | null>(null);

  readonly selectedMetric = signal<Metric>('weight');

  private readonly WEIGHTED_METRICS: { value: Metric; label: string }[] = [
    { value: 'weight', label: 'Pes màx' },
    { value: 'volume', label: 'Volum' },
    { value: 'feeling', label: 'Fatiga' },
  ];

  // Bodyweight exercises track reps done (real progression) instead of the
  // logged weight, which is only the extra load (0 for pure calisthenics).
  // "Pes afegit" stays as a 4th option so belt/dip-belt work is still charted.
  private readonly BODYWEIGHT_METRICS: { value: Metric; label: string }[] = [
    { value: 'reps',    label: 'Reps' },
    { value: 'volume',  label: 'Volum' },
    { value: 'feeling', label: 'Fatiga' },
    { value: 'weight',  label: 'Pes afegit' },
  ];

  /** Bodyweight (calisthenics) exercises log no base weight, so their
   *  progression is read from reps, not the added load. */
  readonly isBodyweight = computed(() =>
    this.exerciseService.getById(this.exerciseId() ?? '')?.loadType === 'bodyweight');

  readonly metrics = computed(() =>
    this.isBodyweight() ? this.BODYWEIGHT_METRICS : this.WEIGHTED_METRICS);

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

  readonly isLoading = signal(false);

  /** Number of logged sessions for this exercise — drives the visibility of
   *  the "delete data" action (no data ⇒ nothing to delete). */
  readonly sessionCount = computed(() => {
    const exId = this.exerciseId();
    return exId ? this.workoutService.getWorkoutsForExercise(exId).length : 0;
  });

  readonly isDeleting = signal(false);

  private _metricInitialised = false;

  constructor() {
    // Pick the natural default metric once the exercise type is known:
    // reps for bodyweight, weight for everything else.
    effect(() => {
      const ex = this.exerciseService.getById(this.exerciseId() ?? '');
      if (this._metricInitialised || !ex) return;
      this._metricInitialised = true;
      this.selectedMetric.set(ex.loadType === 'bodyweight' ? 'reps' : 'weight');
    });

    effect(() => {
      const id = this.exerciseId();
      if (!id) return;
      this.isLoading.set(true);
      this.workoutService.loadWorkoutsForExercise(id)
        .finally(() => { if (this.exerciseId() === id) this.isLoading.set(false); });
    });

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

  /** Opens the delete-scope dialog, then wipes the chosen slice of this
   *  exercise's history — with a running toast at every step so the user
   *  always knows what happened. */
  async openDeleteDialog(): Promise<void> {
    const exId = this.exerciseId();
    if (!exId || this.isDeleting()) return;
    const name = this.exerciseName() ?? 'aquest exercici';

    const sessionDates = this.workoutService.getWorkoutsForExercise(exId).map(w => w.date);
    if (sessionDates.length === 0) {
      this.feedback.info('No hi ha dades per eliminar');
      return;
    }

    const ref = this.dialog.open(DeleteExerciseDataDialogComponent, {
      data: { exerciseName: name, sessionDates },
      maxWidth: '360px',
      panelClass: 'confirm-dialog-panel',
    });
    const range = await firstValueFrom(ref.afterClosed()) as DeleteExerciseDataRange | null | undefined;
    if (!range) return; // cancelled / dismissed

    this.isDeleting.set(true);
    this.feedback.info('Eliminant dades…', 1500);
    try {
      const { sessions } = await this.workoutService.deleteExerciseData(exId, range);
      if (sessions === 0) {
        this.feedback.info('No s\'ha eliminat cap sessió');
      } else {
        const label = sessions === 1 ? 'sessió' : 'sessions';
        this.feedback.success(`Dades eliminades · ${sessions} ${label} de ${name}`);
      }
    } catch {
      this.feedback.error('No s\'han pogut eliminar les dades');
    } finally {
      this.isDeleting.set(false);
    }
  }

  private _extractMetric(w: Workout, exId: string, metric: Metric): number {
    const entry = w.entries.find(e => e.exerciseId === exId);
    if (!entry) return 0;
    if (metric === 'feeling') return entry.feeling ?? 0;
    const workingSets = entry.sets.filter(s => !s.warmup);
    if (!workingSets.length) return 0;
    if (metric === 'weight') return Math.max(...workingSets.map(s => setMaxWeight(s)));
    // Total reps across working sets (drop stages included) — the progression
    // signal for bodyweight exercises where the logged weight stays at 0.
    if (metric === 'reps') {
      return workingSets.reduce(
        (sum, s) => sum + s.reps + (s.drops ?? []).reduce((d, x) => d + x.reps, 0), 0);
    }
    // Volume folds in bodyweight so dominades & co. count their real load, not
    // just the added weight (0 for pure bodyweight). "Pes màx" stays as logged.
    const ex = this.exerciseService.getById(exId);
    const ctx = { bodyweightKg: this.settingsService.bodyweightKg(), loadType: ex?.loadType, bodyweightFactor: ex?.bodyweightFactor };
    return workingSets.reduce((sum, s) => sum + setVolume(s, ctx), 0);
  }

  private _label(metric: Metric): string {
    return { weight: 'Pes màxim (kg)', volume: 'Volum (kg)', feeling: 'Fatiga (1-5)', reps: 'Reps totals' }[metric];
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
