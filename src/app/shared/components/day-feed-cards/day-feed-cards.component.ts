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
import { ActivityItem, SessionGroup, groupDayFeed, itemsOf } from '../../utils/session-group.utils';

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

        @for (w of group.workouts; track w.id) {
          <app-activity-card
              [accent]="workoutPrimaryColor(w)" [barColor]="workoutCardColor(w)"
              [icon]="workoutPrimaryIcon(w)" mascot="marley"
              [title]="workoutTypeLabel(w)" [note]="w.notes ?? ''"
              [stats]="workoutStats(w)"
              [feeling]="w.feeling ? emojiOf(w.feeling) : ''"
              [planned]="isPlanned(w)" interactive
              [expandable]="!isPlanned(w)"
              [expanded]="expandedWorkoutId() === w.id"
              (cardClick)="handleWorkoutClick(w)">

            @if (isPlanned(w)) {
              <div class="ac-actions" cardActions>
                <button class="ac-act ac-act--del" (click)="deletePlan(w)"
                        aria-label="Eliminar planificació">
                  <span class="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
                <button class="ac-act ac-act--start" (click)="startPlan(w)" aria-label="Comença">
                  <span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>
                </button>
              </div>
            }

            @if (expandedWorkoutId() === w.id && !isPlanned(w)) {
              <app-workout-detail [workout]="w" />
              <div class="ac-detail-actions">
                @if (group.grouped) {
                  <button class="ac-side-btn" (click)="detach({ kind: 'workout', workout: w })">
                    <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
                    Separa
                  </button>
                }
                @if (canMerge(group)) {
                  <button class="ac-side-btn" (click)="toggleMergePicker(group)">
                    <span class="material-symbols-outlined" aria-hidden="true">merge</span>
                    Uneix
                  </button>
                }
                <button class="ac-side-btn" (click)="addToSession({ kind: 'workout', workout: w }, w.date)">
                  <span class="material-symbols-outlined" aria-hidden="true">add</span>
                  Afegeix-hi
                </button>
                <button class="ac-open-btn" (click)="open.emit(w.id)">
                  <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
                  Obrir entrenament
                </button>
              </div>
            }
          </app-activity-card>
        }

        @for (item of group.sports; track item.session.id) {
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

            @if (expandedSportId() === item.session.id) {
              <app-sport-detail [sport]="item.sport" [session]="item.session" compact />
              <div class="ac-detail-actions">
                @if (group.grouped) {
                  <button class="ac-side-btn" (click)="detach({ kind: 'sport', sport: item.sport, session: item.session })">
                    <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
                    Separa
                  </button>
                }
                @if (!isSportPlanned(item)) {
                  @if (canMerge(group)) {
                    <button class="ac-side-btn" (click)="toggleMergePicker(group)">
                      <span class="material-symbols-outlined" aria-hidden="true">merge</span>
                      Uneix
                    </button>
                  }
                  <button class="ac-side-btn"
                          (click)="addToSession({ kind: 'sport', sport: item.sport, session: item.session }, item.session.date)">
                    <span class="material-symbols-outlined" aria-hidden="true">add</span>
                    Afegeix-hi
                  </button>
                }
                <button class="ac-open-btn" (click)="openSport.emit(item)">
                  <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
                  Obrir sessió
                </button>
              </div>
            }
          </app-activity-card>
        }

        <!-- ── Uneix amb una altra sessió del dia ──
             Les candidates són les altres sessions d'aquest mateix dia: tocar-ne
             una les ajunta allà mateix, sense sortir de la llista ni obrir res. -->
        @if (mergePickerKey() === group.key) {
          <div class="sg-merge">
            <span class="sg-merge-title">Uneix aquesta sessió amb…</span>
            <div class="sg-merge-list">
              @for (target of mergeTargets(group); track target.key) {
                <button class="sg-merge-opt" (click)="mergeWith(group, target)">
                  <span class="sg-icons" aria-hidden="true">
                    @for (ic of groupIcons(target); track $index) {
                      <span class="material-symbols-outlined sg-icon" [style.color]="ic.color">{{ ic.icon }}</span>
                    }
                  </span>
                  {{ groupTitle(target) }}
                </button>
              }
              <button class="sg-merge-cancel" (click)="mergePickerKey.set(null)">Cancel·la</button>
            </div>
          </div>
        }

      </div>
    }
  `,
  styles: [`
    /* La targeta és compartida; d'aquí només és l'aire que se'n deixa entre
       una activitat i la següent. */
    app-activity-card { display: block; margin-bottom: 10px; }

    /* ── Una sessió amb més d'una activitat ──
       La caixa és el que diu «això és una sola anada»: les targetes de dins no
       canvien de forma —es continuen desplegant i obrint igual—, només queden
       encaixades. Una sessió d'una sola activitat no té caixa: es pinta com
       s'ha pintat sempre. */
    .sg--grouped {
      border: 1.5px solid var(--c-border-2); border-radius: 16px;
      background: color-mix(in srgb, var(--c-text) 3%, var(--c-card));
      padding: 8px; margin-bottom: 10px;
      app-activity-card:last-child { margin-bottom: 0; }
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

    /* ── Triar amb quina sessió s'ajunta ──
       Xapes com les dels filtres: la llista és curta —les altres sessions del
       dia— i s'ha de poder llegir de què està feta cadascuna abans de tocar. */
    .sg-merge { padding: 2px 4px 4px; }
    .sg-merge-title { display: block; font-size: 11.5px; font-weight: 700; color: var(--c-text-3); padding: 0 2px 6px; }
    .sg-merge-list { display: flex; flex-wrap: wrap; gap: 6px; }
    .sg-merge-opt, .sg-merge-cancel {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 6px 12px; border-radius: 20px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 15px; }
    }
    .sg-merge-opt:hover { border-color: var(--c-brand); color: var(--c-brand); }
    .sg-merge-cancel { color: var(--c-text-3); border-style: dashed; }
    .sg-merge-cancel:hover { color: var(--c-text-2); border-color: var(--c-text-3); }

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

    /* Ajuntar i separar són accions de segon terme: mateixa alçada que obrir,
       però sense el color de l'activitat, que és per al pas que s'espera. */
    .ac-side-btn {
      display: inline-flex; align-items: center; gap: 5px;
      height: 34px; padding: 0 12px; border-radius: 10px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      color: var(--c-text-3); font-size: 12.5px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: var(--c-text-2); border-color: var(--c-text-3); }
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
  /**
   * Afegir una activitat a una sessió que ja hi és. Porta el dia i l'id del
   * grup —creat aquí si l'activitat encara no en tenia—, i qui ho reculli
   * duu l'usuari a triar què hi afegeix: el que registri neix dins d'aquesta
   * sessió.
   */
  readonly addActivity = output<{ date: string; groupId: string }>();
  /** El mateix per a una sessió d'esport: la targeta només la llegeix, i
   *  canviar-hi res passa per la pàgina que la sap registrar. */
  readonly openSport = output<{ sport: Sport; session: SportSession }>();

  /** La sessió que està triant amb quina s'ajunta, si n'hi ha cap. */
  readonly mergePickerKey    = signal<string | null>(null);
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

  /** Les icones de les activitats de la sessió, amb el seu color: és el que
   *  fa reconèixer d'un cop d'ull de què està feta l'anada. */
  groupIcons(group: SessionGroup): { icon: string; color: string }[] {
    return [
      ...group.workouts.map(w => ({ icon: workoutPrimaryIcon(w), color: workoutPrimaryColor(w) })),
      ...group.sports.map(s => ({ icon: s.sport.icon, color: s.sport.color })),
    ];
  }

  /** «Empenta · Córrer»: els noms de les activitats, en el mateix ordre que
   *  les targetes de sota. */
  groupTitle(group: SessionGroup): string {
    return [
      ...group.workouts.map(w => workoutTypeLabel(w)),
      ...group.sports.map(s => s.sport.name),
    ].join(' · ');
  }

  groupCount(group: SessionGroup): string {
    return `${group.workouts.length + group.sports.length} activitats`;
  }

  /**
   * Obre el pas d'afegir una activitat a aquesta sessió.
   *
   * Si l'activitat encara no era de cap grup, ara passa a ser-ne la primera:
   * l'etiqueta s'escriu abans de marxar, perquè el que es registri tot seguit
   * pugui néixer amb la mateixa. Quedar-se aquí a mitges no deixa res per
   * netejar — una activitat sola amb grup es compta i es pinta igual.
   */
  async addToSession(item: ActivityItem, date: string): Promise<void> {
    try {
      const groupId = await this.sessionGroups.ensureGroupId(item);
      this.addActivity.emit({ date, groupId });
    } catch {
      this.feedback.error('Error en obrir la sessió', 2500);
    }
  }

  /**
   * Les altres sessions del dia amb què es pot ajuntar aquesta.
   *
   * Tot el que es veu en aquesta llista ja és del mateix dia —la targeta pinta
   * un dia i prou—, o sigui que aquí només en queden fora les planificades:
   * un pla encara no és cap anada, i ajuntar-l'hi no voldria dir res.
   */
  mergeTargets(group: SessionGroup): SessionGroup[] {
    return this.groups().filter(g => g.key !== group.key && !this.isPlannedGroup(g));
  }

  /** Ajuntar demana dues sessions: sense cap altra al dia, el botó no hi és. */
  canMerge(group: SessionGroup): boolean {
    return !this.isPlannedGroup(group) && this.mergeTargets(group).length > 0;
  }

  private isPlannedGroup(group: SessionGroup): boolean {
    return group.workouts.some(w => this.isPlanned(w))
        || group.sports.some(s => this.isSportPlanned(s));
  }

  toggleMergePicker(group: SessionGroup): void {
    this.mergePickerKey.update(key => key === group.key ? null : group.key);
  }

  /**
   * Ajunta aquesta sessió amb la que s'ha triat: totes dues passen a ser una
   * sola anada. Cap activitat no canvia de contingut —les sèries, les
   * mètriques i els rècords es queden on eren—, i «Separa» les torna a
   * deixar soltes una per una.
   */
  async mergeWith(group: SessionGroup, target: SessionGroup): Promise<void> {
    this.mergePickerKey.set(null);
    try {
      await this.sessionGroups.merge(itemsOf(group), itemsOf(target));
      this.feedback.success('Sessions unides', 2000);
    } catch {
      this.feedback.error('Error en unir les sessions', 2500);
    }
  }

  /** Treu l'activitat de la sessió: torna a comptar com una de sola. */
  async detach(item: ActivityItem): Promise<void> {
    try {
      await this.sessionGroups.detach(item);
      this.feedback.success('Activitat separada', 2000);
    } catch {
      this.feedback.error('Error en separar', 2500);
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
