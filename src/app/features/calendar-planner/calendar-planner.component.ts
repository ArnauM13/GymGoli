import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';

import { WorkoutService } from '../../core/services/workout.service';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { workoutCategories } from '../../shared/utils/calendar-utils';
import { Workout } from '../../core/models/workout.model';
import { CATEGORY_ICONS, CATEGORY_LABELS, CATEGORY_COLORS, ExerciseCategory } from '../../core/models/exercise.model';

const TODAY = (): string => new Date().toISOString().split('T')[0];

const WORKOUT_TYPES: { value: ExerciseCategory; label: string; icon: string; color: string }[] = [
  { value: 'push', label: CATEGORY_LABELS.push, icon: CATEGORY_ICONS.push, color: CATEGORY_COLORS.push },
  { value: 'pull', label: CATEGORY_LABELS.pull, icon: CATEGORY_ICONS.pull, color: CATEGORY_COLORS.pull },
  { value: 'legs', label: CATEGORY_LABELS.legs, icon: CATEGORY_ICONS.legs, color: CATEGORY_COLORS.legs },
];

const DAYS_CA = ['Diumenge','Dilluns','Dimarts','Dimecres','Dijous','Divendres','Dissabte'];
const MONTHS_CA_FULL = [
  'de gener','de febrer','de març','d\'abril','de maig','de juny',
  'de juliol','d\'agost','de setembre','d\'octubre','de novembre','de desembre',
];

