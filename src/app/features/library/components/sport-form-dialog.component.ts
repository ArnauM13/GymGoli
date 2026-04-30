import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { DEFAULT_SPORTS, METRIC_CATALOGUE, SPORT_COLORS, SPORT_ICONS, Sport, SportMetricDef, SportSubtype } from '../../../core/models/sport.model';

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

        <!-- Metric defs -->
        <div class="picker-section">
          <p class="field-label">Mètriques <span class="optional-hint">(opcional)</span></p>
          <div class="metric-grid">
            @for (m of catalogue; track m.key) {
              <button type="button" class="metric-chip"
                      [class.selected]="hasMetric(m.key)"
                      (click)="toggleMetric(m)">
                {{ m.label }}
                @if (m.unit) { <span class="metric-unit">{{ m.unit }}</span> }
              </button>
            }
          </div>
        </div>

        <!-- Subtypes (optional) -->
        <div class="picker-section">
          <p class="field-label">Subtipus <span class="optional-hint">(opcional)</span></p>

          @if (subtypes().length > 0) {
            <div class="subtype-list">
              @for (sub of subtypes(); track sub.id) {
                <span class="subtype-chip">
                  {{ sub.name }}
                  <button type="button" class="subtype-remove" (click)="removeSubtype(sub.id)">
                    <span class="material-symbols-outlined">close</span>
                  </button>
                </span>
              }
            </div>
          }

          <div class="subtype-add-row">
            <input
              class="subtype-input"
              type="text"
              placeholder="Nou subtipus..."
              [value]="newSubtypeName()"
              (input)="newSubtypeName.set($any($event.target).value)"
              (keydown.enter)="$event.preventDefault(); addSubtype()"
              autocomplete="off"
            >
            <button type="button" class="subtype-add-btn" (click)="addSubtype()" [disabled]="!newSubtypeName().trim()">
              <span class="material-symbols-outlined">add</span>
            </button>
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
    .optional-hint { font-weight: 400; color: #666; font-size: 11px; }

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
      &:hover { border-color: #666; background: #f0f0f0; }
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

    /* Metrics */
    .metric-grid { display: flex; flex-wrap: wrap; gap: 7px; }
    .metric-chip {
      padding: 6px 12px; border: 1.5px solid #e0e0e0; border-radius: 20px;
      background: white; font-size: 12px; font-weight: 600; color: #555;
      cursor: pointer; transition: all 0.15s;
      &.selected { background: #006874; color: white; border-color: #006874; }
      &:hover:not(.selected) { border-color: #006874; color: #006874; }
    }
    .metric-unit { font-size: 10px; font-weight: 400; opacity: 0.8; margin-left: 3px; }

    /* Subtypes */
    .subtype-list {
      display: flex; flex-wrap: wrap; gap: 6px;
    }
    .subtype-chip {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 8px 4px 10px;
      background: #f0f0f0; border-radius: 20px;
      font-size: 12px; font-weight: 500; color: #444;
    }
    .subtype-remove {
      display: flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%; border: none;
      background: transparent; cursor: pointer; color: #888; padding: 0;
      transition: background 0.12s, color 0.12s;
      .material-symbols-outlined { font-size: 13px; }
      &:hover { background: #ddd; color: #333; }
    }

    .subtype-add-row {
      display: flex; gap: 6px; align-items: center;
    }
    .subtype-input {
      flex: 1; padding: 7px 10px;
      border: 1.5px solid #e0e0e0; border-radius: 8px;
      font-size: 13px; outline: none;
      transition: border-color 0.15s;
      &:focus { border-color: #006874; }
    }
    .subtype-add-btn {
      width: 34px; height: 34px; border-radius: 8px; border: none;
      background: #006874; color: white; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover:not(:disabled) { background: #005a63; }
      &:disabled { background: #ccc; cursor: default; }
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

  readonly selectedIcon   = signal<string>(this.data.sport?.icon  ?? DEFAULT_SPORTS[0].icon);
  readonly selectedColor  = signal<string>(this.data.sport?.color ?? DEFAULT_SPORTS[0].color);
  readonly metricDefs     = signal<SportMetricDef[]>([...(this.data.sport?.metricDefs ?? [])]);
  readonly subtypes       = signal<SportSubtype[]>([...(this.data.sport?.subtypes ?? [])]);
  readonly newSubtypeName = signal('');

  readonly catalogue = METRIC_CATALOGUE;

  hasMetric(key: string): boolean {
    return this.metricDefs().some(m => m.key === key);
  }

  toggleMetric(def: SportMetricDef): void {
    this.metricDefs.update(list =>
      list.some(m => m.key === def.key) ? list.filter(m => m.key !== def.key) : [...list, def]
    );
  }

  readonly form = this.fb.group({
    name: [this.data.sport?.name ?? '', Validators.required],
  });

  addSubtype(): void {
    const name = this.newSubtypeName().trim();
    if (!name) return;
    this.subtypes.update(list => [...list, { id: crypto.randomUUID(), name }]);
    this.newSubtypeName.set('');
  }

  removeSubtype(id: string): void {
    this.subtypes.update(list => list.filter(s => s.id !== id));
  }

  save(): void {
    if (this.form.invalid) return;
    this.dialogRef.close({
      name:       this.form.value.name!.trim(),
      icon:       this.selectedIcon(),
      color:      this.selectedColor(),
      subtypes:   this.subtypes(),
      metricDefs: this.metricDefs(),
    });
  }

  close(): void { this.dialogRef.close(); }
}
