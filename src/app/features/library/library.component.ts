import { Component, computed, inject, signal } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  Exercise,
  ExerciseCategory,
  SUBCATEGORY_LABELS,
} from '../../core/models/exercise.model';
import { Sport } from '../../core/models/sport.model';
import { AuthService } from '../../core/services/auth.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { ExerciseFormDialogComponent } from './components/exercise-form-dialog.component';
import { SportFormDialogComponent } from './components/sport-form-dialog.component';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [],
  template: `
    <div class="page">
      <header class="page-header">
        <h1>Exercicis</h1>
        <button class="header-add" (click)="openForm()" aria-label="Nou exercici">
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
            [style.--cat-color]="getCategoryColor(cat.value)"
            (click)="activeFilter.set(cat.value)"
          >
            <span class="material-symbols-outlined">{{ cat.icon }}</span>
            {{ cat.label }}
          </button>
        }
      </div>

      <!-- Empty state -->
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
            <span class="section-count">{{ exercisesByCategory(cat.value).length }}</span>
          </div>

          @for (exercise of exercisesByCategory(cat.value); track exercise.id) {
            <div class="item-card">
              <div class="ic-bar" [style.background]="getCategoryColor(cat.value)"></div>
              <div class="ic-info">
                <span class="ic-name">{{ exercise.name }}</span>
                <span class="ic-detail">
                  @if (exercise.subcategory) {
                    {{ getSubcategoryLabel(exercise.subcategory) }}
                  }
                  @if (exercise.subcategory && exercise.notes) { · }
                  @if (exercise.notes) { {{ exercise.notes }} }
                </span>
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

      <!-- ══ Secció Esports ══ -->
      <header class="page-header page-header--mt">
        <h1>Esports</h1>
        <button class="header-add" (click)="openSportForm()" aria-label="Nou esport">
          <span class="material-symbols-outlined">add</span>
        </button>
      </header>

      @if (sports().length === 0) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">sports_soccer</span>
            <p>Cap esport configurat</p>
            <div class="empty-actions">
              <button class="btn-primary" (click)="openSportForm()">Afegeix el primer</button>
            </div>
          </div>
        </div>
      } @else {
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">sports_soccer</span>
            <h2 class="section-title">Els teus esports</h2>
            <span class="section-count">{{ sports().length }}</span>
          </div>

          @for (sport of sports(); track sport.id) {
            <div class="item-card">
              <div class="ic-bar" [style.background]="sport.color"></div>
              <span class="material-symbols-outlined sport-icon" [style.color]="sport.color">
                {{ sport.icon }}
              </span>
              <div class="ic-info">
                <span class="ic-name">{{ sport.name }}</span>
                @if (sport.metricDefs?.length || sport.subtypes?.length) {
                  <span class="ic-detail">
                    @if (sport.metricDefs?.length) { {{ sport.metricDefs.length }} mètr }
                    @if (sport.metricDefs?.length && sport.subtypes?.length) { · }
                    @if (sport.subtypes?.length) { {{ sport.subtypes.length }} subtipus }
                  </span>
                }
              </div>
              <button class="ic-action" (click)="openSportForm(sport)" aria-label="Editar">
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button class="ic-action ic-action--danger" (click)="deleteSport(sport)" aria-label="Eliminar">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 0 0 84px; }

    /* ── Page header ── */
    .page-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 16px 8px;
      &.page-header--mt { padding-top: 24px; }
      h1 { margin: 0; font-size: 20px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.2px; }
    }
    .header-add {
      width: 36px; height: 36px; border-radius: 50%; border: none;
      background: #006874; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s, transform 0.1s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; }
      &:hover  { background: #005a63; }
      &:active { transform: scale(0.94); }
    }

    /* ── Filter chips ── */
    .filter-bar {
      display: flex; gap: 6px;
      padding: 4px 16px 12px;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }
    .filter-chip {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 12px;
      border: 1.5px solid #e0e0e0; border-radius: 20px;
      background: white;
      font-size: 12px; font-weight: 600; color: #666;
      cursor: pointer; white-space: nowrap; touch-action: manipulation;
      transition: all 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover:not(.active) {
        border-color: var(--cat-color, #006874);
        color: var(--cat-color, #006874);
      }
      &.active {
        background: var(--cat-color, #006874);
        border-color: var(--cat-color, #006874);
        color: white;
      }
    }

    /* ── Section card (matches train page) ── */
    .card-section {
      margin: 12px 16px 0;
      padding: 14px 14px 10px;
      background: white;
      border-radius: 18px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.07);
    }

    .section-header {
      display: flex; align-items: center; gap: 7px;
      margin-bottom: 12px;
    }
    .section-icon {
      font-size: 18px; color: #666;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .section-title {
      margin: 0; flex: 1;
      font-size: 14px; font-weight: 700; color: #555; letter-spacing: 0.2px;
    }
    .section-count {
      font-size: 11px; font-weight: 700; color: #666;
      background: #f0f0f0; border-radius: 10px; padding: 2px 8px;
    }

    /* ── Item card (exercise / sport) ── */
    .item-card {
      display: flex; align-items: center;
      margin-bottom: 6px;
      border: 1.5px solid #efefef; border-radius: 14px;
      background: white; overflow: hidden;
      transition: box-shadow 0.15s, border-color 0.15s;
      &:last-child  { margin-bottom: 4px; }
      &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-color: #ddd; }
    }

    .ic-bar { width: 5px; align-self: stretch; flex-shrink: 0; }

    .sport-icon {
      font-size: 22px; flex-shrink: 0;
      padding: 0 2px 0 10px;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }

    .ic-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 2px;
      padding: 10px 10px;
    }
    .ic-name {
      font-size: 13px; font-weight: 700; color: #1a1a1a;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ic-detail {
      font-size: 11px; color: #666;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      &:empty { display: none; }
    }

    .ic-action {
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: #ccc; touch-action: manipulation;
      transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: #666; background: rgba(0,0,0,0.04); }
      &.ic-action--danger:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
      &:last-child { margin-right: 4px; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      padding: 28px 16px;
      text-align: center; color: #666;
      .empty-icon {
        font-size: 48px; color: #d8d8d8;
        font-variation-settings: 'FILL' 0, 'wght' 200;
      }
      p { margin: 0; font-size: 14px; font-weight: 500; }
    }
    .empty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .btn-primary {
      padding: 8px 16px; border: none; border-radius: 10px;
      background: #006874; color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: #005a63; }
    }
    .btn-secondary {
      padding: 8px 16px; border-radius: 10px;
      border: 1.5px solid #e0e0e0; background: white; color: #666;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: #767676; color: #333; }
    }
  `],
})
export class LibraryComponent {
  private exerciseService = inject(ExerciseService);
  private sportService    = inject(SportService);
  private authService     = inject(AuthService);
  private dialog          = inject(MatDialog);
  private snackBar        = inject(MatSnackBar);

