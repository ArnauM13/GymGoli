import { Component, computed, inject, input } from '@angular/core';

import { CATEGORY_COLORS, ExerciseCategory, SUBCATEGORY_LABELS } from '../../../core/models/exercise.model';
import { FeelingLevel, Workout, WorkoutEntry, WorkoutSet, setMaxWeight, setVolume } from '../../../core/models/workout.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { formatFeeling } from '../../utils/workout-card.utils';
import { kgToDisplay } from '../../utils/weight.utils';

/**
 * El desglossament d'un entrenament: exercicis, sèries, drop sets, PRs i notes.
 *
 * Viu apart de la targeta perquè la targeta és la mateixa a tot arreu i el
 * detall només s'obre on té sentit (Historial). Abans estava incrustat a la
 * pàgina d'Historial i no es podia reaprofitar.
 */
@Component({
  selector: 'app-workout-detail',
  standalone: true,
  template: `
    <div class="workout-detail">
      @for (entry of workout().entries; track entry.exerciseId) {
        <div class="entry-row" [style.--ec]="getEntryCatColor(entry)">
          <div class="entry-name-row">
            <span class="entry-cat-dot"></span>
            <span class="entry-name">{{ entry.exerciseName }}</span>
            @if (getEntrySubLabel(entry); as sub) {
              <span class="entry-sub-badge" [style.color]="getEntryCatColor(entry)"
                    [style.background]="'color-mix(in srgb, ' + getEntryCatColor(entry) + ' 12%, var(--c-card))'">{{ sub }}</span>
            }
            @if (entry.feeling) {
              <span class="entry-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
            }
          </div>
          @if (entry.sets.length > 0) {
            <div class="entry-sets-col">
              @for (set of entry.sets; track $index) {
                <div class="entry-set-line" [class.entry-set-line--max]="isMaxSet(entry, set)"
                     [class.entry-set-line--warmup]="set.warmup">
                  @if (set.warmup) {
                    <span class="esl-num esl-num--warmup material-symbols-outlined"
                          title="Sèrie d'escalfament">local_fire_department</span>
                  } @else {
                    <span class="esl-num">{{ workingSetNumber(entry, $index) }}</span>
                  }
                  <span class="esl-weight-group">
                    @if (set.weightLeft != null) {
                      <span class="esl-weight">E {{ dispW(set.weightLeft) }}<small>{{ unit() }}</small></span>
                      <span class="esl-weight">D {{ dispW(set.weightRight!) }}<small>{{ unit() }}</small></span>
                    } @else {
                      <span class="esl-weight">{{ dispW(set.weight) }}<small>{{ unit() }}</small></span>
                    }
                  </span>
                  <span class="esl-x">×</span>
                  <span class="esl-reps-group">
                    <span class="esl-reps">{{ set.reps }}</span>
                    @for (d of (set.drops ?? []); track $index) {
                      <span class="esl-drop-stage">
                        <span class="esl-drop-sep">→</span>
                        <span class="esl-weight drop">{{ dispW(d.weight) }}<small>{{ unit() }}</small></span>
                        <span class="esl-x">×</span>
                        <span class="esl-reps">{{ d.reps }}</span>
                      </span>
                    }
                  </span>
                  @if (isMaxSet(entry, set)) { <span class="esl-pr">PR</span> }
                </div>
              }
            </div>
          } @else {
            <span class="no-sets">Cap sèrie registrada</span>
          }
          @if (entry.notes) {
            <div class="entry-note">
              <span class="material-symbols-outlined entry-note-icon" aria-hidden="true">sticky_note_2</span>
              <span class="entry-note-text">{{ entry.notes }}</span>
            </div>
          }
        </div>
      }
      @if (workout().notes) {
        <div class="workout-notes">
          <span class="material-symbols-outlined" aria-hidden="true">notes</span>
          {{ workout().notes }}
        </div>
      }
      <div class="workout-volume-footer">
        <span>{{ workout().entries.length }} exercici{{ workout().entries.length !== 1 ? 's' : '' }}</span>
        <span class="wvf-sep">·</span>
        <span>{{ totalSets() }} sèries@if (totalWarmupSets(); as warm) { <span class="wvf-warmup">+{{ warm }} esc</span>}</span>
        <span class="wvf-sep">·</span>
        <span>{{ dispW(totalVolume()) }} {{ unit() }} volum</span>
      </div>
    </div>
  `,
  styles: [`
    .workout-detail {
      display: flex; flex-direction: column; gap: 8px;
      padding: 10px 12px 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--ac, var(--c-border-2)) 18%, var(--c-border-2));
      background: var(--c-card);
    }

    .entry-row {
      display: flex; flex-direction: column; gap: 8px;
      padding-bottom: 12px; border-bottom: 1px solid var(--c-border-2);
      &:last-child { border-bottom: none; padding-bottom: 0; }
    }
    .entry-name-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .entry-cat-dot { width: 4px; height: 16px; border-radius: 2px; flex-shrink: 0; background: var(--ec, var(--c-border)); }
    .entry-name { flex: 1; min-width: 0; font-size: 13px; font-weight: 700; color: var(--c-text); line-height: 1.25; }
    .entry-sub-badge {
      flex-shrink: 0; padding: 1px 6px; border-radius: 8px;
      font-size: 10px; font-weight: 600; line-height: 1.4;
    }
    .entry-feeling { font-size: 16px; line-height: 1; }

    .entry-sets-col { display: flex; flex-direction: column; gap: 2px; padding-left: 11px; }
    .entry-set-line {
      display: grid; grid-template-columns: 16px auto auto auto auto;
      justify-content: start; align-items: baseline; gap: 5px;
      padding: 3px 6px; border-radius: 6px; transition: background 0.15s;
    }
    .entry-set-line--max { background: color-mix(in srgb, var(--ec, var(--c-brand)) 8%, transparent); }
    .entry-set-line--warmup { opacity: 0.7; }
    .esl-num { font-size: 10px; font-weight: 700; color: var(--c-text-3); text-align: right; }
    .esl-num--warmup { font-size: 13px; color: #ff9800; font-variation-settings: 'FILL' 1, 'wght' 400; }
    .esl-weight {
      font-size: 13px; font-weight: 700; color: var(--c-text);
      small { font-size: 9px; font-weight: 400; color: var(--c-text-3); margin-left: 1px; }
    }
    .esl-x { font-size: 11px; color: var(--c-text-3); }
    .esl-reps { font-size: 12px; font-weight: 600; color: var(--c-text-2); }
    .esl-weight-group, .esl-reps-group { display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap; }
    .esl-drop-stage { display: inline-flex; align-items: baseline; gap: 5px; }
    .esl-weight.drop { font-size: 11px; font-weight: 600; opacity: 0.75; }
    .esl-drop-sep { font-size: 11px; color: var(--c-text-3); }
    .esl-pr {
      padding: 1px 6px; border-radius: 6px; line-height: 1.3;
      font-size: 9px; font-weight: 800; letter-spacing: 0.3px;
      color: #b88500; background: rgba(255, 193, 7, 0.18);
    }
    .entry-set-line--max .esl-weight { color: color-mix(in srgb, var(--ec, var(--c-brand)) 75%, var(--c-text)); }
    .no-sets { padding-left: 12px; font-size: 12px; color: var(--c-text-3); font-style: italic; }

    .entry-note {
      display: flex; align-items: flex-start; gap: 5px;
      margin-top: 4px; padding: 5px 8px; border-radius: 7px;
      background: rgba(var(--c-brand-rgb), 0.06);
    }
    .entry-note-icon { font-size: 13px; color: var(--c-brand); flex-shrink: 0; margin-top: 1px; }
    .entry-note-text { font-size: 12px; color: var(--c-text-2); font-style: italic; line-height: 1.4; }
    .workout-notes {
      display: flex; align-items: flex-start; gap: 6px;
      padding: 8px 10px; border-radius: 8px; background: var(--c-subtle);
      font-size: 12px; color: var(--c-text-2); font-style: italic;
      .material-symbols-outlined { font-size: 15px; color: var(--c-text-3); flex-shrink: 0; margin-top: 1px; }
    }
    .workout-volume-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap;
      padding-top: 2px; font-size: 11px; font-weight: 600; color: var(--c-text-3);
      .wvf-sep { color: var(--c-border-2); }
      .wvf-warmup { color: #ff9800; margin-left: 3px; }
    }
  `],
})
export class WorkoutDetailComponent {
  private exerciseService = inject(ExerciseService);
  private settingsService = inject(UserSettingsService);

