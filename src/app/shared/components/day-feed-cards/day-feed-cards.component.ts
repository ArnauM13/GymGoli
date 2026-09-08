import { Component, booleanAttribute, inject, input, output, signal } from '@angular/core';

import { ActivityIconComponent } from '../activity-icon/activity-icon.component';
import { SportDetailComponent } from '../sport-detail/sport-detail.component';
import { WorkoutDetailComponent } from '../workout-detail/workout-detail.component';
import { Sport, SportSession } from '../../../core/models/sport.model';
import { FeelingLevel, Workout } from '../../../core/models/workout.model';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { TodayService } from '../../../core/services/today.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FeedbackService } from '../../services/feedback.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import {
  ActivityStat,
  formatFeeling, isWorkoutPlanned, sportCardStats,
  workoutCardColor, workoutExerciseCount, workoutPrimaryColor, workoutPrimaryIcon,
  workoutSetsCount, workoutTypeLabel, workoutWarmupSetsCount,
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
 * títol que diu què és, detall i xifres — i es comporten igual: tocar-les
 * desplega el detall aquí mateix (les sèries d'un entrenament, les dades
 * d'una sessió d'esport) i, a sota, un botó porta a l'activitat sencera.
 */
@Component({
  selector: 'app-day-feed-cards',
  standalone: true,
  imports: [ActivityIconComponent, SportDetailComponent, WorkoutDetailComponent],
  template: `
    @for (w of day()?.workouts ?? []; track w.id) {
      <div class="act-card" [class.act-card--planned]="isPlanned(w)"
           [class.expanded]="expandedWorkoutId() === w.id"
           [style.--ac]="workoutPrimaryColor(w)">
        <span class="ac-bar" [style.background]="workoutCardColor(w)" aria-hidden="true"></span>

        <div class="ac-head">
          <button class="ac-main" (click)="handleWorkoutClick(w)"
                  [attr.aria-expanded]="isPlanned(w) ? null : expandedWorkoutId() === w.id">
            <app-activity-icon [icon]="workoutPrimaryIcon(w)"
                               [color]="workoutPrimaryColor(w)" mascot="marley" />
            <div class="ac-info">
              <div class="ac-title-row">
                <span class="ac-title">{{ workoutTypeLabel(w) }}</span>
                @if (w.notes?.trim(); as note) { <span class="ac-detail">{{ note }}</span> }
              </div>
              @if (!isPlanned(w)) {
                <!-- Les xifres surten igual porti les sèries o només el resum:
                     el servidor les compta amb la mateixa matemàtica (vegeu
                     workoutSetsCount i la migració 031), i per això una
                     targeta plegada ja no necessita baixar-se cap sèrie. -->
                <div class="ac-stats">
                  <span class="ac-stat">
                    <span class="material-symbols-outlined" aria-hidden="true">fitness_center</span>
                    <strong>{{ workoutExerciseCount(w) }}</strong> exerc
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
                {{ expandedWorkoutId() === w.id ? 'expand_less' : 'expand_more' }}
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

        @if (expandedWorkoutId() === w.id && !isPlanned(w)) {
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
      <div class="act-card" [class.act-card--planned]="isSportPlanned(item)"
           [class.expanded]="expandedSportId() === item.session.id"
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

          @if (isSportPlanned(item)) {
            <div class="ac-actions">
              <button class="ac-act ac-act--del" (click)="deleteSportPlan(item)"
                      aria-label="Eliminar planificació">
                <span class="material-symbols-outlined" aria-hidden="true">delete</span>
              </button>
              <!-- Un pla de demà encara no es pot haver fet: el botó de
                   registrar només surt quan el dia ja ha arribat. -->
              @if (item.session.date <= today()) {
                <button class="ac-act ac-act--start" (click)="registerSportPlan(item)"
                        aria-label="Registrar">
                  <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                </button>
              }
            </div>
          }
        </div>

        @if (expandedSportId() === item.session.id) {
          <app-sport-detail [sport]="item.sport" [session]="item.session" compact />
          <div class="ac-detail-actions">
            <button class="ac-open-btn" (click)="openSport.emit(item)">
              <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
              Obrir sessió
            </button>
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
      display: flex; align-items: center; gap: 11px; flex: 1; min-width: 0;
      padding: 13px 6px 13px 14px; border: none; background: transparent; text-align: left;
      cursor: pointer; touch-action: manipulation;
      &:focus-visible { outline: 2px solid var(--ac, var(--c-brand)); outline-offset: -3px; }
    }

    /* Identitat a dalt (títol, subtipus i nota) i xifres a sota. L'alçada
     * mínima es reserva encara que la targeta porti poca cosa, perquè totes
     * les activitats d'un dia facin la mateixa mida; només creix si les
     * xifres no caben en una línia. */
    .ac-info {
      flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;
      gap: 7px; min-height: 46px;
    }
    .ac-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .ac-title {
      flex: 0 1 auto; min-width: 0; font-size: 14px; font-weight: 800; line-height: 1.25;
      color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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
      flex-shrink: 0; width: 22px; text-align: center;
      font-size: 15px; font-weight: 700; line-height: 1.2; color: var(--c-text-2);
    }
    /* La nota va al costat del títol, no a sota: és el subtítol de
     * l'activitat i és la primera que cedeix amplada quan no hi cap tot. */
    .ac-detail {
      flex: 1 1 auto; min-width: 0;
      font-size: 11.5px; font-weight: 500; color: var(--c-text-2); line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* Xifres juntes: el mateix aire que a la barra d'entrenament, prou
     * estret perquè les tres d'un entrenament (exercicis, sèries i volum)
     * càpiguen d'una tirada. Si un esport en porta més, embolcallen a la
     * línia següent en comptes de quedar tallades a mitges. */
    .ac-stats {
      display: flex; align-items: center; column-gap: 4px; row-gap: 2px; flex-wrap: wrap;
      min-width: 0;
      font-size: 11px; font-weight: 500; color: var(--c-text-3);
    }
    .ac-stat {
      display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; white-space: nowrap;
      .material-symbols-outlined { font-size: 11px; color: color-mix(in srgb, var(--ac, var(--c-text-3)) 60%, var(--c-text-3)); }
      strong { font-weight: 700; color: var(--c-text-2); }
    }
    .ac-stat-warmup {
      display: inline-flex; align-items: center; gap: 1px; margin-left: 1px; color: #ff9800;
      .material-symbols-outlined { font-size: 11px; color: #ff9800; font-variation-settings: 'FILL' 1, 'wght' 400; }
    }
    .ac-stat-sep { flex-shrink: 0; color: var(--c-border); }
    .ac-stat--vol strong { color: var(--ac, var(--c-brand)); }
    .ac-chevron {
      flex-shrink: 0; margin-right: 4px; font-size: 20px; color: var(--c-text-3);
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

  `],
})
export class DayFeedCardsComponent {
  private workoutService = inject(WorkoutService);
  private sportService    = inject(SportService);
  private settingsService = inject(UserSettingsService);
  private exerciseService = inject(ExerciseService);
  private feedback       = inject(FeedbackService);
  private confirmDialog   = inject(ConfirmDialogService);

