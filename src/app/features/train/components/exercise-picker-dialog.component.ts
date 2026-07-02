import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import {
  Exercise, ExerciseCategory, ExerciseSubcategory,
  CATEGORY_LABELS, CATEGORY_COLORS, CATEGORY_ICONS,
  MUSCLE_LABELS, SUBCATEGORY_LABELS, SUBCATEGORY_OPTIONS,
} from '../../../core/models/exercise.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FilterBarComponent } from '../../../shared/components/filter-bar/filter-bar.component';

export interface ExercisePickerData {
  excludeIds?: string[];
  /**
   * When set, this category is pre-selected in the filter bar
   * but the user can freely switch to any other category.
   */
  defaultCategory?: ExerciseCategory;
}

@Component({
  selector: 'app-exercise-picker-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, FilterBarComponent],
  template: `
    @if (mode() === 'list') {

      <!-- ── LIST MODE ── -->
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
          @if (filtered().length === 0) {
            <div class="empty">
              <p class="empty-msg">Cap exercici trobat</p>
              <button class="empty-create-btn" type="button" (click)="startCreate()">
                <span class="material-symbols-outlined">add_circle</span>
                Crear "{{ searchTerm() || 'exercici nou' }}"
              </button>
            </div>
          }
          @for (ex of filtered(); track ex.id) {
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
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button class="dlg-btn dlg-btn--new" type="button" (click)="startCreate()">
          <span class="material-symbols-outlined">add</span>
          Nou exercici
        </button>
        <button class="dlg-btn dlg-btn--cancel" type="button" (click)="close()">Cancel·lar</button>
      </mat-dialog-actions>

    } @else {

      <!-- ── CREATE MODE ── -->
      <div class="create-header">
        <button class="create-back" type="button" (click)="cancelCreate()">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 class="create-title">Nou exercici</h2>
      </div>

      <mat-dialog-content class="create-content">
        <div class="form">

          <!-- Nom -->
          <div class="field">
            <label class="field-label">Nom de l'exercici</label>
            <input class="field-input" type="text" [(ngModel)]="createName"
                   placeholder="Ex: Press banca" autocomplete="off">
          </div>

          <!-- Tipus -->
          <div class="field">
            <span class="field-label">Tipus</span>
            <div class="cat-grid">
              @for (cat of categories; track cat.value) {
                <button type="button" class="cat-btn"
                        [class.selected]="createCategory() === cat.value"
                        [style.--cat-color]="cat.color"
                        (click)="createCategory.set(cat.value)">
                  <span class="material-symbols-outlined">{{ cat.icon }}</span>
                  <span class="cat-btn-label">{{ cat.label }}</span>
                </button>
              }
            </div>
          </div>

          <!-- Subcategoria -->
          @if (createSubcatOptions().length > 0) {
            <div class="field">
              <span class="field-label">Grup principal <span class="optional-hint">(opcional)</span></span>
              <div class="chips-row">
                @for (sub of createSubcatOptions(); track sub.value) {
                  <button type="button" class="subcat-chip"
                          [class.selected]="createSubcat() === sub.value"
                          (click)="toggleSubcat(sub.value)">
                    {{ sub.label }}
                  </button>
                }
              </div>
            </div>
          }

          <!-- Guia sèries × reps -->
          <div class="field">
            <span class="field-label">
              Guia sèries × reps <span class="optional-hint">(opcional)</span>
            </span>
            <div class="guide-row">
              <div class="guide-group">
                <span class="guide-group-label">Sèries</span>
                <div class="guide-inputs">
                  <input class="guide-input" type="number" min="1" max="10" inputmode="numeric"
                         [value]="createSetsMin() || null" placeholder="—"
                         (input)="createSetsMin.set(numFromEvent($event))">
                  @if (createSetsRange()) {
                    <span class="guide-sep">–</span>
                    <input class="guide-input" type="number" min="1" max="10" inputmode="numeric"
                           [value]="createSetsMax() || null" placeholder="—"
                           (input)="createSetsMax.set(numFromEvent($event))">
                    <button type="button" class="guide-toggle" (click)="createSetsRange.set(false)">
                      <span class="material-symbols-outlined">remove</span>
                    </button>
                  } @else {
                    <button type="button" class="guide-toggle" (click)="createSetsRange.set(true)">
                      <span class="material-symbols-outlined">add</span>
                      <span class="guide-toggle-label">rang</span>
                    </button>
                  }
                </div>
              </div>
              <div class="guide-group">
                <span class="guide-group-label">Reps</span>
                <div class="guide-inputs">
                  <input class="guide-input" type="number" min="1" max="100" inputmode="numeric"
                         [value]="createRepsMin() || null" placeholder="—"
                         (input)="createRepsMin.set(numFromEvent($event))">
                  @if (createRepsRange()) {
                    <span class="guide-sep">–</span>
                    <input class="guide-input" type="number" min="1" max="100" inputmode="numeric"
                           [value]="createRepsMax() || null" placeholder="—"
                           (input)="createRepsMax.set(numFromEvent($event))">
                    <button type="button" class="guide-toggle" (click)="createRepsRange.set(false)">
                      <span class="material-symbols-outlined">remove</span>
                    </button>
                  } @else {
                    <button type="button" class="guide-toggle" (click)="createRepsRange.set(true)">
                      <span class="material-symbols-outlined">add</span>
                      <span class="guide-toggle-label">rang</span>
                    </button>
                  }
                </div>
              </div>
            </div>
          </div>

        </div>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button class="dlg-btn dlg-btn--cancel" type="button" (click)="cancelCreate()">Enrere</button>
        <button class="dlg-btn dlg-btn--save" type="button"
                [disabled]="!createName.trim() || !createCategory() || creating()"
                (click)="saveNew()">
          @if (creating()) {
            <span class="material-symbols-outlined spin">sync</span>
          } @else {
            Crear
          }
        </button>
      </mat-dialog-actions>

    }
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
      padding: 9px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
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
    .dlg-btn--save {
      background: var(--c-brand); color: #fff;
      display: flex; align-items: center; justify-content: center; min-width: 80px;
      .material-symbols-outlined { font-size: 18px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk, #005a63); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }

    /* ── Create mode ── */
    .create-header {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 20px 8px;
    }
    .create-back {
      width: 34px; height: 34px; border-radius: 50%;
      border: none; background: var(--c-subtle); cursor: pointer;
      color: var(--c-text-2); display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); color: var(--c-text); }
    }
    .create-title { margin: 0; font-size: 17px; font-weight: 800; color: var(--c-text); }

    .create-content { padding: 0 20px !important; max-height: 60vh; }

    .form { display: flex; flex-direction: column; gap: 16px; padding: 4px 0 8px; }

    .field { display: flex; flex-direction: column; gap: 8px; }
    .field-label {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .optional-hint {
      font-size: 10px; font-weight: 500; color: var(--c-text-3);
      text-transform: none; letter-spacing: 0; opacity: 0.85;
    }
    .field-input {
      width: 100%; padding: 10px 12px; box-sizing: border-box;
      border: 1.5px solid var(--c-border-2); border-radius: 12px;
      background: var(--c-card); color: var(--c-text);
      font-size: 14px; font-family: inherit; outline: none;
      transition: border-color 0.15s;
      &::placeholder { color: var(--c-text-3); }
      &:focus { border-color: var(--c-brand); }
    }

    .cat-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .cat-btn {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 12px 6px;
      border: 2px solid var(--c-border-2); border-radius: 12px;
      background: var(--c-card); color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 22px; }
      .cat-btn-label { font-size: 12px; font-weight: 600; }
      &:hover {
        border-color: color-mix(in srgb, var(--cat-color, var(--c-brand)) 55%, var(--c-border));
        background: color-mix(in srgb, var(--cat-color, var(--c-brand)) 6%, var(--c-card));
      }
      &.selected {
        border-color: var(--cat-color, var(--c-brand));
        background: var(--cat-color, var(--c-brand));
        color: #fff;
      }
    }

    .chips-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .subcat-chip {
      padding: 6px 12px; border-radius: 16px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover:not(.selected) { border-color: var(--c-brand); color: var(--c-brand); }
      &.selected { background: var(--c-brand); border-color: var(--c-brand); color: #fff; }
    }

    .guide-row { display: flex; gap: 10px; }
    .guide-group {
      flex: 1; display: flex; flex-direction: column; gap: 6px;
      padding: 10px 12px;
      background: var(--c-subtle); border-radius: 12px;
      border: 1.5px solid var(--c-border-2);
    }
    .guide-group-label {
      font-size: 10px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .guide-inputs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .guide-input {
      width: 50px; padding: 6px 8px; box-sizing: border-box;
      border: 1.5px solid var(--c-border-2); border-radius: 8px;
      background: var(--c-card); color: var(--c-text);
      font-size: 14px; font-weight: 700; text-align: center;
      outline: none; transition: border-color 0.15s;
      -moz-appearance: textfield;
      &::-webkit-outer-spin-button, &::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
      &::placeholder { color: var(--c-text-3); font-weight: 400; }
      &:focus { border-color: var(--c-brand); }
    }
    .guide-sep { font-size: 13px; color: var(--c-text-3); font-weight: 700; }
    .guide-toggle {
      display: inline-flex; align-items: center; gap: 3px;
      padding: 5px 8px; border-radius: 8px;
      border: 1.5px dashed var(--c-border); background: transparent;
      color: var(--c-text-3); font-size: 11px; font-weight: 600;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 14px; }
      &:hover { color: var(--c-brand); border-color: var(--c-brand); border-style: solid; }
    }
    .guide-toggle-label { letter-spacing: 0.2px; }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; }

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
  private exerciseService = inject(ExerciseService);
  private snackBar        = inject(MatSnackBar);
  readonly data: ExercisePickerData = inject(MAT_DIALOG_DATA);

  readonly isLoaded    = this.exerciseService.isLoaded;
  readonly skeletonRows = [1, 2, 3, 4, 5];

  constructor() { this.exerciseService.ensureLoaded(); }

  // ── List mode ─────────────────────────────────────────────────────────────

  readonly searchTerm = signal('');
  readonly catFilter = signal<ExerciseCategory | null>(this.data.defaultCategory ?? null);
  readonly mode = signal<'list' | 'create'>('list');

  readonly categories = (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map(v => ({
    value: v,
    label: CATEGORY_LABELS[v],
    icon:  CATEGORY_ICONS[v],
    color: CATEGORY_COLORS[v],
  }));

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

  getCategoryColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat] ?? '#bbb'; }
  getCategoryLabel(cat: ExerciseCategory): string { return CATEGORY_LABELS[cat]; }
  getSubLabel(sub: string): string { return SUBCATEGORY_LABELS[sub as keyof typeof SUBCATEGORY_LABELS] ?? sub; }
  getMuscleLabel(m: string): string { return MUSCLE_LABELS[m] ?? m; }

  formatRange([min, max]: [number, number]): string {
    return min === max ? `${min}` : `${min}–${max}`;
  }

  select(exercise: Exercise): void { this.dialogRef.close(exercise); }
  close(): void { this.dialogRef.close(); }

  // ── Create mode ────────────────────────────────────────────────────────────

  createName     = '';
  readonly createCategory  = signal<ExerciseCategory | null>(null);
  readonly createSubcat    = signal<string>('');
  readonly createSetsMin   = signal(0);
  readonly createSetsMax   = signal(0);
  readonly createRepsMin   = signal(0);
  readonly createRepsMax   = signal(0);
  readonly createSetsRange = signal(false);
  readonly createRepsRange = signal(false);
  readonly creating        = signal(false);

  readonly createSubcatOptions = computed(() => {
    const cat = this.createCategory();
    return cat ? SUBCATEGORY_OPTIONS[cat] : [];
  });

  startCreate(): void {
    this.createName = this.searchTerm();
    this.createCategory.set(this.catFilter());
    this.createSubcat.set('');
    this.createSetsMin.set(0);
    this.createSetsMax.set(0);
    this.createRepsMin.set(0);
    this.createRepsMax.set(0);
    this.createSetsRange.set(false);
    this.createRepsRange.set(false);
    this.mode.set('create');
  }

  cancelCreate(): void { this.mode.set('list'); }

  toggleSubcat(v: string): void {
    this.createSubcat.update(cur => cur === v ? '' : v);
  }

  numFromEvent(ev: Event): number {
    const v = +(ev.target as HTMLInputElement).value;
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  async saveNew(): Promise<void> {
    const name = this.createName.trim();
    const cat  = this.createCategory();
    if (!name || !cat) return;
    this.creating.set(true);
    try {
      const exercise = await this.exerciseService.create({
        name,
        category:    cat,
        subcategory: (this.createSubcat() || undefined) as ExerciseSubcategory | undefined,
        setsRange:   this._buildRange(this.createSetsMin(), this.createSetsMax(), this.createSetsRange()),
        repsRange:   this._buildRange(this.createRepsMin(), this.createRepsMax(), this.createRepsRange()),
      });
      this.dialogRef.close(exercise);
    } catch {
      this.snackBar.open('Error en crear l\'exercici', '', { duration: 2500 });
      this.creating.set(false);
    }
  }

  private _buildRange(min: number, max: number, asRange: boolean): [number, number] | undefined {
    if (min <= 0) return undefined;
    if (asRange && max > 0 && max !== min) return [Math.min(min, max), Math.max(min, max)];
    return [min, min];
  }
}
