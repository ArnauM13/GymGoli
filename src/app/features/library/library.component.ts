import { Component, computed, inject, signal } from '@angular/core';
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
  MUSCLE_OPTIONS,
  SUBCATEGORY_LABELS,
} from '../../core/models/exercise.model';
import { Sport } from '../../core/models/sport.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { ExerciseFormDialogComponent } from './components/exercise-form-dialog.component';
import { SportFormDialogComponent } from './components/sport-form-dialog.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'app-library',
  standalone: true,
  imports: [PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header title="Exercicis" />

      <!-- Category filter -->
      <div class="filter-bar">
        <button class="filter-chip" [class.active]="!activeFilter() && !muscleFilter()"
                (click)="clearFilters()">Tots</button>
        @for (cat of categoryList; track cat.value) {
          <button class="filter-chip" [class.active]="activeFilter() === cat.value"
                  [style.--cat-color]="getCategoryColor(cat.value)"
                  (click)="setCategory(cat.value)">
            <span class="material-symbols-outlined">{{ cat.icon }}</span>
            {{ cat.label }}
          </button>
        }
        <div class="filter-sep"></div>
        @for (m of muscleList; track m.value) {
          <button class="filter-chip filter-chip--muscle" [class.active]="muscleFilter() === m.value"
                  (click)="setMuscle(m.value)">{{ m.label }}</button>
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

      <!-- ══ Secció Esports ══ -->
      <div class="sports-section-header">
        <h2>Esports</h2>
      </div>

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
                @if (sport.metricDefs.length || sport.subtypes.length) {
                  <span class="ic-detail">
                    @if (sport.metricDefs.length) { {{ sport.metricDefs.length }} mètr }
                    @if (sport.metricDefs.length && sport.subtypes.length) { · }
                    @if (sport.subtypes.length) { {{ sport.subtypes.length }} subtipus }
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

      <!-- ── Speed dial FAB ── -->
      @if (speedDialOpen()) {
        <div class="sd-backdrop" (click)="speedDialOpen.set(false)"></div>
      }
      <div class="sd-container">
        @if (speedDialOpen()) {
          <div class="sd-items">
            <div class="sd-item" [style.--sd-i]="0">
              <span class="sd-label">Esport nou</span>
              <button class="sd-btn" style="background:#26a69a" (click)="sdAddSport()">
                <span class="material-symbols-outlined">sports_soccer</span>
              </button>
            </div>
            <div class="sd-item" [style.--sd-i]="1">
              <span class="sd-label">Exercici nou</span>
              <button class="sd-btn" style="background:var(--c-brand)" (click)="sdAddExercise()">
                <span class="material-symbols-outlined">fitness_center</span>
              </button>
            </div>
          </div>
        }
        <button class="sd-fab" [class.sd-fab--open]="speedDialOpen()" (click)="toggleSpeedDial()">
          <span class="material-symbols-outlined">add</span>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .page { padding: 0 0 88px; }

    /* ── Sports section header ── */
    .sports-section-header {
      padding: 24px 16px 8px;
      h2 { margin: 0; font-size: 22px; font-weight: 700; color: var(--c-text); letter-spacing: -0.3px; }
    }

    /* ── Speed dial FAB ── */
    .sd-backdrop { position: fixed; inset: 0; z-index: 88; }
    .sd-container {
      position: fixed; bottom: calc(var(--nav-height) + 16px); right: 20px; z-index: 89;
      display: flex; flex-direction: column; align-items: flex-end; gap: 10px;
    }
    .sd-items {
      display: flex; flex-direction: column; align-items: flex-end; gap: 8px;
      padding-bottom: 4px;
      animation: sd-items-in 0.2s cubic-bezier(0.34, 1.4, 0.64, 1) both;
    }
    @keyframes sd-items-in {
      from { opacity: 0; transform: scale(0.88) translateY(12px); }
      to   { opacity: 1; transform: none; }
    }
    .sd-item {
      display: flex; align-items: center; gap: 10px;
      animation: sd-item-in 0.18s calc(var(--sd-i, 0) * 28ms) both;
    }
    @keyframes sd-item-in {
      from { opacity: 0; transform: translateX(10px); }
      to   { opacity: 1; transform: none; }
    }
    .sd-label {
      background: var(--c-card); color: var(--c-text);
      padding: 6px 12px; border-radius: 20px;
      font-size: 13px; font-weight: 600;
      box-shadow: 0 2px 8px var(--c-shadow); white-space: nowrap;
    }
    .sd-btn {
      width: 46px; height: 46px; border-radius: 50%; border: none; color: white;
      cursor: pointer; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 3px 12px rgba(0,0,0,0.22);
      transition: transform 0.15s;
      .material-symbols-outlined { font-size: 22px; font-variation-settings: 'FILL' 1; }
      &:hover  { transform: scale(1.08); }
      &:active { transform: scale(0.93); }
    }
    .sd-fab {
      width: 56px; height: 56px; border-radius: 50%; border: none;
      background: var(--c-brand); color: white;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px rgba(var(--c-brand-rgb), 0.4), 0 1px 4px var(--c-shadow);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 28px; transition: transform 0.22s ease; }
      &:hover { background: var(--c-brand-dk); transform: scale(1.06); }
      &:active { transform: scale(0.94); }
      &.sd-fab--open .material-symbols-outlined { transform: rotate(45deg); }
    }

    /* ── Filter chips ── */
    .filter-bar {
      display: flex; gap: 6px;
      padding: 4px 16px 12px;
      overflow-x: auto;
      scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }
    .filter-sep {
      width: 1px; height: 20px; background: var(--c-border-2);
      flex-shrink: 0; align-self: center; margin: 0 2px;
    }

    .filter-chip {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 12px;
      border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card);
      font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; white-space: nowrap; touch-action: manipulation;
      transition: all 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover:not(.active) {
        border-color: var(--cat-color, var(--c-brand));
        color: var(--cat-color, var(--c-brand));
      }
      &.active {
        background: var(--cat-color, var(--c-brand));
        border-color: var(--cat-color, var(--c-brand));
        color: white;
      }
      &--muscle.active {
        background: var(--c-brand); border-color: var(--c-brand); color: white;
      }
    }

    /* ── Section card (matches train page) ── */
    .card-section {
      margin: 12px 16px 0;
      padding: 14px 14px 10px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }

    .section-header {
      display: flex; align-items: center; gap: 7px;
      margin-bottom: 12px;
    }
    .section-icon {
      font-size: 18px; color: var(--c-text-2);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .section-title {
      margin: 0; flex: 1;
      font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px;
    }
    .section-count {
      font-size: 11px; font-weight: 700; color: var(--c-text-2);
      background: var(--c-border-2); border-radius: 10px; padding: 2px 8px;
    }

    /* ── Item card (exercise / sport) ── */
    .item-card {
      display: flex; align-items: center;
      margin-bottom: 6px;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden;
      transition: box-shadow 0.15s, border-color 0.15s;
      &:last-child  { margin-bottom: 4px; }
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
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
      font-size: 13px; font-weight: 700; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ic-detail {
      font-size: 11px; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      &:empty { display: none; }
    }
    .ic-meta {
      display: flex; align-items: center; flex-wrap: wrap; gap: 4px;
    }
    .ic-guide {
      font-size: 11px; font-weight: 700; color: var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.1); border-radius: 6px;
      padding: 1px 5px; flex-shrink: 0;
    }
    .ic-muscle {
      font-size: 10px; font-weight: 500; color: var(--c-text-3);
      background: var(--c-subtle); border: 1px solid var(--c-border-2);
      border-radius: 6px; padding: 1px 5px;
    }

    .ic-action {
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); touch-action: manipulation;
      transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: var(--c-text-2); background: var(--c-hover); }
      &.ic-action--danger:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
      &:last-child { margin-right: 4px; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      padding: 28px 16px;
      text-align: center; color: var(--c-text-2);
      .empty-icon {
        font-size: 48px; color: var(--c-border);
        font-variation-settings: 'FILL' 0, 'wght' 200;
      }
      p { margin: 0; font-size: 14px; font-weight: 500; }
    }
    .empty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .btn-primary {
      padding: 8px 16px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
    }
    .btn-secondary {
      padding: 8px 16px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card); color: var(--c-text-2);
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }
  `],
})
export class LibraryComponent {
  private exerciseService = inject(ExerciseService);
  private sportService    = inject(SportService);
  private dialog          = inject(MatDialog);
  private snackBar        = inject(MatSnackBar);
  private confirmDialog   = inject(ConfirmDialogService);

  constructor() { this.exerciseService.ensureLoaded(); }

  readonly sports = this.sportService.sports;

  readonly speedDialOpen = signal(false);

  readonly activeFilter = signal<ExerciseCategory | null>(null);
  readonly muscleFilter = signal<string | null>(null);
  readonly exercises = this.exerciseService.exercises;

  readonly categoryList = (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map(value => ({
    value,
    label: CATEGORY_LABELS[value],
    icon: CATEGORY_ICONS[value],
  }));

  readonly muscleList = MUSCLE_OPTIONS;

  readonly visibleCategories = computed(() => {
    const filter = this.activeFilter();
    if (filter) return this.categoryList.filter(c => c.value === filter);
    return this.categoryList.filter(c => this.exercisesByCategory(c.value).length > 0);
  });

  exercisesByCategory(cat: ExerciseCategory): Exercise[] {
    const muscle = this.muscleFilter();
    return this.exercises().filter(e =>
      e.category === cat && (!muscle || (e.muscles ?? []).includes(muscle))
    );
  }

  clearFilters(): void { this.activeFilter.set(null); this.muscleFilter.set(null); }
  setCategory(cat: ExerciseCategory): void { this.activeFilter.set(cat); this.muscleFilter.set(null); }
  setMuscle(m: string): void {
    this.muscleFilter.set(this.muscleFilter() === m ? null : m);
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
  getCategoryIcon(cat: ExerciseCategory): string { return CATEGORY_ICONS[cat]; }
  getCategoryColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat]; }
  getSubcategoryLabel(sub: string): string { return SUBCATEGORY_LABELS[sub as keyof typeof SUBCATEGORY_LABELS] ?? sub; }
  getMuscleLabel(m: string): string { return MUSCLE_LABELS[m] ?? m; }

  toggleSpeedDial(): void { this.speedDialOpen.set(!this.speedDialOpen()); }
  sdAddExercise(): void { this.speedDialOpen.set(false); this.openForm(); }
  sdAddSport(): void { this.speedDialOpen.set(false); this.openSportForm(); }

  openForm(exercise?: Exercise): void {
    const ref = this.dialog.open(ExerciseFormDialogComponent, {
      data: { exercise },
      width: '360px',
      maxHeight: '90vh',
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
    if (!await this.confirmDialog.confirm(`Eliminar "${exercise.name}"?`, { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    try {
      await this.exerciseService.delete(exercise.id);
      this.snackBar.open('Exercici eliminat', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 3000 });
    }
  }

  async seed(): Promise<void> {
    await this.exerciseService.ensureLoaded();
    this.snackBar.open('Exercicis carregats', '', { duration: 2000 });
  }

  openSportForm(sport?: Sport): void {
    const ref = this.dialog.open(SportFormDialogComponent, {
      data: { sport },
      width: '360px',
      maxHeight: '90vh',
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
    if (!await this.confirmDialog.confirm(`Eliminar "${sport.name}"?`, { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    try {
      await this.sportService.deleteSport(sport.id);
      this.snackBar.open('Esport eliminat', '', { duration: 2000 });
    } catch {
      this.snackBar.open('Error en eliminar', '', { duration: 3000 });
    }
  }
}
