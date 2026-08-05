import { Component, computed, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface DeleteExerciseDataDialogData {
  exerciseName: string;
  /** Every session date ('YYYY-MM-DD') that logs this exercise. */
  sessionDates: string[];
}

/** Inclusive date bounds; an omitted bound means "no limit on that side".
 *  An empty object `{}` therefore means "all data". */
export interface DeleteExerciseDataRange { from?: string; to?: string; }

type Scope = 'all' | '1m' | '3m' | '6m' | '1y' | 'custom';

/** Lets the user delete a single exercise's logged data — everything, one of
 *  the usual "last N" windows, or a hand-picked range — always showing exactly
 *  how many sessions each choice would remove before confirming. */
@Component({
  selector: 'app-delete-exercise-data-dialog',
  standalone: true,
  imports: [MatDialogModule],
  template: `
    <div class="dd-wrap">
      <div class="dd-head">
        <span class="material-symbols-outlined dd-head-icon">delete_sweep</span>
        <div class="dd-head-text">
          <h2 class="dd-title">Eliminar dades</h2>
          <p class="dd-sub">{{ data.exerciseName }}</p>
        </div>
      </div>

      <p class="dd-intro">
        Tria quines dades registrades vols esborrar. Aquesta acció
        <strong>no es pot desfer</strong>.
      </p>

      <div class="dd-options" role="radiogroup" aria-label="Rang a eliminar">
        @for (opt of options(); track opt.value) {
          <button class="dd-opt" role="radio"
                  [attr.aria-checked]="scope() === opt.value"
                  [class.active]="scope() === opt.value"
                  (click)="scope.set(opt.value)">
            <span class="dd-radio"></span>
            <span class="dd-opt-label">{{ opt.label }}</span>
            @if (opt.count >= 0) {
              <span class="dd-opt-count">{{ opt.count }}</span>
            }
          </button>
        }
      </div>

      @if (scope() === 'custom') {
        <div class="dd-custom">
          <label class="dd-field">
            <span class="dd-field-lbl">Des de</span>
            <input type="date" [max]="today"
                   [value]="customFrom()"
                   (change)="customFrom.set($any($event.target).value)">
          </label>
          <label class="dd-field">
            <span class="dd-field-lbl">Fins a</span>
            <input type="date" [max]="today"
                   [value]="customTo()"
                   (change)="customTo.set($any($event.target).value)">
          </label>
        </div>
      }

      <div class="dd-summary" [class.dd-summary--empty]="selectedCount() === 0">
        <span class="material-symbols-outlined">
          {{ selectedCount() === 0 ? 'info' : 'warning' }}
        </span>
        @if (selectedCount() === 0) {
          <span>Cap sessió en aquest rang</span>
        } @else {
          <span>
            S'eliminaran <strong>{{ selectedCount() }}</strong>
            {{ selectedCount() === 1 ? 'sessió' : 'sessions' }}
            de {{ data.exerciseName }}
          </span>
        }
      </div>

      <div class="dd-actions">
        <button class="dd-btn dd-btn--cancel" (click)="cancel()">Cancel·lar</button>
        <button class="dd-btn dd-btn--danger"
                [disabled]="selectedCount() === 0"
                (click)="confirm()">
          Eliminar{{ selectedCount() > 0 ? ' ' + selectedCount() : '' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .dd-wrap { padding: 22px 20px 16px; max-width: 340px; }

    .dd-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .dd-head-icon {
      flex-shrink: 0; font-size: 26px; color: #e04b48;
      background: color-mix(in srgb, #ef5350 12%, var(--c-card));
      width: 44px; height: 44px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
    }
    .dd-head-text { min-width: 0; }
    .dd-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--c-text); }
    .dd-sub {
      margin: 2px 0 0; font-size: 13px; font-weight: 600; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .dd-intro { margin: 0 0 16px; font-size: 13px; color: var(--c-text-2); line-height: 1.5; }

    .dd-options { display: flex; flex-direction: column; gap: 6px; }
    .dd-opt {
      display: flex; align-items: center; gap: 10px;
      padding: 11px 12px; border-radius: 12px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      cursor: pointer; text-align: left; touch-action: manipulation;
      transition: border-color 0.15s, background 0.15s;
      &:hover:not(.active) { border-color: var(--c-border); }
      &.active { border-color: #e04b48; background: color-mix(in srgb, #ef5350 6%, var(--c-card)); }
    }
    .dd-radio {
      flex-shrink: 0; width: 18px; height: 18px; border-radius: 50%;
      border: 2px solid var(--c-border); transition: border-color 0.15s;
      display: flex; align-items: center; justify-content: center;
    }
    .dd-opt.active .dd-radio {
      border-color: #e04b48;
      &::after { content: ''; width: 9px; height: 9px; border-radius: 50%; background: #e04b48; }
    }
    .dd-opt-label { flex: 1; font-size: 14px; font-weight: 600; color: var(--c-text); }
    .dd-opt-count {
      flex-shrink: 0; font-size: 11px; font-weight: 700; color: var(--c-text-2);
      background: var(--c-border-2); border-radius: 10px; padding: 2px 9px;
    }

    /* The custom range sits in its own tinted, rounded well so the two date
       fields have room to breathe instead of butting up against the radio
       list above and the summary below. */
    .dd-custom {
      display: flex; gap: 12px; margin-top: 12px;
      padding: 14px; border-radius: 12px;
      background: var(--c-subtle); border: 1px solid var(--c-border-2);
    }
    /* min-width:0 lets each field shrink inside the flex track — native
       date inputs have an intrinsic min-width that otherwise pushes the
       pair past the dialog's right edge. */
    .dd-field { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
    .dd-field-lbl {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      text-transform: uppercase; letter-spacing: 0.04em;
    }
    .dd-field input {
      width: 100%; min-width: 0; box-sizing: border-box; padding: 8px 9px;
      border: 1.5px solid var(--c-border); border-radius: 10px;
      background: var(--c-card); color: var(--c-text);
      font-size: 13px; font-family: inherit;
      &:focus { outline: none; border-color: var(--c-brand); }
    }

    .dd-summary {
      display: flex; align-items: center; gap: 8px;
      margin: 16px 0 4px; padding: 10px 12px; border-radius: 12px;
      font-size: 13px; line-height: 1.4;
      background: color-mix(in srgb, #ef5350 8%, var(--c-card));
      color: var(--c-text); border: 1px solid color-mix(in srgb, #ef5350 20%, var(--c-border-2));
      .material-symbols-outlined { font-size: 18px; color: #e04b48; flex-shrink: 0; }
      strong { color: #e04b48; }
    }
    .dd-summary--empty {
      background: var(--c-subtle); border-color: var(--c-border-2); color: var(--c-text-2);
      .material-symbols-outlined { color: var(--c-text-3); }
    }

    .dd-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
    .dd-btn {
      padding: 10px 18px; border-radius: 10px; font-size: 14px; font-weight: 600;
      cursor: pointer; border: none; transition: background 0.15s, opacity 0.15s;
    }
    .dd-btn--cancel {
      background: var(--c-subtle); color: var(--c-text-2); border: 1.5px solid var(--c-border-2);
      &:hover { background: var(--c-border); }
    }
    .dd-btn--danger {
      background: #d32f2f; color: #fff;
      &:hover:not(:disabled) { background: #b71c1c; }
      &:disabled { opacity: 0.45; cursor: default; }
    }
  `],
})
export class DeleteExerciseDataDialogComponent {
  readonly data      = inject<DeleteExerciseDataDialogData>(MAT_DIALOG_DATA);
  readonly dialogRef = inject(MatDialogRef<DeleteExerciseDataDialogComponent, DeleteExerciseDataRange | null>);

