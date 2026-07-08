import { Component, inject, input, output } from '@angular/core';

import { Sport, SportSession } from '../../../core/models/sport.model';
import { FeelingLevel, Workout } from '../../../core/models/workout.model';
import { WorkoutService } from '../../../core/services/workout.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { CategoryService } from '../../../core/services/category.service';
import { FeedbackService } from '../../services/feedback.service';
import {
  formatFeeling, getCatLabel, getExerciseNames, isWorkoutPlanned, sportSessionSummary,
  workoutCardColor, workoutCategoryList, workoutPrimaryColor, workoutSetsCount, workoutVolumeFmt,
} from '../../utils/workout-card.utils';

export interface DayFeedEntry {
  date: string;
  workouts: Workout[];
  sports: { sport: Sport; session: SportSession }[];
}

@Component({
  selector: 'app-day-feed-cards',
  standalone: true,
  template: `
    @for (w of day()?.workouts ?? []; track w.id) {
      <div class="feed-card" [class.feed-card--planned]="isPlanned(w)"
           [style.--wc]="workoutPrimaryColor(w)"
           (click)="handleWorkoutClick(w)">
        <div class="fc-bar" [style.background]="workoutCardColor(w)"></div>
        <div class="fc-info">
          <div class="fc-badges">
            @for (cat of workoutCategoryList(w); track cat) {
              <span class="fc-badge" [style.--cc]="getCatColor(cat)">{{ getCatLabel(cat) }}</span>
            }
            @if (isPlanned(w)) {
              <span class="fc-badge fc-badge--planned">Planificat</span>
            }
          </div>
          <span class="fc-exercises">{{ w.entries.length ? getExerciseNames(w) : 'Pla buit' }}</span>
          @if (!isPlanned(w)) {
            <div class="fc-stats">
              <span class="fc-stat">
                <span class="material-symbols-outlined">fitness_center</span>
                <strong>{{ w.entries.length }}</strong> exerc
              </span>
              @if (workoutSetsCount(w); as n) {
                <span class="fc-stat-sep">·</span>
                <span class="fc-stat">
                  <span class="material-symbols-outlined">repeat</span>
                  <strong>{{ n }}</strong> sèr
                </span>
              }
              @if (workoutVolumeFmt(w); as vol) {
                <span class="fc-stat-sep">·</span>
                <span class="fc-stat fc-stat--vol">
                  <span class="material-symbols-outlined">weight</span>
                  <strong>{{ vol }}</strong>
                </span>
              }
              @if (w.feeling) {
                <span class="fc-stat-sep">·</span>
                <span class="fc-stat">{{ emojiOf(w.feeling) }}</span>
              }
            </div>
          }
        </div>
        @if (isPlanned(w)) {
          <button class="fc-start" (click)="$event.stopPropagation(); startPlan(w)" title="Comença">
            <span class="material-symbols-outlined">play_arrow</span>
          </button>
        } @else {
          <span class="material-symbols-outlined fc-chevron">chevron_right</span>
        }
      </div>
    }
    @for (item of day()?.sports ?? []; track item.session.id) {
      <div class="feed-sport-row" [style.--ic]="item.sport.color">
        <span class="material-symbols-outlined feed-sport-icon">{{ item.sport.icon }}</span>
        <div class="fsr-info">
          <span class="feed-sport-name">{{ item.sport.name }}</span>
          @if (sportSummary(item.session, item.sport); as meta) {
            <span class="feed-sport-meta">{{ meta }}</span>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    /* ── Feed workout cards (bigger, richer than the compact .workout-card) ── */
    .feed-card {
      display: flex; align-items: center;
      margin-bottom: 8px;
      border: 1.5px solid color-mix(in srgb, var(--wc, var(--c-border-2)) 38%, var(--c-border-2));
      border-radius: 16px;
      background: color-mix(in srgb, var(--wc, var(--c-card)) 6%, var(--c-card));
      box-shadow: 0 2px 8px var(--c-shadow); overflow: hidden;
      cursor: pointer; touch-action: manipulation;
      transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
      &:hover {
        box-shadow: 0 3px 12px var(--c-shadow-md);
        background: color-mix(in srgb, var(--wc, var(--c-card)) 10%, var(--c-card));
        border-color: color-mix(in srgb, var(--wc, var(--c-border)) 45%, var(--c-border));
      }
    }
    .feed-card--planned {
      border-style: dashed;
      border-color: color-mix(in srgb, var(--wc, var(--c-brand)) 55%, var(--c-border-2));
      background: color-mix(in srgb, var(--wc, var(--c-brand)) 5%, var(--c-card));
      &:hover { background: color-mix(in srgb, var(--wc, var(--c-brand)) 9%, var(--c-card)); }
    }
    .fc-bar { width: 5px; align-self: stretch; flex-shrink: 0; }
    .fc-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 5px;
      padding: 13px 12px;
    }
    .fc-badges { display: flex; flex-wrap: wrap; gap: 4px; }
    .fc-badge {
      display: inline-block; padding: 2px 8px; border-radius: 8px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.2px; line-height: 1.4;
      background: color-mix(in srgb, var(--cc, var(--c-border)) 15%, transparent);
      color: color-mix(in srgb, var(--cc, var(--c-text-2)) 75%, var(--c-text));
    }
    html.dark .fc-badge { background: color-mix(in srgb, var(--cc, var(--c-border)) 18%, transparent); }
    .fc-badge--planned { background: rgba(var(--c-brand-rgb), 0.12); color: var(--c-brand); }
    .fc-exercises {
      font-size: 14px; font-weight: 700; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .fc-stats {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-size: 12px; color: var(--c-text-2); font-weight: 500;
    }
    .fc-stat {
      display: inline-flex; align-items: center; gap: 3px;
      .material-symbols-outlined { font-size: 14px; color: color-mix(in srgb, var(--wc, var(--c-text-3)) 60%, var(--c-text-3)); }
      strong { font-weight: 700; color: var(--c-text-2); }
    }
    .fc-stat-sep { color: var(--c-border); }
    .fc-stat--vol strong { color: var(--wc, var(--c-brand)); }
    .fc-chevron { font-size: 22px; color: var(--c-text-3); flex-shrink: 0; margin-right: 8px; }
    .fc-start {
      width: 38px; height: 38px; border: none; border-radius: 10px; flex-shrink: 0;
      margin-right: 10px;
      background: var(--c-brand); color: white;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-brand-dk); }
    }

    .feed-sport-row {
      display: flex; align-items: center; gap: 12px;
      padding: 13px 14px; margin-bottom: 8px;
      border: 1.5px solid var(--c-border-2); border-radius: 16px;
      background: color-mix(in srgb, var(--ic, var(--c-card)) 5%, var(--c-card));
    }
    .feed-sport-icon {
      font-size: 22px; color: var(--ic, var(--c-text-2)); font-variation-settings: 'FILL' 1;
      flex-shrink: 0;
    }
    .fsr-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .feed-sport-name { font-size: 14px; font-weight: 700; color: var(--c-text); }
    .feed-sport-meta { font-size: 12px; color: var(--c-text-3); }
  `],
})
export class DayFeedCardsComponent {
  private workoutService = inject(WorkoutService);
  private settingsService = inject(UserSettingsService);
  private categoryService = inject(CategoryService);
  private feedback       = inject(FeedbackService);

