import { LowerCasePipe } from '@angular/common';
import { Component, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';

import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, Exercise, ExerciseCategory,
} from '../../core/models/exercise.model';
import { WorkoutEntry } from '../../core/models/workout.model';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';

const TODAY = (): string => new Date().toISOString().split('T')[0];

const WORKOUT_TYPES: { value: ExerciseCategory; label: string; icon: string; color: string }[] = [
  { value: 'push', label: CATEGORY_LABELS.push, icon: CATEGORY_ICONS.push, color: CATEGORY_COLORS.push },
  { value: 'pull', label: CATEGORY_LABELS.pull, icon: CATEGORY_ICONS.pull, color: CATEGORY_COLORS.pull },
  { value: 'legs', label: CATEGORY_LABELS.legs, icon: CATEGORY_ICONS.legs, color: CATEGORY_COLORS.legs },
];


@Component({
  selector: 'app-train',
  standalone: true,
  imports: [WorkoutEditorComponent, LowerCasePipe],
  template: `
    <div class="page">

      <!-- ── Workout type badges ── -->
      @if (selectedWorkout() && workoutCategories().length > 0) {
        <div class="type-badges">
          @for (cat of workoutCategoryItems(); track cat.value) {
            <span class="type-badge" [style.background]="cat.color">{{ cat.label }}</span>
          }
          @if (workoutCategories().length > 1) {
            <span class="hybrid-badge">Híbrid</span>
          }
        </div>
      }

      <!-- ── Loading ── -->
      @if (workoutService.isLoading() && !selectedWorkout()) {
        <div class="loading-state">
          <span class="material-symbols-outlined spin">sync</span>
        </div>
      }

      <!-- ── Empty state / Suggestion ── -->
      @if (!selectedWorkout() && !workoutService.isLoading()) {
        @if (suggestionType() && suggestion()) {
          <div class="suggestion-panel">
            <div class="suggestion-header">
              <span class="suggestion-title">Últim {{ suggestionTypeLabel() | lowercase }}</span>
              <span class="suggestion-date">· {{ suggestionAgo() }}</span>
            </div>
            @if (suggestionEntries().length > 0) {
              <div class="suggestion-exercises">
                @for (entry of suggestionEntries(); track entry.exerciseId) {
                  <div class="suggestion-exercise">
                    <span class="suggestion-exercise-name">{{ entry.exerciseName }}</span>
                    <span class="suggestion-exercise-stats">{{ entry.sets.length }} sèr · {{ maxWeight(entry) }}kg màx</span>
                  </div>
                }
              </div>
            }
            <div class="suggestion-actions">
              <button class="btn-suggestion-new" (click)="dismissSuggestion(false)">Nou</button>
              <button class="btn-suggestion-template" (click)="dismissSuggestion(true)">Usar com a base</button>
            </div>
          </div>
        } @else {
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">fitness_center</span>
            <h2>{{ emptyTitle() }}</h2>
            <p>Quin tipus d'entrenament?</p>
            <div class="type-grid">
              @for (cat of workoutTypes; track cat.value) {
                <button class="type-btn" [style.--cat-color]="cat.color" (click)="selectType(cat.value)">
                  <span class="material-symbols-outlined type-icon">{{ cat.icon }}</span>
                  <span class="type-label">{{ cat.label }}</span>
                </button>
              }
            </div>
          </div>
        }
      }

      <!-- ── Workout editor ── -->
      @if (selectedWorkout()) {
        <app-workout-editor
          #editor
          [workout]="selectedWorkout()"
          [editMode]="editMode()"
          [alwaysEditable]="true"
          (requestAddExercise)="openPicker()"
        />

      }

      <!-- ══ Secció Esports ══ -->
      @if (!workoutService.isLoading()) {
      <div class="sports-section">
        <div class="sports-header">
          <span class="material-symbols-outlined sports-header-icon">sports_soccer</span>
          <h2 class="sports-title">Esports</h2>
        </div>
        <div class="sports-grid">
          @for (sport of sportService.sports(); track sport.id) {
            <button
              class="sport-btn"
              [class.active]="isSportDone(sport.id)"
              [style.--sport-color]="sport.color"
              (click)="toggleSport(sport.id)"
              [disabled]="sportToggling()"
            >
              @if (isSportDone(sport.id)) {
                <span class="sport-check material-symbols-outlined">check_circle</span>
              }
              <span class="material-symbols-outlined sport-icon">{{ sport.icon }}</span>
              <span class="sport-name">{{ sport.name }}</span>
              @if (isSportDone(sport.id) && getActiveSubtypeName(sport); as subName) {
                <span class="sport-subtype-label">{{ subName }}</span>
              }
            </button>
          }
        </div>

        <!-- Subtype picker: shown when an active sport has subtypes -->
        @if (expandedSport(); as sport) {
          <div class="subtype-row">
            <span class="subtype-row-label">{{ sport.name }}:</span>
            <button
              class="subtype-chip"
              [class.active]="!activeSubtypeId()"
              (click)="selectSubtype(null)"
            >Cap</button>
            @for (sub of sport.subtypes; track sub.id) {
              <button
                class="subtype-chip"
                [class.active]="activeSubtypeId() === sub.id"
                (click)="selectSubtype(sub.id)"
              >{{ sub.name }}</button>
            }
          </div>
        }
      </div>
      } <!-- end @if !isLoading -->

    </div>

    <!-- ── Bottom bar: data + accions en un sol contenidor ── -->
    <div class="bottom-bar">

      <!-- Navegació de data -->
      <div class="bar-date">
        <button class="arrow-btn" (click)="navigateDate(-1)">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
        <button class="date-btn" (click)="openCalendar()">
          <span class="date-text">{{ dateLabel() }}</span>
          <span class="material-symbols-outlined date-edit-icon">edit_calendar</span>
        </button>
        <button class="arrow-btn" [class.invisible]="isToday()" (click)="navigateDate(1)">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <!-- Botons d'acció -->
      @if (selectedWorkout()) {
        @if (editMode()) {
          <div class="bar-actions">
            <button class="bar-icon-btn bar-danger" (click)="deleteWorkout()" title="Eliminar entrenament">
              <span class="material-symbols-outlined">delete</span>
            </button>
            <button class="bar-primary-btn" (click)="toggleEditMode()">
              <span class="material-symbols-outlined">check</span>
              Fet
            </button>
          </div>
        } @else {
          <div class="bar-actions">
            <button class="bar-icon-btn" (click)="toggleEditMode()" title="Reordenar / eliminar exercicis">
              <span class="material-symbols-outlined">tune</span>
            </button>
            <button class="bar-primary-btn" (click)="openPicker()">
              <span class="material-symbols-outlined">add</span>
              Exercici
            </button>
          </div>
        }
      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 160px; min-height: 100dvh; }

    /* ── Bottom bar: contenidor únic per data + accions ── */
    .bottom-bar {
      position: fixed;
      bottom: calc(64px + env(safe-area-inset-bottom) + 12px);
      left: 12px; right: 12px;
      z-index: 90;
      display: flex; align-items: center; gap: 4px;
      background: white;
      border-radius: 20px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15), 0 1px 4px rgba(0,0,0,0.08);
      padding: 4px;
    }

    .bar-date {
      flex: 1; min-width: 0;
      display: flex; align-items: center;
    }

    .arrow-btn {
      width: 38px; height: 38px; border-radius: 50%; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: #999; transition: color 0.15s, background 0.15s;
      touch-action: manipulation; flex-shrink: 0;
      .material-symbols-outlined { font-size: 22px; }
      &:hover { color: #333; background: rgba(0,0,0,0.06); }
      &.invisible { visibility: hidden; pointer-events: none; }
    }

    .date-btn {
      flex: 1; min-width: 0;
      display: flex; align-items: center; gap: 5px;
      padding: 8px 6px; border-radius: 14px; border: none; background: transparent;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover { background: rgba(0,0,0,0.05); }
    }
    .date-text {
      flex: 1; min-width: 0;
      font-size: 13px; font-weight: 600; color: #333; text-transform: capitalize;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .date-edit-icon { font-size: 14px; color: #bbb; flex-shrink: 0; }

    .bar-actions {
      display: flex; align-items: center; gap: 4px;
      flex-shrink: 0; padding-right: 2px;
    }

    .bar-icon-btn {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      background: transparent; color: #777;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(0,0,0,0.06); color: #333; }
      &.bar-danger:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
    }

    .bar-primary-btn {
      display: flex; align-items: center; gap: 5px;
      height: 38px; padding: 0 16px; border-radius: 19px; border: none;
      background: #006874; color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      touch-action: manipulation; transition: background 0.15s; white-space: nowrap;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: #005a63; }
    }


    /* ── Type badges ── */
    .type-badges {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
      padding: 0 16px 10px;
    }
    .type-badge {
      padding: 3px 10px; border-radius: 10px;
      font-size: 12px; font-weight: 600; color: white;
    }
    .hybrid-badge {
      padding: 3px 10px; border-radius: 10px;
      font-size: 11px; font-weight: 700;
      background: linear-gradient(90deg, #ef5350 0%, #9c27b0 50%, #2196f3 100%);
      color: white; letter-spacing: 0.3px;
    }

    /* ── Loading ── */
    .loading-state {
      display: flex; justify-content: center; padding: 48px;
      .material-symbols-outlined { font-size: 32px; color: #ccc; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 12px; padding: 32px 24px 24px; text-align: center;
      .empty-icon { font-size: 48px; color: #ddd; }
      h2 { margin: 0; font-size: 18px; font-weight: 600; color: #444; }
      p  { margin: 0; color: #888; font-size: 14px; }
    }
    .type-grid {
      display: flex; gap: 12px; margin-top: 8px; width: 100%; max-width: 340px;
    }
    .type-btn {
      flex: 1; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 8px;
      border: 2px solid var(--cat-color); border-radius: 16px;
      background: white; cursor: pointer; color: var(--cat-color);
      transition: all 0.18s; touch-action: manipulation;
      &:hover {
        background: color-mix(in srgb, var(--cat-color) 10%, white);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.12);
      }
      .type-icon { font-size: 28px; }
      .type-label { font-size: 13px; font-weight: 600; }
    }

    /* ── Suggestion panel ── */
    .suggestion-panel {
      margin: 24px 16px;
      background: white;
      border-radius: 16px;
      padding: 20px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.1);
    }
    .suggestion-header {
      display: flex; align-items: center; gap: 6px; margin-bottom: 16px;
    }
    .suggestion-title { font-size: 15px; font-weight: 600; color: #333; }
    .suggestion-date  { font-size: 14px; color: #888; }
    .suggestion-exercises {
      display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;
    }
    .suggestion-exercise {
      display: flex; justify-content: space-between; align-items: center;
    }
    .suggestion-exercise-name  { font-size: 14px; color: #333; }
    .suggestion-exercise-stats { font-size: 12px; color: #888; }
    .suggestion-actions { display: flex; gap: 10px; }
    .btn-suggestion-new {
      flex: 1; padding: 10px; border: 2px solid #ddd; border-radius: 10px;
      background: white; color: #666; font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      &:hover { border-color: #bbb; color: #333; }
    }
    .btn-suggestion-template {
      flex: 2; padding: 10px; border: none; border-radius: 10px;
      background: #006874; color: white; font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      &:hover { background: #004f5a; }
    }


    /* ── Secció Esports ── */
    .sports-section {
      margin: 24px 16px 0;
      padding: 14px 14px 16px;
      background: white;
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    }

    .sports-header {
      display: flex; align-items: center; gap: 7px;
      margin-bottom: 14px;
    }
    .sports-header-icon {
      font-size: 18px; color: #888;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .sports-title {
      margin: 0; font-size: 14px; font-weight: 700;
      color: #555; letter-spacing: 0.2px;
    }

    .sports-grid {
      display: flex; gap: 10px;
    }

    .sport-btn {
      position: relative;
      flex: 1;
      display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 16px 4px 14px;
      border: 1.5px solid color-mix(in srgb, var(--sport-color) 30%, #e8e8e8);
      border-radius: 16px;
      background: white;
      color: color-mix(in srgb, var(--sport-color) 65%, #444);
      cursor: pointer; touch-action: manipulation;
      transition: all 0.18s ease;

      &:hover:not(:disabled) {
        border-color: var(--sport-color);
        background: color-mix(in srgb, var(--sport-color) 6%, white);
        transform: translateY(-1px);
      }
      &:active:not(:disabled) { transform: scale(0.97); }

      &.active {
        border-color: var(--sport-color);
        background: color-mix(in srgb, var(--sport-color) 10%, white);
      }
      &:disabled { opacity: 0.65; cursor: default; }
    }

    .sport-icon {
      font-size: 28px;
      font-variation-settings: 'FILL' 0, 'wght' 300;
      transition: font-variation-settings 0.15s;
      .active & { font-variation-settings: 'FILL' 1, 'wght' 400; }
    }

    .sport-name {
      font-size: 11px; font-weight: 700; letter-spacing: 0.2px;
      text-align: center; line-height: 1.1;
    }

    .sport-check {
      position: absolute; top: 6px; right: 6px;
      font-size: 15px;
      color: var(--sport-color);
      font-variation-settings: 'FILL' 1, 'wght' 500;
    }

    .sport-subtype-label {
      font-size: 10px; font-weight: 600; color: var(--sport-color);
      text-align: center; line-height: 1.1;
      max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    /* ── Subtype picker row ── */
    .subtype-row {
      display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
      padding: 10px 2px 2px;
    }
    .subtype-row-label {
      font-size: 11px; font-weight: 600; color: #888;
      flex-shrink: 0;
    }
    .subtype-chip {
      padding: 5px 12px;
      border: 1.5px solid #e0e0e0; border-radius: 20px;
      background: white; font-size: 12px; font-weight: 600; color: #666;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active {
        background: #006874; color: white; border-color: #006874;
      }
      &:hover:not(.active) { border-color: #006874; color: #006874; }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spin { animation: spin 1s linear infinite; }
  `],
})
export class TrainComponent {
  readonly workoutService = inject(WorkoutService);
  readonly sportService   = inject(SportService);
  private dialog          = inject(MatDialog);
  private snackBar        = inject(MatSnackBar);

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  readonly selectedDate     = signal<string>(TODAY());
  readonly editMode         = signal(false);
  readonly sportToggling    = signal(false);
  readonly workoutTypes     = WORKOUT_TYPES;
  readonly expandedSportId  = signal<string | null>(null);

