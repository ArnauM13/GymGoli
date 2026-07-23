import { Component, inject, signal, computed } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

import {
  Exercise, ExerciseCategory,
  CATEGORY_LABELS, CATEGORY_COLORS,
  ALL_SUBCATEGORY_OPTIONS, MUSCLE_LABELS, SUBCATEGORY_LABELS,
} from '../../../core/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';
import { ExerciseFormDialogComponent } from '../../library/components/exercise-form-dialog.component';
import { FeedbackService } from '../../../shared/services/feedback.service';

export interface ExercisePickerData {
  excludeIds?: string[];
  /**
   * When set, this category is pre-selected in the filter bar
   * but the user can freely switch to any other category.
   */
  defaultCategory?: ExerciseCategory;
  /**
   * Learned next-exercise guesses (ordered), surfaced as a "Suggerits per tu"
   * group at the top of the list while browsing the default category.
   */
  suggestions?: { exerciseId: string; reason: string }[];
}

@Component({
  selector: 'app-exercise-picker-dialog',
  standalone: true,
  imports: [MatDialogModule, FilterBarComponent],
  template: `
    <h2 mat-dialog-title>Selecciona exercici</h2>

    <app-filter-bar
      searchPlaceholder="Cerca exercici..."
      [showSort]="false"
      [(searchQuery)]="searchTerm"
      [(category)]="catFilter" />

    <mat-dialog-content class="exercise-list">
      @if (!isLoaded()) {
        @for (sk of skeletonRows; track sk) {
          <div class="skeleton-item">
            <div class="sk-dot"></div>
            <div class="sk-info">
              <div class="sk-line sk-name"></div>
              <div class="sk-line sk-sub"></div>
            </div>
          </div>
        }
      } @else {
        @if (suggestedGroup().length) {
          <div class="muscle-group-header muscle-group-header--sugg">
            <span class="material-symbols-outlined">auto_awesome</span> Suggerits per tu
          </div>
          @for (s of suggestedGroup(); track s.ex.id) {
            <button class="exercise-item exercise-item--sugg" (click)="select(s.ex)">
              <span class="category-dot" [style.background]="getCategoryColor(s.ex.category)"></span>
              <div class="info">
                <span class="name">{{ s.ex.name }}</span>
                <span class="sub sub--sugg">{{ s.reason }}</span>
              </div>
              <span class="material-symbols-outlined arrow">chevron_right</span>
            </button>
          }
        }
        @if (groupedFiltered().length === 0) {
          <div class="empty">
            <p class="empty-msg">Cap exercici trobat</p>
            <button class="empty-create-btn" type="button" (click)="startCreate()">
              <span class="material-symbols-outlined">add_circle</span>
              Crear "{{ searchTerm() || 'exercici nou' }}"
            </button>
          </div>
        }
        @for (group of groupedFiltered(); track group.key) {
          <div class="muscle-group-header">{{ group.label }}</div>
          @for (ex of group.exercises; track ex.id) {
            <button class="exercise-item" (click)="select(ex)">
              <span class="category-dot" [style.background]="getCategoryColor(ex.category)"></span>
              <div class="info">
                <span class="name">{{ ex.name }}</span>
                @if (ex.muscles?.length || ex.setsRange) {
                  <div class="ex-meta">
                    @if (ex.setsRange && ex.repsRange) {
                      <span class="ex-guide">{{ formatRange(ex.setsRange) }} × {{ formatRange(ex.repsRange) }}</span>
                    }
                    @for (m of (ex.muscles ?? []); track m; let i = $index) {
                      @if (i < 2) {
                        <span class="ex-muscle">{{ getMuscleLabel(m) }}</span>
                      }
                    }
                  </div>
                } @else if (ex.subcategory) {
                  <span class="sub">{{ getSubLabel(ex.subcategory) }} · {{ getCategoryLabel(ex.category) }}</span>
                }
              </div>
              <span class="material-symbols-outlined arrow">chevron_right</span>
            </button>
          }
        }
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button class="dlg-btn dlg-btn--new" type="button" (click)="startCreate()">
        <span class="material-symbols-outlined">add</span>
        Nou exercici
      </button>
      <button class="dlg-btn dlg-btn--cancel" type="button" (click)="close()">Cancel·lar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] { margin-bottom: 0; }

    app-filter-bar { display: block; margin-top: 4px; }

    .exercise-list { padding: 0 !important; min-height: 200px; max-height: 50vh; }

    .exercise-item {
      display: flex; align-items: center; gap: 12px;
      width: 100%; padding: 12px 24px;
      border: none; background: transparent;
      cursor: pointer; text-align: left;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-subtle); }
    }

    .muscle-group-header {
      padding: 8px 24px 6px;
      font-size: 10.5px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.4px;
      &:not(:first-child) { margin-top: 4px; border-top: 1px solid var(--c-border-2); padding-top: 12px; }
    }

    .muscle-group-header--sugg {
      display: flex; align-items: center; gap: 5px;
      color: var(--c-brand); border-top: none !important; margin-top: 0 !important;
      .material-symbols-outlined { font-size: 14px; }
    }
    .exercise-item--sugg { background: rgba(var(--c-brand-rgb), 0.045); }
    .sub--sugg { color: var(--c-brand); font-weight: 600; }

    .category-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .name { font-size: 15px; font-weight: 500; color: var(--c-text); }
    .sub { font-size: 12px; color: var(--c-text-3); }
    .arrow { color: var(--c-text-3); font-size: 20px; }

    .ex-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
    .ex-guide {
      font-size: 10px; font-weight: 700; color: var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.1); border-radius: 5px; padding: 1px 5px;
    }
    .ex-muscle {
      font-size: 10px; font-weight: 500; color: var(--c-text-3);
      background: var(--c-subtle); border: 1px solid var(--c-border-2);
      border-radius: 5px; padding: 1px 5px;
    }

    .empty {
      padding: 28px 24px;
      display: flex; flex-direction: column; align-items: center; gap: 12px;
    }
    .empty-msg { margin: 0; color: var(--c-text-3); font-size: 14px; }
    .empty-create-btn {
      display: flex; align-items: center; gap: 6px;
      padding: 10px 16px; border-radius: 12px;
      border: 1.5px dashed var(--c-border); background: transparent;
      color: var(--c-brand); font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(var(--c-brand-rgb), 0.06); border-style: solid; }
    }

    /* ── Actions ── */
    mat-dialog-actions { gap: 10px; }
    .dlg-btn {
      padding: 9px 18px; border-radius: 10px; font-size: 13px; font-weight: 700;
      cursor: pointer; border: none; transition: background 0.15s, color 0.15s;
      touch-action: manipulation;
    }
    .dlg-btn--cancel {
      background: transparent; color: var(--c-text-2);
      border: 1.5px solid var(--c-border-2);
      &:hover { background: var(--c-hover); color: var(--c-text); }
    }
    .dlg-btn--new {
      display: flex; align-items: center; gap: 4px;
      margin-right: auto;
      background: transparent; color: var(--c-brand);
      border: 1.5px solid rgba(var(--c-brand-rgb), 0.3);
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: rgba(var(--c-brand-rgb), 0.06); border-color: var(--c-brand); }
    }

    /* ── Skeleton ── */
    @keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .skeleton-item {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 24px;
    }
    .sk-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      background: var(--c-border-2); animation: sk-pulse 1.4s ease-in-out infinite;
    }
    .sk-info { flex: 1; display: flex; flex-direction: column; gap: 5px; }
    .sk-line {
      background: var(--c-border-2); border-radius: 6px;
      animation: sk-pulse 1.4s ease-in-out infinite;
    }
    .sk-name { height: 13px; width: 55%; }
    .sk-sub  { height: 10px; width: 35%; }
  `],
})
export class ExercisePickerDialogComponent {
  private dialogRef       = inject(MatDialogRef<ExercisePickerDialogComponent>);
  private dialog          = inject(MatDialog);
  private exerciseService = inject(ExerciseService);
  private feedback        = inject(FeedbackService);
  readonly data: ExercisePickerData = inject(MAT_DIALOG_DATA);

