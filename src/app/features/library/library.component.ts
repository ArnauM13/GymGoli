import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  Exercise,
  ExerciseCategory,
  SUBCATEGORY_LABELS,
} from '../../core/models/exercise.model';
import { ExerciseService } from '../../core/services/exercise.service';
import {
  ExerciseFormDialogComponent,
} from './components/exercise-form-dialog.component';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [MatButtonModule, MatIconModule],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Exercicis</h1>
        <button mat-icon-button (click)="openForm()" aria-label="Nou exercici">
          <span class="material-symbols-outlined">add</span>
        </button>
      </header>

      <!-- Category filter -->
      <div class="filter-bar">
        <button
          class="filter-chip"
          [class.active]="!activeFilter()"
          (click)="activeFilter.set(null)"
        >Tots</button>
        @for (cat of categoryList; track cat.value) {
          <button
            class="filter-chip"
            [class.active]="activeFilter() === cat.value"
            (click)="activeFilter.set(cat.value)"
          >
            <span class="material-symbols-outlined" style="font-size:16px">{{ cat.icon }}</span>
            {{ cat.label }}
          </button>
        }
      </div>

      <!-- Exercise list -->
      <div class="exercise-list">
        @if (exercises().length === 0) {
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">fitness_center</span>
            <p>Cap exercici encara</p>
            <button mat-flat-button (click)="openForm()">Crea el primer</button>
            <button mat-button (click)="seed()">Carrega exercicis per defecte</button>
          </div>
        }

        @for (cat of visibleCategories(); track cat.value) {
          <div class="category-section">
            <div class="category-header" [style.border-left-color]="getCategoryColor(cat.value)">
              <span class="material-symbols-outlined" [style.color]="getCategoryColor(cat.value)">
                {{ getCategoryIcon(cat.value) }}
              </span>
              <h2>{{ getCategoryLabel(cat.value) }}</h2>
              <span class="count">{{ exercisesByCategory(cat.value).length }}</span>
            </div>

            @for (exercise of exercisesByCategory(cat.value); track exercise.id) {
              <div class="exercise-card">
                <div class="exercise-info">
                  <span class="exercise-name">{{ exercise.name }}</span>
                  @if (exercise.subcategory) {
                    <span class="exercise-sub">{{ getSubcategoryLabel(exercise.subcategory) }}</span>
                  }
                  @if (exercise.notes) {
                    <span class="exercise-notes">{{ exercise.notes }}</span>
                  }
                </div>
                <div class="exercise-actions">
                  <button mat-icon-button (click)="openForm(exercise)" aria-label="Editar">
                    <span class="material-symbols-outlined">edit</span>
                  </button>
                  <button mat-icon-button (click)="deleteExercise(exercise)" aria-label="Eliminar">
                    <span class="material-symbols-outlined">delete</span>
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
      padding: 16px 16px 8px;

      h1 { margin: 0; font-size: 22px; font-weight: 600; color: #1a1a1a; }
    }

    .filter-bar {
      display: flex;
      gap: 8px;
      padding: 4px 16px 12px;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }

    .filter-chip {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 6px 14px;
      border: 1.5px solid #e0e0e0;
      border-radius: 20px;
      background: white;
      font-size: 13px;
      font-weight: 500;
      color: #616161;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;

      &:hover { border-color: #006874; color: #006874; }
      &.active { background: #006874; color: white; border-color: #006874; }
    }

    .exercise-list { padding: 0 16px; }

    .category-section { margin-bottom: 20px; }

    .category-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-left: 4px solid #ccc;
      background: #f8f8f8;
      border-radius: 0 8px 8px 0;
      margin-bottom: 8px;

      h2 { margin: 0; font-size: 15px; font-weight: 600; color: #333; flex: 1; }
      .count { font-size: 12px; color: #888; background: #e0e0e0; border-radius: 10px; padding: 1px 7px; }
    }

    .exercise-card {
      display: flex;
      align-items: center;
      padding: 10px 12px;
      background: white;
      border-radius: 10px;
      margin-bottom: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }

    .exercise-info {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .exercise-name { font-size: 15px; font-weight: 500; color: #1a1a1a; }
    .exercise-sub { font-size: 12px; color: #006874; font-weight: 500; }
    .exercise-notes { font-size: 12px; color: #888; font-style: italic; }

    .exercise-actions { display: flex; gap: 4px; color: #bbb; }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 48px 16px;
      text-align: center;
      color: #888;

      .empty-icon { font-size: 56px; color: #ccc; }
      p { margin: 0; font-size: 16px; }
    }
  `],
})
export class LibraryComponent implements OnInit {
  private exerciseService = inject(ExerciseService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  readonly activeFilter = signal<ExerciseCategory | null>(null);
  readonly exercises = this.exerciseService.exercises;

  readonly categoryList = (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map(value => ({
    value,
    label: CATEGORY_LABELS[value],
    icon: CATEGORY_ICONS[value],
  }));

  readonly visibleCategories = computed(() => {
    const filter = this.activeFilter();
    if (filter) return this.categoryList.filter(c => c.value === filter);
    return this.categoryList.filter(c => this.exercisesByCategory(c.value).length > 0);
  });

  ngOnInit(): void {
    // Seed after a brief delay to let Firestore load
    setTimeout(() => this.exerciseService.seedIfEmpty(), 1000);
  }

  exercisesByCategory(cat: ExerciseCategory): Exercise[] {
    return this.exercises().filter(e => e.category === cat);
  }

  getCategoryLabel(cat: ExerciseCategory): string { return CATEGORY_LABELS[cat]; }
  getCategoryIcon(cat: ExerciseCategory): string { return CATEGORY_ICONS[cat]; }
  getCategoryColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat]; }
  getSubcategoryLabel(sub: string): string { return SUBCATEGORY_LABELS[sub as keyof typeof SUBCATEGORY_LABELS] ?? sub; }

  openForm(exercise?: Exercise): void {
    const ref = this.dialog.open(ExerciseFormDialogComponent, {
      data: { exercise },
      width: '360px',
    });

    ref.afterClosed().subscribe(async result => {
      if (!result) return;
      try {
        if (exercise) {
          await this.exerciseService.update(exercise.id, result);
          this.snackBar.open('Exercici actualitzat', '', { duration: 2000 });
        } else {
          await this.exerciseService.create(result);
          this.snackBar.open('Exercici creat', '', { duration: 2000 });
        }
      } catch {
        this.snackBar.open('Error en desar', '', { duration: 3000 });
      }
    });
  }

  async deleteExercise(exercise: Exercise): Promise<void> {
    if (!confirm(`Eliminar "${exercise.name}"?`)) return;
    try {
      await this.exerciseService.delete(exercise.id);
      this.snackBar.open('Exercici eliminat', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 3000 });
    }
  }

  async seed(): Promise<void> {
    await this.exerciseService.seedIfEmpty();
    this.snackBar.open('Exercicis carregats', '', { duration: 2000 });
  }
}