  readonly isToday = computed(() => this.selectedDate() === TODAY());

  readonly expandedSport = computed(() => {
    const id = this.expandedSportId();
    return id ? this.sportService.sports().find(s => s.id === id) ?? null : null;
  });

  readonly activeSubtypeId = computed(() => {
    const sportId = this.expandedSportId();
    if (!sportId) return null;
    return this.sportService.getSessionForDate(this.selectedDate(), sportId)?.subtypeId ?? null;
  });

  readonly dateLabel = computed(() => {
    const d = new Date(this.selectedDate() + 'T12:00:00');
    const formatted = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'short' });
    return this.isToday() ? `Avui · ${formatted}` : formatted;
  });

  readonly selectedWorkout = computed(() => {
    if (this.isToday()) return this.workoutService.todayWorkout();
    return this.workoutService.getWorkoutForDate(this.selectedDate());
  });

  readonly emptyTitle = computed(() =>
    this.isToday() ? 'Cap entrenament avui' : 'Cap entrenament aquest dia'
  );

  readonly workoutCategories = computed((): string[] => {
    const w = this.selectedWorkout();
    if (!w) return [];
    return w.categories?.length ? w.categories : (w.category ? [w.category] : []);
  });

  readonly workoutCategoryItems = computed(() =>
    this.workoutCategories()
      .map(c => WORKOUT_TYPES.find(t => t.value === c))
      .filter((t): t is typeof WORKOUT_TYPES[0] => !!t)
  );

  readonly suggestionType = signal<ExerciseCategory | null>(null);

  readonly suggestion = computed(() => {
    const type = this.suggestionType();
    return type ? this.workoutService.getLastWorkoutByCategory(type) : null;
  });

  readonly suggestionTypeLabel = computed(() => {
    const type = this.suggestionType();
    return type ? WORKOUT_TYPES.find(t => t.value === type)?.label ?? '' : '';
  });

  readonly suggestionAgo = computed(() => {
    const s = this.suggestion();
    if (!s) return '';
    const diffDays = Math.round(
      (new Date(TODAY() + 'T12:00:00').getTime() - new Date(s.date + 'T12:00:00').getTime())
      / 86_400_000
    );
    if (diffDays === 0) return 'avui';
    if (diffDays === 1) return 'ahir';
    if (diffDays < 7)  return `fa ${diffDays} dies`;
    if (diffDays < 14) return 'fa una setmana';
    return `fa ${Math.round(diffDays / 7)} setmanes`;
  });

  readonly suggestionEntries = computed(() =>
    this.suggestion()?.entries.filter(e => e.sets.length > 0) ?? []
  );

  constructor() {
    effect(() => {
      const date = this.selectedDate();
      const [yearStr, monthStr] = date.split('-');
      const year  = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      this.workoutService.ensureMonthLoaded(year, month);
      this.sportService.ensureMonthLoaded(year, month);
      untracked(() => this.expandedSportId.set(null));
    });
  }

  // ── Sport helpers ──────────────────────────────────────────────────────────

  isSportDone(sportId: string): boolean {
    return this.sportService.hasSportOnDate(this.selectedDate(), sportId);
  }

  getActiveSubtypeName(sport: { id: string; subtypes: { id: string; name: string }[] }): string | null {
    const session = this.sportService.getSessionForDate(this.selectedDate(), sport.id);
    if (!session?.subtypeId) return null;
    return sport.subtypes.find(s => s.id === session.subtypeId)?.name ?? null;
  }

  async toggleSport(sportId: string): Promise<void> {
    this.sportToggling.set(true);
    try {
      const wasActive = this.sportService.hasSportOnDate(this.selectedDate(), sportId);
      await this.sportService.toggleSport(this.selectedDate(), sportId);
      if (!wasActive) {
        const sport = this.sportService.sports().find(s => s.id === sportId);
        if (sport?.subtypes?.length) {
          this.expandedSportId.set(sportId);
        }
      } else if (this.expandedSportId() === sportId) {
        this.expandedSportId.set(null);
      }
    } catch {
      this.snackBar.open('Error en guardar l\'esport', '', { duration: 2500 });
    } finally {
      this.sportToggling.set(false);
    }
  }

  async selectSubtype(subtypeId: string | null): Promise<void> {
    const sportId = this.expandedSportId();
    if (!sportId) return;
    const session = this.sportService.getSessionForDate(this.selectedDate(), sportId);
    if (!session) return;
    try {
      await this.sportService.setSessionSubtype(session.id, this.selectedDate(), subtypeId);
    } catch {
      this.snackBar.open('Error en guardar el subtipus', '', { duration: 2500 });
    }
  }

  navigateDate(days: number): void {
    const d = new Date(this.selectedDate() + 'T12:00:00');
    d.setDate(d.getDate() + days);
    this.selectedDate.set(d.toISOString().split('T')[0]);
    this.editMode.set(false);
    this.suggestionType.set(null);
  }

  openCalendar(): void {
    const ref = this.dialog.open(CalendarComponent, {
      data: { selectedDate: this.selectedDate() },
      panelClass: 'cal-dialog',
      width: '360px',
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe((date: string | undefined) => {
      if (date) {
        this.selectedDate.set(date);
        this.editMode.set(false);
        this.suggestionType.set(null);
      }
    });
  }

  toggleEditMode(): void {
    const next = !this.editMode();
    this.editMode.set(next);
    if (!next) this.editor?.reset();
  }

  async deleteWorkout(): Promise<void> {
    if (!confirm('Eliminar l\'entrenament?')) return;
    const w = this.selectedWorkout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.editMode.set(false);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async selectType(category: ExerciseCategory): Promise<void> {
    const last = this.workoutService.getLastWorkoutByCategory(category);
    if (last) {
      this.suggestionType.set(category);
    } else {
      try {
        await this.workoutService.createWorkoutForDate(this.selectedDate(), category);
      } catch {
        this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
      }
    }
  }

  async dismissSuggestion(useTemplate: boolean): Promise<void> {
    const category = this.suggestionType();
    if (!category) return;
    this.suggestionType.set(null);
    try {
      const date = this.selectedDate();
      if (useTemplate) {
        const template = this.workoutService.getLastWorkoutByCategory(category);
        await this.workoutService.createWorkoutFromTemplate(date, category, template?.entries ?? []);
      } else {
        await this.workoutService.createWorkoutForDate(date, category);
      }
    } catch {
      this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
    }
  }

  maxWeight(entry: WorkoutEntry): number {
    return entry.sets.length ? Math.max(...entry.sets.map(s => s.weight)) : 0;
  }

  openPicker(newCategory?: ExerciseCategory): void {
    const w               = this.selectedWorkout();
    const excludeIds      = w?.entries.map(e => e.exerciseId) ?? [];
    const defaultCategory = (newCategory ?? w?.category) as ExerciseCategory | undefined;

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds, defaultCategory }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe(async (exercise: Exercise | undefined) => {
      if (!exercise) return;
      try {
        let workoutId = w?.id;
        if (!workoutId) {
          const date = this.selectedDate();
          workoutId = this.isToday()
            ? await this.workoutService.createTodayWorkout(defaultCategory)
            : await this.workoutService.createWorkoutForDate(date, defaultCategory);
        }

        await this.workoutService.addExerciseToWorkout(workoutId, {
          exerciseId: exercise.id, exerciseName: exercise.name, sets: [],
        });

        setTimeout(() => {
          this.editor?.startAddSet({ exerciseId: exercise.id, exerciseName: exercise.name, sets: [] });
        }, 0);
      } catch {
        this.snackBar.open('Error en afegir l\'exercici', '', { duration: 3000 });
      }
    });
  }
}
