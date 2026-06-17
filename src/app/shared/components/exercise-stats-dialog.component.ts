import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { FEELING_EMOJI, FEELING_LABEL, FeelingLevel, WorkoutSet } from '../../core/models/workout.model';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { kgToDisplay } from '../utils/weight.utils';

interface SessionDetail {
  date: string;
  feeling?: FeelingLevel;
  sets: WorkoutSet[];
}

@Component({
  selector: 'app-exercise-stats',
  standalone: true,
  imports: [],
  template: `
    <div class="esd-wrap" [class.esd-inline]="isInline()">

      <!-- Header: title only, no close button -->
      <div class="esd-header">
        <span class="material-symbols-outlined esd-title-icon">bar_chart</span>
        <h2 class="esd-title">{{ resolvedName() }}</h2>
      </div>

      @if (isLoading()) {
        <div class="esd-loading-bar-wrap">
          <span class="esd-loading-bar"></span>
        </div>
      }

      @if (!isLoading() && recentSessions().length === 0) {
        <div class="esd-empty">
          <span class="material-symbols-outlined">show_chart</span>
          <p>Sense dades per a aquest exercici</p>
        </div>
      }

      @if (recentSessions().length > 0) {
        <div class="esd-sessions">
          @for (s of recentSessions(); track s.date) {
            <div class="esd-session-card">
              <!-- Subtitle: date + feeling -->
              <div class="esd-session-header">
                <span class="esd-session-date">{{ formatDate(s.date) }}</span>
                @if (s.feeling) {
                  <span class="esd-session-feeling" [title]="getFeelingLabel(s.feeling)">
                    {{ getFeelingEmoji(s.feeling) }}
                  </span>
                  <span class="esd-session-feeling-label">{{ getFeelingLabel(s.feeling) }}</span>
                }
              </div>
              <!-- Sets in horizontal scroll -->
              <div class="esd-sets-row">
                @for (set of s.sets; track $index) {
                  <span class="esd-set-pill">
                    {{ dispW(set.weight) }}{{ unit() }}<span class="esd-set-reps"> × {{ set.reps }}</span>
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
      max-height: 80vh; overflow: hidden;
    }
    .esd-wrap:not(.esd-inline) { min-width: min(340px, 90vw); }
    .esd-inline { padding: 0; }

    /* ── Header ── */
    .esd-header {
      display: flex; align-items: center; gap: 8px;
      padding: 20px 20px 14px;
    }
    .esd-title-icon {
      font-size: 20px; color: var(--c-brand);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .esd-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--c-text); }

    /* ── Loading bar ── */
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
      gap: 10px; padding: 36px 24px; color: var(--c-text-3); text-align: center;
      .material-symbols-outlined { font-size: 44px; font-variation-settings: 'FILL' 0, 'wght' 200; }
      p { margin: 0; font-size: 14px; }
    }

    /* ── Sessions list ── */
    .esd-sessions {
      overflow-y: auto; padding: 0 16px 4px;
      display: flex; flex-direction: column; gap: 10px;
    }
    .esd-inline .esd-sessions { padding: 0 12px 4px; }

    /* ── Session card ── */
    .esd-session-card {
      border: 1.5px solid #efefef; border-radius: 14px;
      background: white; padding: 10px 12px 12px; overflow: hidden;
    }
    .esd-session-header {
      display: flex; align-items: center; gap: 6px; margin-bottom: 8px;
    }
    .esd-session-date {
      font-size: 13px; font-weight: 700; color: var(--c-text);
    }
    .esd-session-feeling { font-size: 15px; line-height: 1; }
    .esd-session-feeling-label {
      font-size: 11px; color: var(--c-text-3); font-weight: 500;
    }

    /* ── Sets row ── */
    .esd-sets-row {
      display: flex; flex-wrap: wrap; gap: 5px;
    }
    .esd-set-pill {
      display: inline-flex; align-items: baseline; gap: 1px;
      padding: 4px 9px; border-radius: 20px;
      background: color-mix(in srgb, var(--c-brand) 10%, white);
      font-size: 13px; font-weight: 700; color: var(--c-brand);
      white-space: nowrap;
    }
    .esd-set-reps { font-size: 11px; font-weight: 600; color: var(--c-text-3); }

    /* ── Footer CTA ── */
    .esd-footer { padding: 10px 16px 20px; }
    .esd-inline .esd-footer { padding: 10px 12px 16px; }
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

  /** Last 3 sessions, newest first, with full sets data */
  readonly recentSessions = computed((): SessionDetail[] => {
    const id = this.resolvedId();
    if (!id) return [];
    const workouts = this.workoutService.getWorkoutsForExercise(id);
    const sessions: SessionDetail[] = [];
    for (const w of [...workouts].reverse()) {
      const entry = w.entries.find(e => e.exerciseId === id);
      if (!entry || !entry.sets.length) continue;
      sessions.push({ date: w.date, feeling: entry.feeling, sets: entry.sets });
      if (sessions.length === 3) break;
    }
    return sessions;
  });

  constructor() {
    if (!this.data) return;
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
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'long', year: 'numeric' });
  }
}
