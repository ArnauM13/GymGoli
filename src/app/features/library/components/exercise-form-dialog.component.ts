import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';

import {
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  Exercise,
  ExerciseCategory,
  MUSCLE_OPTIONS,
  SUBCATEGORY_OPTIONS,
} from '../../../core/models/exercise.model';

export interface ExerciseFormDialogData {
  exercise?: Exercise;
}

const MUSCLE_GROUPS: { label: string; values: string[] }[] = [
  { label: 'Tronc',  values: ['pit', 'esquena', 'espatlles', 'core'] },
  { label: 'Braços', values: ['biceps', 'triceps', 'avantbracos'] },
  { label: 'Cames',  values: ['quadriceps', 'isquiotibials', 'glutis', 'bessons'] },
];

@Component({
  selector: 'app-exercise-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatSlideToggleModule],
  template: `
    <div class="dlg-wrap">

      <!-- Títol -->
      <div class="dlg-header">
        <h2 class="dlg-title">{{ isEdit ? 'Editar exercici' : 'Nou exercici' }}</h2>
      </div>

      <!-- Contingut desplaçable -->
      <div class="dlg-body">
        <form [formGroup]="form" class="form">

          <!-- Nom -->
          <div class="field">
            <label class="field-label" for="ex-name">Nom de l'exercici</label>
            <input id="ex-name" class="field-input" type="text" formControlName="name"
                   placeholder="Ex: Press banca" autocomplete="off" maxlength="50">
            @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
              <span class="field-error">El nom és obligatori</span>
            }
            @if (form.get('name')?.hasError('maxlength')) {
              <span class="field-error">El nom no pot superar els 50 caràcters</span>
            }
          </div>

          <!-- Tipus -->
          <div class="field">
            <span class="field-label">Tipus</span>
            <div class="cat-grid">
              @for (cat of categories; track cat.value) {
                <button type="button" class="cat-btn"
                        [class.selected]="selectedCategory() === cat.value"
                        [style.--cat-color]="cat.color"
                        (click)="selectCategory(cat.value)">
                  <span class="material-symbols-outlined">{{ cat.icon }}</span>
                  <span class="cat-btn-label">{{ cat.label }}</span>
                </button>
              }
            </div>
          </div>

          <!-- Grup muscular principal -->
          @if (subcategoryOptions().length > 0) {
            <div class="field">
              <span class="field-label">Grup muscular principal</span>
              <div class="chips-row">
                @for (sub of subcategoryOptions(); track sub.value) {
                  <button type="button" class="chip"
                          [class.selected]="form.get('subcategory')?.value === sub.value"
                          (click)="selectSubcategory(sub.value)">
                    {{ sub.label }}
                  </button>
                }
              </div>
            </div>
          }

          <!-- Músculs -->
          <div class="field">
            <span class="field-label">Músculs implicats <span class="optional-hint">(opcional)</span></span>
            <div class="muscle-groups">
              @for (group of muscleGroups; track group.label) {
                <div class="muscle-group">
                  <span class="muscle-group-title">{{ group.label }}</span>
                  <div class="chips-row">
                    @for (v of group.values; track v) {
                      <button type="button" class="chip"
                              [class.selected]="hasMuscle(v)"
                              (click)="toggleMuscle(v)">
                        {{ muscleLabel(v) }}
                      </button>
                    }
                  </div>
                </div>
              }
            </div>
          </div>

          <!-- Unilateral -->
          <div class="field">
            <div class="unilateral-row">
              <div class="unilateral-info">
                <span class="field-label">Exercici unilateral</span>
                <span class="unilateral-desc">Es treballa un costat a la vegada — permet registrar el pes per separat a cada braç o cama.</span>
              </div>
              <mat-slide-toggle
                [checked]="unilateral()"
                (change)="unilateral.set($event.checked)"
                color="primary"
              />
            </div>
          </div>

          <!-- Guia sèries i reps -->
          <div class="field">
            <span class="field-label">Guia de sèries i reps <span class="optional-hint">(opcional)</span></span>
            <div class="guide-row">
              <div class="guide-group">
                <span class="guide-group-label">Sèries</span>
                <div class="guide-inputs">
                  <input class="guide-input" type="number" min="1" max="10" inputmode="numeric"
                         [value]="setsMin() || null" placeholder="—"
                         (input)="setsMin.set(numFromEvent($event))">
                  @if (setsRange()) {
                    <span class="guide-sep">–</span>
                    <input class="guide-input" type="number" min="1" max="10" inputmode="numeric"
                           [value]="setsMax() || null" placeholder="—"
                           (input)="setsMax.set(numFromEvent($event))">
                    <button type="button" class="guide-toggle" (click)="setsRange.set(false)" title="Treure rang">
                      <span class="material-symbols-outlined">remove</span>
                    </button>
                  } @else {
                    <button type="button" class="guide-toggle" (click)="setsRange.set(true)" title="Afegir rang">
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
                         [value]="repsMin() || null" placeholder="—"
                         (input)="repsMin.set(numFromEvent($event))">
                  @if (repsRange()) {
                    <span class="guide-sep">–</span>
                    <input class="guide-input" type="number" min="1" max="100" inputmode="numeric"
                           [value]="repsMax() || null" placeholder="—"
                           (input)="repsMax.set(numFromEvent($event))">
                    <button type="button" class="guide-toggle" (click)="repsRange.set(false)" title="Treure rang">
                      <span class="material-symbols-outlined">remove</span>
                    </button>
                  } @else {
                    <button type="button" class="guide-toggle" (click)="repsRange.set(true)" title="Afegir rang">
                      <span class="material-symbols-outlined">add</span>
                      <span class="guide-toggle-label">rang</span>
                    </button>
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- Descripció -->
          <div class="field">
            <label class="field-label" for="ex-desc">
              Descripció de tècnica <span class="optional-hint">(opcional)</span>
            </label>
            <textarea id="ex-desc" class="field-input field-textarea" rows="3" formControlName="description"
                      placeholder="Com fer l'exercici, consells de tècnica..."></textarea>
          </div>

          <!-- Notes -->
          <div class="field">
            <label class="field-label" for="ex-notes">
              Notes personals <span class="optional-hint">(opcional)</span>
            </label>
            <textarea id="ex-notes" class="field-input field-textarea" rows="2" formControlName="notes"
                      placeholder="Variants, equipament..."></textarea>
          </div>

        </form>
      </div>

      <!-- Accions -->
      <div class="dlg-actions">
        <button class="dlg-btn dlg-btn--cancel" type="button" (click)="close()">Cancel·lar</button>
        <button class="dlg-btn dlg-btn--save" type="button" (click)="save()"
                [disabled]="form.invalid || !selectedCategory()">
          {{ isEdit ? 'Desar' : 'Crear' }}
        </button>
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; }

    /* ── Wrapper ── */
    .dlg-wrap {
      display: flex; flex-direction: column;
      max-height: 85vh; overflow: hidden;
    }

    /* ── Títol ── */
    .dlg-header {
      padding: 20px 16px 14px;
      border-bottom: 1px solid var(--c-border-2);
      flex-shrink: 0;
    }
    .dlg-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--c-text); }

    /* ── Cos desplaçable ── */
    .dlg-body { overflow-y: auto; padding: 16px; flex: 1; }

    /* ── Accions ── */
    .dlg-actions {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 16px 18px;
      border-top: 1px solid var(--c-border-2);
      flex-shrink: 0;
    }

    .form { display: flex; flex-direction: column; gap: 18px; }

    /* ── Field (label + control) ── */
    .field { display: flex; flex-direction: column; gap: 8px; }
    .field-label {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .optional-hint {
      font-size: 10px; font-weight: 500; color: var(--c-text-3);
      text-transform: none; letter-spacing: 0; opacity: 0.85;
    }
    .field-error { font-size: 12px; color: #ef5350; }

    /* ── Inputs ── */
    .field-input {
      width: 100%; padding: 10px 12px; box-sizing: border-box;
      border: 1.5px solid var(--c-border-2); border-radius: 12px;
      background: var(--c-card); color: var(--c-text);
      font-size: 14px; font-family: inherit; outline: none;
      transition: border-color 0.15s;
      &::placeholder { color: var(--c-text-3); }
      &:focus { border-color: var(--c-brand); }
    }
    .field-textarea { resize: vertical; min-height: 60px; line-height: 1.4; }

    /* ── Categoria ── */
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
        background: color-mix(in srgb, var(--cat-color, var(--c-brand)) 14%, var(--c-card));
        color: color-mix(in srgb, var(--cat-color, var(--c-brand)) 80%, var(--c-text));
      }
    }

    /* ── Chips (subcategoria + músculs) ── */
    .chips-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      padding: 6px 12px; border-radius: 16px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover:not(.selected) { border-color: var(--c-brand); color: var(--c-brand); }
      &.selected { background: var(--c-brand); border-color: var(--c-brand); color: #fff; }
    }

    /* ── Músculs agrupats ── */
    .muscle-groups { display: flex; flex-direction: column; gap: 12px; }
    .muscle-group { display: flex; flex-direction: column; gap: 6px; }
    .muscle-group-title {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      letter-spacing: 0.2px;
    }

    /* ── Unilateral ── */
    .unilateral-row { display: flex; align-items: center; gap: 12px; }
    .unilateral-info { flex: 1; display: flex; flex-direction: column; gap: 3px; }
    .unilateral-desc { font-size: 12px; color: var(--c-text-3); line-height: 1.4; }

    /* ── Guia sèries / reps ── */
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

    /* ── Botons ── */
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
    .dlg-btn--save {
      background: var(--c-brand); color: #fff;
      &:hover:not(:disabled) { background: var(--c-brand-hover, #005a63); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
  `],
})
export class ExerciseFormDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ExerciseFormDialogComponent>);
  readonly data: ExerciseFormDialogData = inject(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.exercise;
  readonly selectedCategory = signal<ExerciseCategory | null>(this.data.exercise?.category ?? null);

  readonly muscleGroups = MUSCLE_GROUPS;
  readonly selectedMuscles = signal<string[]>([...(this.data.exercise?.muscles ?? [])]);

  private readonly _setsInit = this.data.exercise?.setsRange;
  private readonly _repsInit = this.data.exercise?.repsRange;

  readonly setsMin = signal(this._setsInit?.[0] ?? 0);
  readonly setsMax = signal(this._setsInit?.[1] ?? 0);
  readonly repsMin = signal(this._repsInit?.[0] ?? 0);
  readonly repsMax = signal(this._repsInit?.[1] ?? 0);

  readonly setsRange = signal(!!this._setsInit && this._setsInit[0] !== this._setsInit[1]);
  readonly repsRange = signal(!!this._repsInit && this._repsInit[0] !== this._repsInit[1]);

  readonly unilateral = signal(!!this.data.exercise?.unilateral);

  readonly categories = (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map(value => ({
    value,
    label: CATEGORY_LABELS[value],
    icon: CATEGORY_ICONS[value],
    color: CATEGORY_COLORS[value],
  }));

  readonly subcategoryOptions = computed(() => {
    const cat = this.selectedCategory();
    return cat ? SUBCATEGORY_OPTIONS[cat] : [];
  });

  readonly form = this.fb.group({
    name:        [this.data.exercise?.name ?? '', [Validators.required, Validators.maxLength(50)]],
    subcategory: [this.data.exercise?.subcategory ?? ''],
    description: [this.data.exercise?.description ?? ''],
    notes:       [this.data.exercise?.notes ?? ''],
  });

  hasMuscle(v: string): boolean { return this.selectedMuscles().includes(v); }

  muscleLabel(v: string): string {
    return MUSCLE_OPTIONS.find(m => m.value === v)?.label ?? v;
  }

  toggleMuscle(v: string): void {
    this.selectedMuscles.update(list =>
      list.includes(v) ? list.filter(m => m !== v) : [...list, v]
    );
  }

  selectCategory(cat: ExerciseCategory): void {
    this.selectedCategory.set(cat);
    this.form.patchValue({ subcategory: '' });
  }

  selectSubcategory(value: string): void {
    const current = this.form.get('subcategory')?.value;
    this.form.patchValue({ subcategory: current === value ? '' : value });
  }

  numFromEvent(ev: Event): number {
    const v = +(ev.target as HTMLInputElement).value;
    return Number.isFinite(v) && v > 0 ? v : 0;
  }

  save(): void {
    if (this.form.invalid || !this.selectedCategory()) return;
    const { name, subcategory, description, notes } = this.form.value;

    const setsRange = this.buildRange(this.setsMin(), this.setsMax(), this.setsRange());
    const repsRange = this.buildRange(this.repsMin(), this.repsMax(), this.repsRange());

    this.dialogRef.close({
      name:        name!.trim(),
      category:    this.selectedCategory()!,
      subcategory: subcategory || undefined,
      muscles:     this.selectedMuscles().length ? this.selectedMuscles() : undefined,
      description: description?.trim() || undefined,
      notes:       notes?.trim() || undefined,
      setsRange,
      repsRange,
      unilateral: this.unilateral() || undefined,
    });
  }

  private buildRange(min: number, max: number, asRange: boolean): [number, number] | undefined {
    if (min <= 0) return undefined;
    if (asRange && max > 0 && max !== min) return [Math.min(min, max), Math.max(min, max)];
    return [min, min];
  }

  close(): void { this.dialogRef.close(); }
}
