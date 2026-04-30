import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';

import {
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

@Component({
  selector: 'app-exercise-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar exercici' : 'Nou exercici' }}</h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="form">

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Nom de l'exercici</mat-label>
          <input matInput formControlName="name" placeholder="Ex: Press banca" autocomplete="off">
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>El nom és obligatori</mat-error>
          }
        </mat-form-field>

        <div class="category-selector">
          <p class="field-label">Tipus</p>
          <div class="category-buttons">
            @for (cat of categories; track cat.value) {
              <button
                type="button"
                class="cat-btn"
                [class.selected]="selectedCategory() === cat.value"
                (click)="selectCategory(cat.value)"
              >
                <span class="material-symbols-outlined">{{ cat.icon }}</span>
                <span>{{ cat.label }}</span>
              </button>
            }
          </div>
        </div>

        @if (subcategoryOptions().length > 0) {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Grup muscular principal</mat-label>
            <mat-select formControlName="subcategory">
              @for (sub of subcategoryOptions(); track sub.value) {
                <mat-option [value]="sub.value">{{ sub.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <!-- Músculs implicats -->
        <div class="picker-section">
          <p class="field-label">Músculs <span class="optional-hint">(opcional)</span></p>
          <div class="muscle-grid">
            @for (m of muscleOptions; track m.value) {
              <button type="button" class="muscle-chip"
                      [class.selected]="hasMuscle(m.value)"
                      (click)="toggleMuscle(m.value)">
                {{ m.label }}
              </button>
            }
          </div>
        </div>

        <!-- Guia de sèries i repeticions -->
        <div class="picker-section">
          <p class="field-label">Guia de sèries i reps <span class="optional-hint">(opcional)</span></p>
          <div class="range-row">
            <div class="range-group">
              <span class="range-label">Sèries</span>
              <div class="range-inputs">
                <input class="range-input" type="number" min="1" max="10" placeholder="mín"
                       [value]="setsMin()" (input)="setsMin.set(+$any($event.target).value || 0)">
                <span class="range-sep">–</span>
                <input class="range-input" type="number" min="1" max="10" placeholder="màx"
                       [value]="setsMax()" (input)="setsMax.set(+$any($event.target).value || 0)">
              </div>
            </div>
            <div class="range-divider"></div>
            <div class="range-group">
              <span class="range-label">Reps</span>
              <div class="range-inputs">
                <input class="range-input" type="number" min="1" max="100" placeholder="mín"
                       [value]="repsMin()" (input)="repsMin.set(+$any($event.target).value || 0)">
                <span class="range-sep">–</span>
                <input class="range-input" type="number" min="1" max="100" placeholder="màx"
                       [value]="repsMax()" (input)="repsMax.set(+$any($event.target).value || 0)">
              </div>
            </div>
          </div>
        </div>

        <!-- Descripció de tècnica -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Descripció de tècnica <span style="font-size:11px;opacity:.6">(opcional)</span></mat-label>
          <textarea matInput formControlName="description" rows="3"
                    placeholder="Com fer l'exercici, consells de tècnica..."></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Notes personals <span style="font-size:11px;opacity:.6">(opcional)</span></mat-label>
          <textarea matInput formControlName="notes" rows="2" placeholder="Variants, equipament..."></textarea>
        </mat-form-field>

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Cancel·lar</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid || !selectedCategory()">
        {{ isEdit ? 'Desar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; }
    .full-width { width: 100%; }
    .field-label { margin: 0 0 8px; font-size: 13px; color: var(--c-text-3); font-weight: 500; }
    .optional-hint { font-weight: 400; font-size: 11px; }

    .category-selector { margin-bottom: 4px; }
    .category-buttons { display: flex; gap: 8px; }

    .cat-btn {
      flex: 1; display: flex; flex-direction: column; align-items: center;
      gap: 4px; padding: 12px 8px;
      border: 2px solid var(--c-border-2); border-radius: 12px;
      background: var(--c-subtle); cursor: pointer;
      font-size: 12px; font-weight: 500; color: var(--c-text-3); transition: all 0.2s;
      span.material-symbols-outlined { font-size: 22px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.06); }
      &.selected { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.1); color: var(--c-brand); }
    }

    /* Músculs */
    .picker-section { display: flex; flex-direction: column; gap: 8px; }
    .muscle-grid { display: flex; flex-wrap: wrap; gap: 6px; }
    .muscle-chip {
      padding: 5px 10px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 12px; font-weight: 500; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s;
      &.selected { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.selected) { border-color: var(--c-brand); color: var(--c-brand); }
    }

    /* Rang sèries/reps */
    .range-row {
      display: flex; align-items: center; gap: 12px;
      background: var(--c-subtle); border-radius: 10px; padding: 10px 12px;
    }
    .range-group { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .range-label { font-size: 11px; color: var(--c-text-3); font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .range-inputs { display: flex; align-items: center; gap: 4px; }
    .range-sep { font-size: 13px; color: var(--c-text-3); }
    .range-input {
      width: 44px; padding: 5px 6px; text-align: center;
      border: 1.5px solid var(--c-border-2); border-radius: 8px;
      font-size: 13px; font-weight: 600; background: var(--c-card); color: var(--c-text);
      outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
      &::placeholder { color: var(--c-text-3); font-weight: 400; }
    }
    .range-divider { width: 1px; height: 36px; background: var(--c-border-2); }
  `],
})
export class ExerciseFormDialogComponent {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<ExerciseFormDialogComponent>);
  readonly data: ExerciseFormDialogData = inject(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.exercise;
  readonly selectedCategory = signal<ExerciseCategory | null>(
    this.data.exercise?.category ?? null
  );

  readonly muscleOptions = MUSCLE_OPTIONS;
  readonly selectedMuscles = signal<string[]>([...(this.data.exercise?.muscles ?? [])]);

  readonly setsMin = signal(this.data.exercise?.setsRange?.[0] ?? 0);
  readonly setsMax = signal(this.data.exercise?.setsRange?.[1] ?? 0);
  readonly repsMin = signal(this.data.exercise?.repsRange?.[0] ?? 0);
  readonly repsMax = signal(this.data.exercise?.repsRange?.[1] ?? 0);

  readonly categories = (Object.keys(CATEGORY_LABELS) as ExerciseCategory[]).map(value => ({
    value,
    label: CATEGORY_LABELS[value],
    icon: CATEGORY_ICONS[value],
  }));

  readonly subcategoryOptions = () => {
    const cat = this.selectedCategory();
    return cat ? SUBCATEGORY_OPTIONS[cat] : [];
  };

  readonly form = this.fb.group({
    name:        [this.data.exercise?.name ?? '', Validators.required],
    subcategory: [this.data.exercise?.subcategory ?? ''],
    description: [this.data.exercise?.description ?? ''],
    notes:       [this.data.exercise?.notes ?? ''],
  });

  hasMuscle(v: string): boolean { return this.selectedMuscles().includes(v); }

  toggleMuscle(v: string): void {
    this.selectedMuscles.update(list =>
      list.includes(v) ? list.filter(m => m !== v) : [...list, v]
    );
  }

  selectCategory(cat: ExerciseCategory): void {
    this.selectedCategory.set(cat);
    this.form.patchValue({ subcategory: '' });
  }

  save(): void {
    if (this.form.invalid || !this.selectedCategory()) return;
    const { name, subcategory, description, notes } = this.form.value;

    const setsRange: [number, number] | undefined =
      this.setsMin() > 0 && this.setsMax() > 0 ? [this.setsMin(), this.setsMax()] : undefined;
    const repsRange: [number, number] | undefined =
      this.repsMin() > 0 && this.repsMax() > 0 ? [this.repsMin(), this.repsMax()] : undefined;

    this.dialogRef.close({
      name:        name!.trim(),
      category:    this.selectedCategory()!,
      subcategory: subcategory || undefined,
      muscles:     this.selectedMuscles().length ? this.selectedMuscles() : undefined,
      description: description?.trim() || undefined,
      notes:       notes?.trim() || undefined,
      setsRange,
      repsRange,
    });
  }

  close(): void { this.dialogRef.close(); }
}