  readonly isLoaded    = this.exerciseService.isLoaded;
  readonly skeletonRows = [1, 2, 3, 4, 5];

  constructor() { this.exerciseService.ensureLoaded(); }

  readonly searchTerm = signal('');
  readonly catFilter = signal<ExerciseCategory | null>(this.data.defaultCategory ?? null);

  readonly filtered = computed(() => {
    const term     = this.searchTerm().toLowerCase();
    const cat      = this.catFilter();
    const excluded = this.data.excludeIds ?? [];
    return this.exerciseService
      .exercises()
      .filter(e => !excluded.includes(e.id))
      .filter(e => !cat || e.category === cat)
      .filter(e => !term || e.name.toLowerCase().includes(term));
  });

  /** "Suggerits per tu": the learned next-exercise guesses resolved to real
   *  catalog exercises. Only shown while browsing (no active search) and on
   *  the default category, so it never fights the user's own filtering. */
  readonly suggestedGroup = computed(() => {
    if (this.searchTerm().trim()) return [];
    const cat = this.catFilter();
    if (cat !== null && cat !== this.data.defaultCategory) return [];

    const excluded = this.data.excludeIds ?? [];
    const byId = new Map(this.exerciseService.exercises().map(e => [e.id, e]));
    return (this.data.suggestions ?? [])
      .filter(s => !excluded.includes(s.exerciseId))
      .map(s => ({ ex: byId.get(s.exerciseId), reason: s.reason }))
      .filter((s): s is { ex: Exercise; reason: string } => !!s.ex);
  });