  readonly day  = input<DayFeedEntry | null>(null);
  readonly open = output<string>();

  readonly isPlanned          = isWorkoutPlanned;
  readonly workoutCategoryList = workoutCategoryList;
  readonly getExerciseNames    = getExerciseNames;
  readonly workoutSetsCount    = workoutSetsCount;
  readonly workoutVolumeFmt    = workoutVolumeFmt;

  workoutPrimaryColor(w: Workout): string { return workoutPrimaryColor(w, this.categoryService); }
  workoutCardColor(w: Workout): string { return workoutCardColor(w, this.categoryService); }
  getCatLabel(cat: string): string { return getCatLabel(cat, this.categoryService); }
  getCatColor(cat: string): string { return this.categoryService.color(cat); }

  emojiOf(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  sportSummary(sub: { duration?: number; feeling?: FeelingLevel; subtypeId?: string }, sport: Sport): string {
    return sportSessionSummary(sub, sport, this.settingsService.difficultyScale());
  }

  handleWorkoutClick(w: Workout): void {
    if (this.isPlanned(w)) this.startPlan(w);
    else this.open.emit(w.id);
  }

  async startPlan(w: Workout): Promise<void> {
    try {
      await this.workoutService.startPlannedWorkout(w.id);
      this.open.emit(w.id);
    } catch {
      this.feedback.error('Error en iniciar el pla', 2500);
    }
  }
}
