import { Component, booleanAttribute, inject, input, output, signal } from '@angular/core';

import { ActivityIconComponent } from '../activity-icon/activity-icon.component';
import { WorkoutDetailComponent } from '../workout-detail/workout-detail.component';
import { Sport, SportMetricDef, SportSession } from '../../../core/models/sport.model';
import { FeelingLevel, Workout } from '../../../core/models/workout.model';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FeedbackService } from '../../services/feedback.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import {
  ActivityStat,
  formatFeeling, isWorkoutPlanned, sportCardStats,
  workoutCardColor, workoutPrimaryColor, workoutPrimaryIcon, workoutSetsCount,
  workoutTypeLabel, workoutWarmupSetsCount,
  workoutVolumeFmt as workoutVolumeFmtUtil,
} from '../../utils/workout-card.utils';

export interface DayFeedEntry {
  date: string;
  workouts: Workout[];
  sports: { sport: Sport; session: SportSession }[];
}

/**
 * L'activitat d'un dia: entrenaments i esports, amb la mateixa targeta.
 *
 * Les dues activitats es llegeixen igual — barra de color, icona amb el gos,
 * títol que diu què és, detall i xifres — i només canvia el chevron i què
 * passa quan la toques: un entrenament s'obre (o es desplega a l'Historial),
 * un esport es desplega per editar-lo aquí mateix.
 */
