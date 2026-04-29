import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

import { Exercise, ExerciseCategory, CATEGORY_LABELS, CATEGORY_COLORS, SUBCATEGORY_LABELS } from '../../../core/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';

export interface ExercisePickerData {
  excludeIds?: string[];
  /**
   * When set, this category is pre-selected in the filter bar
   * but the user can freely switch to any other category.
   * If the user picks an exercise from a different category,
   * WorkoutService will mark the workout as hybrid.
   */
  defaultCategory?: ExerciseCategory;
}

@Component({
  selector: 'app-exercise-picker-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatInputModule, MatFormFieldModule],
  template: `
    <h2 mat-dialog-title>Selecciona exercici</h2>

    <div class="search-bar">
      <mat-form-field appearance="outline" class="search-field">
        <mat-label>Cerca...</mat-label>
        <input matInput [(ngModel)]="searchTerm" autocomplete="off">
      </mat-form-field>
    </div>

    <div class="filter-bar">
      <button class="chip" [class.active]="!catFilter()" (click)="catFilter.set(null)">Tots</button>
      @for (cat of categories; track cat.value) {
        <button class="chip" [class.active]="catFilter() === cat.value"
                [style.--cat-c]="cat.color"
                (click)="catFilter.set(cat.value)">
          {{ cat.label }}
        </button>
      }
    </div>

    <mat-dialog-content class="exercise-list">
      @if (filtered().length === 0) {
        <p class="empty">Cap exercici trobat</p>
      }
      @for (ex of filtered(); track ex.id) {
        <button class="exercise-item" (click)="select(ex)">
          <span class="category-dot" [style.background]="getCategoryColor(ex.category)"></span>
          <div class="info">
            <span class="name">{{ ex.name }}</span>
            @if (ex.subcategory) {
              <span class="sub">{{ getSubLabel(ex.subcategory) }} · {{ getCategoryLabel(ex.category) }}</span>
            }
          </div>
          <span class="material-symbols-outlined arrow">chevron_right</span>
        </button>
      }
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Cancel·lar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] { margin-bottom: 0; }

    .search-bar { padding: 0 24px 4px; }
    .search-field { width: 100%; }

    .filter-bar {
      display: flex;
      gap: 6px;
      padding: 0 24px 8px;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }

    .chip {
      padding: 5px 12px;
      border: 1.5px solid var(--c-border-2);
      border-radius: 16px;
      background: var(--c-card);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.15s;
      color: #555;
      touch-action: manipulation;

      &.active {
        background: var(--cat-c, var(--c-brand));
        color: var(--c-card);
        border-color: var(--cat-c, var(--c-brand));
      }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }

    .exercise-list { padding: 0 !important; min-height: 200px; max-height: 50vh; }

    .exercise-item {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 12px 24px;
      border: none;
      background: transparent;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
      touch-action: manipulation;

      &:hover { background: var(--c-subtle); }
    }

    .category-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

    .info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .name { font-size: 15px; font-weight: 500; color: var(--c-text); }
    .sub { font-size: 12px; color: var(--c-text-3); }

    .arrow { color: var(--c-text-3); font-size: 20px; }

    .empty { padding: 24px; text-align: center; color: var(--c-text-3); }
  `],
})
export class ExercisePickerDialogComponent {
  private dialogRef      = inject(MatDialogRef<ExercisePickerDialogComponent>);
  private exerciseService = inject(ExerciseService);
  readonly data: ExercisePickerData = inject(MAT_DIALOG_DATA);

  searchTerm = '';
  readonly catFilter = signal<ExerciseCategory | null>(this.data.defaultCategory ?? null);

  readonly categories = (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map(v => ({
    value: v,
    label: CATEGORY_LABELS[v],
    color: CATEGORY_COLORS[v],
  }));

  readonly filtered = computed(() => {
    const term     = this.searchTerm.toLowerCase();
    const cat      = this.catFilter();
    const excluded = this.data.excludeIds ?? [];
    return this.exerciseService
      .exercises()
      .filter(e => !excluded.includes(e.id))
      .filter(e => !cat || e.category === cat)
      .filter(e => !term || e.name.toLowerCase().includes(term));
  });

  getCategoryColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat] ?? '#bbb'; }
  getCategoryLabel(cat: ExerciseCategory): string { return CATEGORY_LABELS[cat]; }
  getSubLabel(sub: string): string { return SUBCATEGORY_LABELS[sub as keyof typeof SUBCATEGORY_LABELS] ?? sub; }

  select(exercise: Exercise): void { this.dialogRef.close(exercise); }
  close(): void { this.dialogRef.close(); }
}
