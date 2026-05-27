import { Component, OnInit, ViewEncapsulation, inject, input, output, signal } from '@angular/core';
import { ExerciseCategory } from '../../../core/models/exercise.model';
import { WorkoutEntry, WorkoutSet } from '../../../core/models/workout.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { ImportedWorkout } from '../../../core/services/fit-import.service';
import { WorkoutService } from '../../../core/services/workout.service';

const CAT_COLOR: Record<ExerciseCategory, string> = {
  push: '#e57373', pull: '#64b5f6', legs: '#81c784',
};
const CAT_LABEL: Record<ExerciseCategory, string> = {
  push: 'Pit / espatlles', pull: 'Esquena / bíceps', legs: 'Cames',
};

@Component({
  selector: 'app-import-preview',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="ip-backdrop" (click)="closed.emit()"></div>
    <div class="ip-sheet">

      <div class="ip-header">
        <div class="ip-header-left">
          <span class="material-symbols-outlined ip-header-icon">watch</span>
          <div>
            <div class="ip-title">Importar entrenament</div>
            <div class="ip-subtitle">{{ subtitle() }}</div>
          </div>
        </div>
        <button class="ip-close" (click)="closed.emit()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      @if (workout().entries.length === 0) {
        <!-- Apple Watch: no set data available -->
        <div class="ip-no-sets">
          <span class="material-symbols-outlined ip-no-sets-icon">info</span>
          <p>Apple Watch no inclou sèries individuals al fitxer d'exportació.
             S'importarà el temps i la FC, però hauràs d'afegir els exercicis manualment.</p>
        </div>
      } @else {
        <div class="ip-entries">
          @for (entry of workout().entries; track entry.exerciseName) {
            <div class="ip-entry" [style.--ec]="catColor(entry.category)">
              <div class="ip-entry-bar"></div>
              <div class="ip-entry-body">
                <div class="ip-entry-name">{{ entry.exerciseName }}</div>
                <div class="ip-entry-cat">{{ catLabel(entry.category) }}</div>
                <div class="ip-sets">
                  @for (s of entry.sets; track $index) {
                    <span class="ip-set">
                      {{ s.reps }} rep@if (s.reps !== 1) { s }
                      @if (s.weightKg > 0) { · {{ s.weightKg }}kg }
                    </span>
                  }
                </div>
              </div>
            </div>
          }
        </div>
      }

      <div class="ip-actions">
        <button class="ip-cancel" (click)="closed.emit()">Cancel·lar</button>
        <button class="ip-save" (click)="confirm()" [disabled]="saving()">
          @if (saving()) {
            <span class="material-symbols-outlined spin">sync</span>
          } @else {
            <span class="material-symbols-outlined">download</span>
          }
          Importar
        </button>
      </div>

    </div>
  `,
  styles: [`
    .ip-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.4); animation: ip-fade 0.18s ease;
    }
    @keyframes ip-fade { from { opacity: 0; } to { opacity: 1; } }

    .ip-sheet {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: var(--c-card); border-radius: 24px 24px 0 0;
      padding: 0 16px calc(env(safe-area-inset-bottom) + 16px);
      max-height: 82vh; overflow-y: auto;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.14);
      animation: ip-up 0.22s cubic-bezier(0.34, 1.2, 0.64, 1);
    }
    @keyframes ip-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

    .ip-header {
      display: flex; align-items: center;
      padding: 16px 0 12px; border-bottom: 1px solid var(--c-border-2); margin-bottom: 12px;
    }
    .ip-header-left { flex: 1; display: flex; align-items: center; gap: 10px; }
    .ip-header-icon { font-size: 22px; color: var(--c-brand); font-variation-settings: 'FILL' 1; }
    .ip-title   { font-size: 16px; font-weight: 800; color: var(--c-text); }
    .ip-subtitle { font-size: 12px; color: var(--c-text-2); margin-top: 1px; }
    .ip-close {
      width: 34px; height: 34px; border-radius: 50%; border: none;
      background: var(--c-subtle); cursor: pointer; color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); }
    }

    .ip-no-sets {
      display: flex; gap: 10px; align-items: flex-start;
      padding: 14px; border-radius: 12px;
      background: color-mix(in srgb, var(--c-brand) 8%, var(--c-card));
      border: 1px solid color-mix(in srgb, var(--c-brand) 20%, transparent);
      margin-bottom: 16px;
      .ip-no-sets-icon { font-size: 18px; color: var(--c-brand); flex-shrink: 0; margin-top: 2px; }
      p { margin: 0; font-size: 13px; color: var(--c-text-2); line-height: 1.5; }
    }

    .ip-entries { display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; }
    .ip-entry {
      display: flex; align-items: stretch; border-radius: 12px; overflow: hidden;
      border: 1px solid var(--c-border-2);
      background: color-mix(in srgb, var(--ec) 5%, var(--c-card));
    }
    .ip-entry-bar { width: 4px; flex-shrink: 0; background: var(--ec); }
    .ip-entry-body { flex: 1; padding: 10px 12px; }
    .ip-entry-name { font-size: 14px; font-weight: 700; color: var(--c-text); }
    .ip-entry-cat  { font-size: 11px; color: var(--ec); font-weight: 600; margin-top: 1px; margin-bottom: 6px; }
    .ip-sets { display: flex; flex-wrap: wrap; gap: 5px; }
    .ip-set {
      padding: 3px 9px; border-radius: 20px; font-size: 12px; font-weight: 600;
      background: color-mix(in srgb, var(--ec) 12%, var(--c-card));
      color: color-mix(in srgb, var(--ec) 70%, var(--c-text));
      border: 1px solid color-mix(in srgb, var(--ec) 25%, transparent);
    }

    .ip-actions {
      display: flex; gap: 8px; justify-content: flex-end;
      padding: 12px 0 4px; border-top: 1px solid var(--c-border-2); margin-top: 4px;
    }
    .ip-cancel {
      height: 40px; padding: 0 18px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 14px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s;
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }
    .ip-save {
      height: 40px; padding: 0 20px; border-radius: 10px;
      border: none; background: var(--c-brand); color: white;
      font-size: 14px; font-weight: 700;
      cursor: pointer; display: flex; align-items: center; gap: 6px;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 17px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.7; cursor: not-allowed; }
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; display: inline-block; }
  `],
})
export class ImportPreviewComponent implements OnInit {
  readonly workout = input.required<ImportedWorkout>();
  readonly closed  = output<void>();
  readonly saved   = output<string>(); // emits the new workoutId

  readonly saving = signal(false);

  private exerciseService = inject(ExerciseService);
  private workoutService  = inject(WorkoutService);

  subtitle(): string {
    const w = this.workout();
    const parts: string[] = [];
    if (w.durationSecs) parts.push(`${Math.round(w.durationSecs / 60)}min`);
    if (w.calories)     parts.push(`${w.calories}kcal`);
    if (w.avgHR)        parts.push(`FC: ${w.avgHR}bpm`);
    return [w.date, ...parts].join(' · ');
  }

  catColor(cat: ExerciseCategory): string { return CAT_COLOR[cat]; }
  catLabel(cat: ExerciseCategory): string { return CAT_LABEL[cat]; }

  ngOnInit(): void {}

  async confirm(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    try {
      const w = this.workout();

      // Build full WorkoutEntry[] with sets, resolving exercise IDs
      const entries: WorkoutEntry[] = await Promise.all(
        w.entries.map(async imp => {
          const exerciseId = await this._getOrCreateExerciseId(imp.exerciseName, imp.category);
          const sets: WorkoutSet[] = imp.sets.map(s => ({ weight: s.weightKg, reps: s.reps }));
          return { exerciseId, exerciseName: imp.exerciseName, sets };
        })
      );

      const primaryCat = entries[0]
        ? this.exerciseService.getById(entries[0].exerciseId)?.category
        : undefined;

      const workoutId = await this.workoutService.createWorkoutWithEntries(
        w.date, entries, primaryCat,
      );

      this.saved.emit(workoutId);
      this.closed.emit();
    } finally {
      this.saving.set(false);
    }
  }

  private async _getOrCreateExerciseId(name: string, category: ExerciseCategory): Promise<string> {
    const existing = this.exerciseService.exercises().find(
      e => e.name.toLowerCase() === name.toLowerCase(),
    );
    if (existing) return existing.id;

    await this.exerciseService.create({ name, category });

    const created = this.exerciseService.exercises().find(
      e => e.name.toLowerCase() === name.toLowerCase(),
    );
    if (!created) throw new Error(`No s'ha pogut crear l'exercici: ${name}`);
    return created.id;
  }
}
