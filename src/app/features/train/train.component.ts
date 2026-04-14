import { LowerCasePipe } from '@angular/common';
import { Component, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';

import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, Exercise, ExerciseCategory,
} from '../../core/models/exercise.model';
import { Workout, WorkoutEntry } from '../../core/models/workout.model';
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

      <!-- ── Loading ── -->
      @if ((workoutService.isLoading() && dateWorkouts().length === 0) || creating()) {
        <div class="loading-state">
          <span class="material-symbols-outlined spin">sync</span>
        </div>
      }

      @if ((!workoutService.isLoading() || dateWorkouts().length > 0) && !creating()) {

        @if (activeWorkout(); as w) {

          <!-- ══ ACTIVE WORKOUT ══ -->
          <div class="workout-topbar">
            <button class="topbar-back" (click)="closeWorkout()" title="Tornar">
              <span class="material-symbols-outlined">arrow_back_ios</span>
            </button>
            <div class="topbar-center">
              @for (cat of activeWorkoutCategoryItems(); track cat.value) {
                <span class="type-badge" [style.background]="cat.color">{{ cat.label }}</span>
              }
              @if (activeWorkoutCategoryItems().length > 1) {
                <span class="hybrid-badge">Híbrid</span>
              }
            </div>
            <button class="topbar-delete" (click)="deleteActiveWorkout()" title="Eliminar entrenament">
              <span class="material-symbols-outlined">delete</span>
            </button>
          </div>

          <app-workout-editor
            #editor
            [workout]="w"
            [editMode]="false"
            [alwaysEditable]="true"
            (requestAddExercise)="openPicker()"
          />

        } @else {

          <!-- ══ DASHBOARD ══ -->

          <!-- Entrenaments section -->
          <div class="workout-section">
            <div class="sports-header">
              <span class="material-symbols-outlined sports-header-icon">fitness_center</span>
              <h2 class="sports-title">Entrenaments</h2>
            </div>

            <!-- Existing workout cards -->
            @for (w of dateWorkouts(); track w.id) {
              <div class="workout-card" (click)="openWorkout(w.id)">
                <div class="wc-bar" [style.background]="workoutCardColor(w)"></div>
                <div class="wc-info">
                  <span class="wc-label">{{ workoutLabel(w) }}</span>
                  <span class="wc-detail">
                    {{ w.entries.length }} exerc
                    @if (workoutSetsCount(w); as n) { · {{ n }} sèr }
                  </span>
                </div>
                <button class="wc-delete" (click)="$event.stopPropagation(); confirmDeleteWorkout(w)" title="Eliminar">
                  <span class="material-symbols-outlined">delete</span>
                </button>
              </div>
            }

            <!-- Inline suggestion panel -->
            @if (suggestionType() && suggestion()) {
              <div class="suggestion-body">
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
            }

            <!-- Type grid (hidden while suggestion showing) -->
            @if (!suggestionType()) {
              <div class="type-grid" [class.type-grid--mt]="dateWorkouts().length > 0">
                @for (cat of workoutTypes; track cat.value) {
                  <button class="type-btn" [style.--cat-color]="cat.color" (click)="selectType(cat.value)">
                    <span class="material-symbols-outlined type-icon">{{ cat.icon }}</span>
                    <span class="type-label">{{ cat.label }}</span>
                  </button>
                }
              </div>
            }
          </div>

          <!-- Sports section -->
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

        }
      }

    </div>

    <!-- ── Bottom bar: date nav (dashboard) or "+" FAB (active workout) ── -->
    @if (activeWorkout()) {
      <button class="add-exercise-fab" (click)="openPicker()" title="Afegir exercici">
        <span class="material-symbols-outlined">add</span>
      </button>
    } @else {
      <div class="bottom-bar">
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
      </div>
    }
  `,
  styles: [`
    .page { padding: 0 0 160px; min-height: 100dvh; }

    /* ── Bottom bar ── */
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

    /* ── Add-exercise FAB (active workout mode) ── */
    .add-exercise-fab {
      position: fixed;
      bottom: calc(64px + env(safe-area-inset-bottom) + 16px);
      right: 20px;
      z-index: 90;
      width: 52px; height: 52px; border-radius: 50%; border: none;
      background: #006874; color: white;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px rgba(0,104,116,0.4), 0 1px 4px rgba(0,0,0,0.1);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 26px; }
      &:hover { background: #005a63; transform: scale(1.06); }
      &:active { transform: scale(0.96); }
    }

    /* ── Loading ── */
    .loading-state {
      display: flex; justify-content: center; padding: 48px;
      .material-symbols-outlined { font-size: 32px; color: #ccc; }
    }

    /* ── Active workout topbar ── */
    .workout-topbar {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 12px 6px;
    }
    .topbar-back {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: #555;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s; flex-shrink: 0; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(0,0,0,0.06); }
    }
    .topbar-center {
      flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 5px;
    }
    .topbar-delete {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: #bbb;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.15s; flex-shrink: 0; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: rgba(239,83,80,0.08); color: #ef5350; }
    }

    /* ── Type badges ── */
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

    /* ── Workout section (dashboard) ── */
    .workout-section {
      margin: 12px 16px 0;
      padding: 14px 14px 16px;
      background: white;
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    }

    /* ── Workout summary cards ── */
    .workout-card {
      display: flex; align-items: center;
      margin-bottom: 8px;
      border: 1.5px solid #efefef; border-radius: 14px;
      background: white; overflow: hidden;
      cursor: pointer; transition: box-shadow 0.15s, border-color 0.15s;
      touch-action: manipulation;
      &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: #ddd; }
    }
    .wc-bar {
      width: 5px; align-self: stretch; flex-shrink: 0;
    }
    .wc-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
      padding: 10px 10px;
    }
    .wc-label {
      font-size: 13px; font-weight: 700; color: #1a1a1a;
    }
    .wc-detail {
      font-size: 11px; color: #999;
    }
    .wc-delete {
      width: 40px; height: 40px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: #ccc; transition: color 0.15s; touch-action: manipulation;
      margin-right: 4px;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { color: #ef5350; }
    }

    /* ── Type grid ── */
    .type-grid {
      display: flex; gap: 10px;
      &.type-grid--mt { margin-top: 10px; }
    }
    .type-btn {
      flex: 1; display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 16px 4px 14px;
      border: 1.5px solid color-mix(in srgb, var(--cat-color) 40%, #e8e8e8);
      border-radius: 16px;
      background: white; cursor: pointer;
      color: color-mix(in srgb, var(--cat-color) 70%, #444);
      transition: all 0.18s; touch-action: manipulation;
      &:hover {
        border-color: var(--cat-color);
        background: color-mix(in srgb, var(--cat-color) 6%, white);
        transform: translateY(-1px);
      }
      &:active { transform: scale(0.97); }
      .type-icon { font-size: 28px; }
      .type-label { font-size: 11px; font-weight: 700; letter-spacing: 0.2px; text-align: center; }
    }

    /* ── Suggestion (inline, inside workout-section) ── */
    .suggestion-body {
      margin-top: 10px;
      padding: 12px 10px 10px;
      background: #fafafa; border-radius: 12px;
      border: 1px solid #f0f0f0;
    }
    .suggestion-header {
      display: flex; align-items: center; gap: 6px; margin-bottom: 10px;
    }
    .suggestion-title { font-size: 13px; font-weight: 700; color: #444; }
    .suggestion-date  { font-size: 12px; color: #aaa; }
    .suggestion-exercises {
      display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;
    }
    .suggestion-exercise {
      display: flex; justify-content: space-between; align-items: center;
    }
    .suggestion-exercise-name  { font-size: 13px; color: #333; }
    .suggestion-exercise-stats { font-size: 11px; color: #888; }
    .suggestion-actions { display: flex; gap: 8px; }
    .btn-suggestion-new {
      flex: 1; padding: 8px; border: 1.5px solid #e0e0e0; border-radius: 10px;
      background: white; color: #666; font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      &:hover { border-color: #bbb; color: #333; }
    }
    .btn-suggestion-template {
      flex: 2; padding: 8px; border: none; border-radius: 10px;
      background: #006874; color: white; font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation;
      &:hover { background: #004f5a; }
    }

    /* ── Sports section ── */
    .sports-section {
      margin: 12px 16px 0;
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

  readonly selectedDate    = signal<string>(TODAY());
  readonly sportToggling   = signal(false);
  readonly workoutTypes    = WORKOUT_TYPES;
  readonly activeWorkoutId = signal<string | null>(null);
  readonly expandedSportId = signal<string | null>(null);
  readonly creating        = signal(false);

  readonly isToday = computed(() => this.selectedDate() === TODAY());

  readonly dateWorkouts = computed(() =>
    this.workoutService.getWorkoutsForDate(this.selectedDate())
  );

  readonly activeWorkout = computed((): Workout | null => {
    const id = this.activeWorkoutId();
    if (!id) return null;
    return this.dateWorkouts().find(w => w.id === id) ?? null;
  });

  readonly activeWorkoutCategories = computed((): string[] => {
    const w = this.activeWorkout();
    if (!w) return [];
    return w.categories?.length ? w.categories : (w.category ? [w.category] : []);
  });

  readonly activeWorkoutCategoryItems = computed(() =>
    this.activeWorkoutCategories()
      .map(c => WORKOUT_TYPES.find(t => t.value === c))
      .filter((t): t is typeof WORKOUT_TYPES[0] => !!t)
  );

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
      untracked(() => {
        this.expandedSportId.set(null);
        this.activeWorkoutId.set(null);
        this.suggestionType.set(null);
      });
    });
  }

  // ── Workout navigation ────────────────────────────────────────────────────

  openWorkout(id: string): void {
    this.activeWorkoutId.set(id);
    this.suggestionType.set(null);
  }

  closeWorkout(): void {
    this.activeWorkoutId.set(null);
    this.editor?.reset();
  }

  workoutLabel(w: Workout): string {
    const cats = w.categories?.length ? w.categories : (w.category ? [w.category] : []);
    if (!cats.length) return 'Entrenament';
    return cats.map(c => CATEGORY_LABELS[c as ExerciseCategory] ?? c).join(' + ');
  }

  workoutCardColor(w: Workout): string {
    const cats = w.categories?.length ? w.categories : (w.category ? [w.category] : []);
    if (!cats.length) return '#006874';
    if (cats.length === 1) return CATEGORY_COLORS[cats[0] as ExerciseCategory] ?? '#006874';
    const colors = cats.map(c => CATEGORY_COLORS[c as ExerciseCategory] ?? '#006874');
    const step = 100 / colors.length;
    return `linear-gradient(180deg, ${colors.map((c, i) => `${c} ${i * step}%, ${c} ${(i + 1) * step}%`).join(', ')})`;
  }

  workoutSetsCount(w: Workout): number {
    return w.entries.reduce((sum, e) => sum + e.sets.length, 0);
  }

  async deleteActiveWorkout(): Promise<void> {
    if (!confirm('Eliminar l\'entrenament?')) return;
    const w = this.activeWorkout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.activeWorkoutId.set(null);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  async confirmDeleteWorkout(w: Workout): Promise<void> {
    if (!confirm(`Eliminar "${this.workoutLabel(w)}"?`)) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 2000 });
    }
  }

  // ── Workout creation ──────────────────────────────────────────────────────

  async selectType(category: ExerciseCategory): Promise<void> {
    const last = this.workoutService.getLastWorkoutByCategory(category);
    if (last) {
      this.suggestionType.set(category);
    } else {
      this.creating.set(true);
      try {
        const id = await this.workoutService.createWorkoutForDate(this.selectedDate(), category);
        this.openWorkout(id);
      } catch {
        this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
      } finally {
        this.creating.set(false);
      }
    }
  }

  async dismissSuggestion(useTemplate: boolean): Promise<void> {
    const category = this.suggestionType();
    if (!category) return;
    this.suggestionType.set(null);
    this.creating.set(true);
    try {
      const date = this.selectedDate();
      let id: string;
      if (useTemplate) {
        const template = this.workoutService.getLastWorkoutByCategory(category);
        id = await this.workoutService.createWorkoutFromTemplate(date, category, template?.entries ?? []);
      } else {
        id = await this.workoutService.createWorkoutForDate(date, category);
      }
      this.openWorkout(id);
    } catch {
      this.snackBar.open('Error en crear l\'entrenament', '', { duration: 3000 });
    } finally {
      this.creating.set(false);
    }
  }

  maxWeight(entry: WorkoutEntry): number {
    return entry.sets.length ? Math.max(...entry.sets.map(s => s.weight)) : 0;
  }

  openPicker(newCategory?: ExerciseCategory): void {
    const w               = this.activeWorkout();
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
          workoutId = await this.workoutService.createWorkoutForDate(this.selectedDate(), defaultCategory);
          this.activeWorkoutId.set(workoutId);
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

  // ── Date navigation ───────────────────────────────────────────────────────

  navigateDate(days: number): void {
    const d = new Date(this.selectedDate() + 'T12:00:00');
    d.setDate(d.getDate() + days);
    this.selectedDate.set(d.toISOString().split('T')[0]);
  }

  openCalendar(): void {
    const ref = this.dialog.open(CalendarComponent, {
      data: { selectedDate: this.selectedDate() },
      panelClass: 'cal-dialog',
      width: '360px',
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe((date: string | undefined) => {
      if (date) this.selectedDate.set(date);
    });
  }

  // ── Sport helpers ─────────────────────────────────────────────────────────

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
        if (sport?.subtypes?.length) this.expandedSportId.set(sportId);
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
}