@Component({
  selector: 'app-day-feed-cards',
  standalone: true,
  imports: [ActivityIconComponent, WorkoutDetailComponent],
  template: `
    @for (w of day()?.workouts ?? []; track w.id) {
      <div class="act-card" [class.act-card--planned]="isPlanned(w)"
           [class.expanded]="expandedWorkoutId() === w.id"
           [style.--ac]="workoutPrimaryColor(w)">
        <span class="ac-bar" [style.background]="workoutCardColor(w)" aria-hidden="true"></span>

        <div class="ac-head">
          <button class="ac-main" (click)="handleWorkoutClick(w)"
                  [attr.aria-expanded]="expandWorkouts() && !isPlanned(w) ? expandedWorkoutId() === w.id : null">
            <app-activity-icon [icon]="workoutPrimaryIcon(w)"
                               [color]="workoutPrimaryColor(w)" mascot="marley" />
            <div class="ac-info">
              <div class="ac-title-row">
                <span class="ac-title">{{ workoutTypeLabel(w) }}</span>
                @if (isPlanned(w)) { <span class="ac-tag">Planificat</span> }
                @if (w.notes?.trim(); as note) { <span class="ac-detail">{{ note }}</span> }
              </div>
              @if (!isPlanned(w)) {
                <div class="ac-stats">
                  <span class="ac-stat">
                    <span class="material-symbols-outlined" aria-hidden="true">fitness_center</span>
                    <strong>{{ w.entries.length }}</strong> exerc
                  </span>
                  @if (workoutSetsCount(w) || workoutWarmupSetsCount(w)) {
                    <span class="ac-stat-sep" aria-hidden="true">·</span>
                    <span class="ac-stat">
                      <span class="material-symbols-outlined" aria-hidden="true">repeat</span>
                      <strong>{{ workoutSetsCount(w) }}</strong> sèr
                      @if (workoutWarmupSetsCount(w); as warm) {
                        <span class="ac-stat-warmup">
                          +{{ warm }}<span class="material-symbols-outlined" aria-hidden="true">local_fire_department</span>
                        </span>
                      }
                    </span>
                  }
                  @if (!hideVolume() && workoutVolumeFmt(w); as vol) {
                    <span class="ac-stat-sep" aria-hidden="true">·</span>
                    <span class="ac-stat ac-stat--vol">
                      <span class="material-symbols-outlined" aria-hidden="true">weight</span>
                      <strong>{{ vol }}</strong>
                    </span>
                  }
                </div>
              }
            </div>
            <span class="ac-feeling">
              @if (w.feeling) { {{ emojiOf(w.feeling) }} }
            </span>
            @if (!isPlanned(w)) {
              <span class="material-symbols-outlined ac-chevron" aria-hidden="true">
                {{ expandWorkouts() ? (expandedWorkoutId() === w.id ? 'expand_less' : 'expand_more') : 'chevron_right' }}
              </span>
            }
          </button>

          @if (isPlanned(w)) {
            <div class="ac-actions">
              <button class="ac-act ac-act--del" (click)="deletePlan(w)"
                      aria-label="Eliminar planificació">
                <span class="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>
              <button class="ac-act ac-act--start" (click)="startPlan(w)" aria-label="Comença">
                <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
              </button>
            </div>
          }
        </div>

        @if (expandWorkouts() && expandedWorkoutId() === w.id && !isPlanned(w)) {
          <app-workout-detail [workout]="w" />
          <div class="ac-detail-actions">
            <button class="ac-open-btn" (click)="open.emit(w.id)">
              <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
              Obrir entrenament
            </button>
          </div>
        }
      </div>
    }

    @for (item of day()?.sports ?? []; track item.session.id) {
      <div class="act-card" [class.expanded]="expandedSportId() === item.session.id"
           [style.--ac]="item.sport.color">
        <span class="ac-bar" [style.background]="item.sport.color" aria-hidden="true"></span>

        <div class="ac-head">
          <button class="ac-main" (click)="toggleSportExpand(item)"
                  [attr.aria-expanded]="expandedSportId() === item.session.id">
            <app-activity-icon [icon]="item.sport.icon" [color]="item.sport.color" mascot="xoco" />
            <div class="ac-info">
              <div class="ac-title-row">
                <span class="ac-title">{{ item.sport.name }}</span>
                @if (sportSubtype(item); as sub) { <span class="ac-subtype">{{ sub }}</span> }
                @if (item.session.notes?.trim(); as note) { <span class="ac-detail">{{ note }}</span> }
              </div>
              @if (sportStats(item); as stats) {
                @if (stats.length) {
                  <div class="ac-stats">
                    @for (stat of stats; track stat.text; let i = $index) {
                      @if (i > 0) { <span class="ac-stat-sep" aria-hidden="true">·</span> }
                      <span class="ac-stat">
                        <span class="material-symbols-outlined" aria-hidden="true">{{ stat.icon }}</span>
                        <strong>{{ stat.text }}</strong>
                      </span>
                    }
                  </div>
                }
              }
            </div>
            <span class="ac-feeling">
              @if (item.session.feeling) { {{ emojiOf(item.session.feeling) }} }
            </span>
            <span class="material-symbols-outlined ac-chevron" aria-hidden="true">
              {{ expandedSportId() === item.session.id ? 'expand_less' : 'expand_more' }}
            </span>
          </button>
        </div>

        @if (expandedSportId() === item.session.id) {
          <div class="sport-detail">
            <!-- Durada -->
            <div class="sd-field">
              <span class="sd-field-label">Durada</span>
              <div class="sd-row">
                <div class="sd-quick-btns">
                  @for (t of durationPresets; track t) {
                    <button class="sd-quick-btn" [class.active]="editDuration() === t"
                            (click)="editDuration.set(t)">{{ t }}min</button>
                  }
                </div>
                <div class="sd-stepper">
                  <button class="sd-step-btn" (click)="adjustDuration(-5)">−5</button>
                  <span class="sd-step-val">{{ editDuration() }}<small>min</small></span>
                  <button class="sd-step-btn" (click)="adjustDuration(5)">+5</button>
                </div>
              </div>
            </div>

            <!-- Subtipus -->
            @if (item.sport.subtypes.length) {
              <div class="sd-field">
                <span class="sd-field-label">Subtipus</span>
                <div class="sd-chips">
                  @for (sub of item.sport.subtypes; track sub.id) {
                    <button class="sd-chip" [class.active]="editSubtype() === sub.id"
                            (click)="toggleSubtype(sub.id)">{{ sub.name }}</button>
                  }
                </div>
              </div>
            }

            <!-- Mètriques -->
            @for (def of item.sport.metricDefs; track def.key) {
              <div class="sd-field">
                <span class="sd-field-label">{{ def.label }}@if (def.unit) { <small>({{ def.unit }})</small> }</span>
                @if (def.type === 'select') {
                  <div class="sd-chips">
                    @for (opt of def.options ?? []; track opt.value) {
                      <button class="sd-chip"
                              [class.active]="editMetric(def.key) === opt.value"
                              (click)="setMetric(def.key, editMetric(def.key) === opt.value ? null : opt.value)">
                        {{ opt.label }}
                      </button>
                    }
                  </div>
                } @else {
                  <div class="sd-stepper">
                    <button class="sd-step-btn" (click)="adjustMetric(def, -1)">−</button>
                    <span class="sd-step-val">{{ editMetricNum(def) }}<small>@if (def.unit) { {{ def.unit }} }</small></span>
                    <button class="sd-step-btn" (click)="adjustMetric(def, 1)">+</button>
                  </div>
                }
              </div>
            }

            <!-- Sensació -->
            <div class="sd-field">
              <span class="sd-field-label">Sensació</span>
              <div class="sd-feeling-row">
                @for (level of feelingLevels; track level) {
                  <button class="sd-feeling-btn" [class.active]="editFeeling() === level"
                          (click)="toggleFeeling(level)">{{ emojiOf(level) }}</button>
                }
              </div>
            </div>

            <!-- Notes -->
            <div class="sd-field">
              <span class="sd-field-label">Notes</span>
              <textarea class="sd-notes"
                placeholder="Afegeix una nota opcional..."
                [value]="editNotes()"
                (input)="editNotes.set($any($event.target).value)"
                rows="2"
              ></textarea>
            </div>

            <div class="sd-actions">
              <button class="sd-delete-btn" [disabled]="editSaving()" (click)="deleteSportEdit(item)"
                      aria-label="Eliminar" title="Eliminar">
                <span class="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>
              <div class="sd-main-actions">
                <button class="sd-cancel" (click)="collapseSport()">Cancel·lar</button>
                <button class="sd-save" [disabled]="editSaving()" (click)="saveSportEdit(item)">Guardar</button>
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    /* ── Targeta d'activitat (la mateixa per a entrenaments i esports) ── */
    .act-card {
      position: relative; margin-bottom: 10px;
      border: 1.5px solid color-mix(in srgb, var(--ac, var(--c-border-2)) 34%, var(--c-border-2));
      border-radius: 14px; overflow: hidden;
      background: color-mix(in srgb, var(--ac, var(--c-card)) 6%, var(--c-card));
      box-shadow: 0 2px 8px var(--c-shadow);
      transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
      &:hover {
        box-shadow: 0 3px 12px var(--c-shadow-md);
        background: color-mix(in srgb, var(--ac, var(--c-card)) 10%, var(--c-card));
        border-color: color-mix(in srgb, var(--ac, var(--c-border)) 45%, var(--c-border));
      }
      &.expanded {
        box-shadow: 0 4px 16px var(--c-shadow-md);
        border-color: color-mix(in srgb, var(--ac, var(--c-border)) 55%, var(--c-border));
      }
    }
    .act-card--planned {
      border-style: dashed;
      border-color: color-mix(in srgb, var(--ac, var(--c-brand)) 55%, var(--c-border-2));
      background: color-mix(in srgb, var(--ac, var(--c-brand)) 5%, var(--c-card));
      &:hover { background: color-mix(in srgb, var(--ac, var(--c-brand)) 9%, var(--c-card)); }
    }
    .ac-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; }

    .ac-head { display: flex; align-items: stretch; }
    .ac-main {
      display: flex; align-items: center; gap: 13px; flex: 1; min-width: 0;
      padding: 13px 8px 13px 16px; border: none; background: transparent; text-align: left;
      cursor: pointer; touch-action: manipulation;
      &:focus-visible { outline: 2px solid var(--ac, var(--c-brand)); outline-offset: -3px; }
    }

    /* Dues línies i mai una tercera: identitat a dalt (títol, subtipus i
     * nota) i xifres a sota. L'alçada es reserva encara que la targeta porti
     * poca cosa, perquè totes les activitats d'un dia facin la mateixa mida. */
    .ac-info {
      flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;
      gap: 7px; min-height: 46px;
    }
    .ac-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .ac-title {
      flex: 0 1 auto; min-width: 0; font-size: 14px; font-weight: 800; line-height: 1.25;
      color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .ac-tag {
      display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
      padding: 1px 7px; border-radius: 8px;
      background: rgba(var(--c-brand-rgb), 0.12); color: var(--c-brand);
      font-size: 10px; font-weight: 700; letter-spacing: 0.2px; line-height: 1.5;
      .material-symbols-outlined { font-size: 12px; }
    }
    /* El subtipus és part de la identitat («Yoga · Vinyasa»), així que va al
     * costat del títol i no en una línia pròpia. */
    .ac-subtype {
      flex-shrink: 0; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      padding: 1px 7px; border-radius: 8px;
      background: color-mix(in srgb, var(--ac, var(--c-brand)) 14%, transparent);
      color: color-mix(in srgb, var(--ac, var(--c-brand)) 65%, var(--c-text));
      font-size: 10.5px; font-weight: 700; line-height: 1.5;
    }
    /* La fatiga té columna pròpia a la dreta, just abans del chevron: sempre
     * al mateix lloc, hi sigui o no, perquè les targetes s'alineïn entre elles. */
    .ac-feeling {
      flex-shrink: 0; width: 26px; text-align: center;
      font-size: 15px; font-weight: 700; line-height: 1.2; color: var(--c-text-2);
    }
    /* La nota va al costat del títol, no a sota: és el subtítol de
     * l'activitat i és la primera que cedeix amplada quan no hi cap tot. */
    .ac-detail {
      flex: 1 1 auto; min-width: 0;
      font-size: 11.5px; font-weight: 500; color: var(--c-text-2); line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* Sense embolcallar: una fila de xifres que envaeix una tercera línia
     * trencaria l'alçada de totes les targetes del dia. */
    .ac-stats {
      display: flex; align-items: center; gap: 8px; flex-wrap: nowrap;
      min-width: 0; overflow: hidden;
      font-size: 11.5px; font-weight: 500; color: var(--c-text-3);
    }
    .ac-stat {
      display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; white-space: nowrap;
      .material-symbols-outlined { font-size: 13px; color: color-mix(in srgb, var(--ac, var(--c-text-3)) 60%, var(--c-text-3)); }
      strong { font-weight: 700; color: var(--c-text-2); }
    }
    .ac-stat-warmup {
      display: inline-flex; align-items: center; gap: 1px; margin-left: 1px; color: #ff9800;
      .material-symbols-outlined { font-size: 12px; color: #ff9800; font-variation-settings: 'FILL' 1, 'wght' 400; }
    }
    .ac-stat-sep { flex-shrink: 0; color: var(--c-border); }
    .ac-stat--vol strong { color: var(--ac, var(--c-brand)); }
    .ac-chevron {
      flex-shrink: 0; margin-right: 6px; font-size: 21px; color: var(--c-text-3);
      transition: color 0.2s;
      .act-card.expanded & { color: color-mix(in srgb, var(--ac, var(--c-brand)) 70%, var(--c-text-2)); }
    }

    .ac-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; padding-right: 9px; }
    .ac-act {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 36px; height: 36px; border-radius: 10px;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
    }
    .ac-act--del {
      border: 1.5px solid var(--c-border-2); background: var(--c-card); color: var(--c-text-3);
      &:hover { background: rgba(239,83,80,0.1); color: #ef5350; border-color: rgba(239,83,80,0.3); }
    }
    .ac-act--start {
      border: none; background: var(--c-brand); color: white;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-brand-dk); }
    }

    .ac-detail-actions {
      display: flex; justify-content: flex-end;
      padding: 0 12px 10px; background: var(--c-card);
    }
    .ac-open-btn {
      display: inline-flex; align-items: center; gap: 5px;
      height: 34px; padding: 0 13px; border-radius: 10px;
      border: 1.5px solid color-mix(in srgb, var(--ac, var(--c-brand)) 45%, var(--c-border-2));
      background: color-mix(in srgb, var(--ac, var(--c-card)) 10%, var(--c-card));
      color: var(--c-text-2); font-size: 12.5px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: color-mix(in srgb, var(--ac, var(--c-card)) 15%, var(--c-card)); color: var(--c-text); }
    }

    /* ── Sport session inline edit panel ── */
    .sport-detail {
      padding: 4px 14px 14px; border-top: 1px solid var(--c-border-2);
      display: flex; flex-direction: column;
    }
    .sd-field { margin-top: 14px; }
    .sd-field-label {
      display: block; font-size: 11px; font-weight: 700; color: var(--c-text-2);
      letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 8px;
      small { font-size: 10px; color: var(--c-text-3); font-weight: 400; text-transform: none; margin-left: 4px; }
    }
    .sd-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .sd-quick-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .sd-quick-btn {
      padding: 6px 12px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sd-stepper { display: flex; align-items: center; gap: 6px; }
    .sd-step-btn {
      width: 32px; height: 32px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 14px; font-weight: 700; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sd-step-val {
      min-width: 50px; text-align: center;
      font-size: 16px; font-weight: 800; color: var(--c-text);
      small { font-size: 11px; color: var(--c-text-3); margin-left: 2px; }
    }
    .sd-chips { display: flex; gap: 7px; flex-wrap: wrap; }
    .sd-chip {
      padding: 7px 14px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sd-feeling-row { display: flex; gap: 8px; }
    .sd-feeling-btn {
      flex: 1; height: 40px; border-radius: 12px;
      border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      font-size: 20px; cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &.active { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.08); transform: scale(1.1); }
      &:hover:not(.active) { border-color: var(--c-border); background: var(--c-hover); }
    }
    .sd-notes {
      width: 100%; box-sizing: border-box;
      padding: 9px 12px; border: 1.5px solid var(--c-border); border-radius: 10px;
      font-size: 13px; font-family: inherit; color: var(--c-text); resize: none; background: var(--c-card);
      outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
      &::placeholder { color: var(--c-text-3); }
    }
    .sd-actions {
      display: flex; align-items: center; gap: 8px;
      margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--c-border-2);
    }
    .sd-delete-btn {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 38px; height: 38px; border-radius: 10px;
      border: 1.5px solid rgba(239,83,80,0.3); background: rgba(239,83,80,0.06);
      color: #ef5350;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(239,83,80,0.12); border-color: #ef5350; }
      &:disabled { opacity: 0.6; cursor: default; }
    }
    .sd-main-actions { display: flex; gap: 8px; flex: 1; justify-content: flex-end; }
    .sd-cancel {
      height: 38px; padding: 0 16px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }
    .sd-save {
      height: 38px; padding: 0 18px; border-radius: 10px; border: none;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700;
      cursor: pointer; transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.6; cursor: default; }
    }
  `],
})
export class DayFeedCardsComponent {
  private workoutService = inject(WorkoutService);
  private sportService    = inject(SportService);
  private settingsService = inject(UserSettingsService);
  private exerciseService = inject(ExerciseService);
  private feedback       = inject(FeedbackService);
  private confirmDialog   = inject(ConfirmDialogService);

