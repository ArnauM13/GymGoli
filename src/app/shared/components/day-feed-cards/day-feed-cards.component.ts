import { Component, booleanAttribute, computed, inject, input, output, signal } from '@angular/core';

import { ActivityCardComponent } from '../activity-card/activity-card.component';
import { SportDetailComponent } from '../sport-detail/sport-detail.component';
import { WorkoutDetailComponent } from '../workout-detail/workout-detail.component';
import { Sport, SportSession } from '../../../core/models/sport.model';
import { FeelingLevel, Workout } from '../../../core/models/workout.model';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { SessionGroupService } from '../../../core/services/session-group.service';
import { TodayService } from '../../../core/services/today.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FeedbackService } from '../../services/feedback.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import {
  ActivityStat,
  formatFeeling, isWorkoutPlanned, sportCardStats,
  workoutCardColor, workoutCardStats, workoutPrimaryColor, workoutPrimaryIcon, workoutTypeLabel,
} from '../../utils/workout-card.utils';
import {
  ActivityItem, SessionGroup, activityOf, groupDayFeed, groupIcons, groupTitle, splitLine,
} from '../../utils/session-group.utils';

export interface DayFeedEntry {
  date: string;
  workouts: Workout[];
  sports: { sport: Sport; session: SportSession }[];
}

/**
 * L'activitat d'un dia: entrenaments i esports, amb la mateixa targeta.
 *
 * Les dues activitats es llegeixen igual —`app-activity-card`, la targeta
 * compartida— i es comporten igual: tocar-les desplega el detall aquí mateix
 * (una ullada curta: les xifres i poc més) i, a sota, un botó porta a
 * l'activitat sencera, que és on es llegeix del tot i es canvia.
 */