@Component({
  selector: 'app-calendar-planner',
  standalone: true,
  imports: [CalendarComponent, WorkoutEditorComponent],
  template: `
    <div class="page">

      <!-- Page header -->
      <div class="page-header">
        <div class="page-header-top">
          <button class="back-btn" (click)="goBack()">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <h1>Planifica</h1>
        </div>
      </div>

      <!-- Calendar -->
      <div class="calendar-wrap">
        <app-calendar
          [allowFuturePlanning]="true"
          [selectedDate]="selectedDate()"
          (dateSelected)="selectDate($event)">
        </app-calendar>
      </div>

      <!-- Inline editor for a planned workout -->
      @if (editingWorkout(); as ew) {
        <div class="editor-section">
          <div class="editor-header">
            <span class="editor-title">Editar pla</span>
            <button class="editor-close" (click)="closeEditor()">
              <span class="material-symbols-outlined">check</span>
              Fet
            </button>
          </div>
          <app-workout-editor [workout]="ew" [alwaysEditable]="true"></app-workout-editor>
        </div>
      } @else {

        <!-- Selected day panel -->
        <div class="day-section">

          <!-- Day label -->
          <div class="day-label">{{ dayLabel() }}</div>

          <!-- Done workouts -->
          @for (w of selectedDone(); track w.id) {
            <div class="item-card" [style.--ic]="planColor(w)">
              <div class="ic-bar" [style.background]="planColor(w)"></div>
              <div class="ic-info">
                <div class="ic-label">
                  <span class="material-symbols-outlined ic-icon">{{ planIcon(w) }}</span>
                  {{ planLabel(w) }}
                </div>
                <span class="ic-meta">
                  {{ w.entries.length }} ex · {{ workoutSetsCount(w) }} sèr
                </span>
              </div>
              <span class="ic-done material-symbols-outlined">check_circle</span>
            </div>
          }

          <!-- Planned workouts -->
          @for (plan of selectedPlanned(); track plan.id) {
            <div class="plan-card" [style.--pc]="planColor(plan)">
              <div class="pc-bar" [style.background]="planColor(plan)"></div>
              <div class="pc-body">
                <div class="pc-header">
                  <span class="material-symbols-outlined pc-icon">{{ planIcon(plan) }}</span>
                  <span class="pc-title">{{ planLabel(plan) }}</span>
                  <span class="pc-badge"
                        [class.pc-badge--trainer]="plan.plannedSource === 'trainer'">
                    {{ plan.plannedSource === 'trainer' ? 'Entrenador' : 'Tu' }}
                  </span>
                </div>
                @if (plan.entries.length > 0) {
                  <div class="pc-exercises">
                    @for (e of plan.entries.slice(0, 4); track e.exerciseId) {
                      <span class="pc-ex">{{ e.exerciseName }}</span>
                    }
                    @if (plan.entries.length > 4) {
                      <span class="pc-ex pc-ex--more">+{{ plan.entries.length - 4 }} més</span>
                    }
                  </div>
                }
                @if (plan.notes) {
                  <p class="pc-notes">{{ plan.notes }}</p>
                }
                <div class="pc-actions">
                  @if (selectedDate() <= todayStr) {
                    <button class="pc-start" (click)="startPlan(plan)">
                      <span class="material-symbols-outlined">play_arrow</span>
                      Comença
                    </button>
                  }
                  <button class="pc-action-btn pc-edit" (click)="editPlan(plan)">
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                  <button class="pc-action-btn pc-delete" (click)="deletePlan(plan)">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Add plan section (future, or no planned yet on any day) -->
          @if (showAddPlan()) {
            <div class="add-section">
              <div class="add-label">Nou pla d'entrenament</div>
              <div class="type-grid">
                @for (t of workoutTypes; track t.value) {
                  <button class="type-btn" [style.--cat-color]="t.color"
                          (click)="createPlan(t.value)" [disabled]="creating()">
                    <span class="material-symbols-outlined type-icon">{{ t.icon }}</span>
                    <span class="type-label">{{ t.label }}</span>
                  </button>
                }
              </div>
              <button class="btn-empty" (click)="createPlan()" [disabled]="creating()">
                <span class="material-symbols-outlined">add</span>
                Entrenament buit
              </button>
            </div>
          }

          <!-- Empty state: past day, no activity, no plans -->
          @if (selectedDone().length === 0 && selectedPlanned().length === 0 && !showAddPlan()) {
            <div class="empty-day">
              <span class="material-symbols-outlined empty-icon">calendar_today</span>
              <p>Cap activitat registrada</p>
            </div>
          }

        </div>
      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 90px; }

    .page-header { padding: 16px 16px 10px; }
    .page-header-top {
      display: flex; align-items: center; gap: 8px;
      h1 { margin: 0; font-size: 22px; font-weight: 700; flex: 1; }
    }

    .back-btn {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: var(--c-subtle); color: var(--c-text-2);
      cursor: pointer; -webkit-tap-highlight-color: transparent;
      transition: background 0.15s;
      flex-shrink: 0;
      span { font-size: 20px; }
      &:hover  { background: var(--c-hover); }
      &:active { opacity: 0.7; }
    }

    .calendar-wrap {
      margin: 0 16px 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 16px; overflow: hidden;
      background: var(--c-card);
    }

    /* ── Day section ── */
    .day-section {
      margin: 0 16px;
      display: flex; flex-direction: column; gap: 10px;
    }

    .day-label {
      font-size: 13px; font-weight: 700; color: var(--c-text-2);
      text-transform: capitalize; padding: 0 2px;
    }

    /* ── Done item card ── */
    .item-card {
      display: flex; align-items: center;
      border: 1.5px solid color-mix(in srgb, var(--ic, var(--c-border-2)) 30%, var(--c-border-2));
      border-radius: 14px;
      background: color-mix(in srgb, var(--ic, var(--c-card)) 8%, var(--c-card));
      overflow: hidden;
    }
    .ic-bar { width: 5px; align-self: stretch; flex-shrink: 0; }
    .ic-info {
      flex: 1; min-width: 0; padding: 10px 10px;
      display: flex; flex-direction: column; gap: 2px;
    }
    .ic-label {
      font-size: 13px; font-weight: 700; color: var(--c-text);
      display: flex; align-items: center; gap: 5px;
    }
    .ic-icon { font-size: 15px; font-variation-settings: 'FILL' 1, 'wght' 400; color: var(--ic, var(--c-brand)); }
    .ic-meta { font-size: 11px; color: var(--c-text-3); }
    .ic-done {
      font-size: 18px; color: #43a047; margin-right: 14px; flex-shrink: 0;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }

    /* ── Plan card ── */
    .plan-card {
      display: flex;
      border: 1.5px solid color-mix(in srgb, var(--pc, var(--c-brand)) 40%, var(--c-border-2));
      border-radius: 14px; overflow: hidden;
      background: color-mix(in srgb, var(--pc, var(--c-brand)) 5%, var(--c-card));
    }
    .pc-bar { width: 5px; align-self: stretch; flex-shrink: 0; }
    .pc-body { flex: 1; min-width: 0; padding: 12px 12px 10px; display: flex; flex-direction: column; gap: 8px; }
    .pc-header { display: flex; align-items: center; gap: 7px; }
    .pc-icon {
      font-size: 18px; flex-shrink: 0; color: var(--pc, var(--c-brand));
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .pc-title { font-size: 14px; font-weight: 700; color: var(--c-text); flex: 1; min-width: 0; }
    .pc-badge {
      font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; flex-shrink: 0;
      background: rgba(var(--c-brand-rgb), 0.12); color: var(--c-brand);
      &.pc-badge--trainer { background: rgba(255,152,0,0.12); color: #ef6c00; }
    }
    .pc-exercises { display: flex; flex-wrap: wrap; gap: 4px; }
    .pc-ex {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      background: var(--c-subtle); border-radius: 8px; padding: 2px 7px;
      &.pc-ex--more { color: var(--c-text-3); font-style: italic; }
    }
    .pc-notes { margin: 0; font-size: 12px; color: var(--c-text-2); font-style: italic; line-height: 1.4; }
    .pc-actions { display: flex; align-items: center; gap: 8px; }
    .pc-start {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 9px 14px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700; cursor: pointer; touch-action: manipulation;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: var(--c-brand-dk); }
    }
    .pc-action-btn {
      width: 36px; height: 36px; border-radius: 10px; flex-shrink: 0;
      border: 1.5px solid var(--c-border-2); background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 16px; }
      transition: all 0.15s;
      &:hover { border-color: var(--c-border); color: var(--c-text-2); }
    }
    .pc-delete:hover { border-color: rgba(239,83,80,0.35) !important; color: #ef5350 !important; }

    /* ── Add plan section ── */
    .add-section {
      background: var(--c-card); border-radius: 16px;
      padding: 14px; box-shadow: 0 2px 10px var(--c-shadow);
      display: flex; flex-direction: column; gap: 10px;
    }
    .add-label {
      font-size: 12px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.4px;
    }
    .type-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
    }
    .type-btn {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 14px 4px 12px;
      border: 2px solid color-mix(in srgb, var(--cat-color) 55%, var(--c-border));
      border-radius: 14px;
      background: color-mix(in srgb, var(--cat-color) 10%, var(--c-card));
      cursor: pointer; color: color-mix(in srgb, var(--cat-color) 80%, var(--c-text));
      transition: all 0.18s; touch-action: manipulation;
      .type-icon { font-size: 26px; }
      .type-label { font-size: 11px; font-weight: 700; text-align: center; }
      &:hover:not(:disabled) {
        border-color: var(--cat-color);
        background: color-mix(in srgb, var(--cat-color) 18%, var(--c-card));
        transform: translateY(-1px);
      }
      &:disabled { opacity: 0.6; cursor: default; }
    }
    .btn-empty {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      width: 100%; padding: 11px 16px; border-radius: 12px;
      border: 1.5px dashed var(--c-border); background: transparent;
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover:not(:disabled) { border-color: var(--c-brand); color: var(--c-brand); background: rgba(var(--c-brand-rgb),0.04); }
      &:disabled { opacity: 0.6; cursor: default; }
    }

    /* ── Empty state ── */
    .empty-day {
      display: flex; flex-direction: column; align-items: center;
      padding: 32px 16px; gap: 10px;
    }
    .empty-icon { font-size: 36px; color: var(--c-border); }
    .empty-day p { margin: 0; font-size: 14px; color: var(--c-text-3); }

    /* ── Inline editor ── */
    .editor-section { margin: 0 16px; }
    .editor-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 10px;
    }
    .editor-title { font-size: 16px; font-weight: 700; color: var(--c-text); }
    .editor-close {
      display: flex; align-items: center; gap: 5px;
      padding: 8px 16px; border-radius: 20px;
      border: none; background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 600; cursor: pointer; touch-action: manipulation;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { background: var(--c-brand-dk); }
    }
  `],
})
export class CalendarPlannerComponent {
  readonly workoutService = inject(WorkoutService);
  private router          = inject(Router);
  private snackBar        = inject(MatSnackBar);

