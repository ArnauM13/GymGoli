import { Component, computed, inject, signal } from '@angular/core';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout, WorkoutEntry } from '../../core/models/workout.model';
import { SPORT_CONFIG, SportType } from '../../core/models/sport.model';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { ExerciseStatsDialogComponent } from '../../shared/components/exercise-stats-dialog.component';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CalendarComponent, ExerciseStatsDialogComponent],
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

          <!-- Sports done that day -->
          @if (selectedDateSports().length > 0) {
            <div class="sports-row">
              @for (sport of selectedDateSports(); track sport) {
                <span class="sport-tag" [style.--sport-color]="getSportColor(sport)">
                  <span class="material-symbols-outlined sport-tag-icon">{{ getSportIcon(sport) }}</span>
                  {{ getSportLabel(sport) }}
                </span>
              }
            </div>
          }

          @if (!selectedWorkout()) {
            <div class="detail-empty">
              @if (selectedDateSports().length === 0) {
                <span class="material-symbols-outlined empty-icon">fitness_center</span>
                <p>Cap activitat registrada</p>
              } @else {
                <span class="material-symbols-outlined empty-icon">sports_soccer</span>
                <p>Sense entrenament al gimnàs</p>
              }
            </div>
          } @else {

            <!-- Two-column: exercise list + sets panel -->
            <div class="ex-layout">

              <!-- Left column: exercise chips -->
              <div class="ex-list">
                @for (entry of selectedWorkout()!.entries; track entry.exerciseId) {
                  <button class="ex-chip"
                    [class.active]="selectedExerciseId() === entry.exerciseId"
                    [style.--cat]="getEntryCatColor(entry)"
                    (click)="selectExercise(entry.exerciseId)">
                    <span class="ex-chip-dot"></span>
                    <span class="ex-chip-name">{{ entry.exerciseName }}</span>
                    <div class="ex-chip-meta">
                      @if (entry.feeling) {
                        <span>{{ getFeelingEmoji(entry.feeling) }}</span>
                      }
                      <span>{{ entry.sets.length }}s · {{ getMaxWeight(entry) }}kg</span>
                    </div>
                  </button>
                }
              </div>

              <!-- Right column: sets for selected exercise -->
              <div class="ex-sets-panel">
                @if (!selectedEntry()) {
                  <div class="ex-sets-hint">← Selecciona un exercici</div>
                } @else if (selectedEntry()!.sets.length === 0) {
                  <p class="ex-sets-empty">Sense sèries</p>
                } @else {
                  @for (set of selectedEntry()!.sets; track $index) {
                    <div class="ex-set-row">
                      <span class="ex-set-num">{{ $index + 1 }}</span>
                      <span class="ex-set-weight">{{ set.weight }}<small>kg</small></span>
                      <span class="ex-set-reps">× {{ set.reps }}</span>
                    </div>
                  }
                }
              </div>

            </div>

            <!-- Analysis panel (shown when an exercise is selected) -->
            @if (selectedExerciseId()) {
              <div class="ex-analysis">
                <app-exercise-stats
                  [inlineExerciseId]="selectedExerciseId()"
                  [inlineExerciseName]="selectedEntry()?.exerciseName ?? null" />
              </div>
            }

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

    /* ── Sports row ── */
    .sports-row {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 10px 16px 8px;
      border-bottom: 1px solid #f5f5f5;
    }
    .sport-tag {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 20px;
      background: color-mix(in srgb, var(--sport-color) 12%, white);
      color: var(--sport-color);
      font-size: 12px; font-weight: 600;
      border: 1px solid color-mix(in srgb, var(--sport-color) 25%, transparent);
    }
    .sport-tag-icon { font-size: 14px; font-variation-settings: 'FILL' 1; }

    .detail-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 24px; text-align: center;
      .empty-icon { font-size: 36px; color: #ddd; }
      p { margin: 0; font-size: 14px; color: #aaa; }
    }

    /* Two-column exercise layout */
    .ex-layout {
      display: grid;
      grid-template-columns: 45% 55%;
      min-height: 120px;
    }

    .ex-list {
      padding: 10px 8px 10px 12px;
      display: flex; flex-direction: column; gap: 4px;
      border-right: 1px solid #f0f0f0;
    }

    .ex-chip {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      padding: 8px 8px 8px 10px;
      border-radius: 10px; border: none; background: transparent;
      cursor: pointer; text-align: left; width: 100%;
      border-left: 3px solid transparent;
      transition: background 0.15s, border-color 0.15s;
      &:hover { background: #f5f5f5; }
      &.active {
        background: color-mix(in srgb, var(--cat) 8%, white);
        border-left-color: var(--cat);
      }
    }
    .ex-chip-dot {
      display: inline-block; width: 6px; height: 6px; border-radius: 50%;
      background: var(--cat); margin-bottom: 2px;
    }
    .ex-chip-name {
      font-size: 12px; font-weight: 700; color: #1a1a1a;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      max-width: 100%;
    }
    .ex-chip-meta {
      font-size: 11px; color: #888; display: flex; align-items: center; gap: 3px;
    }

    /* Sets panel (right column) */
    .ex-sets-panel {
      padding: 10px 12px 10px 10px;
      display: flex; flex-direction: column; gap: 6px;
      justify-content: flex-start;
    }
    .ex-sets-hint {
      color: #ccc; font-size: 12px; font-style: italic;
      display: flex; align-items: center; justify-content: center;
      height: 100%; text-align: center; padding: 16px 8px;
    }
    .ex-set-row {
      display: flex; align-items: center; gap: 8px;
    }
    .ex-set-num { font-size: 11px; font-weight: 700; color: #ccc; min-width: 14px; }
    .ex-set-weight { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .ex-set-weight small { font-size: 10px; font-weight: 500; color: #888; }
    .ex-set-reps { font-size: 12px; color: #666; }
    .ex-sets-empty { font-size: 12px; color: #bbb; font-style: italic; margin: 0; }

    /* Analysis panel */
    .ex-analysis {
      border-top: 1px solid #f0f0f0;
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
  private workoutService  = inject(WorkoutService);
  private exerciseService = inject(ExerciseService);
  private sportService    = inject(SportService);

  readonly selectedDate = signal<string | null>(null);
  readonly expandedId   = signal<string | null>(null);

  readonly selectedExerciseId = signal<string | null>(null);

  readonly allWorkouts = this.workoutService.workouts;

  readonly selectedWorkout = computed(() => {
    const d = this.selectedDate();
    return d ? this.workoutService.getWorkoutForDate(d) : null;
  });

  readonly selectedDateSports = computed((): SportType[] => {
    const d = this.selectedDate();
    return d ? this.sportService.getSportsForDate(d) : [];
  });

  readonly selectedEntry = computed((): WorkoutEntry | null => {
    const id = this.selectedExerciseId();
    const w  = this.selectedWorkout();
    if (!id || !w) return null;
    return w.entries.find(e => e.exerciseId === id) ?? null;
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

  getSportLabel(sport: SportType): string { return SPORT_CONFIG[sport].label; }
  getSportIcon(sport: SportType): string  { return SPORT_CONFIG[sport].icon; }
  getSportColor(sport: SportType): string { return SPORT_CONFIG[sport].color; }

  getCatColor(cat: string): string { return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#bbb'; }
  getCatLabel(cat: string): string { return CATEGORY_LABELS[cat as ExerciseCategory] ?? cat; }

  getEntryCategory(entry: WorkoutEntry): ExerciseCategory {
    return this.exerciseService.getById(entry.exerciseId)?.category ?? 'push';
  }
  getEntryCatColor(entry: WorkoutEntry): string {
    return CATEGORY_COLORS[this.getEntryCategory(entry)] ?? '#bbb';
  }
  getMaxWeight(entry: WorkoutEntry): number {
    if (!entry.sets.length) return 0;
    return Math.max(...entry.sets.map(s => s.weight));
  }

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
    this.selectedExerciseId.set(null);
  }

  selectExercise(exerciseId: string): void {
    const next = this.selectedExerciseId() === exerciseId ? null : exerciseId;
    this.selectedExerciseId.set(next);
    if (next) this.workoutService.loadAllWorkouts();
  }

  toggleExpanded(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }
}
