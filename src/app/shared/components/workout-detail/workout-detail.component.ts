import { Component, booleanAttribute, computed, effect, inject, input, signal, untracked } from '@angular/core';

import { CATEGORY_COLORS, ExerciseCategory, SUBCATEGORY_LABELS } from '../../../core/models/exercise.model';
import { FeelingLevel, Workout, WorkoutEntry, WorkoutSet, hasFullEntries, setMaxWeight, setVolume } from '../../../core/models/workout.model';
import { ExerciseService } from '../../../core/services/exercise.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { formatFeeling } from '../../utils/workout-card.utils';
import { kgToDisplay } from '../../utils/weight.utils';

/**
 * El desglossament d'un entrenament: exercicis, sèries, drop sets, PRs i notes.
 *
 * És el germà de `app-sport-detail` i es llegeix igual que ell. Els exercicis
 * són les úniques targetes que hi ha —van soltes, sense cap bloc que les
 * empaqueti totes— i el que no és cap exercici (com va anar el dia, el
 * recompte) va a part, amb la forma que hi posa una sessió d'esport: files
 * etiqueta → valor, la nota amb el seu filet i un peu que situa.
 *
 * Té dues mides. Plegat dins una targeta del feed (`compact`) és una ullada:
 * una línia per exercici amb el que hi has fet —«4×8-12 · 80 kg»— i prou. La
 * sencera, a la pàgina de l'entrenament, ensenya sèrie a sèrie. Abans només
 * hi havia la sencera, i el desplegable d'una targeta acabava sent tan llarg
 * com la pàgina.
 *
 * És també on es demanen les sèries: de l'historial vell només se'n baixa el
 * resum que necessita la targeta, i obrir el detall és el moment en què les
 * sèries fan falta de debò. Mentre arriben, hi ha l'indicador de càrrega.
 */