  readonly workout = input.required<Workout>();

  readonly unit = this.settingsService.weightUnit;
  dispW(kg: number): number { return kgToDisplay(kg, this.unit()); }

  readonly totalSets = computed(() =>
    this.workout().entries.reduce((s, e) => s + e.sets.filter(set => !set.warmup).length, 0));

  readonly totalWarmupSets = computed(() =>
    this.workout().entries.reduce((s, e) => s + e.sets.filter(set => set.warmup).length, 0));

  readonly totalVolume = computed(() => {
    const bodyweightKg = this.settingsService.bodyweightKg();
    return Math.round(this.workout().entries.reduce((t, e) => {
      const ex  = this.exerciseService.getById(e.exerciseId);
      const ctx = { bodyweightKg, loadType: ex?.loadType, bodyweightFactor: ex?.bodyweightFactor };
      return t + e.sets.reduce((s, set) => set.warmup ? s : s + setVolume(set, ctx), 0);
    }, 0));
  });

  getFeelingEmoji(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  getEntryCategory(entry: WorkoutEntry): ExerciseCategory {
    return this.exerciseService.getById(entry.exerciseId)?.category ?? 'push';
  }

  getEntryCatColor(entry: WorkoutEntry): string {
    return CATEGORY_COLORS[this.getEntryCategory(entry)] ?? '#bbb';
  }

  getEntrySubLabel(entry: WorkoutEntry): string {
    const sub = this.exerciseService.getById(entry.exerciseId)?.subcategory;
    return sub ? (SUBCATEGORY_LABELS[sub] ?? sub) : '';
  }

  getMaxWeight(entry: WorkoutEntry): number {
    const workingSets = entry.sets.filter(s => !s.warmup);
    if (!workingSets.length) return 0;
    return Math.max(...workingSets.map(s => setMaxWeight(s)));
  }

  /** 1-based position of a working set within its entry (warm-ups skipped),
   *  matching the numbering used in the workout editor. */
  workingSetNumber(entry: WorkoutEntry, index: number): number {
    let n = 0;
    for (let i = 0; i <= index; i++) if (!entry.sets[i].warmup) n++;
    return n;
  }

  isMaxSet(entry: WorkoutEntry, set: WorkoutSet): boolean {
    if (set.warmup || entry.sets.length <= 1) return false;
    const max = this.getMaxWeight(entry);
    if (max === 0) return false;
    return entry.sets.some(s => setMaxWeight(s) !== max) && setMaxWeight(set) === max;
  }
}
