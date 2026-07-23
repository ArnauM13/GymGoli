import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import {
  TRAINING_TYPE_COLORS,
  TRAINING_TYPE_ICONS,
  TrainingType,
} from '../../../core/models/training-type.model';

export interface TrainingTypeFormDialogData {
  type?: TrainingType;
}

@Component({
  selector: 'app-training-type-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? "Editar tipus d'entrenament" : "Nou tipus d'entrenament" }}</h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="form">

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Nom del tipus</mat-label>
          <input matInput formControlName="name" placeholder="Ex: Bíceps" autocomplete="off" maxlength="30">
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>El nom és obligatori</mat-error>
          }
        </mat-form-field>

        <!-- Icon picker -->
        <div class="picker-section">
          <p class="field-label">Icona</p>
          <div class="icon-grid">
            @for (icon of icons; track icon) {
              <button type="button" class="icon-btn"
                [class.selected]="selectedIcon() === icon"
                [style.color]="selectedIcon() === icon ? selectedColor() : null"
                (click)="selectedIcon.set(icon)">
                <span class="material-symbols-outlined">{{ icon }}</span>
              </button>
            }
          </div>
        </div>

        <!-- Colour picker -->
        <div class="picker-section">
          <p class="field-label">Color</p>
          <div class="color-grid">
            @for (color of colors; track color) {
              <button type="button" class="color-swatch"
                [class.selected]="selectedColor() === color"
                [style.background]="color"
                (click)="selectedColor.set(color)"></button>
            }
          </div>
        </div>

        <!-- Muscles (optional descriptive line) -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Músculs treballats (opcional)</mat-label>
          <input matInput formControlName="muscles" placeholder="Ex: Bíceps · Avantbraços" autocomplete="off" maxlength="60">
        </mat-form-field>

        <!-- Preview -->
        <div class="preview">
          <div class="preview-card" [style.--tt-color]="selectedColor()">
            <span class="material-symbols-outlined preview-icon">{{ selectedIcon() }}</span>
            <span class="preview-name">{{ form.get('name')?.value || 'Nom' }}</span>
          </div>
        </div>

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button class="dlg-btn dlg-btn--cancel" type="button" (click)="close()">Cancel·lar</button>
      <button class="dlg-btn dlg-btn--save" type="button" (click)="save()" [disabled]="form.invalid">
        {{ isEdit ? 'Desar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; }
    .full-width { width: 100%; }

    .picker-section { display: flex; flex-direction: column; gap: 8px; }
    .field-label { margin: 0; font-size: 13px; color: var(--c-text-3); font-weight: 500; }

    .icon-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(36px, 1fr)); gap: 4px;
    }
    .icon-btn {
      aspect-ratio: 1;
      display: flex; align-items: center; justify-content: center;
      border: 1.5px solid var(--c-border-2); border-radius: 8px;
      background: var(--c-subtle); cursor: pointer; transition: all 0.15s;
      .material-symbols-outlined { font-size: 20px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
      &:hover { border-color: var(--c-text-3); background: var(--c-border-2); }
      &.selected {
        border-color: currentColor;
        background: color-mix(in srgb, currentColor 8%, var(--c-card));
        .material-symbols-outlined { font-variation-settings: 'FILL' 1, 'wght' 400; color: inherit; }
      }
    }

    .color-grid { display: flex; gap: 8px; flex-wrap: wrap; }
    .color-swatch {
      width: 28px; height: 28px; border-radius: 50%;
      border: 2px solid transparent; cursor: pointer;
      transition: transform 0.15s, border-color 0.15s; outline: none;
      &:hover { transform: scale(1.15); }
      &.selected { border-color: var(--c-text); transform: scale(1.15); }
    }

    .preview { display: flex; justify-content: center; padding: 4px 0; }
    .preview-card {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 14px 24px;
      border: 1.5px solid var(--tt-color, var(--c-border)); border-radius: 14px;
      background: color-mix(in srgb, var(--tt-color, var(--c-border)) 8%, var(--c-card));
      min-width: 80px;
    }
    .preview-icon { font-size: 28px; color: var(--tt-color, var(--c-text-3)); font-variation-settings: 'FILL' 1, 'wght' 400; }
    .preview-name { font-size: 12px; font-weight: 700; color: color-mix(in srgb, var(--tt-color, var(--c-text-3)) 70%, var(--c-text-2)); }

    .dlg-btn {
      padding: 9px 18px; border-radius: 10px; font-size: 13px; font-weight: 600;
      cursor: pointer; border: none; transition: background 0.15s, color 0.15s; touch-action: manipulation;
    }
    .dlg-btn--cancel {
      background: transparent; color: var(--c-text-2); border: 1.5px solid var(--c-border-2);
      &:hover { background: var(--c-hover); color: var(--c-text); }
    }
    .dlg-btn--save {
      background: var(--c-brand); color: #fff; font-weight: 700;
      &:hover:not(:disabled) { background: var(--c-brand-hover, #005a63); }
      &:disabled { opacity: 0.4; cursor: not-allowed; }
    }
  `],
})
export class TrainingTypeFormDialogComponent {
  private fb        = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<TrainingTypeFormDialogComponent>);
  readonly data: TrainingTypeFormDialogData = inject(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.type;

  readonly icons  = TRAINING_TYPE_ICONS;
  readonly colors = TRAINING_TYPE_COLORS;

  readonly selectedIcon  = signal<string>(this.data.type?.icon  ?? TRAINING_TYPE_ICONS[0]);
  readonly selectedColor = signal<string>(this.data.type?.color ?? TRAINING_TYPE_COLORS[0]);

  readonly form = this.fb.group({
    name:    [this.data.type?.name ?? '', [Validators.required, Validators.maxLength(30)]],
    muscles: [this.data.type?.muscles ?? ''],
  });

  save(): void {
    if (this.form.invalid) return;
    this.dialogRef.close({
      name:    this.form.value.name!.trim(),
      icon:    this.selectedIcon(),
      color:   this.selectedColor(),
      muscles: this.form.value.muscles?.trim() || undefined,
    });
  }

  close(): void { this.dialogRef.close(); }
}
