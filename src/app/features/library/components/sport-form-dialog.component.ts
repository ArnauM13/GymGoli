import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { DEFAULT_SPORTS, SPORT_COLORS, SPORT_ICONS, Sport } from '../../../core/models/sport.model';

export interface SportFormDialogData {
  sport?: Sport;
}

@Component({
  selector: 'app-sport-form-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ isEdit ? 'Editar esport' : 'Nou esport' }}</h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="form">

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Nom de l'esport</mat-label>
          <input matInput formControlName="name" placeholder="Ex: Natació" autocomplete="off">
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>El nom és obligatori</mat-error>
          }
        </mat-form-field>

        <!-- Icon picker -->
        <div class="picker-section">
          <p class="field-label">Icona</p>
          <div class="icon-grid">
            @for (icon of icons; track icon) {
              <button
                type="button"
                class="icon-btn"
                [class.selected]="selectedIcon() === icon"
                [style.color]="selectedIcon() === icon ? selectedColor() : null"
                (click)="selectedIcon.set(icon)"
              >
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
              <button
                type="button"
                class="color-swatch"
                [class.selected]="selectedColor() === color"
                [style.background]="color"
                (click)="selectedColor.set(color)"
              ></button>
            }
          </div>
        </div>

        <!-- Preview -->
        <div class="preview">
          <div class="preview-card" [style.--sport-color]="selectedColor()">
            <span class="material-symbols-outlined preview-icon">{{ selectedIcon() }}</span>
            <span class="preview-name">{{ form.get('name')?.value || 'Nom' }}</span>
          </div>
        </div>

      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="close()">Cancel·lar</button>
      <button mat-flat-button (click)="save()" [disabled]="form.invalid">
        {{ isEdit ? 'Desar' : 'Crear' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: flex; flex-direction: column; gap: 12px; padding-top: 4px; min-width: 300px; }
    .full-width { width: 100%; }

    .picker-section { display: flex; flex-direction: column; gap: 8px; }
    .field-label { margin: 0; font-size: 13px; color: #616161; font-weight: 500; }

    /* Icon grid */
    .icon-grid {
      display: grid;
      grid-template-columns: repeat(8, 1fr);
      gap: 4px;
    }

    .icon-btn {
      width: 36px; height: 36px;
      display: flex; align-items: center; justify-content: center;
      border: 1.5px solid #e0e0e0; border-radius: 8px;
      background: #fafafa; cursor: pointer;
      transition: all 0.15s;
      .material-symbols-outlined {
        font-size: 20px; color: #555;
        font-variation-settings: 'FILL' 0, 'wght' 300;
      }
      &:hover { border-color: #aaa; background: #f0f0f0; }
      &.selected {
        border-color: currentColor;
        background: color-mix(in srgb, currentColor 8%, white);
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 1, 'wght' 400;
          color: inherit;
        }
      }
    }

    /* Colour grid */
    .color-grid {
      display: flex; gap: 8px; flex-wrap: wrap;
    }

    .color-swatch {
      width: 28px; height: 28px; border-radius: 50%;
      border: 2px solid transparent; cursor: pointer;
      transition: transform 0.15s, border-color 0.15s;
      outline: none;
      &:hover { transform: scale(1.15); }
      &.selected {
        border-color: #1a1a1a;
        transform: scale(1.15);
      }
    }

    /* Preview */
    .preview {
      display: flex; justify-content: center; padding: 4px 0 4px;
    }
    .preview-card {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 14px 24px;
      border: 1.5px solid var(--sport-color, #ccc);
      border-radius: 14px;
      background: color-mix(in srgb, var(--sport-color, #ccc) 8%, white);
      min-width: 80px;
    }
    .preview-icon {
      font-size: 28px; color: var(--sport-color, #888);
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .preview-name {
      font-size: 12px; font-weight: 700;
      color: color-mix(in srgb, var(--sport-color, #888) 70%, #333);
    }
  `],
})
export class SportFormDialogComponent {
  private fb        = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SportFormDialogComponent>);
  readonly data: SportFormDialogData = inject(MAT_DIALOG_DATA);

  readonly isEdit = !!this.data.sport;

  readonly icons  = SPORT_ICONS;
  readonly colors = SPORT_COLORS;

  readonly selectedIcon  = signal<string>(this.data.sport?.icon  ?? DEFAULT_SPORTS[0].icon);
  readonly selectedColor = signal<string>(this.data.sport?.color ?? DEFAULT_SPORTS[0].color);

  readonly form = this.fb.group({
    name: [this.data.sport?.name ?? '', Validators.required],
  });

  save(): void {
    if (this.form.invalid) return;
    this.dialogRef.close({
      name:  this.form.value.name!.trim(),
      icon:  this.selectedIcon(),
      color: this.selectedColor(),
    });
  }

  close(): void { this.dialogRef.close(); }
}