@Component({
  selector: 'app-day-feed-cards',
  standalone: true,
  imports: [ActivityCardComponent, SportDetailComponent, WorkoutDetailComponent],
  template: `
    @for (group of groups(); track group.key) {
      <div class="sg" [class.sg--grouped]="group.grouped">

        <!-- Una sessió amb més d'una activitat es llegeix com una de sola: la
             capçalera diu de què està feta i les targetes queden a dins. Amb una
             sola activitat no hi ha capçalera ni caixa — es pinta com sempre. -->
        @if (group.grouped) {
          <div class="sg-head">
            <span class="sg-icons" aria-hidden="true">
              @for (ic of groupIcons(group); track $index) {
                <span class="material-symbols-outlined sg-icon" [style.color]="ic.color">{{ ic.icon }}</span>
              }
            </span>
            <span class="sg-title">{{ groupTitle(group) }}</span>
            <span class="sg-count">{{ groupCount(group) }}</span>
          </div>
        }

        <!-- Les activitats van per ordre cronològic —la que s'ha fet abans,
             abans—, i per això les dues menes es pinten al mateix bucle: una
             cursa del matí ha de sortir per davant del gimnàs de la tarda
             encara que siguin de taules diferents. -->
        @for (item of group.items; track itemKey(item)) {
          @if (item.kind === 'workout') {
            <app-activity-card
                [accent]="workoutPrimaryColor(item.workout)" [barColor]="workoutCardColor(item.workout)"
                [icon]="workoutPrimaryIcon(item.workout)" mascot="marley"
                [title]="workoutTypeLabel(item.workout)" [note]="item.workout.notes ?? ''"
                [stats]="workoutStats(item.workout)"
                [feeling]="item.workout.feeling ? emojiOf(item.workout.feeling) : ''"
                [planned]="isPlanned(item.workout)" interactive
                expandable [expanded]="expandedWorkoutId() === item.workout.id"
                (cardClick)="handleWorkoutClick(item.workout)">

              @if (isPlanned(item.workout)) {
                <div class="ac-actions" cardActions>
                  <button class="ac-act ac-act--del" (click)="deletePlan(item.workout)"
                          aria-label="Eliminar planificació">
                    <span class="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                  @if (canStart(item.workout.date)) {
                    <button class="ac-act ac-act--start" (click)="startPlan(item.workout)" aria-label="Comença">
                      <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                    </button>
                  }
                </div>
              }

              @if (expandedWorkoutId() === item.workout.id) {
                <app-workout-detail [workout]="item.workout" [planned]="isPlanned(item.workout)" />
                <!-- El peu del desplegable porta una sola cosa, i és la
                     mateixa per a un entrenament i per a un esport: obrir
                     l'activitat. Començar un pla ja és el botó de play del
                     costat de la targeta —dir-ho dues vegades al mateix
                     desplegable era només l'entrenament, i sobrava. -->
                <div class="ac-detail-actions">
                  <button class="ac-open-btn"
                          (click)="isPlanned(item.workout) ? openPlan(item.workout) : open.emit(item.workout.id)">
                    <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
                    Obrir
                  </button>
                </div>
              }
            </app-activity-card>

          } @else {
            <app-activity-card
                [accent]="item.sport.color" [icon]="item.sport.icon" mascot="xoco"
                [title]="item.sport.name" [subtype]="sportSubtype(item)"
                [note]="item.session.notes ?? ''" [stats]="sportStats(item)"
                [feeling]="item.session.feeling ? emojiOf(item.session.feeling) : ''"
                [planned]="isSportPlanned(item)" interactive
                expandable [expanded]="expandedSportId() === item.session.id"
                (cardClick)="toggleSportExpand(item)">

              @if (isSportPlanned(item)) {
                <div class="ac-actions" cardActions>
                  <button class="ac-act ac-act--del" (click)="deleteSportPlan(item)"
                          aria-label="Eliminar planificació">
                    <span class="material-symbols-outlined" aria-hidden="true">delete</span>
                  </button>
                  @if (canStart(item.session.date)) {
                    <button class="ac-act ac-act--start" (click)="registerSportPlan(item)"
                            aria-label="Registrar">
                      <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                    </button>
                  }
                </div>
              }

              @if (expandedSportId() === item.session.id) {
                <app-sport-detail [sport]="item.sport" [session]="item.session" compact />
                <div class="ac-detail-actions">
                  <button class="ac-open-btn"
                          (click)="openSport.emit({ sport: item.sport, session: item.session })">
                    <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
                    Obrir
                  </button>
                </div>
              }
            </app-activity-card>
          }
        }

        <!-- ── Desfer la sessió ──
             Unir-les es fa des de l'activitat; desfer-ho, des d'aquí: el botó
             és de la caixa, no de cap targeta de dins, perquè el que separa és
             la sessió sencera. A baix a la dreta, l'últim que es llegeix del
             bloc i sense pes: no és el pas que s'espera de ningú. -->
        @if (group.grouped) {
          <div class="sg-foot">
            <button class="sg-split" (click)="split(group)" [disabled]="splitting() === group.key">
              <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
              Separar sessions
            </button>
          </div>
        }

      </div>
    }
  `,
  styles: [`
    /* La targeta és compartida; d'aquí només és l'aire que se'n deixa entre
       una activitat i la següent, i entre una sessió i la següent — que és el
       mateix aire, el posi la caixa o la targeta.

       L'últim de tot no en deixa: el marge de sota se sumava al de qui ens
       pinta (la targeta del dia a Inici, el dia a l'Historial) i el buit de
       baix sortia més gran que el de dalt. Dins d'una caixa de sessió,
       l'última targeta sí que en deixa: a sota hi té el peu de «Separar
       sessions», no la vora del bloc. */
    .sg { margin-bottom: 10px; }
    .sg:last-child { margin-bottom: 0; }
    app-activity-card { display: block; margin-bottom: 10px; }
    app-activity-card:last-child { margin-bottom: 0; }

    /* ── Una sessió amb més d'una activitat ──
       La caixa és el que diu «això és una sola anada»: les targetes de dins no
       canvien de forma —es continuen desplegant i obrint igual—, només queden
       encaixades. Una sessió d'una sola activitat no té caixa: es pinta com
       s'ha pintat sempre. */
    .sg--grouped {
      border: 1.5px solid var(--c-border-2); border-radius: 16px;
      background: color-mix(in srgb, var(--c-text) 3%, var(--c-card));
      padding: 8px;
    }

    .sg-head {
      display: flex; align-items: center; gap: 7px;
      padding: 3px 6px 9px;
    }
    .sg-icons { display: flex; align-items: center; gap: 3px; flex-shrink: 0; }
    .sg-icon  { font-size: 17px; }
    .sg-title {
      font-size: 12.5px; font-weight: 700; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sg-count {
      margin-left: auto; flex-shrink: 0;
      font-size: 11.5px; font-weight: 700; color: var(--c-text-3);
    }

    /* ── Botons d'un pla, al costat de la targeta ── */
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

    /* ── Peu del desplegable: obrir l'activitat sencera ── */
    .ac-detail-actions {
      display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 6px;
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
    /* ── Separar la sessió, al peu de la caixa ──
       Separar és de segon terme: sense fons ni vora, a baix a la dreta i en
       el to apagat del text de suport. Qui hi arriba hi va a posta. */
    .sg-foot { display: flex; justify-content: flex-end; padding: 2px 2px 0; }
    .sg-split {
      display: inline-flex; align-items: center; gap: 5px;
      height: 30px; padding: 0 9px; border-radius: 9px;
      border: none; background: transparent;
      color: var(--c-text-3); font-size: 12px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover:not(:disabled) { color: var(--c-text-2); background: color-mix(in srgb, var(--c-text) 6%, transparent); }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  `],
})
export class DayFeedCardsComponent {
  private workoutService = inject(WorkoutService);
  private sportService    = inject(SportService);
  private sessionGroups   = inject(SessionGroupService);
  private settingsService = inject(UserSettingsService);
  private exerciseService = inject(ExerciseService);
  private feedback       = inject(FeedbackService);
  private confirmDialog   = inject(ConfirmDialogService);

