import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Exercise, CATEGORY_COLORS, CATEGORY_LABELS } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FEELING_LABEL, FeelingLevel, Workout, WorkoutEntry } from '../../core/models/workout.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { WorkoutService } from '../../core/services/workout.service';
import { ExercisePickerDialogComponent } from '../today/components/exercise-picker-dialog.component';

// ── Calendar day cell ────────────────────────────────────────────────────────
interface CalDay {
  date:       string;
  day:        number;
  hasWorkout: boolean;
  isToday:    boolean;
  isFuture:   boolean;
  isSelected: boolean;
}

const MONTHS_CA = [
  'Gener','Febrer','Març','Abril','Maig','Juny',
  'Juliol','Agost','Setembre','Octubre','Novembre','Desembre',
];

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [ReactiveFormsModule, MatButtonModule],
  template: `
    <div class="page">

      <!-- ── Page header ── -->
      <header class="page-header">
        <h1>Historial</h1>
        <span class="count">{{ allWorkouts().length }} entrenaments</span>
      </header>

      <!-- ═══════════════════════════════════
           CALENDAR
      ════════════════════════════════════ -->
      <div class="calendar-card">

        <!-- Month navigation -->
        <div class="cal-header">
          <button class="cal-nav-btn" (click)="navigateCal(-1)" aria-label="Mes anterior">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <span class="cal-month-label">{{ calMonthLabel() }}</span>
          <button class="cal-nav-btn" (click)="navigateCal(1)"
            [disabled]="!canNavForward()" aria-label="Mes següent">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <!-- Day-of-week headers -->
        <div class="cal-grid">
          @for (dow of dayNames; track dow) {
            <div class="cal-dow">{{ dow }}</div>
          }

          <!-- Day cells -->
          @for (cell of calDays(); track $index) {
            @if (cell === null) {
              <div></div>
            } @else {
              <button
                class="cal-day"
                [class.has-workout]="cell.hasWorkout"
                [class.is-today]="cell.isToday"
                [class.is-selected]="cell.isSelected"
                [class.is-future]="cell.isFuture"
                [disabled]="cell.isFuture"
                (click)="selectDate(cell.date)"
                [attr.aria-label]="cell.day"
              >
                <span class="day-num">{{ cell.day }}</span>
                @if (cell.hasWorkout) {
                  <span class="workout-dot"></span>
                }
              </button>
            }
          }
        </div>
      </div>

      <!-- ═══════════════════════════════════
           SELECTED DATE DETAIL
      ════════════════════════════════════ -->
      @if (selectedDate()) {
        <div class="detail-section">

          <div class="detail-header">
            <h2 class="detail-title">{{ selectedDateLabel() }}</h2>
            <div class="detail-actions">
              @if (selectedWorkout() && !editMode()) {
                <button class="action-btn edit-btn" (click)="toggleEditMode()" aria-label="Editar">
                  <span class="material-symbols-outlined">edit</span>
                </button>
              }
              @if (editMode()) {
                <button class="action-btn delete-btn" (click)="deleteSelectedWorkout()" aria-label="Eliminar">
                  <span class="material-symbols-outlined">delete</span>
                </button>
                <button class="action-btn done-btn" (click)="toggleEditMode()" aria-label="Finalitzar edició">
                  <span class="material-symbols-outlined">check_circle</span>
                </button>
              }
            </div>
          </div>

          <!-- No workout for this day -->
          @if (!selectedWorkout()) {
            <div class="detail-empty">
              <span class="material-symbols-outlined empty-icon">fitness_center</span>
              <p>Cap entrenament registrat</p>
              <button mat-flat-button class="add-btn" (click)="openPicker()">
                <span class="material-symbols-outlined">add</span>
                Afegir exercici
              </button>
            </div>
          }

          <!-- Workout entries for selected day -->
          @if (selectedWorkout(); as sw) {
            <div class="entries">
              @for (entry of sw.entries; track entry.exerciseId) {
                <div class="entry-card">

                  <div class="entry-header">
                    <div class="entry-title">
                      <span class="category-badge" [style.background]="getCatColor(entry)">
                        {{ getCatLabel(entry) }}
                      </span>
                      <span class="entry-name">{{ entry.exerciseName }}</span>
                    </div>
                    @if (editMode()) {
                      <button mat-icon-button class="remove-btn" (click)="removeEntry(entry.exerciseId)">
                        <span class="material-symbols-outlined">close</span>
                      </button>
                    }
                  </div>

                  @if (entry.sets.length > 0) {
                    <table class="sets-table">
                      <thead><tr>
                        <th>#</th><th>Pes</th><th>Reps</th><th>Estat</th>
                        @if (editMode()) { <th></th> }
                      </tr></thead>
                      <tbody>
                        @for (set of entry.sets; track $index) {
                          <tr>
                            <td class="set-num">{{ $index + 1 }}</td>
                            <td class="set-weight">{{ set.weight }}<small>kg</small></td>
                            <td class="set-reps">{{ set.reps }}<small>r</small></td>
                            <td class="set-feeling">{{ getFeelingEmoji(set.feeling) }}</td>
                            @if (editMode()) {
                              <td>
                                <button class="icon-btn-sm" (click)="removeSet(entry.exerciseId, $index)">
                                  <span class="material-symbols-outlined">close</span>
                                </button>
                              </td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  } @else if (!editMode()) {
                    <p class="no-sets-hint">Sense sèries</p>
                  }

                  @if (editMode()) {
                    @if (addingFor() === entry.exerciseId) {
                      <form [formGroup]="setForm" (ngSubmit)="submitSets(entry.exerciseId)" class="set-form">
                        <div class="set-inputs">
                          <div class="input-group">
                            <label>Pes (kg)</label>
                            <div class="number-input">
                              <button type="button" (click)="adjustWeight(-2.5)">−</button>
                              <input type="number" formControlName="weight" min="0" step="2.5">
                              <button type="button" (click)="adjustWeight(2.5)">+</button>
                            </div>
                          </div>
                          <div class="input-group">
                            <label>Repeticions</label>
                            <div class="number-input">
                              <button type="button" (click)="adjustReps(-1)">−</button>
                              <input type="number" formControlName="reps" min="1" step="1">
                              <button type="button" (click)="adjustReps(1)">+</button>
                            </div>
                          </div>
                          <div class="input-group">
                            <label>Sèries</label>
                            <div class="number-input">
                              <button type="button" (click)="adjustSeries(-1)">−</button>
                              <input type="number" formControlName="series" min="1" step="1">
                              <button type="button" (click)="adjustSeries(1)">+</button>
                            </div>
                          </div>
                        </div>
                        <div class="feeling-selector">
                          @for (level of feelingLevels; track level) {
                            <button type="button" class="feeling-btn"
                              [class.selected]="setForm.value.feeling === level"
                              [title]="getFeelingLabel(level)"
                              (click)="setFeeling(level)"
                            >{{ getFeelingEmoji(level) }}</button>
                          }
                        </div>
                        <div class="set-form-actions">
                          <button type="button" mat-button (click)="cancelSet()">Cancel·lar</button>
                          <button type="submit" mat-flat-button [disabled]="setForm.invalid">
                            {{ addSetsLabel }}
                          </button>
                        </div>
                      </form>
                    } @else {
                      <button class="add-set-btn" (click)="startAddSet(entry)">
                        <span class="material-symbols-outlined">add</span>
                        Afegir sèries
                      </button>
                    }
                  }

                </div>
              }

              @if (editMode()) {
                <button class="add-exercise-btn" (click)="openPicker()">
                  <span class="material-symbols-outlined">add</span>
                  Afegir exercici
                </button>
              }
            </div>
          }

        </div>
      }

      <!-- ═══════════════════════════════════
           WORKOUT LIST
      ════════════════════════════════════ -->
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
                        <div class="entry-name-row">{{ entry.exerciseName }}</div>
                        @if (entry.sets.length > 0) {
                          <div class="sets-list">
                            @for (set of entry.sets; track $index) {
                              <div class="set-pill">
                                <span class="set-weight">{{ set.weight }}kg</span>
                                <span class="set-reps">× {{ set.reps }}</span>
                                <span class="set-feeling">{{ getFeelingEmoji(set.feeling) }}</span>
                              </div>
                            }
                          </div>
                        } @else {
                          <span class="no-sets">Cap sèrie registrada</span>
                        }
                      </div>
                    }
                    <div class="detail-footer">
                      <button mat-button class="edit-from-list-btn" (click)="selectDateFromList(workout.date)">
                        <span class="material-symbols-outlined">edit_calendar</span>
                        Editar
                      </button>
                    </div>
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
          <p>Selecciona un dia al calendari per afegir un entrenament</p>
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
    .calendar-card {
      margin: 0 16px 12px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      overflow: hidden;
    }

    .cal-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 8px 8px;
    }

    .cal-month-label { font-size: 16px; font-weight: 700; color: #1a1a1a; }

    .cal-nav-btn {
      width: 36px; height: 36px; border: none; background: transparent;
      border-radius: 50%; cursor: pointer; color: #555;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      &:hover:not(:disabled) { background: rgba(0,0,0,0.06); }
      &:disabled { color: #ccc; cursor: default; }
      .material-symbols-outlined { font-size: 22px; }
    }

    .cal-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      padding: 0 8px 12px;
    }

    .cal-dow {
      text-align: center; font-size: 11px; font-weight: 600;
      color: #aaa; padding: 4px 0; text-transform: uppercase;
    }

    .cal-day {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 3px;
      min-height: 40px; width: 100%;
      border: none; border-radius: 10px; background: transparent;
      font-size: 14px; font-weight: 500; color: #333;
      cursor: pointer; transition: background 0.15s;
      padding: 4px 0;

      &:hover:not(:disabled):not(.is-selected) { background: rgba(0,104,116,0.08); }
      &:disabled { cursor: default; }

      &.is-today:not(.is-selected) {
        outline: 2px solid #006874; outline-offset: -2px;
        color: #006874; font-weight: 700;
      }
      &.is-selected {
        background: #006874 !important; color: white; font-weight: 700;
      }
      &.is-future { color: #ccc; }
      &.has-workout.is-future { color: #ddd; }
    }

    .day-num { line-height: 1; }

    .workout-dot {
      width: 5px; height: 5px; border-radius: 50%; background: #006874; flex-shrink: 0;
    }
    .is-selected .workout-dot { background: rgba(255,255,255,0.75); }
    .is-today:not(.is-selected) .workout-dot { background: #006874; }

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
      display: flex; align-items: center; justify-content: space-between;
      padding: 14px 10px 10px 16px;
      border-bottom: 1px solid #f5f5f5;
    }

    .detail-title {
      margin: 0; font-size: 16px; font-weight: 700; color: #1a1a1a;
      text-transform: capitalize;
    }

    .detail-actions { display: flex; align-items: center; gap: 4px; }

    .action-btn {
      width: 38px; height: 38px; border: none; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 20px; }
    }
    .edit-btn   { background: rgba(0,104,116,0.1);  color: #006874; &:hover { background: rgba(0,104,116,0.18); } }
    .done-btn   { background: rgba(0,150,80,0.12);  color: #00966e; &:hover { background: rgba(0,150,80,0.2);   } }
    .delete-btn { background: transparent; color: #ccc; &:hover { background: rgba(239,83,80,0.1); color: #ef5350; } }

    .detail-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 28px 24px; text-align: center;
      .empty-icon { font-size: 40px; color: #ddd; }
      p { margin: 0; font-size: 14px; color: #aaa; }
    }

    .add-btn {
      background: #006874; color: white; border-radius: 20px;
      padding: 0 20px; height: 40px; font-size: 14px;
      display: flex; align-items: center; gap: 4px;
    }

    /* Entry cards inside detail */
    .entries { padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 10px; }

    .entry-card {
      background: #fafafa; border-radius: 12px;
      border: 1px solid #f0f0f0; overflow: hidden;
    }

    .entry-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 8px 6px 12px;
    }

    .entry-title { display: flex; flex-direction: column; gap: 3px; }
    .entry-name { font-size: 15px; font-weight: 600; color: #1a1a1a; }

    .category-badge {
      display: inline-block; padding: 1px 7px; border-radius: 8px;
      font-size: 10px; font-weight: 600; color: white; width: fit-content;
    }
    .remove-btn { color: #ccc; }

    .no-sets-hint { margin: 0; padding: 4px 12px 10px; font-size: 12px; color: #bbb; font-style: italic; }

    .sets-table {
      width: 100%; border-collapse: collapse; font-size: 13px;
      th { padding: 3px 10px; font-size: 10px; color: #aaa; font-weight: 500; text-align: left; border-bottom: 1px solid #eee; }
      td { padding: 7px 10px; border-bottom: 1px solid #f5f5f5; }
      .set-num    { color: #aaa; font-size: 11px; width: 22px; }
      .set-weight { font-weight: 600; small { font-size: 9px; color: #aaa; margin-left: 1px; } }
      .set-reps   { small { font-size: 9px; color: #aaa; margin-left: 1px; } }
      .set-feeling { font-size: 16px; }
    }

    .icon-btn-sm {
      background: none; border: none; cursor: pointer; color: #ccc; padding: 2px;
      display: flex; align-items: center;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { color: #ef5350; }
    }

    .set-form {
      padding: 10px 12px; background: #f0f0f0; border-top: 1px solid #e8e8e8;
      display: flex; flex-direction: column; gap: 10px;
    }

    .set-inputs { display: flex; gap: 8px; }

    .input-group {
      flex: 1; display: flex; flex-direction: column; gap: 3px;
      label { font-size: 11px; color: #666; font-weight: 500; }
    }

    .number-input {
      display: flex; align-items: center;
      border: 1.5px solid #e0e0e0; border-radius: 8px; overflow: hidden; background: white;
      button { width: 28px; height: 34px; border: none; background: #f5f5f5; font-size: 16px; cursor: pointer; color: #333; &:hover { background: #e8e8e8; } }
      input  { flex: 1; border: none; text-align: center; font-size: 14px; font-weight: 600; outline: none; width: 0; min-width: 0; padding: 6px 0; background: white; }
    }

    .feeling-selector { display: flex; gap: 6px; justify-content: center; }

    .feeling-btn {
      font-size: 20px; width: 40px; height: 40px; border: 2px solid transparent;
      border-radius: 50%; background: #e8e8e8; cursor: pointer; transition: all 0.15s;
      display: flex; align-items: center; justify-content: center; line-height: 1;
      &:hover { transform: scale(1.1); }
      &.selected { border-color: #006874; background: rgba(0,104,116,0.1); transform: scale(1.1); }
    }

    .set-form-actions { display: flex; justify-content: flex-end; gap: 8px; }

    .add-set-btn {
      display: flex; align-items: center; gap: 6px; width: 100%; padding: 10px 12px;
      border: none; background: transparent; color: #006874; font-size: 13px;
      font-weight: 500; cursor: pointer; border-top: 1px solid #e8e8e8;
      &:hover { background: rgba(0,104,116,0.05); }
    }

    .add-exercise-btn {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; padding: 12px; border: 2px dashed #d0d0d0; border-radius: 10px;
      background: transparent; color: #888; font-size: 14px; font-weight: 500;
      cursor: pointer; transition: all 0.2s;
      &:hover { border-color: #006874; color: #006874; }
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
      flex: 1; display: flex; flex-direction: column; gap: 3px;
      .exercise-count { font-size: 14px; font-weight: 600; color: #1a1a1a; }
      .set-count { font-size: 12px; color: #888; }
    }

    .chevron { color: #bbb; font-size: 20px; flex-shrink: 0; }

    .workout-detail {
      border-top: 1px solid #f0f0f0; padding: 10px 14px 4px;
      display: flex; flex-direction: column; gap: 8px;
    }

    .entry-row { display: flex; flex-direction: column; gap: 4px; }

    .entry-name-row { font-size: 13px; font-weight: 600; color: #444; }

    .sets-list { display: flex; flex-wrap: wrap; gap: 5px; }

    .set-pill {
      display: flex; align-items: center; gap: 3px;
      padding: 3px 9px; background: #f5f5f5; border-radius: 16px; font-size: 12px;
      .set-weight { font-weight: 600; color: #333; }
      .set-reps { color: #666; }
      .set-feeling { font-size: 12px; }
    }

    .no-sets { font-size: 12px; color: #bbb; font-style: italic; }

    .detail-footer { display: flex; justify-content: flex-end; padding: 2px 0 6px; }

    .edit-from-list-btn { color: #006874 !important; font-size: 13px !important; }

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
  private exerciseService = inject(ExerciseService);
  private dialog          = inject(MatDialog);
  private snackBar        = inject(MatSnackBar);
  private fb              = inject(FormBuilder);

  // ── Calendar state ────────────────────────────────────────────
  readonly calYear   = signal(new Date().getFullYear());
  readonly calMonth  = signal(new Date().getMonth()); // 0-indexed
  readonly selectedDate = signal<string | null>(null);

  // ── Edit state ────────────────────────────────────────────────
  readonly editMode   = signal(false);
  readonly addingFor  = signal<string | null>(null);
  readonly expandedId = signal<string | null>(null);
  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  readonly dayNames = ['dl', 'dm', 'dc', 'dj', 'dv', 'ds', 'dg'];

  // ── Computed ──────────────────────────────────────────────────
  readonly allWorkouts = this.workoutService.workouts;

  readonly calMonthLabel = computed(() =>
    `${MONTHS_CA[this.calMonth()]} ${this.calYear()}`
  );

  readonly canNavForward = computed(() => {
    const now = new Date();
    return this.calYear() < now.getFullYear() ||
      (this.calYear() === now.getFullYear() && this.calMonth() < now.getMonth());
  });

  /** Grid of calendar cells (null = padding) */
  readonly calDays = computed((): (CalDay | null)[] => {
    const y   = this.calYear();
    const m   = this.calMonth();
    const today = this.workoutService.todayDateString();
    const sel   = this.selectedDate();
    const workoutDates = new Set(this.allWorkouts().map(w => w.date));

    const firstDay    = new Date(y, m, 1);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    // Monday-first: getDay() → 0=Sun→6, 1=Mon→0, …
    const startPad = (firstDay.getDay() + 6) % 7;

    const cells: (CalDay | null)[] = [];
    for (let i = 0; i < startPad; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        date: dateStr, day: d,
        hasWorkout: workoutDates.has(dateStr),
        isToday:    dateStr === today,
        isFuture:   dateStr > today,
        isSelected: dateStr === sel,
      });
    }
    return cells;
  });

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

  // ── Form (4 sèries per defecte) ──────────────────────────────
  readonly setForm = this.fb.group({
    weight:  [0,              [Validators.required, Validators.min(0)]],
    reps:    [8,              [Validators.required, Validators.min(1)]],
    series:  [4,              [Validators.required, Validators.min(1)]],
    feeling: [3 as FeelingLevel, Validators.required],
  });

  get addSetsLabel(): string {
    const n = this.setForm.value.series ?? 4;
    return `Afegir ${n} ${n === 1 ? 'sèrie' : 'sèries'}`;
  }

  // ── Calendar navigation ───────────────────────────────────────
  navigateCal(delta: number): void {
    let m = this.calMonth() + delta;
    let y = this.calYear();
    if (m < 0)  { m = 11; y--; }
    if (m > 11) { m = 0;  y++; }
    this.calMonth.set(m);
    this.calYear.set(y);
  }

  selectDate(date: string): void {
    // Toggle deselection
    this.selectedDate.set(this.selectedDate() === date ? null : date);
    this._resetEditState();
  }

  /** Called from the workout list "Editar" button */
  selectDateFromList(date: string): void {
    const d = new Date(date + 'T00:00:00');
    this.calYear.set(d.getFullYear());
    this.calMonth.set(d.getMonth());
    this.selectedDate.set(date);
    this._resetEditState();
    // Scroll calendar into view (best-effort)
    setTimeout(() => document.querySelector('.calendar-card')?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  // ── Edit mode ─────────────────────────────────────────────────
  toggleEditMode(): void {
    const next = !this.editMode();
    this.editMode.set(next);
    if (!next) this._resetForm();
  }

  private _resetEditState(): void {
    this.editMode.set(false);
    this._resetForm();
  }

  private _resetForm(): void {
    this.addingFor.set(null);
    this.setForm.reset({ weight: 0, reps: 8, series: 4, feeling: 3 });
  }

  toggleExpanded(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // ── Helpers ───────────────────────────────────────────────────
  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }
  getFeelingLabel(level: FeelingLevel): string { return FEELING_LABEL[level]; }

  getCatColor(entry: WorkoutEntry): string {
    const ex = this.exerciseService.getById(entry.exerciseId);
    return ex ? CATEGORY_COLORS[ex.category] : '#bbb';
  }

  getCatLabel(entry: WorkoutEntry): string {
    const ex = this.exerciseService.getById(entry.exerciseId);
    return ex ? CATEGORY_LABELS[ex.category] : '';
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

  // ── Form adjusters ────────────────────────────────────────────
  adjustWeight(delta: number): void {
    const v = (this.setForm.value.weight ?? 0) + delta;
    this.setForm.patchValue({ weight: Math.max(0, Math.round(v * 4) / 4) });
  }
  adjustReps(delta: number): void {
    const v = (this.setForm.value.reps ?? 1) + delta;
    this.setForm.patchValue({ reps: Math.max(1, v) });
  }
  adjustSeries(delta: number): void {
    const v = (this.setForm.value.series ?? 1) + delta;
    this.setForm.patchValue({ series: Math.max(1, v) });
  }
  setFeeling(level: FeelingLevel): void {
    this.setForm.patchValue({ feeling: level });
  }

  // ── Set actions ───────────────────────────────────────────────
  startAddSet(entry: WorkoutEntry): void {
    this.addingFor.set(entry.exerciseId);
    const last = entry.sets.at(-1);
    if (last) this.setForm.patchValue({ weight: last.weight, reps: last.reps });
  }

  cancelSet(): void { this._resetForm(); }

  async submitSets(exerciseId: string): Promise<void> {
    if (this.setForm.invalid) return;
    const { weight, reps, series, feeling } = this.setForm.value;
    const w = this.selectedWorkout();
    if (!w) return;

    const sets = Array.from({ length: series! }, () => ({
      weight: weight!, reps: reps!, feeling: feeling as FeelingLevel,
    }));

    try {
      await this.workoutService.addSetsToEntry(w.id, exerciseId, sets);
      this.cancelSet();
    } catch {
      this.snackBar.open('Error en afegir les sèries', '', { duration: 3000 });
    }
  }

  async removeSet(exerciseId: string, index: number): Promise<void> {
    const w = this.selectedWorkout();
    if (!w) return;
    try {
      await this.workoutService.removeSetFromEntry(w.id, exerciseId, index);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async removeEntry(exerciseId: string): Promise<void> {
    const w = this.selectedWorkout();
    if (!w) return;
    try {
      await this.workoutService.removeEntryFromWorkout(w.id, exerciseId);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async deleteSelectedWorkout(): Promise<void> {
    const label = this.selectedDateLabel();
    if (!confirm(`Eliminar l'entrenament de ${label}?`)) return;
    const w = this.selectedWorkout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.editMode.set(false);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  // ── Exercise picker ───────────────────────────────────────────
  openPicker(): void {
    const workout    = this.selectedWorkout();
    const date       = this.selectedDate()!;
    const excludeIds = workout?.entries.map(e => e.exerciseId) ?? [];

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = workout?.id;
        if (!workoutId) workoutId = await this.workoutService.createWorkoutForDate(date);
        await this.workoutService.addExerciseToWorkout(workoutId, {
          exerciseId: exercise.id, exerciseName: exercise.name, sets: [],
        });
        this.editMode.set(true);
        this.startAddSet({ exerciseId: exercise.id, exerciseName: exercise.name, sets: [] });
      } catch {
        this.snackBar.open('Error en afegir l\'exercici', '', { duration: 3000 });
      }
    });
  }
}
