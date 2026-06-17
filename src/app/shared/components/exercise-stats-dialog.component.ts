import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';


import { FEELING_EMOJI, FEELING_LABEL, FeelingLevel } from '../../core/models/workout.model';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { kgToDisplay } from '../utils/weight.utils';

interface SessionPoint {
  date: string;
  maxWeight: number;
  feeling?: FeelingLevel;
  pct: number; // width percentage relative to overall max
}

@Component({
  selector: 'app-exercise-stats',
  standalone: true,
  imports: [],
  template: `
    <div class="esd-wrap" [class.esd-inline]="isInline()">
      <!-- Header (dialog mode only) -->
      @if (!isInline()) {
        <div class="esd-header">
          <div class="esd-title-block">
            <span class="material-symbols-outlined esd-title-icon">bar_chart</span>
            <h2 class="esd-title">{{ resolvedName() }}</h2>
          </div>
          <button class="esd-close-btn" type="button" (click)="close()" aria-label="Tancar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>
      }

      @if (isLoading()) {
        <div class="esd-loading-bar-wrap">
          <span class="esd-loading-bar"></span>
        </div>
      }

      @if (!isLoading() && sessions().length === 0) {
        <div class="esd-empty">
          <span class="material-symbols-outlined">show_chart</span>
          <p>Sense dades per a aquest exercici</p>
        </div>
      }

      @if (sessions().length > 0) {
        <!-- Summary stats row -->
        <div class="esd-stats-row">
          <div class="esd-stat">
            <span class="esd-stat-value">{{ summary().total }}</span>
            <span class="esd-stat-label">Sessions</span>
          </div>
          <div class="esd-stat">
            <span class="esd-stat-value">{{ dispW(summary().maxWeight) }}{{ unit() }}</span>
            <span class="esd-stat-label">Màxim</span>
          </div>
          <div class="esd-stat">
            <span class="esd-stat-value">{{ dispW(summary().last) }}{{ unit() }}</span>
            <span class="esd-stat-label">Últim</span>
          </div>
          <div class="esd-stat">
            <span class="esd-stat-value"
              [class.positive]="summary().trend > 0"
              [class.negative]="summary().trend < 0">
              {{ summary().trend > 0 ? '+' : '' }}{{ summary().trend }}%
            </span>
            <span class="esd-stat-label">Tendència</span>
          </div>
        </div>

        <!-- Section label: últims N entrenaments -->
        <div class="esd-section-label">
          <span class="material-symbols-outlined esd-section-icon">history</span>
          <span class="esd-section-text">Últims entrenaments</span>
          <span class="esd-section-chip">{{ sessionsDesc().length }} de {{ summary().total }}</span>
        </div>

        <!-- Session bars (newest first, max 5) -->
        <div class="esd-sessions">
          @for (s of sessionsDesc(); track s.date) {
            <div class="esd-session-row">
              <span class="esd-session-date">{{ formatDate(s.date) }}</span>
              <div class="esd-bar-track">
                <div class="esd-bar-fill" [style.width.%]="s.pct"></div>
              </div>
              <div class="esd-session-right">
                <span class="esd-session-weight">{{ dispW(s.maxWeight) }}{{ unit() }}</span>
                @if (s.feeling) {
                  <span class="esd-session-feeling" [title]="getFeelingLabel(s.feeling)">
                    {{ getFeelingEmoji(s.feeling) }}
                  </span>
                }
              </div>
            </div>
          }
        </div>

        <!-- Footer CTA -->
        <div class="esd-footer">
          <button class="esd-btn-charts" type="button" (click)="goToCharts()">
            <span class="material-symbols-outlined">insights</span>
            Veure gràfiques avançades
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .esd-wrap {
      display: flex; flex-direction: column;
      max-height: 80vh;
      overflow: hidden;
    }
    .esd-wrap:not(.esd-inline) {
      min-width: min(340px, 90vw);
    }
    .esd-inline {
      padding: 0;
    }

    /* ── Header ── */
    .esd-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 12px 16px 20px;
    }
    .esd-title-block { display: flex; align-items: center; gap: 8px; }
    .esd-title-icon { font-size: 22px; color: var(--c-brand); }
    .esd-title { margin: 0; font-size: 18px; font-weight: 700; color: var(--c-text); }
    .esd-close-btn {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-hover); color: var(--c-text); }
    }

    /* Loading bar */
    .esd-loading-bar-wrap {
      height: 3px; margin: 0 20px 12px; border-radius: 2px;
      background: rgba(var(--c-brand-rgb), 0.1); overflow: hidden;
    }
    .esd-loading-bar {
      display: block; height: 100%; width: 40%; background: var(--c-brand); border-radius: 2px;
      animation: esd-slide 1.2s ease-in-out infinite;
    }
    @keyframes esd-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }

    /* ── Empty state ── */
    .esd-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 40px 24px; color: var(--c-text-3); text-align: center;
      .material-symbols-outlined { font-size: 48px; }
      p { margin: 0; font-size: 14px; }
    }

    /* ── Summary stats ── */
    .esd-stats-row {
      display: grid; grid-template-columns: repeat(4, 1fr);
      gap: 8px; padding: 0 16px 16px;
    }
    .esd-inline .esd-stats-row {
      padding: 12px 12px 12px;
    }
    .esd-stat {
      background: var(--c-subtle); border-radius: 10px; padding: 10px 6px;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
    }
    .esd-stat-value { font-size: 16px; font-weight: 700; color: var(--c-text); }
    .esd-stat-label { font-size: 10px; color: var(--c-text-3); text-align: center; }
    .positive { color: #4caf50 !important; }
    .negative { color: #ef5350 !important; }

    /* ── Section label ── */
    .esd-section-label {
      display: flex; align-items: center; gap: 6px;
      padding: 0 16px 8px;
    }
    .esd-inline .esd-section-label { padding: 0 12px 8px; }
    .esd-section-icon {
      font-size: 15px; color: #888;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .esd-section-text {
      flex: 1; font-size: 12px; font-weight: 700; color: #888;
      text-transform: uppercase; letter-spacing: 0.3px;
    }
    .esd-section-chip {
      font-size: 11px; font-weight: 700; color: #999;
      background: #f0f0f0; border-radius: 10px; padding: 2px 8px;
    }

    /* ── Session bars ── */
    .esd-sessions {
      overflow-y: auto; padding: 0 16px 12px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .esd-inline .esd-sessions { padding: 0 12px 12px; }
    .esd-session-row { display: flex; align-items: center; gap: 10px; }
    .esd-session-date {
      font-size: 12px; color: var(--c-text-3); width: 52px; flex-shrink: 0; text-align: right;
    }
    .esd-bar-track {
      flex: 1; height: 10px; background: var(--c-border-2); border-radius: 5px; overflow: hidden;
    }
    .esd-bar-fill {
      height: 100%; background: var(--c-brand); border-radius: 5px;
      transition: width 0.3s ease;
    }
    .esd-session-right { display: flex; align-items: center; gap: 4px; min-width: 70px; }
    .esd-session-weight {
      font-size: 13px; font-weight: 700; color: var(--c-brand); min-width: 44px;
    }
    .esd-session-feeling { font-size: 16px; line-height: 1; }

    /* ── Footer CTA ── */
    .esd-footer {
      padding: 4px 16px 20px;
    }
    .esd-inline .esd-footer { padding: 4px 12px 16px; }
    .esd-btn-charts {
      width: 100%; display: flex; align-items: center; justify-content: center; gap: 7px;
      padding: 11px 16px; border: none; border-radius: 12px;
      background: #006874; color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s, transform 0.1s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: #005a63; }
      &:active { transform: scale(0.97); }
    }
  `],
})
export class ExerciseStatsDialogComponent {
  private dialogRef       = inject(MatDialogRef<ExerciseStatsDialogComponent>, { optional: true });
  readonly data: { exerciseId: string; exerciseName: string } | null = inject(MAT_DIALOG_DATA, { optional: true });
  private workoutService  = inject(WorkoutService);
  private settingsService = inject(UserSettingsService);
  private router          = inject(Router);