  /** El dia d'avui com a senyal: la targeta d'un pla canvia sola a mitjanit. */
  readonly today = inject(TodayService).today;

  readonly day  = input<DayFeedEntry | null>(null);
  /** El volum és la xifra que menys es mira d'un cop d'ull i la que més
   *  amplada es menja; a Activitat recent, on les targetes s'apilen, se
   *  n'amaga. A la targeta del dia i a l'Historial s'hi queda. */
  readonly hideVolume = input(false, { transform: booleanAttribute });
  /** Obrir l'entrenament desplegat, a la pàgina d'Entrenar. */
  readonly open = output<string>();
  /** El mateix per a una sessió d'esport: la targeta només la llegeix, i
   *  canviar-hi res passa per la pàgina que la sap registrar. */
  readonly openSport = output<{ sport: Sport; session: SportSession }>();

  readonly expandedSportId   = signal<string | null>(null);
  readonly expandedWorkoutId = signal<string | null>(null);

  readonly isPlanned          = isWorkoutPlanned;
  readonly workoutExerciseCount = workoutExerciseCount;
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

  /** Un esport encara per fer, igual que un entrenament planificat: es
   *  llegeix com un pla (xapa i vora discontínua), no com una sessió feta. */
  isSportPlanned(item: { session: SportSession }): boolean {
    return item.session.status === 'planned';
  }

  /** Registra el pla tal com estava previst — la durada i el subtipus que ja
   *  portava passen a comptar com a fets. Per canviar-ne res, la sessió
   *  s'obre des del seu detall. */
  async registerSportPlan(item: { sport: Sport; session: SportSession }): Promise<void> {
    try {
      await this.sportService.startPlannedSession(item.session.id, item.session.date);
      this.feedback.success(`${item.sport.name} registrat`, 2000);
    } catch {
      this.feedback.error('Error en registrar', 2500);
    }
  }

  async deleteSportPlan(item: { sport: Sport; session: SportSession }): Promise<void> {
    const ok = await this.confirmDialog.confirm('Eliminar aquesta planificació?', {
      variant: 'danger', confirmLabel: 'Eliminar', cancelLabel: 'Cancel·lar',
    });
    if (!ok) return;
    try {
      await this.sportService.deleteSession(item.session.id, item.session.date);
      this.feedback.success('Planificació eliminada', 2000);
    } catch {
      this.feedback.error('Error en eliminar', 2500);
    }
  }

  handleWorkoutClick(w: Workout): void {
    if (this.isPlanned(w)) { this.startPlan(w); return; }
    this.expandedWorkoutId.update(id => id === w.id ? null : w.id);
  }

  async startPlan(w: Workout): Promise<void> {
    try {
      // Un planificat de la rutina no és cap fila fins que el comences: el
      // que s'obre és l'entrenament que s'acaba de crear, no el projectat.
      const id = await this.workoutService.startPlannedWorkout(w.id);
      this.open.emit(id);
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

  // ── Sport session expand ────────────────────────────────────────────────

  /** Tocar la targeta desplega el detall de la sessió, igual que un
   *  entrenament. Canviar-hi res és un pas a part, a la seva pàgina. */
  toggleSportExpand(item: { sport: Sport; session: SportSession }): void {
    this.expandedSportId.update(id => id === item.session.id ? null : item.session.id);
  }

  collapseSport(): void {
    this.expandedSportId.set(null);
  }
}
