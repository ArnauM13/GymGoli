import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { MUSCLE_OPTIONS } from '../../../core/models/exercise.model';
import {
  TRAINING_TYPE_COLORS,
  TRAINING_TYPE_ICONS,
  TrainingType,
} from '../../../core/models/training-type.model';

export interface TrainingTypeFormDialogData {
  type?: TrainingType;
}

/** Muscle groups shown as selectable chips, mirroring the exercise form so the
 *  two dialogs share one vocabulary. Each value is a MUSCLE_OPTIONS id. */
const MUSCLE_GROUPS: { label: string; values: string[] }[] = [
  { label: 'Tronc',  values: ['pit', 'esquena', 'espatlles', 'core'] },
  { label: 'Braços', values: ['biceps', 'triceps', 'avantbracos'] },
  { label: 'Cames',  values: ['quadriceps', 'isquiotibials', 'glutis', 'bessons'] },
];

@Component({
  selector: 'app-training-type-form-dialog',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="dlg-wrap">

      <!-- Títol -->
      <div class="dlg-header">
        <h2 class="dlg-title">{{ isEdit ? "Editar tipus d'entrenament" : "Nou tipus d'entrenament" }}</h2>
      </div>

      <!-- Contingut desplaçable -->
      <div class="dlg-body">
        <form [formGroup]="form" class="form">

          <!-- Nom -->
          <div class="field">
            <label class="field-label" for="tt-name">Nom del tipus</label>
            <input id="tt-name" class="field-input" type="text" formControlName="name"
                   placeholder="Ex: Bíceps" autocomplete="off" maxlength="30">
            @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
              <span class="field-error">El nom és obligatori</span>
            }
          </div>

          <!-- Icona -->
          <div class="field">
            <span class="field-label">Icona</span>
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

          <!-- Color -->
          <div class="field">
            <span class="field-label">Color</span>
            <div class="color-grid">
              @for (color of colors; track color) {
                <button type="button" class="color-swatch"
                        [class.selected]="selectedColor() === color"
                        [style.background]="color"
                        (click)="selectedColor.set(color)"></button>
              }
            </div>
          </div>

          <!-- Grups musculars -->
          <div class="field">
            <span class="field-label">Grups musculars <span class="optional-hint">(opcional)</span></span>
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

          <!-- Previsualització -->
          <div class="preview">
            <div class="preview-card" [style.--tt-color]="selectedColor()">
              <span class="material-symbols-outlined preview-icon">{{ selectedIcon() }}</span>
              <span class="preview-name">{{ form.get('name')?.value || 'Nom' }}</span>
              @if (musclesLine()) { <span class="preview-muscles">{{ musclesLine() }}</span> }
            </div>
          </div>

        </form>
      </div>

      <!-- Accions -->
      <div class="dlg-actions">
        <button class="dlg-btn dlg-btn--cancel" type="button" (click)="close()">Cancel·lar</button>
        <button class="dlg-btn dlg-btn--save" type="button" (click)="save()" [disabled]="form.invalid">
          {{ isEdit ? 'Desar' : 'Crear' }}
        </button>
      </div>

    </div>
  `,
  styles: [`
    :host { display: block; }

    /* ── Wrapper ── */
    .dlg-wrap { display: flex; flex-direction: column; max-height: 85vh; overflow: hidden; }

    /* ── Títol ── */
    .dlg-header { padding: 20px 16px 14px; border-bottom: 1px solid var(--c-border-2); flex-shrink: 0; }
    .dlg-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--c-text); }

    /* ── Cos desplaçable ── */
    .dlg-body { overflow-y: auto; padding: 16px; flex: 1; }
    .form { display: flex; flex-direction: column; gap: 18px; }

    /* ── Accions ── */
    .dlg-actions {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 16px 18px; border-top: 1px solid var(--c-border-2); flex-shrink: 0;
    }

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

    /* ── Input ── */
    .field-input {
      width: 100%; padding: 10px 12px; box-sizing: border-box;
      border: 1.5px solid var(--c-border-2); border-radius: 12px;
      background: var(--c-card); color: var(--c-text);
      font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.15s;
      &::placeholder { color: var(--c-text-3); }
      &:focus { border-color: var(--c-brand); }
    }

    /* ── Icona ── */
    .icon-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(36px, 1fr)); gap: 4px; }
    .icon-btn {
      aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
      border: 1.5px solid var(--c-border-2); border-radius: 8px;
      background: var(--c-subtle); cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 20px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
      &:hover { border-color: var(--c-text-3); background: var(--c-border-2); }
      &.selected {
        border-color: currentColor;
        background: color-mix(in srgb, currentColor 8%, var(--c-card));
        .material-symbols-outlined { font-variation-settings: 'FILL' 1, 'wght' 400; color: inherit; }
      }
    }

    /* ── Color ── */
    .color-grid { display: flex; gap: 8px; flex-wrap: wrap; }
    .color-swatch {
      width: 28px; height: 28px; border-radius: 50%;
      border: 2px solid transparent; cursor: pointer;
      transition: transform 0.15s, border-color 0.15s; outline: none; touch-action: manipulation;
      &:hover { transform: scale(1.15); }
      &.selected { border-color: var(--c-text); transform: scale(1.15); }
    }

    /* ── Grups musculars (chips) ── */
    .muscle-groups { display: flex; flex-direction: column; gap: 12px; }
    .muscle-group { display: flex; flex-direction: column; gap: 6px; }
    .muscle-group-title { font-size: 11px; font-weight: 600; color: var(--c-text-2); letter-spacing: 0.2px; }
    .chips-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .chip {
      padding: 6px 12px; border-radius: 16px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover:not(.selected) { border-color: var(--c-brand); color: var(--c-brand); }
      &.selected { background: var(--c-brand); border-color: var(--c-brand); color: #fff; }
    }

    /* ── Previsualització ── */
    .preview { display: flex; justify-content: center; padding: 4px 0; }
    .preview-card {
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 14px 24px; text-align: center;
      border: 1.5px solid var(--tt-color, var(--c-border)); border-radius: 14px;
      background: color-mix(in srgb, var(--tt-color, var(--c-border)) 8%, var(--c-card));
      min-width: 80px; max-width: 100%;
    }
    .preview-icon { font-size: 28px; color: var(--tt-color, var(--c-text-3)); font-variation-settings: 'FILL' 1, 'wght' 400; }
    .preview-name { font-size: 12px; font-weight: 700; color: color-mix(in srgb, var(--tt-color, var(--c-text-3)) 70%, var(--c-text-2)); }
    .preview-muscles { font-size: 11px; font-weight: 500; color: var(--c-text-3); line-height: 1.35; }

    /* ── Botons ── */
    .dlg-btn {
      padding: 9px 18px; border-radius: 10px; font-size: 13px; font-weight: 700;
      cursor: pointer; border: none; transition: background 0.15s, color 0.15s; touch-action: manipulation;
    }
    .dlg-btn--cancel {
      background: transparent; color: var(--c-text-2); border: 1.5px solid var(--c-border-2);
      &:hover { background: var(--c-hover); color: var(--c-text); }
    }
    .dlg-btn--save {
      background: var(--c-brand); color: #fff;
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

  readonly icons        = TRAINING_TYPE_ICONS;
  readonly colors       = TRAINING_TYPE_COLORS;
  readonly muscleGroups = MUSCLE_GROUPS;

  readonly selectedIcon    = signal<string>(this.data.type?.icon  ?? TRAINING_TYPE_ICONS[0]);
  readonly selectedColor   = signal<string>(this.data.type?.color ?? TRAINING_TYPE_COLORS[0]);
  readonly selectedMuscles = signal<string[]>(this._parseMuscles(this.data.type?.muscles));

  readonly form = this.fb.group({
    name: [this.data.type?.name ?? '', [Validators.required, Validators.maxLength(30)]],
  });

  /** The muscle labels joined the way they're displayed and stored ("A · B · C"). */
  readonly musclesLine = computed(() =>
    this.selectedMuscles().map(v => this.muscleLabel(v)).join(' · ')
  );

  hasMuscle(v: string): boolean { return this.selectedMuscles().includes(v); }

  muscleLabel(v: string): string {
    return MUSCLE_OPTIONS.find(m => m.value === v)?.label ?? v;
  }

  toggleMuscle(v: string): void {
    this.selectedMuscles.update(list =>
      list.includes(v) ? list.filter(m => m !== v) : [...list, v]
    );
  }

  save(): void {
    if (this.form.invalid) return;
    this.dialogRef.close({
      name:    this.form.value.name!.trim(),
      icon:    this.selectedIcon(),
      color:   this.selectedColor(),
      muscles: this.musclesLine() || undefined,
    });
  }

  close(): void { this.dialogRef.close(); }

  /** Recover selected muscle ids from a stored "A · B · C" line, matching each
   *  segment against the known muscle labels. Unknown segments (legacy free
   *  text) are dropped — the chips only represent the canonical vocabulary. */
  private _parseMuscles(line?: string): string[] {
    if (!line) return [];
    return line.split('·')
      .map(s => s.trim())
      .map(label => MUSCLE_OPTIONS.find(m => m.label.toLowerCase() === label.toLowerCase())?.value)
      .filter((v): v is string => !!v);
  }
}