  readonly day  = input<DayFeedEntry | null>(null);
  /** A l'Historial l'entrenament es desplega aquí mateix amb el desglossament
   *  de sèries; a Inici la targeta porta directament a l'entrenament. */
  readonly expandWorkouts = input(false, { transform: booleanAttribute });
  /** El volum és la xifra que menys es mira d'un cop d'ull i la que més
   *  amplada es menja; a Activitat recent, on les targetes s'apilen, se
   *  n'amaga. A la targeta del dia i a l'Historial s'hi queda. */
  readonly hideVolume = input(false, { transform: booleanAttribute });
  readonly open = output<string>();

  readonly durationPresets: number[] = [30, 45, 60, 90];
  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  readonly expandedSportId   = signal<string | null>(null);
  readonly expandedWorkoutId = signal<string | null>(null);
  readonly editSaving      = signal(false);
  readonly editDuration    = signal(60);
  readonly editSubtype     = signal<string | null>(null);
  readonly editFeeling     = signal<FeelingLevel | null>(null);
  readonly editMetrics     = signal<Record<string, string | number>>({});
  readonly editNotes       = signal('');

  readonly isPlanned          = isWorkoutPlanned;
  readonly workoutPrimaryColor = workoutPrimaryColor;
  readonly workoutPrimaryIcon  = workoutPrimaryIcon;

