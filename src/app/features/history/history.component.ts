import { Component, computed, inject, signal } from '@angular/core';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout } from '../../core/models/workout.model';
import { WorkoutService } from '../../core/services/workout.service';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CalendarComponent],
  template: `
    <div class="page">

      <!-- ── Page header ── -->
      <header class="page-header">
        <h1>Historial</h1>
        <span class="count">{{ allWorkouts().length }} entrenaments</span>
      </header>

      <!-- ══════════════════════════════════
           CALENDAR
      ═════════════════════════════════════ -->
      <div class="calendar-wrap">
        <app-calendar [selectedDate]="selectedDate()" (dateSelected)="selectDate($event)" />
      </div>

      <!-- ══════════════════════════════════
           SELECTED DATE DETAIL
      ═════════════════════════════════════ -->
      @if (selectedDate()) {
        <div class="detail-section">

          <div class="detail-header">
            <h2 class="detail-title">{{ selectedDateLabel() }}</h2>
          </div>

          @if (!selectedWorkout()) {
            <div class="detail-empty">
              <span class="material-symbols-outlined empty-icon">fitness_center</span>
              <p>Cap entrenament registrat</p>
            </div>
          } @else {
            <div class="detail-body">
              @for (entry of selectedWorkout()!.entries; track entry.exerciseId) {
                <div class="entry-row">
                  <div class="entry-name-row">
                    <span class="entry-name">{{ entry.exerciseName }}</span>
                    @if (entry.feeling) {
                      <span class="entry-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
                    }
                  </div>
                  @if (entry.sets.length > 0) {
                    <div class="sets-list">
                      @for (set of entry.sets; track $index) {
                        <div class="set-pill">
                          <span class="set-weight">{{ set.weight }}kg</span>
                          <span class="set-reps">× {{ set.reps }}</span>
                        </div>
                      }
                    </div>
                  } @else {
                    <span class="no-sets">Cap sèrie registrada</span>
                  }
                </div>
              }
            </div>
          }

        </div>
      }

      <!-- ══════════════════════════════════
           WORKOUT LIST
      ═════════════════════════════════════ -->
      @if (allWorkouts().length > 0) {
        <div class="list-section">
          <h2 class="list-title">Tots els entrenaments</h2>

          <div class="workout-list">
            @for (workout of allWorkouts(); track workout.id) {
              <div class="workout-card" [class.expanded]="expandedId() === workout.id">

                <button class="workout-header" (click)="toggleExpanded(workout.id)">
                  <div class="workout-date-block">
                    <span class="day">{{ getDay(workout.date) }}</span>
                    <span class="month-year">{{ getMonthYear(workout.date) }}</span>
                  </div>
                  <div class="workout-summary">
                    @if ((workout.categories ?? (workout.category ? [workout.category] : [])).length > 0) {
                      <div class="workout-badges-row">
                        @for (cat of (workout.categories ?? (workout.category ? [workout.category] : [])); track cat) {
                          <span class="workout-type-badge" [style.background]="getCatColor(cat)">{{ getCatLabel(cat) }}</span>
                        }
                        @if ((workout.categories ?? []).length > 1) {
                          <span class="workout-type-badge workout-hybrid-badge">Híbrid</span>
                        }
                      </div>
                    }
                    <span class="exercise-count">
                      {{ workout.entries.length }} exercici{{ workout.entries.length !== 1 ? 's' : '' }}
                    </span>
                    <span class="set-count">{{ totalSets(workout) }} sèries</span>
                  </div>
                  <span class="material-symbols-outlined chevron">
                    {{ expandedId() === workout.id ? 'expand_less' : 'expand_more' }}
                  </span>
                </button>

                @if (expandedId() === workout.id) {
                  <div class="workout-detail">
                    @for (entry of workout.entries; track entry.exerciseId) {
                      <div class="entry-row">
                        <div class="entry-name-row">
                          <span class="entry-name">{{ entry.exerciseName }}</span>
                          @if (entry.feeling) {
                            <span class="entry-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
                          }
                        </div>
                        @if (entry.sets.length > 0) {
                          <div class="sets-list">
                            @for (set of entry.sets; track $index) {
                              <div class="set-pill">
                                <span class="set-weight">{{ set.weight }}kg</span>
                                <span class="set-reps">× {{ set.reps }}</span>
                              </div>
                            }
                          </div>
                        } @else {
                          <span class="no-sets">Cap sèrie registrada</span>
                        }
                      </div>
                    }
                  </div>
                }

              </div>
            }
          </div>
        </div>
      } @else {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">calendar_month</span>
          <h2>Cap entrenament</h2>
          <p>Encara no hi ha cap entrenament registrat</p>
        </div>
      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 100px; }

    /* ── Page header ── */
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px 12px;
      h1 { margin: 0; font-size: 22px; font-weight: 700; }
      .count { font-size: 13px; color: #888; }
    }

    /* ════════════════════════════════
       CALENDAR
    ════════════════════════════════ */
    .calendar-wrap {
      margin: 0 16px 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 16px;
      overflow: hidden;
    }

    /* ════════════════════════════════
       SELECTED DATE DETAIL
    ════════════════════════════════ */
    .detail-section {
      margin: 0 16px 12px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    .detail-header {
      padding: 14px 16px 10px;
      border-bottom: 1px solid #f5f5f5;
    }

    .detail-title {
      margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;
      text-transform: capitalize;
    }

    .detail-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 24px; text-align: center;
      .empty-icon { font-size: 36px; color: #ddd; }
      p { margin: 0; font-size: 14px; color: #aaa; }
    }

    .detail-body {
      padding: 8px 16px 12px;
      display: flex; flex-direction: column; gap: 14px;
    }

    /* ════════════════════════════════
       WORKOUT LIST
    ════════════════════════════════ */
    .list-section { padding: 0 16px; }

    .list-title {
      margin: 0 0 10px; font-size: 15px; font-weight: 700; color: #555;
      padding: 4px 0; letter-spacing: 0.3px;
    }

    .workout-list { display: flex; flex-direction: column; gap: 8px; }

    .workout-card {
      background: white; border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.07); overflow: hidden;
      transition: box-shadow 0.2s;
      &.expanded { box-shadow: 0 4px 16px rgba(0,0,0,0.11); }
    }

    .workout-header {
      display: flex; align-items: center; gap: 12px; width: 100%;
      padding: 12px 12px 12px 14px; border: none; background: transparent;
      cursor: pointer; text-align: left;
      &:hover { background: rgba(0,0,0,0.02); }
    }

    .workout-date-block {
      display: flex; flex-direction: column; align-items: center;
      min-width: 38px; background: #f5f5f5; border-radius: 8px; padding: 5px 7px;
      .day { font-size: 20px; font-weight: 700; color: #1a1a1a; line-height: 1; }
      .month-year { font-size: 10px; color: #888; text-transform: uppercase; margin-top: 2px; }
    }

    .workout-summary {
      flex: 1; display: flex; flex-direction: column; gap: 4px;
      .exercise-count { font-size: 14px; font-weight: 600; color: #1a1a1a; }
      .set-count { font-size: 12px; color: #888; }
    }

    .workout-badges-row { display: flex; flex-wrap: wrap; gap: 4px; }

    .workout-type-badge {
      display: inline-block; padding: 2px 8px; border-radius: 8px;
      font-size: 11px; font-weight: 600; color: white; width: fit-content;
    }

    .workout-hybrid-badge {
      background: linear-gradient(90deg, #ef5350 0%, #9c27b0 50%, #2196f3 100%) !important;
    }

    .chevron { color: #bbb; font-size: 20px; flex-shrink: 0; }

    .workout-detail {
      border-top: 1px solid #f0f0f0; padding: 12px 14px;
      display: flex; flex-direction: column; gap: 14px;
    }

    /* ── Shared entry styles (detail + list) ── */
    .entry-row {
      display: flex; flex-direction: column; gap: 6px;
      padding-bottom: 14px; border-bottom: 1px solid #f5f5f5;
      &:last-child { border-bottom: none; padding-bottom: 0; }
    }
    .entry-name-row { display: flex; align-items: center; gap: 7px; }
    .entry-name { font-size: 13px; font-weight: 600; color: #333; }
    .entry-feeling { font-size: 17px; line-height: 1; }
    .sets-list { display: flex; flex-wrap: wrap; gap: 5px; }
    .set-pill {
      display: flex; align-items: center; gap: 3px;
      padding: 3px 9px; background: #f5f5f5; border-radius: 16px; font-size: 12px;
      .set-weight { font-weight: 600; color: #333; }
      .set-reps { color: #666; }
    }
    .no-sets { font-size: 12px; color: #bbb; font-style: italic; }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 40px 24px; text-align: center;
      .empty-icon { font-size: 56px; color: #ddd; }
      h2 { margin: 0; font-size: 18px; font-weight: 600; color: #444; }
      p { margin: 0; font-size: 14px; color: #888; }
    }
  `],
})
export class HistoryComponent {
  private workoutService = inject(WorkoutService);

  readonly selectedDate = signal<string | null>(null);
  readonly expandedId   = signal<string | null>(null);

  readonly allWorkouts = this.workoutService.workouts;

  readonly selectedWorkout = computed(() => {
    const d = this.selectedDate();
    return d ? this.workoutService.getWorkoutForDate(d) : null;
  });

  readonly selectedDateLabel = computed(() => {
    const sel = this.selectedDate();
    if (!sel) return '';
    const today = this.workoutService.todayDateString();
    if (sel === today) return 'Avui';
    const yesterday = (() => {
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    })();
    if (sel === yesterday) return 'Ahir';
    const d = new Date(sel + 'T00:00:00');
    const label = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }

  getCatColor(cat: string): string { return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#bbb'; }
  getCatLabel(cat: string): string { return CATEGORY_LABELS[cat as ExerciseCategory] ?? cat; }

  getDay(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric' });
  }
  getMonthYear(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { month: 'short', year: '2-digit' });
  }

  totalSets(workout: Workout): number {
    return workout.entries.reduce((s, e) => s + e.sets.length, 0);
  }

  selectDate(date: string): void {
    this.selectedDate.set(this.selectedDate() === date ? null : date);
  }

  toggleExpanded(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }
}
