import { Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';

import { CATEGORY_COLORS, CATEGORY_LABELS, ExerciseCategory, SUBCATEGORY_LABELS } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout, WorkoutEntry } from '../../core/models/workout.model';
import { WorkoutService } from '../../core/services/workout.service';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [MatButtonModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Historial</h1>
        <span class="count">{{ pastWorkouts().length }} entrenaments</span>
      </header>

      @if (pastWorkouts().length === 0) {
        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon">calendar_month</span>
          <h2>Cap entrenament anterior</h2>
          <p>Els teus entrenaments apareixeran aquí</p>
        </div>
      }

      <div class="workout-list">
        @for (workout of pastWorkouts(); track workout.id) {
          <div class="workout-card" [class.expanded]="expandedId() === workout.id">

            <button class="workout-header" (click)="toggle(workout.id)">
              <div class="workout-date-block">
                <span class="day">{{ getDay(workout.date) }}</span>
                <span class="month-year">{{ getMonthYear(workout.date) }}</span>
              </div>
              <div class="workout-summary">
                <span class="exercise-count">
                  {{ workout.entries.length }} exercici{{ workout.entries.length !== 1 ? 's' : '' }}
                </span>
                <span class="set-count">
                  {{ totalSets(workout) }} sèries
                </span>
                <div class="category-dots">
                  @for (cat of getCategories(workout); track cat) {
                    <span class="dot" [style.background]="getCatColor(cat)"></span>
                  }
                </div>
              </div>
              <span class="material-symbols-outlined chevron">
                {{ expandedId() === workout.id ? 'expand_less' : 'expand_more' }}
              </span>
            </button>

            @if (expandedId() === workout.id) {
              <div class="workout-detail">
                @for (entry of workout.entries; track entry.exerciseId) {
                  <div class="entry-row">
                    <div class="entry-name-block">
                      <span class="entry-name">{{ entry.exerciseName }}</span>
                    </div>

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

                <div class="detail-actions">
                  <button mat-button class="delete-btn" (click)="deleteWorkout(workout)">
                    <span class="material-symbols-outlined">delete</span>
                    Eliminar
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 0 0 80px; }

    .page-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 12px;

      h1 { margin: 0; font-size: 22px; font-weight: 600; }
      .count { font-size: 13px; color: #888; }
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      padding: 60px 24px;
      text-align: center;

      .empty-icon { font-size: 64px; color: #ddd; }
      h2 { margin: 0; font-size: 20px; font-weight: 600; color: #444; }
      p { margin: 0; color: #888; }
    }

    .workout-list { padding: 0 16px; display: flex; flex-direction: column; gap: 10px; }

    .workout-card {
      background: white;
      border-radius: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
      transition: box-shadow 0.2s;

      &.expanded { box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
    }

    .workout-header {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 14px 12px 14px 14px;
      border: none;
      background: transparent;
      cursor: pointer;
      text-align: left;
      &:hover { background: rgba(0,0,0,0.02); }
    }

    .workout-date-block {
      display: flex;
      flex-direction: column;
      align-items: center;
      min-width: 40px;
      background: #f5f5f5;
      border-radius: 8px;
      padding: 6px 8px;

      .day { font-size: 20px; font-weight: 700; color: #1a1a1a; line-height: 1; }
      .month-year { font-size: 10px; color: #888; text-transform: uppercase; margin-top: 2px; }
    }

    .workout-summary {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 4px;

      .exercise-count { font-size: 15px; font-weight: 600; color: #1a1a1a; }
      .set-count { font-size: 12px; color: #888; }
    }

    .category-dots { display: flex; gap: 4px; margin-top: 2px; }
    .dot { width: 8px; height: 8px; border-radius: 50%; }

    .chevron { color: #bbb; font-size: 20px; flex-shrink: 0; }

    .workout-detail {
      border-top: 1px solid #f0f0f0;
      padding: 12px 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .entry-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .entry-name { font-size: 14px; font-weight: 600; color: #333; }

    .sets-list { display: flex; flex-wrap: wrap; gap: 6px; }

    .set-pill {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      background: #f5f5f5;
      border-radius: 20px;
      font-size: 13px;

      .set-weight { font-weight: 600; color: #333; }
      .set-reps { color: #666; }
      .set-feeling { font-size: 14px; }
    }

    .no-sets { font-size: 12px; color: #bbb; font-style: italic; }

    .detail-actions { display: flex; justify-content: flex-end; padding-top: 4px; }
    .delete-btn { color: #ef5350 !important; font-size: 13px; }
  `],
})
export class HistoryComponent {
  private workoutService = inject(WorkoutService);
  private snackBar = inject(MatSnackBar);

  readonly pastWorkouts = this.workoutService.pastWorkouts;
  readonly expandedId = signal<string | null>(null);

  toggle(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  getDay(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric' });
  }

  getMonthYear(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { month: 'short', year: '2-digit' });
  }

  totalSets(workout: Workout): number {
    return workout.entries.reduce((sum, e) => sum + e.sets.length, 0);
  }

  getCategories(workout: Workout): ExerciseCategory[] {
    const cats = new Set<ExerciseCategory>();
    // Since we don't store category in WorkoutEntry, derive from name patterns
    // For now return empty until exercise service integration
    return Array.from(cats);
  }

  getCatColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat]; }
  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }

  async deleteWorkout(workout: Workout): Promise<void> {
    if (!confirm(`Eliminar l'entrenament del ${this.getDay(workout.date)}?`)) return;
    try {
      await this.workoutService.deleteWorkout(workout.id);
      this.expandedId.set(null);
      this.snackBar.open('Entrenament eliminat', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }
}