  readonly selectedDate  = signal<string>(TODAY());
  readonly editingId     = signal<string | null>(null);
  readonly creating      = signal(false);
  readonly todayStr      = TODAY();
  readonly workoutTypes  = WORKOUT_TYPES;

  readonly selectedDone = computed(() =>
    this.workoutService.getDoneWorkoutsForDate(this.selectedDate())
  );

  readonly selectedPlanned = computed(() =>
    this.workoutService.getPlannedForDate(this.selectedDate())
  );

  readonly isSelectedFuture = computed(() => this.selectedDate() > TODAY());

  readonly editingWorkout = computed((): Workout | null => {
    const id = this.editingId();
    if (!id) return null;
    return this.workoutService.getPlannedForDate(this.selectedDate()).find(w => w.id === id)
      ?? this.workoutService.getDoneWorkoutsForDate(this.selectedDate()).find(w => w.id === id)
      ?? null;
  });

  readonly showAddPlan = computed(() =>
    this.selectedDate() >= this.todayStr
  );

  readonly dayLabel = computed(() => {
    const d = new Date(this.selectedDate() + 'T12:00:00');
    if (this.selectedDate() === TODAY()) return 'Avui';
    const diff = Math.round(
      (new Date(this.selectedDate() + 'T12:00:00').getTime() - new Date(TODAY() + 'T12:00:00').getTime())
      / 86_400_000
    );
    if (diff === -1) return 'Ahir';
    if (diff === 1)  return 'Demà';
    return `${DAYS_CA[d.getDay()]}, ${d.getDate()} ${MONTHS_CA_FULL[d.getMonth()]}`;
  });