  /** Subdivides filtered() by main muscle group (subcategory), in a fixed
   *  chest→shoulders→triceps→…→calves order, with an "Altres" bucket for
   *  exercises that don't have one set. Muscle groups are independent of the
   *  workout's training type, so the full flat list is always used. */
  readonly groupedFiltered = computed(() => {
    const list = this.filtered();
    const order = ALL_SUBCATEGORY_OPTIONS;

    const groups: { key: string; label: string; exercises: Exercise[] }[] = [];
    for (const { value, label } of order) {
      const exercises = list.filter(e => e.subcategory === value);
      if (exercises.length > 0) groups.push({ key: value, label, exercises });
    }

    const rest = list.filter(e => !e.subcategory);
    if (rest.length > 0) groups.push({ key: 'other', label: 'Altres', exercises: rest });

    return groups;
  });

  getCategoryColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat] ?? '#bbb'; }
  getCategoryLabel(cat: ExerciseCategory): string { return CATEGORY_LABELS[cat]; }
  getSubLabel(sub: string): string { return SUBCATEGORY_LABELS[sub as keyof typeof SUBCATEGORY_LABELS] ?? sub; }
  getMuscleLabel(m: string): string { return MUSCLE_LABELS[m] ?? m; }

  formatRange([min, max]: [number, number]): string {
    return min === max ? `${min}` : `${min}–${max}`;
  }

  select(exercise: Exercise): void { this.dialogRef.close(exercise); }
  close(): void { this.dialogRef.close(); }

  /** Opens the same exercise-editing form used by the Library page, so
   *  "afegir exercici" and "editar exercici" always share one aesthetic. */
  startCreate(): void {
    const ref = this.dialog.open(ExerciseFormDialogComponent, {
      data: {}, width: '360px', maxHeight: '90vh',
    });
    ref.afterClosed().subscribe(async result => {
      if (!result) return;
      try {
        const exercise = await this.exerciseService.create(result);
        this.dialogRef.close(exercise);
      } catch {
        this.feedback.error('Error en crear l\'exercici', 2500);
      }
    });
  }
}