  readonly today = new Date().toISOString().slice(0, 10);

  readonly scope      = signal<Scope>('all');
  readonly customFrom = signal('');
  readonly customTo   = signal('');

  private readonly presets: { value: Scope; label: string; months: number }[] = [
    { value: '1m', label: 'Últim mes',        months: 1 },
    { value: '3m', label: 'Últims 3 mesos',   months: 3 },
    { value: '6m', label: 'Últims 6 mesos',   months: 6 },
    { value: '1y', label: 'Últim any',        months: 12 },
  ];

  /** Rows shown in the radio group, each with the count of sessions it targets
   *  (`-1` for the custom row, whose count is shown live in the summary). */
  readonly options = computed(() => {
    const dates = this.data.sessionDates;
    return [
      { value: 'all' as Scope, label: 'Totes les dades', count: dates.length },
      ...this.presets.map(p => ({
        value: p.value,
        label: p.label,
        count: dates.filter(d => d >= this.cutoff(p.months)).length,
      })),
      { value: 'custom' as Scope, label: 'Rang personalitzat', count: -1 },
    ];
  });

  private readonly customCount = computed(() => {
    const from = this.customFrom();
    const to   = this.customTo();
    return this.data.sessionDates.filter(d =>
      (!from || d >= from) && (!to || d <= to)).length;
  });

  readonly selectedCount = computed(() => {
    const s = this.scope();
    if (s === 'custom') return this.customCount();
    return this.options().find(o => o.value === s)?.count ?? 0;
  });

  private cutoff(months: number): string {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().slice(0, 10);
  }

  private resolveRange(): DeleteExerciseDataRange {
    const s = this.scope();
    if (s === 'all') return {};
    if (s === 'custom') {
      const r: DeleteExerciseDataRange = {};
      if (this.customFrom()) r.from = this.customFrom();
      if (this.customTo())   r.to   = this.customTo();
      return r;
    }
    const months = this.presets.find(p => p.value === s)!.months;
    return { from: this.cutoff(months) };
  }

  confirm(): void { this.dialogRef.close(this.resolveRange()); }
  cancel(): void  { this.dialogRef.close(null); }
}