@Component({
  selector: 'app-workout-detail',
  standalone: true,
  template: `
    <div class="workout-detail" [class.workout-detail--compact]="compact()">
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
      } @else if (compact()) {

        <!-- ── Una ullada: què has fet a cada exercici ── -->
        @if (visibleEntries().length) {
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

      } @else {

        <!-- ── Els exercicis, sèrie a sèrie ──
             Cada exercici és una targeta pròpia (la mateixa forma que
             l'item-card, barra de color a l'esquerra) en comptes d'una fila
             més dins una llista contínua: així es distingeix d'un cop d'ull
             on acaba un exercici i comença el següent. Van directes, sense
             cap bloc al voltant: aquí no hi ha res més que els exercicis. -->
        @if (workout().entries.length) {
          @for (entry of workout().entries; track entry.exerciseId) {
            <div class="entry-card" [style.--ec]="getEntryCatColor(entry)">
              <div class="entry-bar"></div>
              <div class="entry-body">
                <div class="entry-name-row">
                  <span class="entry-name">{{ entry.exerciseName }}</span>
                  @if (getEntrySubLabel(entry); as sub) {
                    <span class="entry-sub-badge" [style.color]="getEntryCatColor(entry)"
                          [style.background]="'color-mix(in srgb, ' + getEntryCatColor(entry) + ' 12%, var(--c-card))'">{{ sub }}</span>
                  }
                  @if (entry.feeling) {
                    <span class="entry-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
                  }
                  <!-- El resum de l'exercici al costat del nom: el que en
                       diries en veu alta abans d'entrar a mirar sèrie a sèrie. -->
                  <span class="entry-sum">{{ entrySummary(entry) }}</span>
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
            </div>
          }
        } @else {
          <span class="no-sets">Cap exercici registrat</span>
        }

        <!-- ── El que no és cap exercici ──
             Com va anar el dia i el recompte no són cap targeta d'exercici:
             van a part, amb la mateixa forma que el detall d'una sessió
             d'esport —titolet, files etiqueta → valor, la nota amb el seu
             filet i un peu que resumeix. -->
        <section class="wd-extra">
          @if (workout().feeling || workout().notes?.trim()) {
            <div class="wd-block">
              <span class="wd-block-title">Com ha anat</span>
              @if (workout().feeling; as feeling) {
                <div class="wd-rows">
                  <div class="wd-row">
                    <div class="wd-row-main">
                      <span class="material-symbols-outlined wd-icon" aria-hidden="true">mood</span>
                      <span class="wd-label">Sensació</span>
                      <span class="wd-value">{{ getFeelingEmoji(feeling) }}</span>
                    </div>
                  </div>
                </div>
              }
              @if (workout().notes?.trim(); as note) {
                <div class="wd-notes">
                  <span class="material-symbols-outlined" aria-hidden="true">notes</span>
                  <span class="wd-notes-text">{{ note }}</span>
                </div>
              }
            </div>
          }

          <div class="wd-footer">
            <span>{{ workout().entries.length }} exercici{{ workout().entries.length === 1 ? '' : 's' }}</span>
            <span class="wdf-sep" aria-hidden="true">·</span>
            <span>{{ totalSets() }} sèries@if (totalWarmupSets(); as warm) { <span class="wdf-warmup">+{{ warm }} esc</span>}</span>
            <span class="wdf-sep" aria-hidden="true">·</span>
            <span>{{ dispW(totalVolume()) }} {{ unit() }} volum</span>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* A la pàgina, el detall no és cap targeta: les targetes són els
       exercicis, i van soltes sobre el fons de la pàgina. La superfície de
       targeta (fons i vora de dalt) només la porta el desplegable del feed,
       que sí que viu dins una. */
    .workout-detail { display: flex; flex-direction: column; gap: 12px; }

    /* Mentre les sèries viatgen, a la pàgina l'espera és una targeta més;
       plegat dins el feed, una línia i prou. */
    .workout-detail:not(.workout-detail--compact) .wd-pending {
      padding: 14px 16px; border-radius: 14px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
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

    /* Un exercici, una targeta: mateixa forma que l'item-card (barra de
       color a l'esquerra, contingut a la dreta) perquè cada exercici es
       distingeixi del següent sense haver de llegir-se'ls tots seguits.
       Van directes, un darrere l'altre: els separa el gap del contenidor,
       sense cap llista que els embolcalli. */
    .entry-card {
      display: flex; align-items: stretch;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden;
    }
    .entry-bar { width: 5px; flex-shrink: 0; background: var(--ec, var(--c-border)); }
    .entry-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; }

    .entry-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .entry-name { flex: 1; min-width: 0; font-size: 15px; font-weight: 800; color: var(--c-text); line-height: 1.3; }
    .entry-sub-badge {
      flex-shrink: 0; padding: 2px 7px; border-radius: 8px;
      font-size: 11px; font-weight: 600; line-height: 1.4;
    }
    .entry-feeling { font-size: 18px; line-height: 1; }
    .entry-sum { flex-shrink: 0; font-size: 13px; font-weight: 700; color: var(--c-text-2); }

    .entry-sets-col { display: flex; flex-direction: column; }
    .entry-set-line {
      display: grid; grid-template-columns: 22px auto auto auto auto;
      justify-content: start; align-items: baseline; gap: 8px;
      padding: 8px 6px; border-bottom: 1px solid var(--c-border-2); transition: background 0.15s;
      &:last-child { border-bottom: none; padding-bottom: 4px; }
      &:nth-child(odd) { background: color-mix(in srgb, var(--ec, var(--c-subtle)) 4%, transparent); }
    }
    .entry-set-line--max { background: color-mix(in srgb, var(--ec, var(--c-brand)) 10%, transparent); }
    .entry-set-line--warmup { opacity: 0.7; }
    .esl-num { font-size: 12px; font-weight: 700; color: var(--c-text-3); text-align: right; }
    .esl-num--warmup { font-size: 15px; color: #ff9800; font-variation-settings: 'FILL' 1, 'wght' 400; }
    .esl-weight {
      font-size: 15px; font-weight: 800; color: var(--c-text);
      small { font-size: 10px; font-weight: 500; color: var(--c-text-3); margin-left: 1px; }
    }
    .esl-x { font-size: 12px; color: var(--c-text-3); }
    .esl-reps { font-size: 14px; font-weight: 700; color: var(--c-text-2); }
    .esl-weight-group, .esl-reps-group { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; }
    .esl-drop-stage { display: inline-flex; align-items: baseline; gap: 6px; }
    .esl-weight.drop { font-size: 12px; font-weight: 600; opacity: 0.75; }
    .esl-drop-sep { font-size: 12px; color: var(--c-text-3); }
    .esl-pr {
      padding: 2px 7px; border-radius: 6px; line-height: 1.3;
      font-size: 10px; font-weight: 800; letter-spacing: 0.3px;
      color: #b88500; background: rgba(255, 193, 7, 0.18);
    }
    .entry-set-line--max .esl-weight { color: color-mix(in srgb, var(--ec, var(--c-brand)) 75%, var(--c-text)); }
    .no-sets { padding-left: 2px; font-size: 13px; color: var(--c-text-3); font-style: italic; }

    .entry-note {
      display: flex; align-items: flex-start; gap: 6px;
      margin-top: 2px; padding: 7px 10px; border-radius: 8px;
      background: rgba(var(--c-brand-rgb), 0.06);
    }
    .entry-note-icon { font-size: 14px; color: var(--c-brand); flex-shrink: 0; margin-top: 1px; }
    .entry-note-text { font-size: 13px; color: var(--c-text-2); font-style: italic; line-height: 1.45; }

    /* ── El context, com al detall d'una sessió d'esport ──
       Tot el que no és un exercici (com ha anat, el recompte) va junt en una
       superfície pròpia, la mateixa que corona el detall d'un esport: així no
       es confon amb cap exercici i es llegeix igual a totes dues activitats. */
    .wd-extra {
      display: flex; flex-direction: column; gap: 12px;
      margin-top: 4px; padding: 12px 14px; border-radius: 16px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .wd-block { display: flex; flex-direction: column; gap: 6px; }
    .wd-block-title {
      font-size: 10.5px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px;
    }
    .wd-rows { display: flex; flex-direction: column; gap: 2px; }
    .wd-row {
      display: flex; flex-direction: column; gap: 3px;
      padding: 5px 6px; border-radius: 7px;
      &:nth-child(odd) { background: color-mix(in srgb, var(--ac, var(--c-subtle)) 5%, var(--c-subtle)); }
    }
    .wd-row-main { display: flex; align-items: center; gap: 7px; min-height: 20px; }
    .wd-icon {
      flex-shrink: 0; font-size: 14px;
      color: color-mix(in srgb, var(--ac, var(--c-text-3)) 60%, var(--c-text-3));
    }
    .wd-label {
      flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .wd-value {
      flex-shrink: 0; max-width: 62%; text-align: right;
      font-size: 13px; font-weight: 700; color: var(--c-text); line-height: 1.3;
    }
    /* La nota del dia, amb la forma de subcomentari d'un esport: filet a
       l'esquerra i veu baixa. */
    .wd-notes {
      display: flex; align-items: flex-start; gap: 7px;
      padding: 8px 10px; border-radius: 8px; background: var(--c-subtle);
      border-left: 3px solid color-mix(in srgb, var(--ac, var(--c-border)) 45%, var(--c-border-2));
      font-size: 12px; color: var(--c-text-2); line-height: 1.45;
      .material-symbols-outlined { font-size: 15px; color: var(--c-text-3); flex-shrink: 0; margin-top: 1px; }
    }
    .wd-notes-text { flex: 1; min-width: 0; font-style: italic; overflow-wrap: anywhere; }

    .wd-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap;
      padding-top: 2px; font-size: 11px; font-weight: 600; color: var(--c-text-3);
      .wdf-sep { color: var(--c-border-2); }
      .wdf-warmup { color: #ff9800; margin-left: 3px; }
    }

    /* Plegat dins una targeta del feed: només la llista curta, amb l'aire
       just, i la superfície de la targeta que l'aguanta. El que hi ha a sota
       (les notes, el peu, sèrie a sèrie) ja té la seva pàgina. */
    .workout-detail--compact {
      gap: 8px; padding: 8px 12px 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--ac, var(--c-border-2)) 18%, var(--c-border-2));
      background: var(--c-card);
    }
  `],
})
export class WorkoutDetailComponent {
  private exerciseService = inject(ExerciseService);
  private settingsService = inject(UserSettingsService);
  private workoutService  = inject(WorkoutService);

  readonly workout = input.required<Workout>();

  /** Plegat dins una targeta del feed: una línia pels primers exercicis amb
   *  el que hi has fet, i res més —ni sèrie a sèrie, ni notes, ni sensació, ni
   *  peu, que ja són a la targeta o a la pàgina. El desplegable és una ullada;
   *  qui vulgui la lectura sencera obre l'entrenament. És la mateixa regla que
   *  a `app-sport-detail`. */
  readonly compact = input(false, { transform: booleanAttribute });

  /** Quants exercicis caben a una ullada abans que el desplegable deixi de
   *  ser-ho. La mateixa xifra que les dades d'una sessió d'esport. */
  static readonly COMPACT_ROWS = 5;

  /** Els exercicis que es pinten: tots a la pàgina, els primers al desplegable. */
  readonly visibleEntries = computed((): WorkoutEntry[] =>
    this.compact()
      ? this.workout().entries.slice(0, WorkoutDetailComponent.COMPACT_ROWS)
      : this.workout().entries);

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