  readonly workoutCardColor    = workoutCardColor;
  readonly workoutTypeLabel    = workoutTypeLabel;
  readonly workoutSetsCount    = workoutSetsCount;
  readonly workoutWarmupSetsCount = workoutWarmupSetsCount;
  /** Bodyweight-aware total volume label (folds in the user's bodyweight for
   *  bodyweight/assisted exercises). */
  workoutVolumeFmt(w: Workout): string {
    return workoutVolumeFmtUtil(w, {
      bodyweightKg: this.settingsService.bodyweightKg(),
      loadTypeOf: this.exerciseService.loadTypeOf,
      bodyweightFactorOf: this.exerciseService.bodyweightFactorOf,
    });
  }

  emojiOf(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  /** El subtipus de la sessió, per a la xapa del costat del títol. */
  sportSubtype(item: { sport: Sport; session: SportSession }): string {
    if (!item.session.subtypeId) return '';
    return item.sport.subtypes.find(s => s.id === item.session.subtypeId)?.name ?? '';
  }

  sportStats(item: { sport: Sport; session: SportSession }): ActivityStat[] {
    return sportCardStats(item.session, item.sport);
  }

  handleWorkoutClick(w: Workout): void {
    if (this.isPlanned(w)) { this.startPlan(w); return; }
    if (this.expandWorkouts()) {
      this.expandedWorkoutId.update(id => id === w.id ? null : w.id);
      return;
    }
    this.open.emit(w.id);
  }

  async startPlan(w: Workout): Promise<void> {
    try {
      await this.workoutService.startPlannedWorkout(w.id);
      this.open.emit(w.id);
    } catch {
      this.feedback.error('Error en iniciar el pla', 2500);
    }
  }

  /** Deletes a planned workout straight from the feed — a plan behaves like
   *  any other workout, no need to go through the weekly planner. */
  async deletePlan(w: Workout): Promise<void> {
    const ok = await this.confirmDialog.confirm('Eliminar aquesta planificació?', {
      variant: 'danger', confirmLabel: 'Eliminar', cancelLabel: 'Cancel·lar',
    });
    if (!ok) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.feedback.success('Planificació eliminada', 2000);
    } catch {
      this.feedback.error('Error en eliminar', 2500);
    }
  }