  goBack(): void { this.router.navigate(['/train']); }

  selectDate(date: string): void {
    this.selectedDate.set(date);
    this.editingId.set(null);
  }

  async createPlan(category?: ExerciseCategory): Promise<void> {
    this.creating.set(true);
    try {
      const id = await this.workoutService.createPlannedWorkout(this.selectedDate(), category);
      this.editingId.set(id);
    } catch {
      this.snackBar.open('Error al crear el pla', '', { duration: 2500 });
    } finally {
      this.creating.set(false);
    }
  }

  editPlan(workout: Workout): void {
    this.editingId.set(workout.id);
  }

  closeEditor(): void {
    this.editingId.set(null);
  }

  async startPlan(workout: Workout): Promise<void> {
    try {
      await this.workoutService.startPlannedWorkout(workout.id);
      this.router.navigate(['/train']);
    } catch {
      this.snackBar.open('Error en iniciar el pla', '', { duration: 2500 });
    }
  }

  async deletePlan(workout: Workout): Promise<void> {
    try {
      await this.workoutService.deleteWorkout(workout.id);
    } catch {
      this.snackBar.open('Error en eliminar el pla', '', { duration: 2500 });
    }
  }

  planLabel(w: Workout): string {
    const cats = workoutCategories(w);
    if (!cats.length) return 'Entrenament';
    return cats.map(c => CATEGORY_LABELS[c as ExerciseCategory] ?? c).join(' + ');
  }

  planColor(w: Workout): string {
    const cats = workoutCategories(w);
    return cats.length ? (CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? '#006874') : '#006874';
  }

  planIcon(w: Workout): string {
    const cats = workoutCategories(w);
    return cats.length ? (CATEGORY_ICONS[cats[0] as ExerciseCategory] ?? 'fitness_center') : 'fitness_center';
  }

  workoutSetsCount(w: Workout): number {
    return w.entries.reduce((acc, e) => acc + e.sets.length, 0);
  }
}