  /** El dia d'avui com a senyal: la targeta d'un pla canvia sola a mitjanit. */
  readonly today = inject(TodayService).today;

  readonly day  = input<DayFeedEntry | null>(null);

  /**
   * L'activitat del dia repartida en sessions.
   *
   * Una activitat sense grup surt sola, com sempre; les que en comparteixen un
   * queden juntes dins d'una caixa. Els dies d'abans que això existís no en
   * tenen cap, o sigui que es pinten exactament igual que abans.
   */
  readonly groups = computed((): SessionGroup[] =>
    groupDayFeed(this.day()?.workouts ?? [], this.day()?.sports ?? [])
  );
  /** El volum és la xifra que menys es mira d'un cop d'ull i la que més
   *  amplada es menja; a Activitat recent, on les targetes s'apilen, se
   *  n'amaga. A la targeta del dia i a l'Historial s'hi queda. */
  readonly hideVolume = input(false, { transform: booleanAttribute });
  /** Obrir l'entrenament desplegat, a la pàgina d'Entrenar. */
  readonly open = output<string>();
  /** Una sessió d'esport: la targeta només la llegeix, i
   *  canviar-hi res passa per la pàgina que la sap registrar. */
  readonly openSport = output<{ sport: Sport; session: SportSession }>();

  readonly expandedSportId   = signal<string | null>(null);
  readonly expandedWorkoutId = signal<string | null>(null);

  readonly isPlanned           = isWorkoutPlanned;
  readonly workoutPrimaryColor = workoutPrimaryColor;
  readonly workoutPrimaryIcon  = workoutPrimaryIcon;
  readonly workoutCardColor    = workoutCardColor;
  readonly workoutTypeLabel    = workoutTypeLabel;

  /** Les xifres de l'entrenament, amb el pes corporal comptat: les
   *  dominades i companyia sumen volum com les altres. */
  workoutStats(w: Workout): ActivityStat[] {
    return workoutCardStats(w, {
      bodyweightKg: this.settingsService.bodyweightKg(),
      loadTypeOf: this.exerciseService.loadTypeOf,
      bodyweightFactorOf: this.exerciseService.bodyweightFactorOf,
    }, { hideVolume: this.hideVolume() });
  }

  readonly groupIcons = groupIcons;
  readonly groupTitle = groupTitle;

  groupCount(group: SessionGroup): string {
    return `${group.items.length} activitats`;
  }

  /** La clau de la targeta al bucle: l'id de l'activitat, sigui de la mena
   *  que sigui. */
  itemKey(item: ActivityItem): string {
    return activityOf(item).id;
  }

  /** La sessió que s'està separant, perquè el botó no s'accioni dos cops. */
  readonly splitting = signal<string | null>(null);

  /**
   * Desfà la sessió: les seves activitats tornen a comptar cadascuna per ella
   * mateixa. No es toca res del que hi ha dins —les sèries, les mètriques i
   * els rècords es queden on eren—, només deixen de ser la mateixa anada.
   */
  async split(group: SessionGroup): Promise<void> {
    if (this.splitting()) return;
    this.splitting.set(group.key);
    try {
      await this.sessionGroups.split(group.items);
      const { mascot, message } = splitLine(group);
      this.feedback.success(message, 2000, mascot);
    } catch {
      this.feedback.error('Error en separar', 2500);
    } finally {
      this.splitting.set(null);
    }
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
    if (!this.canStart(item.session.date)) return;
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

  /**
   * Un pla de demà encara no es pot haver fet: començar-lo o registrar-lo
   * només val quan el dia ja ha arribat.
   *
   * La regla és la mateixa per a un entrenament i per a un esport —un pla és
   * un pla—, i per això es llegeix d'aquí i no de dos `date <= today()`
   * escampats pel marcatge.
   */
  canStart(date: string): boolean {
    return date <= this.today();
  }

  /**
   * Tocar la targeta la desplega, i prou —també la d'un pla.
   *
   * Un planificat es llegeix abans de fer-se: quins exercicis porta i amb
   * quina pauta. Abans, tocar-lo el començava de cop i l'entrenament quedava
   * obert sense haver-lo demanat; començar-lo té el seu botó, que és el de
   * play, igual que un esport planificat.
   */
  handleWorkoutClick(w: Workout): void {
    this.expandedWorkoutId.update(id => id === w.id ? null : w.id);
  }

  /**
   * Obre el pla per tocar-lo: s'hi afegeixen o se'n treuen exercicis i es
   * queda pla, per començar-lo un altre dia.
   *
   * Un planificat de la rutina no és cap fila fins que el toques, així que
   * el que s'obre pot ser un id nou —el pla de debò que s'acaba de crear—,
   * no el projectat.
   */
  async openPlan(w: Workout): Promise<void> {
    try {
      this.open.emit(await this.workoutService.editPlannedWorkout(w.id));
    } catch {
      this.feedback.error('Error en obrir el pla', 2500);
    }
  }

  async startPlan(w: Workout): Promise<void> {
    if (!this.canStart(w.date)) return;
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