  // ── Sport session inline expand/edit ────────────────────────────────────

  toggleSportExpand(item: { sport: Sport; session: SportSession }): void {
    if (this.expandedSportId() === item.session.id) { this.collapseSport(); return; }
    this.expandedSportId.set(item.session.id);
    this.editDuration.set(item.session.duration ?? 60);
    this.editSubtype.set(item.session.subtypeId ?? null);
    this.editFeeling.set(item.session.feeling ?? null);
    this.editMetrics.set({ ...(item.session.metrics ?? {}) });
    this.editNotes.set(item.session.notes ?? '');
  }

  collapseSport(): void {
    this.expandedSportId.set(null);
  }

  editMetric(key: string): string | number | null {
    return this.editMetrics()[key] ?? null;
  }

  editMetricNum(def: SportMetricDef): number {
    const v = this.editMetrics()[def.key];
    return typeof v === 'number' ? v : (def.min ?? 0);
  }

  adjustMetric(def: SportMetricDef, delta: number): void {
    const step = def.step ?? 1;
    const next = Math.max(def.min ?? 0, Math.min(def.max ?? 9999, this.editMetricNum(def) + delta * step));
    this.editMetrics.update(m => ({ ...m, [def.key]: next }));
  }

  setMetric(key: string, value: string | number | null): void {
    this.editMetrics.update(m => {
      const copy = { ...m };
      if (value === null) delete copy[key]; else copy[key] = value;
      return copy;
    });
  }

