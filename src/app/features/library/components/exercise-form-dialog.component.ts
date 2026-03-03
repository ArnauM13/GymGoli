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
            <mat-label>Grup muscular</mat-label>
            <mat-select formControlName="subcategory">
              @for (sub of subcategoryOptions(); track sub.value) {
                <mat-option [value]="sub.value">{{ sub.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Notes (opcional)</mat-label>
          <textarea matInput formControlName="notes" rows="2" placeholder="Tècnica, variants..."></textarea>
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
    .form { display: flex; flex-direction: column; gap: 8px; padding-top: 4px; min-width: 300px; }
    .full-width { width: 100%; }
    .field-label { margin: 0 0 8px; font-size: 14px; color: #616161; font-weight: 500; }

    .category-selector { margin-bottom: 8px; }
    .category-buttons { display: flex; gap: 8px; }

    .cat-btn {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 12px 8px;
      border: 2px solid #e0e0e0;
      border-radius: 12px;
      background: #fafafa;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      color: #757575;
      transition: all 0.2s;

      span.material-symbols-outlined { font-size: 22px; }

      &:hover { border-color: #006874; color: #006874; background: rgba(0,104,116,0.06); }

      &.selected {
        border-color: #006874;
        background: rgba(0, 104, 116, 0.1);
        color: #006874;
      }
    }
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
    name: [this.data.exercise?.name ?? '', Validators.required],
    subcategory: [this.data.exercise?.subcategory ?? ''],
    notes: [this.data.exercise?.notes ?? ''],
  });

  selectCategory(cat: ExerciseCategory): void {
    this.selectedCategory.set(cat);
    this.form.patchValue({ subcategory: '' });
  }

  save(): void {
    if (this.form.invalid || !this.selectedCategory()) return;
    const { name, subcategory, notes } = this.form.value;
    this.dialogRef.close({
      name: name!.trim(),
      category: this.selectedCategory()!,
      subcategory: subcategory || undefined,
      notes: notes?.trim() || undefined,
    });
  }

  close(): void {
    this.dialogRef.close();
  }
}
