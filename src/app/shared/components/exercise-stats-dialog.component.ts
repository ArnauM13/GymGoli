import { Component, computed, inject, input, signal } from '@angular/core';
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

      <!-- Title -->
      <div class="esd-header">
        <span class="material-symbols-outlined esd-header-icon">bar_chart</span>
        <h2 class="esd-title">{{ resolvedName() }}</h2>
      </div>

      @if (isLoading()) {
        <div class="esd-loading-wrap">
          <span class="esd-loading-bar"></span>
        </div>
      }

      @if (!isLoading() && recentSessions().length === 0) {
        <div class="esd-empty">
          <span class="material-symbols-outlined esd-empty-icon">show_chart</span>
          <p>Sense dades per a aquest exercici</p>
        </div>
      }

      @if (recentSessions().length > 0) {
        <div class="esd-list">
          @for (s of recentSessions(); track s.date) {
            <div class="esd-item">
              <div class="esd-item-bar"></div>
              <div class="esd-item-body">
                <!-- Subtitle row: date + feeling -->
                <div class="esd-item-head">
                  <span class="esd-item-date">{{ formatDate(s.date) }}</span>
                  @if (s.feeling) {
                    <span class="esd-item-feeling">
                      {{ getFeelingEmoji(s.feeling) }} {{ getFeelingLabel(s.feeling) }}
                    </span>
                  }
                </div>
                <!-- Sets horizontal -->
                <div class="esd-sets">
                  @for (set of s.sets; track $index) {
                    <span class="esd-set-pill">
                      {{ dispW(set.weight) }}{{ unit() }}<span class="esd-set-reps">&nbsp;×&nbsp;{{ set.reps }}</span>
                      @for (d of (set.drops ?? []); track $index) {
                        <span class="esd-drop-sep">→</span>{{ dispW(d.weight) }}{{ unit() }}<span class="esd-set-reps">&nbsp;×&nbsp;{{ d.reps }}</span>
                      }
                    </span>
                  }
                </div>
              </div>
            </div>
          }
        </div>

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
      padding: 0; display: flex; flex-direction: column;
      max-height: 80vh; overflow: hidden;
    }
    .esd-wrap:not(.esd-inline) { min-width: min(320px, 90vw); }

    /* ── Header ── */
    .esd-header {
      display: flex; align-items: center; gap: 8px;
      padding: 20px 20px 16px;
      border-bottom: 1px solid var(--c-border-2);
    }
    .esd-header-icon {
      font-size: 18px; color: var(--c-brand);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .esd-title {
      margin: 0; font-size: 16px; font-weight: 700; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ── Loading ── */
    .esd-loading-wrap {
      height: 3px; margin: 12px 20px; border-radius: 2px;
      background: color-mix(in srgb, var(--c-brand) 12%, transparent); overflow: hidden;
    }
    .esd-loading-bar {
      display: block; height: 100%; width: 40%;
      background: var(--c-brand); border-radius: 2px;
      animation: esd-slide 1.2s ease-in-out infinite;
    }
    @keyframes esd-slide {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }

    /* ── Empty ── */
    .esd-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 36px 24px; text-align: center; color: var(--c-text-3);
    }
    .esd-empty-icon {
      font-size: 44px;
      font-variation-settings: 'FILL' 0, 'wght' 200;
    }
    .esd-empty p { margin: 0; font-size: 14px; }

    /* ── Session list ── */
    .esd-list {
      overflow-y: auto; padding: 14px 14px 6px;
      display: flex; flex-direction: column; gap: 8px;
    }

    /* ── Session item card (item-card pattern) ── */
    .esd-item {
      display: flex; align-items: stretch;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden;
    }
    .esd-item-bar {
      width: 5px; flex-shrink: 0;
      background: var(--c-brand); opacity: 0.7;
    }
    .esd-item-body {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 7px;
      padding: 10px 12px;
    }

    /* Date + feeling row */
    .esd-item-head { display: flex; align-items: center; gap: 8px; }
    .esd-item-date {
      font-size: 13px; font-weight: 700; color: var(--c-text);
    }
    .esd-item-feeling {
      font-size: 11px; font-weight: 500; color: var(--c-text-3);
    }

    /* Sets row */
    .esd-sets { display: flex; flex-wrap: wrap; gap: 5px; }
    .esd-set-pill {
      display: inline-flex; align-items: baseline;
      padding: 3px 9px; border-radius: 20px;
      background: color-mix(in srgb, var(--c-brand) 10%, var(--c-card));
      font-size: 12px; font-weight: 700; color: var(--c-brand);
      white-space: nowrap;
    }
    .esd-drop-sep { margin: 0 3px; opacity: 0.6; font-weight: 500; }
    .esd-set-reps { font-size: 11px; font-weight: 500; color: var(--c-text-3); }

    /* ── Footer ── */
    .esd-footer { padding: 10px 14px 18px; display: flex; justify-content: center; }
    .esd-btn-charts {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 9px 16px; border: none; border-radius: 12px;
      background: var(--c-brand); color: #fff;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s, transform 0.1s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 17px; }
      &:hover  { background: var(--c-brand-dk); }
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

  readonly isInline  = computed(() => !this.data);
  readonly isLoading = signal(false);

  /** Last 3 sessions with full sets, newest first */
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
    const id = this.data?.exerciseId;
    if (!id) return;
    this.isLoading.set(true);
    this.workoutService.loadWorkoutsForExercise(id)
      .finally(() => this.isLoading.set(false));
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
    return d.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