  readonly sports = this.sportService.sports;

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
      } catch (err) {
        const msg = (err as { message?: string }).message ?? 'Error desconegut';
        this.snackBar.open(`Error en desar: ${msg}`, 'OK', { duration: 5000 });
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
    const uid = this.authService.uid();
    if (uid) await this.exerciseService.seedIfEmpty(uid);
    this.snackBar.open('Exercicis carregats', '', { duration: 2000 });
  }

  openSportForm(sport?: Sport): void {
    const ref = this.dialog.open(SportFormDialogComponent, {
      data: { sport },
      width: '360px',
    });

    ref.afterClosed().subscribe(async result => {
      if (!result) return;
      try {
        if (sport) {
          await this.sportService.updateSport(sport.id, result);
          this.snackBar.open('Esport actualitzat', '', { duration: 2000 });
        } else {
          await this.sportService.createSport(result);
          this.snackBar.open('Esport creat', '', { duration: 2000 });
        }
      } catch (err) {
        const msg = (err as { message?: string }).message ?? 'Error desconegut';
        this.snackBar.open(`Error en desar: ${msg}`, 'OK', { duration: 5000 });
      }
    });
  }

  async deleteSport(sport: Sport): Promise<void> {
    if (!confirm(`Eliminar "${sport.name}"?`)) return;
    try {
      await this.sportService.deleteSport(sport.id);
      this.snackBar.open('Esport eliminat', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 3000 });
    }
  }
}
