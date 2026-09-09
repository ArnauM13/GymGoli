import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { CATEGORY_COLORS, ExerciseCategory } from '../../../core/models/exercise.model';
import { Workout, WorkoutEntry, hasFullEntries, setMaxWeight } from '../../../core/models/workout.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { kgToDisplay } from '../../utils/weight.utils';

/**
 * L'ullada a un entrenament: què has fet a cada exercici, una línia per cap
 * —«4×8-12 · 80 kg»— dins la targeta desplegada del feed.
 *
 * És només això, una ullada. La lectura sencera —sèrie a sèrie, les notes, el
 * recompte— no viu aquí: obrir l'entrenament et porta a la seva pàgina, que és
 * l'editor en mode consulta. Un sol lloc on es llegeix un entrenament, i és el
 * mateix on s'escriu.
 *
 * És també on es demanen les sèries: de l'historial vell només se'n baixa el
 * resum que necessita la targeta, i desplegar-la és el moment en què les
 * sèries fan falta de debò. Mentre arriben, hi ha l'indicador de càrrega.
 */
@Component({
  selector: 'app-workout-detail',
  standalone: true,
  template: `
    <div class="workout-detail">
      @if (!isFull()) {
        <div class="wd-pending" role="status">
          @if (loadingEntries()) {
            <span class="wd-spinner" aria-hidden="true"></span>
            <span>Carregant les sèries…</span>
          } @else {
            <span class="material-symbols-outlined" aria-hidden="true">cloud_off</span>
            <span>Les sèries d'aquesta sessió necessiten connexió</span>
          }
        </div>
      } @else if (visibleEntries().length) {
        <div class="wd-sum-rows">
          @for (entry of visibleEntries(); track entry.exerciseId) {
            <div class="wd-sum-row" [style.--ec]="getEntryCatColor(entry)">
              <span class="entry-cat-dot"></span>
              <span class="wd-sum-name">{{ entry.exerciseName }}</span>
              <span class="wd-sum-val">{{ entrySummary(entry) }}</span>
            </div>
          }
        </div>
        @if (hiddenEntryCount(); as more) {
          <span class="wd-more">+{{ more }} exercici{{ more === 1 ? '' : 's' }} més</span>
        }
      } @else {
        <span class="no-sets">Cap exercici registrat</span>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* Viu plegat dins una targeta del feed: l'aire just, i la superfície de la
       targeta que l'aguanta separada del que hi ha a sobre per un filet. */
    .workout-detail {
      display: flex; flex-direction: column; gap: 8px;
      padding: 8px 12px 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--ac, var(--c-border-2)) 18%, var(--c-border-2));
      background: var(--c-card);
    }

    /* Mentre les sèries viatgen: una línia sola, de la mida d'una entrada,
     * perquè el desplegable no salti d'alçada quan arribin. */
    .wd-pending {
      display: flex; align-items: center; gap: 8px; min-height: 34px;
      font-size: 12px; font-weight: 600; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 16px; }
    }
    .wd-spinner {
      width: 14px; height: 14px; flex-shrink: 0; border-radius: 50%;
      border: 2px solid var(--c-border-2); border-top-color: var(--c-brand);
      animation: wd-spin 0.7s linear infinite;
    }
    @keyframes wd-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .wd-spinner { animation-duration: 2s; } }

    /* ── L'ullada: una línia per exercici ── */
    .wd-sum-rows { display: flex; flex-direction: column; gap: 2px; }
    .wd-sum-row {
      display: flex; align-items: center; gap: 7px;
      padding: 5px 6px; border-radius: 7px; min-height: 24px;
      &:nth-child(odd) { background: color-mix(in srgb, var(--ec, var(--c-subtle)) 5%, var(--c-subtle)); }
    }
    .wd-sum-name {
      flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* El que no hi cap, comptat: la ullada diu quants exercicis s'ha deixat i
       la pàgina de l'entrenament els diu tots. */
    .wd-more { padding-left: 6px; font-size: 11px; font-weight: 600; color: var(--c-text-3); }
    .wd-sum-val {
      flex-shrink: 0; font-size: 12.5px; font-weight: 700; color: var(--c-text); line-height: 1.3;
    }
    .no-sets { padding-left: 2px; font-size: 13px; color: var(--c-text-3); font-style: italic; }
  `],
})
export class WorkoutDetailComponent {
  private exerciseService = inject(ExerciseService);
  private settingsService = inject(UserSettingsService);
  private workoutService  = inject(WorkoutService);

  readonly workout = input.required<Workout>();

  /** Quants exercicis caben a una ullada abans que el desplegable deixi de
   *  ser-ho. La mateixa xifra que les dades d'una sessió d'esport. */
  static readonly COMPACT_ROWS = 5;

  /** Els exercicis que es pinten: els primers, i els que falten es compten. */
  readonly visibleEntries = computed((): WorkoutEntry[] =>
    this.workout().entries.slice(0, WorkoutDetailComponent.COMPACT_ROWS));

  readonly hiddenEntryCount = computed(() => this.workout().entries.length - this.visibleEntries().length);

  /** Cert quan la sessió porta les sèries. Fals mentre només en tenim el
   *  resum amb què s'ha pintat la targeta. */
  readonly isFull = computed(() => hasFullEntries(this.workout()));
  /** Cert mentre les sèries viatgen. */
  readonly loadingEntries = signal(false);

  constructor() {
    effect(() => {
      const w = this.workout();
      if (hasFullEntries(w)) { untracked(() => this.loadingEntries.set(false)); return; }
      untracked(() => {
        this.loadingEntries.set(true);
        this.workoutService.ensureWorkoutEntries(w.id)
          .finally(() => this.loadingEntries.set(false));
      });
    });
  }

  readonly unit = this.settingsService.weightUnit;
  dispW(kg: number): number { return kgToDisplay(kg, this.unit()); }

  /**
   * El que has fet a l'exercici, en quatre caràcters: «4×10 · 80 kg», o
   * «4×8-12 · 80 kg» quan les repeticions no van totes iguals.
   *
   * Les sèries d'escalfament no hi compten —no són la feina— i, si a
   * l'exercici no n'hi ha cap altra, es diu que només hi va haver escalfament.
   */
  entrySummary(entry: WorkoutEntry): string {
    const working = entry.sets.filter(s => !s.warmup);
    if (!working.length) return entry.sets.length ? `${entry.sets.length} esc` : 'Sense sèries';

    const reps = working.map(s => s.reps);
    const min  = Math.min(...reps);
    const max  = Math.max(...reps);
    const parts = [`${working.length}×${min === max ? min : `${min}-${max}`}`];

    const maxWeight = this.getMaxWeight(entry);
    if (maxWeight > 0) parts.push(`${this.dispW(maxWeight)} ${this.unit()}`);
    return parts.join(' · ');
  }

  getEntryCategory(entry: WorkoutEntry): ExerciseCategory {
    return this.exerciseService.getById(entry.exerciseId)?.category ?? 'push';
  }

  getEntryCatColor(entry: WorkoutEntry): string {
    return CATEGORY_COLORS[this.getEntryCategory(entry)] ?? '#bbb';
  }

  getMaxWeight(entry: WorkoutEntry): number {
    const workingSets = entry.sets.filter(s => !s.warmup);
    if (!workingSets.length) return 0;
    return Math.max(...workingSets.map(s => setMaxWeight(s)));
  }
}