  readonly unit = this.settingsService.weightUnit;
  dispW(kg: number): number { return kgToDisplay(kg, this.unit()); }

  readonly inlineExerciseId   = input<string | null>(null);
  readonly inlineExerciseName = input<string | null>(null);

  readonly resolvedId   = computed(() => this.data?.exerciseId   ?? this.inlineExerciseId()   ?? '');
  readonly resolvedName = computed(() => this.data?.exerciseName ?? this.inlineExerciseName() ?? '');

  readonly isInline = computed(() => !this.data);

  readonly isLoading = this.workoutService.isLoading;

  readonly sessions = computed((): SessionPoint[] => {
    const id = this.resolvedId();
    if (!id) return [];
    const workouts = this.workoutService.getWorkoutsForExercise(id);
    type Raw = { date: string; maxWeight: number; feeling?: FeelingLevel };
    const points: Raw[] = [];
    for (const w of workouts) {
      const entry = w.entries.find(e => e.exerciseId === id);
      if (!entry || !entry.sets.length) continue;
      points.push({ date: w.date, maxWeight: Math.max(...entry.sets.map(s => s.weight)), feeling: entry.feeling });
    }
    const overallMax = Math.max(...points.map(p => p.maxWeight), 1);
    return points.map(p => ({ ...p, pct: Math.round((p.maxWeight / overallMax) * 100) }));
  });

  /** Last 5 sessions, newest first */
  readonly sessionsDesc = computed(() => [...this.sessions()].reverse().slice(0, 5));

  readonly summary = computed(() => {
    const s = this.sessions();
    if (!s.length) return { total: 0, maxWeight: 0, last: 0, trend: 0 };
    const weights = s.map(p => p.maxWeight);
    const maxWeight = Math.max(...weights);
    const last  = weights.at(-1)!;
    const first = weights[0];
    const trend = first === 0 ? 0 : Math.round(((last - first) / first) * 100);
    return { total: s.length, maxWeight, last, trend };
  });

  constructor() {
    if (!this.data) return; // inline mode — parent loads data
    this.workoutService.loadAllWorkouts();
  }

  close(): void { this.dialogRef?.close(); }

  goToCharts(): void {
    this.dialogRef?.close();
    this.router.navigate(['/charts'], { queryParams: { exerciseId: this.resolvedId() } });
  }

  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }
  getFeelingLabel(level: FeelingLevel): string  { return FEELING_LABEL[level]; }

  formatDate(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
  }
}
