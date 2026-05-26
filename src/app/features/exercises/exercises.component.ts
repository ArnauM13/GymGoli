import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';

import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  Exercise,
  ExerciseCategory,
  MUSCLE_LABELS,
  SUBCATEGORY_LABELS,
} from '../../core/models/exercise.model';
import { AuthService } from '../../core/services/auth.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { ExerciseFormDialogComponent } from '../library/components/exercise-form-dialog.component';

@Component({
  selector: 'app-exercises',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="page">

      <header class="page-header">
        <button class="back-btn" (click)="goBack()" aria-label="Enrere">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <h1>Exercicis</h1>
      </header>

      <!-- Search -->
      <div class="search-wrap">
        <span class="material-symbols-outlined search-icon">search</span>
        <input class="search-input" type="search" placeholder="Cerca exercici…"
               [(ngModel)]="searchQuery" (ngModelChange)="onSearch()">
        @if (searchQuery()) {
          <button class="search-clear" (click)="searchQuery.set(''); onSearch()">
            <span class="material-symbols-outlined">close</span>
          </button>
        }
      </div>

      <!-- Category filter -->
      <div class="filter-bar">
        <button class="filter-chip" [class.active]="!activeFilter()"
                (click)="activeFilter.set(null)">Tots</button>
        @for (cat of categoryList; track cat.value) {
          <button class="filter-chip" [class.active]="activeFilter() === cat.value"
                  [style.--cat-color]="getCategoryColor(cat.value)"
                  (click)="setCategory(cat.value)">
            <span class="material-symbols-outlined">{{ cat.icon }}</span>
            {{ cat.label }}
          </button>
        }
      </div>

      @if (exercises().length === 0) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">fitness_center</span>
            <p>Cap exercici encara</p>
            <div class="empty-actions">
              <button class="btn-primary" (click)="openForm()">Crea el primer</button>
              <button class="btn-secondary" (click)="seed()">Carrega per defecte</button>
            </div>
          </div>
        </div>
      }

      @for (cat of visibleCategories(); track cat.value) {
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon" [style.color]="getCategoryColor(cat.value)">
              {{ getCategoryIcon(cat.value) }}
            </span>
            <h2 class="section-title">{{ getCategoryLabel(cat.value) }}</h2>
            <span class="section-count">{{ filteredByCategory(cat.value).length }}</span>
          </div>

          @for (exercise of filteredByCategory(cat.value); track exercise.id) {
            <div class="item-card">
              <div class="ic-bar" [style.background]="getCategoryColor(cat.value)"></div>
              <div class="ic-info">
                <span class="ic-name">{{ exercise.name }}</span>
                @if (exercise.muscles?.length || exercise.setsRange) {
                  <div class="ic-meta">
                    @if (exercise.setsRange && exercise.repsRange) {
                      <span class="ic-guide">{{ formatGuidance(exercise) }}</span>
                    }
                    @for (m of (exercise.muscles ?? []); track m; let i = $index) {
                      @if (i < 3) {
                        <span class="ic-muscle">{{ getMuscleLabel(m) }}</span>
                      }
                    }
                  </div>
                } @else {
                  <span class="ic-detail">
                    @if (exercise.subcategory) { {{ getSubcategoryLabel(exercise.subcategory) }} }
                    @if (exercise.subcategory && exercise.notes) { · }
                    @if (exercise.notes) { {{ exercise.notes }} }
                  </span>
                }
              </div>
              <button class="ic-action" (click)="openForm(exercise)" aria-label="Editar">
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button class="ic-action ic-action--danger" (click)="deleteExercise(exercise)" aria-label="Eliminar">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          }
        </div>
      }

      @if (hasQuery() && visibleCategories().length === 0) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">search_off</span>
            <p>Cap resultat per a "{{ searchQuery() }}"</p>
          </div>
        </div>
      }

      <!-- FAB -->
      <button class="fab" (click)="openForm()" aria-label="Afegir exercici">
        <span class="material-symbols-outlined">add</span>
      </button>
    </div>
  `,
  styles: [`
    .page { padding: 0 0 88px; }

    .page-header {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 16px 10px;
      h1 { margin: 0; font-size: 22px; font-weight: 700; color: var(--c-text); letter-spacing: -0.3px; }
    }
    .back-btn {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: var(--c-subtle); color: var(--c-text-2);
      cursor: pointer; flex-shrink: 0; transition: background 0.15s;
      span { font-size: 20px; }
      &:hover { background: var(--c-hover); }
    }

    /* ── Search ── */
    .search-wrap {
      position: relative; margin: 0 16px 10px;
      display: flex; align-items: center;
    }
    .search-icon {
      position: absolute; left: 12px;
      font-size: 18px; color: var(--c-text-3); pointer-events: none;
    }
    .search-input {
      width: 100%; padding: 9px 36px 9px 38px;
      border: 1.5px solid var(--c-border); border-radius: 12px;
      background: var(--c-card); color: var(--c-text);
      font-size: 14px; font-family: inherit; outline: none;
      transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
      &::placeholder { color: var(--c-text-3); }
    }
    .search-clear {
      position: absolute; right: 8px;
      width: 26px; height: 26px; border-radius: 50%;
      border: none; background: var(--c-border-2); color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; font-size: 15px;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { background: var(--c-border); }
    }

    /* ── Filter chips ── */
    .filter-bar {
      display: flex; gap: 6px; padding: 0 16px 12px;
      overflow-x: auto; scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }
    .filter-chip {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 12px;
      border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 12px; font-weight: 600;
      color: var(--c-text-2); cursor: pointer; white-space: nowrap;
      touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover:not(.active) { border-color: var(--cat-color, var(--c-brand)); color: var(--cat-color, var(--c-brand)); }
      &.active { background: var(--cat-color, var(--c-brand)); border-color: var(--cat-color, var(--c-brand)); color: white; }
    }

    /* ── Section card ── */
    .card-section {
      margin: 12px 16px 0; padding: 14px 14px 10px;
      background: var(--c-card); border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header {
      display: flex; align-items: center; gap: 7px; margin-bottom: 12px;
    }
    .section-icon { font-size: 18px; color: var(--c-text-2); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }
    .section-count { font-size: 11px; font-weight: 700; color: var(--c-text-2); background: var(--c-border-2); border-radius: 10px; padding: 2px 8px; }

    /* ── Item card ── */
    .item-card {
      display: flex; align-items: center; margin-bottom: 6px;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden; transition: box-shadow 0.15s, border-color 0.15s;
      &:last-child { margin-bottom: 4px; }
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
    }
    .ic-bar { width: 5px; align-self: stretch; flex-shrink: 0; }
    .ic-info {
      flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 10px;
    }
    .ic-name { font-size: 13px; font-weight: 700; color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ic-detail { font-size: 11px; color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &:empty { display: none; } }
    .ic-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
    .ic-guide {
      font-size: 11px; font-weight: 700; color: var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.1); border-radius: 6px; padding: 1px 5px;
    }
    .ic-muscle {
      font-size: 10px; font-weight: 500; color: var(--c-text-3);
      background: var(--c-subtle); border: 1px solid var(--c-border-2); border-radius: 6px; padding: 1px 5px;
    }
    .ic-action {
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); touch-action: manipulation; transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: var(--c-text-2); background: var(--c-hover); }
      &.ic-action--danger:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
      &:last-child { margin-right: 4px; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 28px 16px;
      text-align: center; color: var(--c-text-2);
      .empty-icon { font-size: 48px; color: var(--c-border); font-variation-settings: 'FILL' 0, 'wght' 200; }
      p { margin: 0; font-size: 14px; font-weight: 500; }
    }
    .empty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .btn-primary {
      padding: 8px 16px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: background 0.15s;
      &:hover { background: var(--c-brand-dk); }
    }
    .btn-secondary {
      padding: 8px 16px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card); color: var(--c-text-2);
      font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.15s;
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }

    /* ── FAB ── */
    .fab {
      position: fixed; bottom: calc(var(--nav-height) + 16px); right: 20px; z-index: 89;
      width: 56px; height: 56px; border-radius: 50%; border: none;
      background: var(--c-brand); color: white;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px rgba(var(--c-brand-rgb), 0.4), 0 1px 4px var(--c-shadow);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 28px; }
      &:hover { background: var(--c-brand-dk); transform: scale(1.06); }
      &:active { transform: scale(0.94); }
    }
  `],
})
export class ExercisesComponent {
  private exerciseService = inject(ExerciseService);
  private authService     = inject(AuthService);
  private dialog          = inject(MatDialog);
  private snackBar        = inject(MatSnackBar);
  private confirmDialog   = inject(ConfirmDialogService);
  private router          = inject(Router);

  readonly searchQuery  = signal('');
  readonly activeFilter = signal<ExerciseCategory | null>(null);

  readonly categoryList = (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map(value => ({
    value,
    label: CATEGORY_LABELS[value],
    icon: CATEGORY_ICONS[value],
  }));

  readonly hasQuery = computed(() => this.searchQuery().trim().length > 0);

  private readonly allExercises = this.exerciseService.exercises;

  readonly exercises = computed(() => {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return this.allExercises();
    return this.allExercises().filter(e => e.name.toLowerCase().includes(q));
  });

  readonly visibleCategories = computed(() => {
    const filter = this.activeFilter();
    const cats = filter ? this.categoryList.filter(c => c.value === filter) : this.categoryList;
    return cats.filter(c => this.filteredByCategory(c.value).length > 0);
  });

  filteredByCategory(cat: ExerciseCategory): Exercise[] {
    return this.exercises().filter(e => e.category === cat);
  }

  setCategory(cat: ExerciseCategory): void {
    this.activeFilter.set(this.activeFilter() === cat ? null : cat);
  }

  onSearch(): void {
    this.activeFilter.set(null);
  }

  formatGuidance(exercise: Exercise): string {
    const s = exercise.setsRange!;
    const r = exercise.repsRange!;
    const sets = s[0] === s[1] ? `${s[0]}` : `${s[0]}–${s[1]}`;
    const reps = r[0] === r[1] ? `${r[0]}` : `${r[0]}–${r[1]}`;
    return `${reps} × ${sets}`;
  }

  getCategoryLabel(cat: ExerciseCategory): string { return CATEGORY_LABELS[cat]; }
  getCategoryIcon(cat: ExerciseCategory): string  { return CATEGORY_ICONS[cat]; }
  getCategoryColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat]; }
  getSubcategoryLabel(sub: string): string { return SUBCATEGORY_LABELS[sub as keyof typeof SUBCATEGORY_LABELS] ?? sub; }
  getMuscleLabel(m: string): string { return MUSCLE_LABELS[m] ?? m; }

  goBack(): void { this.router.navigate(['/settings']); }

  openForm(exercise?: Exercise): void {
    const ref = this.dialog.open(ExerciseFormDialogComponent, {
      data: { exercise }, width: '360px', maxHeight: '90vh',
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
      } catch (err) {
        this.snackBar.open(`Error: ${(err as { message?: string }).message ?? 'desconegut'}`, 'OK', { duration: 5000 });
      }
    });
  }

  async deleteExercise(exercise: Exercise): Promise<void> {
    if (!await this.confirmDialog.confirm(`Eliminar "${exercise.name}"?`, { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    try {
      await this.exerciseService.delete(exercise.id);
      this.snackBar.open('Exercici eliminat', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 3000 });
    }
  }

  async seed(): Promise<void> {
    const uid = this.authService.uid();
    if (uid) await this.exerciseService.seedIfEmpty(uid);
    this.snackBar.open('Exercicis carregats', '', { duration: 2000 });
  }
}