  toggleSubtype(id: string): void {
    this.editSubtype.update(v => v === id ? null : id);
  }

  adjustDuration(delta: number): void {
    this.editDuration.update(v => Math.max(5, v + delta));
  }

  toggleFeeling(level: FeelingLevel): void {
    this.editFeeling.update(v => v === level ? null : level);
  }

  async saveSportEdit(item: { sport: Sport; session: SportSession }): Promise<void> {
    this.editSaving.set(true);
    try {
      const metrics = this.editMetrics();
      await this.sportService.updateSession(item.session.id, item.session.date, {
        subtypeId: this.editSubtype() ?? undefined,
        duration:  this.editDuration() || undefined,
        feeling:   this.editFeeling() ?? undefined,
        metrics:   Object.keys(metrics).length ? metrics : undefined,
        notes:     this.editNotes().trim() || undefined,
      });
      this.collapseSport();
    } catch {
      this.feedback.error('Error en guardar', 2500);
    } finally {
      this.editSaving.set(false);
    }
  }

  async deleteSportEdit(item: { sport: Sport; session: SportSession }): Promise<void> {
    this.editSaving.set(true);
    try {
      await this.sportService.deleteSession(item.session.id, item.session.date);
      this.collapseSport();
    } catch {
      this.feedback.error('Error en eliminar', 2500);
    } finally {
      this.editSaving.set(false);
    }
  }
}
