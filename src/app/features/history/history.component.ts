import { Component, computed, inject, signal } from '@angular/core';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout, WorkoutEntry } from '../../core/models/workout.model';
import { Sport, SportSubtype } from '../../core/models/sport.model';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { ExerciseStatsDialogComponent } from '../../shared/components/exercise-stats-dialog.component';
import { ExerciseProgressInlineComponent } from '../../shared/components/exercise-progress-inline.component';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CalendarComponent, ExerciseStatsDialogComponent, ExerciseProgressInlineComponent],
  template: `
    <div class="page">

      <!-- ── Page header ── -->
      <header class="page-header">
        <div class="page-header-top">
          <h1>Historial</h1>
          <!-- View mode toggle -->
          <div class="view-seg">
            <button class="view-seg-btn" [class.active]="viewMode() === 'calendar'"
                    (click)="viewMode.set('calendar')" aria-label="Vista calendari">
              <span class="material-symbols-outlined">calendar_month</span>
            </button>
            <button class="view-seg-btn" [class.active]="viewMode() === 'list'"
                    (click)="viewMode.set('list')" aria-label="Vista llista">
              <span class="material-symbols-outlined">format_list_bulleted</span>
            </button>
          </div>
        </div>
        <span class="count">{{ allWorkouts().length }} entrenaments</span>
      </header>

      <!-- ══════════════════════════════════
           MODE: CALENDARI
      ═════════════════════════════════════ -->
      @if (viewMode() === 'calendar') {

        <div class="calendar-wrap">
          <app-calendar [selectedDate]="selectedDate()" (dateSelected)="selectDate($event)" />
        </div>

        @if (!selectedDate()) {
          <div class="select-day-hint">
            <span class="material-symbols-outlined">touch_app</span>
            Selecciona un dia per veure el detall
          </div>
        }

        @if (selectedDate()) {
          <div class="detail-section">

            @if (selectedWorkout()) {
              <div class="detail-color-bar" [style.background]="workoutBarStyle()"></div>
            }

            <div class="detail-header">
              <h2 class="detail-title">{{ selectedDateLabel() }}</h2>
            </div>

            <!-- Esports del dia -->
            @if (selectedDateSports().length > 0) {
              <div class="sports-row">
                @for (item of selectedDateSports(); track item.sport.id) {
                  <span class="sport-tag" [style.--sport-color]="item.sport.color">
                    <span class="material-symbols-outlined sport-tag-icon">{{ item.sport.icon }}</span>
                    {{ item.sport.name }}
                    @if (item.subtypeId && getSubtypeName(item.sport, item.subtypeId ?? ''); as subName) {
                      <span class="sport-tag-subtype">· {{ subName }}</span>
                    }
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

              <!-- Grid de targetes d'exercicis -->
              <div class="ex-grid">
                @for (entry of selectedWorkout()!.entries; track entry.exerciseId) {
                  <button class="ex-card"
                    [class.active]="selectedExerciseId() === entry.exerciseId"
                    [style.--cat]="getEntryCatColor(entry)"
                    (click)="selectExercise(entry.exerciseId)">
                    @if (entry.feeling) {
                      <span class="ex-card-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
                    }
                    <span class="ex-card-name">{{ entry.exerciseName }}</span>
                    <div class="ex-card-meta">
                      <span class="ex-card-sets">{{ entry.sets.length }}<small> sèr</small></span>
                      @if (entry.sets.length > 0) {
                        <span class="ex-card-weight">{{ getMaxWeight(entry) }}<small>kg</small></span>
                      }
                    </div>
                  </button>
                }
              </div>

              <!-- Detall de l'exercici seleccionat -->
              @if (selectedExerciseId()) {
                <div class="ex-detail-panel">
                  @if ((selectedEntry()?.sets ?? []).length > 0) {
                    <div class="ex-sets-row">
                      @for (set of selectedEntry()!.sets; track $index) {
                        <div class="ex-set-pill">
                          <span class="ex-set-num">{{ $index + 1 }}</span>
                          <span class="ex-set-weight">{{ set.weight }}<small>kg</small></span>
                          <span class="ex-set-reps">×{{ set.reps }}</span>
                        </div>
                      }
                    </div>
                  }
                  <div class="ex-card-analysis">
                    <app-exercise-progress-inline
                      [exerciseId]="selectedExerciseId()"
                      [exerciseName]="selectedEntry()?.exerciseName ?? null" />
                  </div>
                </div>
              }

            }
          </div>
        }

        @if (allWorkouts().length === 0) {
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">calendar_month</span>
            <h2>Cap entrenament</h2>
            <p>Encara no hi ha cap entrenament registrat</p>
          </div>
        }

      }

      <!-- ══════════════════════════════════
           MODE: LLISTA
      ═════════════════════════════════════ -->
      @if (viewMode() === 'list') {

        @if (allWorkouts().length > 0) {
          <div class="workout-list-wrap">
            @for (workout of allWorkouts(); track workout.id) {
              <div class="workout-card" [class.expanded]="expandedId() === workout.id">

                <!-- Color stripe lateral -->
                <div class="workout-card-stripe" [style.background]="getWorkoutStripe(workout)"></div>

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
                      <span class="set-count-inline">· {{ totalSets(workout) }} sèries</span>
                    </span>
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
                          <span class="entry-cat-dot" [style.background]="getEntryCatColor(entry)"></span>
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
        } @else {
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">calendar_month</span>
            <h2>Cap entrenament</h2>
            <p>Encara no hi ha cap entrenament registrat</p>
          </div>
        }

      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 100px; }

    /* ── Page header ── */
    .page-header {
      padding: 16px 16px 10px;
    }
    .page-header-top {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
      h1 { margin: 0; font-size: 22px; font-weight: 700; }
    }
    .count { font-size: 12px; color: #999; }

    /* ── View mode segmented control ── */
    .view-seg {
      display: flex; align-items: center;
      border: 1.5px solid #e8e8e8; border-radius: 10px; overflow: hidden;
      flex-shrink: 0;
    }
    .view-seg-btn {
      width: 38px; height: 34px; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: #aaa; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &.active { background: #006874; color: white; }
      &:not(.active):hover { background: rgba(0,104,116,0.08); color: #006874; }
    }

    /* ════════════════════════════════
       CALENDAR MODE
    ════════════════════════════════ */
    .calendar-wrap {
      margin: 4px 16px 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 16px; overflow: hidden;
    }

    .detail-section {
      margin: 0 16px 12px;
      background: white; border-radius: 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08); overflow: hidden;
    }

    .detail-color-bar { height: 5px; width: 100%; }

    .detail-header {
      padding: 14px 16px 10px;
      border-bottom: 1px solid #f5f5f5;
    }
    .detail-title {
      margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;
      text-transform: capitalize;
    }

    /* Sports */
    .sports-row {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 10px 16px 8px; border-bottom: 1px solid #f5f5f5;
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
    .sport-tag-subtype { font-weight: 400; opacity: 0.85; }

    .detail-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 24px; text-align: center;
      .empty-icon { font-size: 36px; color: #ddd; }
      p { margin: 0; font-size: 14px; color: #aaa; }
    }

    /* Exercise grid */
    .ex-grid {
      display: grid; grid-template-columns: repeat(2, 1fr);
      gap: 8px; padding: 10px 14px;
    }

    .ex-card {
      position: relative;
      display: flex; flex-direction: column; align-items: flex-start;
      padding: 14px 12px 12px; border-radius: 14px;
      border: 2px solid transparent; background: #f7f7f7;
      cursor: pointer; text-align: left;
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
      min-height: 96px; overflow: hidden; touch-action: manipulation;
      &:hover { background: #f0f0f0; }
      &:active { transform: scale(0.97); }
      &.active {
        background: color-mix(in srgb, var(--cat) 10%, white);
        border-color: var(--cat);
        box-shadow: 0 2px 10px color-mix(in srgb, var(--cat) 20%, transparent);
      }
    }
    .ex-card-feeling {
      position: absolute; top: 10px; right: 10px;
      font-size: 17px; line-height: 1;
    }
    .ex-card-name {
      font-size: 13px; font-weight: 700; color: #1a1a1a;
      line-height: 1.3; margin-top: 4px; flex: 1; word-break: break-word;
    }
    .ex-card-meta {
      display: flex; align-items: baseline; gap: 6px;
      margin-top: 10px; padding-top: 6px;
      border-top: 1px solid rgba(0,0,0,0.05); width: 100%;
    }
    .ex-card-sets {
      font-size: 20px; font-weight: 800; color: var(--cat); line-height: 1;
      small { font-size: 11px; font-weight: 500; color: #888; margin-left: 1px; }
    }
    .ex-card-weight {
      font-size: 13px; font-weight: 600; color: #666;
      small { font-size: 10px; font-weight: 400; }
    }

    /* Exercise detail panel */
    .ex-detail-panel {
      margin: 0 14px 14px;
      background: #f7f7f7; border-radius: 12px; overflow: hidden;
    }
    .ex-sets-row {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 12px 14px 10px;
    }
    .ex-set-pill {
      display: flex; align-items: center; gap: 4px;
      padding: 5px 10px; background: white; border-radius: 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.08);
    }
    .ex-set-num { font-size: 10px; font-weight: 600; color: #bbb; min-width: 12px; }
    .ex-set-weight { font-size: 13px; font-weight: 700; color: #1a1a1a; }
    .ex-set-weight small { font-size: 9px; font-weight: 400; color: #888; }
    .ex-set-reps { font-size: 12px; color: #666; }
    .ex-card-analysis { border-top: 1px solid rgba(0,0,0,0.06); }

    /* ════════════════════════════════
       LIST MODE
    ════════════════════════════════ */
    .workout-list-wrap {
      display: flex; flex-direction: column; gap: 1px;
      margin: 4px 16px 0;
    }

    .workout-card {
      position: relative;
      background: white; border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.07); overflow: hidden;
      transition: box-shadow 0.2s; margin-bottom: 8px;
      &.expanded { box-shadow: 0 4px 16px rgba(0,0,0,0.11); }
    }

    .workout-card-stripe {
      position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
    }

    .workout-header {
      display: flex; align-items: center; gap: 12px; width: 100%;
      padding: 13px 12px 13px 18px; border: none; background: transparent;
      cursor: pointer; text-align: left;
      &:hover { background: rgba(0,0,0,0.02); }
    }

    .workout-date-block {
      display: flex; flex-direction: column; align-items: center;
      min-width: 36px; flex-shrink: 0;
      .day { font-size: 20px; font-weight: 700; color: #1a1a1a; line-height: 1; }
      .month-year { font-size: 10px; color: #888; text-transform: uppercase; margin-top: 2px; }
    }

    .workout-summary {
      flex: 1; display: flex; flex-direction: column; gap: 5px;
    }
    .exercise-count {
      font-size: 13px; font-weight: 600; color: #1a1a1a;
    }
    .set-count-inline { font-size: 12px; font-weight: 400; color: #888; }

    .workout-badges-row { display: flex; flex-wrap: wrap; gap: 4px; }
    .workout-type-badge {
      display: inline-block; padding: 2px 8px; border-radius: 8px;
      font-size: 11px; font-weight: 600; color: white;
    }
    .workout-hybrid-badge {
      background: linear-gradient(90deg, #ef5350 0%, #9c27b0 50%, #2196f3 100%) !important;
    }

    .chevron { color: #bbb; font-size: 20px; flex-shrink: 0; }

    .workout-detail {
      border-top: 1px solid #f0f0f0; padding: 12px 14px 12px 18px;
      display: flex; flex-direction: column; gap: 14px;
    }

    .entry-row {
      display: flex; flex-direction: column; gap: 6px;
      padding-bottom: 12px; border-bottom: 1px solid #f5f5f5;
      &:last-child { border-bottom: none; padding-bottom: 0; }
    }
    .entry-name-row { display: flex; align-items: center; gap: 7px; }
    .entry-cat-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .entry-name { font-size: 13px; font-weight: 600; color: #333; flex: 1; }
    .entry-feeling { font-size: 17px; line-height: 1; }
    .sets-list { display: flex; flex-wrap: wrap; gap: 5px; padding-left: 15px; }
    .set-pill {
      display: flex; align-items: center; gap: 3px;
      padding: 3px 9px; background: #f5f5f5; border-radius: 16px; font-size: 12px;
      .set-weight { font-weight: 600; color: #333; }
      .set-reps { color: #666; }
    }
    .no-sets { font-size: 12px; color: #bbb; font-style: italic; padding-left: 15px; }

    /* ── Select-day hint ── */
    .select-day-hint {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      margin: 0 16px 12px; padding: 12px 16px;
      background: rgba(0,104,116,0.06); border-radius: 12px;
      font-size: 13px; font-weight: 500; color: #006874;
      .material-symbols-outlined { font-size: 17px; }
    }

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

  readonly viewMode     = signal<'calendar' | 'list'>('calendar');
  readonly selectedDate = signal<string | null>(null);
  readonly expandedId   = signal<string | null>(null);
  readonly selectedExerciseId = signal<string | null>(null);

  readonly allWorkouts = this.workoutService.workouts;

  readonly selectedWorkout = computed(() => {
    const d = this.selectedDate();
    return d ? this.workoutService.getWorkoutForDate(d) : null;
  });

  readonly selectedDateSports = computed(() => {
    const d = this.selectedDate();
    return d ? this.sportService.getSportSessionsForDate(d) : [];
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

  readonly workoutBarStyle = computed((): string => {
    const w = this.selectedWorkout();
    if (!w) return '';
    const cats = w.categories?.length ? w.categories : (w.category ? [w.category] : []);
    if (cats.length === 0) return 'background: #e0e0e0';
    if (cats.length === 1) return `background: ${this.getCatColor(cats[0])}`;
    const stops = cats.map((c, i) => {
      const p1 = Math.round((i / cats.length) * 100);
      const p2 = Math.round(((i + 1) / cats.length) * 100);
      return `${this.getCatColor(c)} ${p1}% ${p2}%`;
    }).join(', ');
    return `background: linear-gradient(90deg, ${stops})`;
  });

  getWorkoutStripe(workout: Workout): string {
    const cats = workout.categories?.length ? workout.categories : (workout.category ? [workout.category] : []);
    if (cats.length === 0) return '#e0e0e0';
    if (cats.length === 1) return this.getCatColor(cats[0]);
    const stops = cats.map((c, i) => {
      const p1 = Math.round((i / cats.length) * 100);
      const p2 = Math.round(((i + 1) / cats.length) * 100);
      return `${this.getCatColor(c)} ${p1}% ${p2}%`;
    }).join(', ');
    return `linear-gradient(180deg, ${stops})`;
  }

  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }
  getCatColor(cat: string): string { return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#bbb'; }
  getCatLabel(cat: string): string { return CATEGORY_LABELS[cat as ExerciseCategory] ?? cat; }

  getSubtypeName(sport: Sport, subtypeId: string): string | null {
    return sport.subtypes.find((s: SportSubtype) => s.id === subtypeId)?.name ?? null;
  }

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
