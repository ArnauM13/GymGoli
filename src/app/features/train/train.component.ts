import { Component, HostListener, OnDestroy, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { workoutCategories } from '../../shared/utils/calendar-utils';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { TrainerService } from '../../core/services/trainer.service';
import { AuthService } from '../../core/services/auth.service';

import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, CATEGORY_MUSCLES,
  Exercise, ExerciseCategory,
} from '../../core/models/exercise.model';
import { MASCOTS, Mascot, MascotMeta } from '../../core/models/mascot.model';
import { Sport } from '../../core/models/sport.model';
import { WorkoutTemplate } from '../../core/models/template.model';
import { FeelingLevel, Workout, WorkoutEntry, setMaxWeight } from '../../core/models/workout.model';
import { TemplateService } from '../../core/services/template.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { SportService } from '../../core/services/sport.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';
import { WorkoutService } from '../../core/services/workout.service';
import { OngoingWorkoutService } from '../../core/services/ongoing-workout.service';
import { OfflineService } from '../../core/services/offline.service';
import { ActivityCardComponent } from '../../shared/components/activity-card/activity-card.component';
import { ActivityIconComponent } from '../../shared/components/activity-icon/activity-icon.component';
import { WorkoutDetailComponent } from '../../shared/components/workout-detail/workout-detail.component';
import { WorkoutEditorComponent } from '../../shared/components/workout-editor/workout-editor.component';
import { WorkoutProfileService } from '../../core/services/workout-profile.service';
import { AppHintService } from '../../core/services/app-hint.service';
import { ExercisePickerDialogComponent } from './components/exercise-picker-dialog.component';
import { ExerciseService } from '../../core/services/exercise.service';
import { ExerciseSuggestionService } from '../../core/services/exercise-suggestion.service';
import { ExerciseSuggestion } from '../../shared/utils/exercise-suggestion.util';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';
import { TodayService } from '../../core/services/today.service';
import {
  ActivityStat,
  feedDayLabel, formatFeeling, workoutCardColor, workoutCardStats,
  workoutPrimaryColor, workoutPrimaryIcon, workoutTypeLabel,
} from '../../shared/utils/workout-card.utils';
import { toDateStr } from '../../shared/utils/date.utils';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Accept a `?date=` deep-link only when it's a well-formed ISO date, so a
 *  hand-typed or stale URL can never point the page at a bogus day. */
const validDateParam = (v: string | null): string | null =>
  v && ISO_DATE.test(v) && !Number.isNaN(new Date(v + 'T12:00:00').getTime()) ? v : null;

/** After this long with no change to the workout, treat the session as no
 *  longer being trained and stop the live "Sèrie activa" suggestions. */
const STALE_SUGGESTION_MS = 2 * 60 * 60 * 1000; // 2 hours
/** Propostes ignorades que es recorden. Una data de fa mesos ja no
 *  filtra res, i la configuració no és lloc per a una llista que creix. */
const KEEP_DISMISSED_PROPOSALS = 60;

type GymSuggestion   = { type: 'gym';   category: ExerciseCategory; label: string; color: string; icon: string; reason: string };
type SportSuggestion = { type: 'sport'; sport: Sport;               label: string; color: string; icon: string; reason: string };
type TodaySuggestion = GymSuggestion | SportSuggestion;

interface WorkoutTypeItem { value: ExerciseCategory; label: string; icon: string; color: string; }

@Component({
  selector: 'app-train',
  standalone: true,
  imports: [
    FormsModule, A11yModule, WorkoutEditorComponent, WorkoutDetailComponent,
    PageHeaderComponent, ActivityCardComponent, ActivityIconComponent,
  ],
  template: `
    <div class="page" [style.padding-bottom]="pagePaddingBottom()">

      @if (activeWorkout(); as w) {

        <!-- ══ ACTIVE WORKOUT MODE ══ -->

        <header class="page-header page-header--aw">
          <button class="back-btn" (click)="closeWorkout()" aria-label="Tancar entrenament">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <div class="aw-title-block">
            <h1>{{ (w.status ?? 'done') === 'planned' ? 'El meu pla' : 'El meu entrenament' }}</h1>
            <span class="aw-date-sub">{{ heroDateLabel(w) }}</span>
          </div>
          <span class="aw-type-badge" [style.--bc]="workoutPrimaryColor(w)">{{ workoutLabel(w) }}</span>
        </header>

        <!-- ── Què és i com ha anat ──
             La targeta compartida, la mateixa que al feed d'Inici i a
             l'Historial: el tipus d'entrenament, les xifres d'un cop d'ull i
             la sensació. El dia no hi surt —ja el diu la capçalera d'aquí
             sobre—, perquè una activitat s'ha de reconèixer igual la miris
             on la miris. Segueix enganxada a dalt: les xifres han de ser
             llegibles a mig entrenament, sense tornar a pujar. -->
        <app-activity-card class="aw-hero"
            [accent]="workoutPrimaryColor(w)" [barColor]="workoutCardColor(w)"
            [icon]="workoutPrimaryIcon(w)" mascot="marley"
            [title]="workoutTypeLabel(w)" [note]="w.notes ?? ''"
            [stats]="workoutStats(w)"
            [feeling]="w.feeling ? emojiOf(w.feeling) : ''"
            [planned]="isPlannedWorkout(w)" plannedPill
            [feelingEditable]="!isPlannedWorkout(w)" [feelingOpen]="awFeelingOpen()"
            (feelingClick)="awFeelingOpen.set(!awFeelingOpen())" />

        <!-- Feeling picker (slides in below header) -->
        @if (awFeelingOpen()) {
          <div class="aw-feeling-row">
            @for (level of feelingLevels5; track level) {
              <button class="aw-feeling-opt" [class.active]="w.feeling === level"
                      (click)="pickWorkoutFeeling(w.id, level)">
                {{ emojiOf(level) }}
              </button>
            }
            @if (w.feeling) {
              <button class="aw-feeling-clear" (click)="pickWorkoutFeeling(w.id, undefined)" aria-label="Treure sensació">
                <span class="material-symbols-outlined">close</span>
              </button>
            }
          </div>
        }

        @if (!editing()) {

          <!-- ── Llegir ──
               Un entrenament d'un dia passat s'obre per mirar-se'l, no per
               fer-lo: primer l'esquema —què vas fer a cada exercici, sèrie a
               sèrie— i, si el vols tocar, el botó d'editar. És el mateix camí
               que una sessió d'esport, i abans un entrenament vell queia de
               dret dins l'editor. -->
          <div class="detail-card">
            <app-workout-detail [workout]="w" />
          </div>

          <button class="edit-btn" (click)="startEditing()">
            <span class="material-symbols-outlined" aria-hidden="true">edit</span>
            Editar l'entrenament
          </button>

        } @else {

        <app-workout-editor
          #editor
          [workout]="w"
          [editMode]="false"
          [alwaysEditable]="true"
          [reorderable]="reorderMode()"
          [groupingMode]="groupingMode()"
          (requestAddExercise)="openPicker()"
        />

        <!-- ── Les dues coses que es fan entrenant ──
             Ordenar els exercicis i posar punt final. Vivien dins el menú de
             tres punts, que és on van les coses que gairebé no es fan;
             aquestes dues es fan cada dia, així que es veuen. -->
        @if (!reorderMode() && !groupingMode()) {
          <div class="aw-actions">
            @if (w.entries.length > 1) {
              <button class="aw-action" (click)="reorderMode.set(true); groupingMode.set(false)">
                <span class="material-symbols-outlined" aria-hidden="true">swap_vert</span>
                Ordenar
              </button>
            }
            @if (activeIsOngoing()) {
              <button class="aw-action aw-action--finish" (click)="finishWorkout()">
                <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
                Acabar l'entrenament
              </button>
            }
          </div>
        }

        <!-- ── Sèrie activa: proper exercici suggerit (aprèn de l'usuari) ── -->
        @if (exerciseSuggestions(); as sugg) {
          @if (sugg.length && !reorderMode() && !groupingMode()) {
            <div class="aw-suggest">
              <div class="aw-suggest-head">
                <span class="material-symbols-outlined aw-suggest-icon">auto_awesome</span>
                <span class="aw-suggest-title">Sèrie activa</span>
                <span class="aw-suggest-sub">El teu proper exercici</span>
              </div>
              <div class="aw-suggest-list">
                @for (s of sugg; track s.exerciseId) {
                  <button class="aw-suggest-chip" (click)="addSuggestion(s)">
                    <span class="aw-suggest-chip-top">
                      <span class="material-symbols-outlined aw-suggest-add">add</span>
                      <span class="aw-suggest-name">{{ s.exerciseName }}</span>
                    </span>
                    <span class="aw-suggest-reason">{{ s.reason }}</span>
                  </button>
                }
              </div>
            </div>
          }
        }

        <!-- ── Nudge contextual: desa'l com a plantilla ── -->
        @if (w.entries.length >= 2 && !offlineService.isOffline()
             && !reorderMode() && !groupingMode()
             && !hintService.isDismissed('nudge-save-template')) {
          <div class="aw-nudge">
            <span class="material-symbols-outlined aw-nudge-icon">bookmark_add</span>
            <div class="aw-nudge-text">
              <span class="aw-nudge-title">Repeteixes aquest entrenament?</span>
              <span class="aw-nudge-sub">Desa'l com a plantilla i comença'l en un tap la propera vegada.</span>
            </div>
            <button class="aw-nudge-cta" (click)="saveTemplateFromNudge(w)">Desar</button>
            <button class="aw-nudge-x" (click)="hintService.dismiss('nudge-save-template')" aria-label="No tornar a mostrar">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        }

        <!-- ── Nudge contextual: pes corporal per comptar la calistènia al volum ── -->
        @if (needsBodyweightHint()) {
          <div class="aw-nudge">
            <span class="material-symbols-outlined aw-nudge-icon">monitor_weight</span>
            <div class="aw-nudge-text">
              <span class="aw-nudge-title">Comptar la calistènia al volum?</span>
              <span class="aw-nudge-sub">Afegeix el teu pes corporal i les dominades i companyia sumaran volum. Si no, es registren igual però no compten al volum — tu tries.</span>
            </div>
            <button class="aw-nudge-cta" (click)="router.navigateByUrl('/settings?section=body')">Afegir</button>
            <button class="aw-nudge-x" (click)="hintService.dismiss('nudge-bodyweight-volume')" aria-label="No tornar a mostrar">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>
        }

        }

        <!-- While reordering, the three-dots menu is replaced by a single
             "save order" button — the reorder is persisted live on each drop,
             so this just leaves reorder mode. -->
        @if (reorderMode()) {
          <button class="aw-reorder-save-fab" (click)="reorderMode.set(false)">
            <span class="material-symbols-outlined">check</span>
            Guardar ordre
          </button>
        } @else {
          <!-- ── Three-dots action menu ── -->
          @if (workoutMenuOpen()) {
            <div class="aw-menu-backdrop" (click)="workoutMenuOpen.set(false)"></div>
            <div class="aw-menu-dropdown">
              @if (editing() && (settingsService.supersetsEnabled() || groupingMode())) {
                <button class="aw-menu-item" (click)="workoutMenuOpen.set(false); groupingMode.set(!groupingMode()); reorderMode.set(false)">
                  <span class="material-symbols-outlined">{{ groupingMode() ? 'check' : 'link' }}</span>
                  {{ groupingMode() ? 'Finalitzar agrupació' : 'Agrupar en superset' }}
                </button>
              }
              @if (!offlineService.isOffline()) {
                <button class="aw-menu-item" (click)="openSaveAsTemplate(w)">
                  <span class="material-symbols-outlined">bookmark_add</span>
                  Guardar com a plantilla
                </button>
                <button class="aw-menu-item" (click)="shareWorkout(w)">
                  <span class="material-symbols-outlined">share</span>
                  Compartir entrenament
                </button>
              }
              <button class="aw-menu-item aw-menu-item--danger" (click)="workoutMenuOpen.set(false); deleteActiveWorkout()">
                <span class="material-symbols-outlined">delete</span>
                Eliminar entrenament
              </button>
            </div>
          }
          <button class="aw-menu-fab" [class.aw-menu-fab--open]="workoutMenuOpen()"
                  (click)="workoutMenuOpen.set(!workoutMenuOpen())"
                  aria-label="Opcions de l'entrenament" [attr.aria-expanded]="workoutMenuOpen()">
            <span class="material-symbols-outlined">more_vert</span>
          </button>
        }

        <!-- ── Save as template bottom sheet ── -->
        @if (saveTemplateOpen()) {
          <div class="aw-tpl-backdrop bottom-sheet-backdrop" (click)="saveTemplateOpen.set(false)" aria-hidden="true"></div>
          <div class="aw-tpl-sheet bottom-sheet" role="dialog" aria-modal="true"
               aria-labelledby="aw-tpl-title" cdkTrapFocus cdkTrapFocusAutoCapture>
            <span class="bottom-sheet-handle" aria-hidden="true"></span>
            <div class="aw-tpl-header">
              <span class="aw-tpl-title" id="aw-tpl-title">Guardar com a plantilla</span>
              <button class="aw-tpl-close" (click)="saveTemplateOpen.set(false)" aria-label="Tancar">
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
            <div class="aw-tpl-field">
              <label class="aw-tpl-label">Nom de la plantilla</label>
              <input class="aw-tpl-input" [(ngModel)]="saveTemplateName"
                     placeholder="Ex: Push A" maxlength="40" autocomplete="off">
            </div>
            <div class="aw-tpl-actions">
              <button class="aw-tpl-cancel" (click)="saveTemplateOpen.set(false)">Cancel·lar</button>
              <button class="aw-tpl-save" (click)="confirmSaveAsTemplate()"
                      [disabled]="!saveTemplateName.trim()">Guardar</button>
            </div>
          </div>
        }

      } @else {

        <!-- ══ DASHBOARD MODE ══ -->
        <app-page-header title="Entrenament" [showBack]="true" />

        <!-- ── Context d'un dia que no és avui (registrar passat / planificar futur) ── -->
        @if (!isToday()) {
          <div class="date-context" [class.date-context--past]="isSelectedPast()">
            <span class="material-symbols-outlined dc-icon">{{ isSelectedPast() ? 'history' : 'event_upcoming' }}</span>
            <div class="dc-info">
              <span class="dc-eyebrow">{{ isSelectedPast() ? 'Registrant' : 'Planificant' }}</span>
              <span class="dc-date">{{ selectedDateLabel() }}</span>
            </div>
          </div>
        }

        <!-- ── Trainer proposal card ── -->
        @if (activeProposal(); as prop) {
          <div class="proposal-card">
            <div class="proposal-header">
              <span class="material-symbols-outlined proposal-icon">sports</span>
              <div class="proposal-header-info">
                <span class="proposal-title">Proposta de l'entrenador</span>
                @if (trainerService.myTrainer()?.displayName; as name) {
                  <span class="proposal-trainer">{{ name }}</span>
                }
              </div>
            </div>
            <div class="proposal-exercises">
              @for (entry of prop.entries.slice(0, 4); track entry.exerciseName) {
                <span class="proposal-ex">{{ entry.exerciseName }}</span>
              }
              @if (prop.entries.length > 4) {
                <span class="proposal-ex proposal-ex--more">+{{ prop.entries.length - 4 }} més</span>
              }
            </div>
            @if (prop.notes) {
              <p class="proposal-notes">{{ prop.notes }}</p>
            }
            <div class="proposal-actions">
              <button class="proposal-accept" (click)="acceptProposal(prop)" [disabled]="acceptingProposal()">
                @if (acceptingProposal()) {
                  <span class="material-symbols-outlined spin">sync</span>
                } @else {
                  <span class="material-symbols-outlined">check</span>
                }
                Accepta
              </button>
              <button class="proposal-ignore" (click)="ignoreProposal()">
                <span class="material-symbols-outlined">close</span>
                Ignora
              </button>
            </div>
          </div>
        }

        <!-- ── Creating spinner (brief, while new workout is being saved) ── -->
        @if (creating()) {
          <div class="loading-state">
            <span class="material-symbols-outlined spin">sync</span>
          </div>
        }

        <!-- ── Gym ── -->
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">fitness_center</span>
            <h2 class="section-title">Gym</h2>
            <button class="section-config" (click)="router.navigate(['/training-types'])" aria-label="Configurar tipus d'entrenament">
              <span class="material-symbols-outlined">tune</span>
            </button>
          </div>
          <p class="section-hint">Tria un tipus per començar</p>
          <div class="type-grid" [style.grid-template-columns]="gridCols(workoutTypes().length)">
            @for (cat of workoutTypes(); track cat.value) {
              <button class="type-btn"
                [style.--cat-color]="cat.color"
                [class.type-btn--active]="pickerCat() === cat.value"
                (click)="selectType(cat.value)">
                <span class="material-symbols-outlined type-btn-add" aria-hidden="true">add</span>
                <span class="material-symbols-outlined type-icon">{{ cat.icon }}</span>
                <span class="type-label">{{ cat.label }}</span>
              </button>
            }
          </div>
          <button class="section-manage" (click)="router.navigate(['/exercises'])">
            <span>Configurar exercicis</span>
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        </div>

        <!-- ── Esport ── -->
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">sports_soccer</span>
            <h2 class="section-title">Esport</h2>
          </div>
          @if (sportService.sports().length > 0) {
            <p class="section-hint">Tria un esport per registrar-lo</p>
            <div class="type-grid" [style.grid-template-columns]="gridCols(sportService.sports().length)">
              @for (sport of sportService.sports(); track sport.id) {
                <button class="type-btn"
                  [style.--cat-color]="sport.color"
                  (click)="startSportSession(sport)"
                  [disabled]="sportToggling()">
                  <span class="material-symbols-outlined type-btn-add" aria-hidden="true">add</span>
                  <span class="material-symbols-outlined type-icon">{{ sport.icon }}</span>
                  <span class="type-label">{{ sport.name }}</span>
                </button>
              }
            </div>
            <button class="section-manage" (click)="router.navigate(['/sports-config'])">
              <span>Configurar esports</span>
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          } @else {
            <div class="es-empty">
              <span class="material-symbols-outlined es-empty-icon">sports_soccer</span>
              <span class="es-empty-msg">Afegeix els esports que practiques</span>
              <button class="es-empty-btn" (click)="router.navigate(['/sports-config'])">
                Configurar esports
                <span class="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          }
        </div>

      }

    </div>

    <!-- ── Suggeriment ──────────────────────────────────────────────────
         Una sola cosa, no tres: la targeta ÉS la bafarada del gos —mateix
         format, amb cua cap a ell i botó de tancar. Si la tanques marxa tot,
         no queda cap targeta de fons: el suggeriment torna la pròxima vegada
         que entris a la pàgina. ── -->
    @if (!suggestionDismissed() && !activeWorkout() && todaySuggestion(); as s) {
      <div class="suggestion-float-row sfr--with-dog">
        <div class="sf-card-wrap">
          <button class="suggestion-float" [style.--sc]="s.color" (click)="handleSuggestionClick(s)"
                  [attr.aria-label]="'Entrenament suggerit: ' + s.label + '. ' + s.reason">
            <div class="sf-bar" aria-hidden="true"></div>
            <app-activity-icon [icon]="s.icon" [color]="s.color" />
            <div class="sf-info" aria-hidden="true">
              <span class="sf-label">{{ s.label }}</span>
              <span class="sf-reason">{{ s.reason }}</span>
            </div>
            <!-- El verb, dins una pastilla: amb només el chevron la targeta
                 es llegia com una nota i no com el botó que és. -->
            <span class="sf-go" aria-hidden="true">
              {{ s.type === 'gym' ? 'Començar' : 'Registrar' }}
              <span class="material-symbols-outlined">arrow_forward</span>
            </span>
          </button>

          <!-- Fora del botó: dins el retallaria l'overflow de la targeta. -->
          <span class="sf-tail" [style.--sc]="s.color" aria-hidden="true"></span>
          <button class="sf-close" type="button" (click)="dismissSuggestion()"
                  aria-label="Tancar el suggeriment">
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <img class="sf-figure" [src]="suggestionMascot(s).figure" alt="" aria-hidden="true">
      </div>
    }

    <!-- ── Template picker bottom sheet ── -->
    @if (pickerCat()) {
      <div class="tp-backdrop bottom-sheet-backdrop" (click)="closePicker()" aria-hidden="true"></div>
      <div class="tp-sheet bottom-sheet" role="dialog" aria-modal="true"
           aria-labelledby="tp-title" cdkTrapFocus cdkTrapFocusAutoCapture>
        <span class="bottom-sheet-handle" aria-hidden="true"></span>
        <div class="tp-header">
          <div class="tp-header-left">
            <div class="tp-dot" [style.background]="pickerColor()"></div>
            <div class="tp-header-info">
              <span class="tp-title" id="tp-title">{{ pickerLabel() }}</span>
              <span class="tp-muscles">{{ pickerMuscles() }}</span>
            </div>
          </div>
          <button class="tp-close" (click)="closePicker()" aria-label="Tancar">
            <span class="material-symbols-outlined">close</span>
          </button>
        </div>

        <button class="tp-option tp-option--primary" (click)="pickerStartEmpty()">
          <span class="material-symbols-outlined tp-opt-icon">add_circle</span>
          <div class="tp-opt-info">
            <span class="tp-opt-name">Entrenament buit</span>
            <span class="tp-opt-sub">Comença de zero</span>
          </div>
        </button>

        @if (pickerLast()) {
          <button class="tp-option" (click)="pickerStartFromLast()">
            <span class="material-symbols-outlined tp-opt-icon">history</span>
            <div class="tp-opt-info">
              <span class="tp-opt-name">Repetir últim</span>
              <span class="tp-opt-sub">{{ pickerLastAgo() }} · {{ pickerLast()!.entries.length }} exercici{{ pickerLast()!.entries.length === 1 ? '' : 's' }}</span>
            </div>
          </button>
        }

        @if (pickerUserTemplates().length) {
          <div class="tp-section">Les meves plantilles</div>
          @for (t of pickerUserTemplates(); track t.id) {
            <button class="tp-option" (click)="pickerStartFromTemplate(t)">
              <span class="material-symbols-outlined tp-opt-icon">bookmark</span>
              <div class="tp-opt-info">
                <span class="tp-opt-name">{{ t.name }}</span>
                <span class="tp-opt-sub">{{ t.entries.length ? t.entries.length + ' exercici' + (t.entries.length === 1 ? '' : 's') : 'Sense exercicis' }}</span>
              </div>
            </button>
          }

          <button class="tp-manage" (click)="goToTemplates()">
            <span>Gestionar plantilles</span>
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
        } @else {
          <button class="tp-option tp-option--create" (click)="goToTemplates()">
            <span class="material-symbols-outlined tp-opt-icon">bookmark_add</span>
            <div class="tp-opt-info">
              <span class="tp-opt-name">Crea la teva primera plantilla</span>
              <span class="tp-opt-sub">Desa una rutina per reutilitzar-la ràpidament</span>
            </div>
          </button>
        }
      </div>
    }

  `,
  styles: [`
    .page { padding: 0; }

    /* ── Page header ── */
    .page-header--aw {
      padding: 16px 16px 10px;
      display: flex; align-items: center; gap: 10px;
    }
    .aw-title-block {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 1px;
      h1 { margin: 0; font-size: 16px; font-weight: 700; color: var(--c-text); line-height: 1.2; }
    }
    .aw-date-sub {
      font-size: 12px; color: var(--c-text-3); font-weight: 500;
      line-height: 1.2; text-transform: capitalize;
    }
    .aw-type-badge {
      --bc: var(--c-brand); flex-shrink: 0;
      padding: 4px 10px; border-radius: 20px;
      background: color-mix(in srgb, var(--bc) 12%, var(--c-card));
      color: var(--bc); font-size: 11px; font-weight: 700;
      border: 1px solid color-mix(in srgb, var(--bc) 25%, transparent);
      white-space: nowrap; max-width: 110px;
      overflow: hidden; text-overflow: ellipsis;
    }
    .back-btn {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: var(--c-subtle); color: var(--c-text-2);
      cursor: pointer; -webkit-tap-highlight-color: transparent;
      transition: background 0.15s; flex-shrink: 0;
      span { font-size: 20px; }
      &:hover  { background: var(--c-hover); }
      &:active { opacity: 0.7; }
    }

    /* ── Capçalera de l'entrenament ──
       La targeta és la compartida (app-activity-card, la mateixa que al
       feed); d'aquesta pàgina només és que es quedi enganxada a dalt: les
       xifres han de ser llegibles a mig entrenament, sense tornar a pujar. */
    .aw-hero { display: block; position: sticky; top: 12px; z-index: 10; margin: 12px 16px 0; }

    /* ── Les accions del dia, a la vista ── */
    .aw-actions {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      margin: 12px 16px 0;
    }
    .aw-action {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      height: 42px; padding: 0 16px; border-radius: 14px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 13.5px; font-weight: 700; color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 19px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
      &:active { transform: scale(0.99); }
    }
    /* Posar punt final és el gest que tanca la sessió: mana sobre l'altre i
       s'emporta l'amplada que sobra. */
    .aw-action--finish {
      flex: 1; min-width: 180px;
      border-color: transparent; background: var(--c-brand); color: white;
      &:hover { background: var(--c-brand-dk); border-color: transparent; color: white; }
    }

    /* ── Llegir un entrenament passat ──
       El detall porta la seva vora superior, així que la targeta que
       l'embolcalla no n'hi posa una altra. La mateixa forma que a la pàgina
       d'una sessió d'esport. */
    .detail-card {
      margin: 12px 16px 0; border-radius: 16px; overflow: hidden;
      border: 1.5px solid var(--c-border-2); box-shadow: 0 2px 10px var(--c-shadow);
      background: var(--c-card);
    }
    .edit-btn {
      display: flex; align-items: center; justify-content: center; gap: 7px;
      width: calc(100% - 32px); box-sizing: border-box;
      margin: 12px 16px 0; padding: 12px; border-radius: 14px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 14px; font-weight: 700; color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 19px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
      &:active { transform: scale(0.99); }
    }

    .aw-feeling-row {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      margin: 4px 16px 0;
      padding: 10px 14px;
      background: var(--c-card);
      border-radius: 14px;
      box-shadow: 0 2px 10px var(--c-shadow);
      border: 1.5px solid var(--c-border-2);
      animation: feel-in 0.18s cubic-bezier(0.34, 1.4, 0.64, 1);
    }
    @keyframes feel-in {
      from { opacity: 0; transform: translateY(-6px) scale(0.95); }
      to   { opacity: 1; transform: none; }
    }
    .aw-feeling-opt {
      flex: 1; height: 44px; border-radius: 10px;
      border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      font-size: 20px; cursor: pointer; transition: all 0.12s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &.active { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.08); transform: scale(1.1); }
      &:hover:not(.active) { border-color: var(--c-border); background: var(--c-hover); }
    }
    .aw-feeling-clear {
      width: 38px; height: 44px; border-radius: 10px; flex-shrink: 0;
      border: 1.5px solid var(--c-border-2); background: transparent;
      color: var(--c-text-3); cursor: pointer; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.12s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { color: #ef5350; border-color: rgba(239,83,80,0.3); background: rgba(239,83,80,0.06); }
    }

    /* ── Active workout action menu FAB ── */
    .aw-menu-fab {
      position: fixed; right: 20px;
      bottom: calc(var(--nav-height) + 16px);
      z-index: 89;
      width: 56px; height: 56px; border-radius: 50%;
      border: 1.5px solid var(--c-border); background: var(--c-card); color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px var(--c-shadow-md);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 24px; }
      &:hover { background: var(--c-subtle); transform: scale(1.06); }
      &:active { transform: scale(0.94); }
      &.aw-menu-fab--open { background: var(--c-subtle); border-color: var(--c-brand); color: var(--c-brand); }
    }
    .aw-menu-backdrop { position: fixed; inset: 0; z-index: 88; }
    /* ── Save-order button shown while reordering ── */
    .aw-reorder-save-fab {
      position: fixed; right: 20px;
      bottom: calc(var(--nav-height) + 16px);
      z-index: 89;
      display: flex; align-items: center; gap: 8px;
      height: 56px; padding: 0 22px; border-radius: 28px;
      border: none; background: var(--c-brand); color: #fff;
      font-size: 15px; font-weight: 700; letter-spacing: 0.2px;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px rgba(var(--c-brand-rgb), 0.4), 0 1px 4px var(--c-shadow);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 24px; }
      &:hover { background: var(--c-brand-dk); transform: scale(1.04); }
      &:active { transform: scale(0.96); }
    }
    /* ── Contextual "save as template" nudge ── */
    .aw-nudge {
      position: relative;
      display: flex; align-items: center; gap: 10px;
      margin: 12px 16px 0; padding: 12px 32px 12px 12px;
      background: color-mix(in srgb, var(--c-brand) 5%, var(--c-card));
      border: 1.5px solid color-mix(in srgb, var(--c-brand) 22%, var(--c-border-2));
      border-radius: 14px;
    }
    .aw-nudge-icon { font-size: 22px; color: var(--c-brand); flex-shrink: 0; font-variation-settings: 'FILL' 0, 'wght' 400; }
    .aw-nudge-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .aw-nudge-title { font-size: 13px; font-weight: 800; color: var(--c-text); }
    .aw-nudge-sub { font-size: 11.5px; color: var(--c-text-3); line-height: 1.35; }
    .aw-nudge-cta {
      flex-shrink: 0; height: 34px; padding: 0 16px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white; font-size: 13px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover { background: var(--c-brand-dk); }
    }
    .aw-nudge-x {
      position: absolute; top: 6px; right: 6px;
      width: 24px; height: 24px; border-radius: 50%; border: none;
      background: transparent; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { background: var(--c-subtle); color: var(--c-text-2); }
    }

    /* ── Sèrie activa (proper exercici suggerit) ── */
    .aw-suggest {
      margin: 12px 16px 0; padding: 12px;
      background: color-mix(in srgb, var(--c-brand) 5%, var(--c-card));
      border: 1.5px solid color-mix(in srgb, var(--c-brand) 20%, var(--c-border-2));
      border-radius: 14px;
      animation: aw-suggest-in 0.25s ease;
    }
    @keyframes aw-suggest-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .aw-suggest-head { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
    .aw-suggest-icon { font-size: 18px; color: var(--c-brand); flex-shrink: 0; }
    .aw-suggest-title { font-size: 12.5px; font-weight: 800; color: var(--c-text); }
    .aw-suggest-sub {
      font-size: 10.5px; font-weight: 600; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px; margin-left: auto;
    }
    .aw-suggest-list { display: flex; flex-direction: column; gap: 6px; }
    .aw-suggest-chip {
      display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
      width: 100%; padding: 9px 12px; text-align: left;
      background: var(--c-card); border: 1.5px solid var(--c-border-2); border-radius: 11px;
      cursor: pointer; touch-action: manipulation; transition: border-color 0.15s, background 0.15s;
      &:hover { border-color: var(--c-brand); background: color-mix(in srgb, var(--c-brand) 6%, var(--c-card)); }
    }
    .aw-suggest-chip-top { display: flex; align-items: center; gap: 7px; }
    .aw-suggest-add {
      font-size: 18px; color: var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.12); border-radius: 7px; padding: 2px;
    }
    .aw-suggest-name { font-size: 14px; font-weight: 700; color: var(--c-text); }
    .aw-suggest-reason { font-size: 11px; color: var(--c-text-3); padding-left: 29px; line-height: 1.3; }

    .aw-menu-dropdown {
      position: fixed; right: 16px;
      bottom: calc(var(--nav-height) + 16px + 56px + 10px);
      z-index: 90; min-width: 230px;
      background: var(--c-card); border-radius: 14px;
      box-shadow: 0 4px 24px var(--c-shadow-md), 0 0 0 1px var(--c-border);
      padding: 6px;
      transform-origin: bottom right;
      animation: menu-in 0.18s cubic-bezier(0.34, 1.2, 0.64, 1) both;
    }
    @keyframes menu-in {
      from { opacity: 0; transform: scale(0.85); }
      to   { opacity: 1; transform: scale(1); }
    }
    .aw-menu-item {
      display: flex; align-items: center; gap: 12px;
      width: 100%; padding: 13px 14px; border-radius: 10px;
      border: none; background: transparent;
      color: var(--c-text); font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; text-align: left;
      transition: background 0.12s;
      .material-symbols-outlined { font-size: 20px; color: var(--c-text-3); }
      &:hover { background: var(--c-subtle); }
      &.aw-menu-item--danger { color: #ef5350; }
      &.aw-menu-item--danger .material-symbols-outlined { color: #ef5350; }
      &.aw-menu-item--danger:hover { background: rgba(239,83,80,0.07); }
    }

    /* ── Save as template sheet (floating bottom sheet — see global .bottom-sheet) ── */
    .aw-tpl-sheet { padding: 8px 20px 22px; }
    .aw-tpl-header {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;
    }
    .aw-tpl-title { font-size: 17px; font-weight: 800; color: var(--c-text); }
    .aw-tpl-close {
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: var(--c-subtle); cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); }
    }
    .aw-tpl-field { margin-bottom: 4px; }
    .aw-tpl-label {
      display: block; font-size: 12px; font-weight: 700; color: var(--c-text-2);
      text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;
    }
    .aw-tpl-input {
      width: 100%; padding: 12px 14px; border-radius: 10px; box-sizing: border-box;
      border: 1.5px solid var(--c-border); background: var(--c-subtle);
      font-size: 16px; color: var(--c-text); outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); background: var(--c-card); }
    }
    .aw-tpl-actions { display: flex; gap: 8px; margin-top: 18px; }
    .aw-tpl-cancel {
      flex: 1; padding: 13px; border-radius: 12px;
      border: 1.5px solid var(--c-border); background: transparent;
      color: var(--c-text-2); font-size: 15px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover { background: var(--c-subtle); }
    }
    .aw-tpl-save {
      flex: 2; padding: 13px; border-radius: 12px;
      border: none; background: var(--c-brand);
      color: white; font-size: 15px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.4; cursor: default; }
    }

    /* ── Type grid (inside the Gym / Esport cards) ── */
    .es-empty {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      padding: 24px 16px; text-align: center;
    }
    .es-empty-icon { font-size: 32px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 200; }
    .es-empty-msg { font-size: 13px; color: var(--c-text-3); }
    .es-empty-btn {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 8px 16px; border-radius: 10px; border: none;
      background: var(--c-brand); color: #fff;
      font-size: 13px; font-weight: 600; cursor: pointer;
      .material-symbols-outlined { font-size: 16px; }
    }

    .type-grid {
      display: grid; gap: 10px;
      &.type-grid--mt { margin-top: 10px; }
    }
    /* Quick link to manage this section's catalog (exercises / sports),
     * same idea as "Gestionar plantilles" in the picker. */
    .section-manage {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; margin-top: 10px; padding: 10px 8px 2px;
      border: none; background: transparent;
      color: var(--c-text-2); font-size: 13px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; transition: color 0.15s;
      .material-symbols-outlined { font-size: 18px; color: var(--c-text-3); }
      &:hover { color: var(--c-text); }
      &:active { opacity: 0.7; }
    }
    /* Text guia sota la capçalera de secció: deixa clar que els mosaics
       s'han de tocar per començar/registrar. */
    .section-hint {
      margin: -2px 0 10px; padding: 0 2px;
      font-size: 12px; font-weight: 500; color: var(--c-text-3); line-height: 1.3;
    }
    .type-btn {
      position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 7px;
      padding: 16px 4px 14px;
      border: 2px solid color-mix(in srgb, var(--cat-color) 55%, var(--c-border));
      border-radius: 16px;
      background: color-mix(in srgb, var(--cat-color) 10%, var(--c-card));
      cursor: pointer;
      color: color-mix(in srgb, var(--cat-color) 80%, var(--c-text));
      box-shadow: 0 1px 3px var(--c-shadow);
      transition: all 0.18s; touch-action: manipulation;
      &:hover {
        border-color: var(--cat-color);
        background: color-mix(in srgb, var(--cat-color) 18%, var(--c-card));
        box-shadow: 0 4px 12px color-mix(in srgb, var(--cat-color) 22%, var(--c-shadow));
        transform: translateY(-1px);
      }
      &:active { transform: scale(0.97); }
      .type-icon { font-size: 28px; }
      .type-label { font-size: 11px; font-weight: 700; letter-spacing: 0.2px; text-align: center; }
    }
    /* Placa "+" a la cantonada: senyal explícita que el mosaic és un botó
       d'acció (afegir / començar), no una simple etiqueta. */
    .type-btn-add {
      position: absolute; top: 6px; right: 6px;
      display: flex; align-items: center; justify-content: center;
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--cat-color); color: #fff;
      font-size: 13px; font-variation-settings: 'wght' 600;
      box-shadow: 0 1px 3px color-mix(in srgb, var(--cat-color) 40%, transparent);
    }

    /* ── Loading ── */
    .loading-state {
      display: flex; justify-content: center; padding: 48px;
      .material-symbols-outlined { font-size: 32px; color: var(--c-border); }
    }

    /* ── Suggestion card: full-width bar, pinned above the nav bar ── */
    .suggestion-float-row {
      position: fixed; left: 16px; right: 16px; bottom: calc(var(--nav-height) + 16px); z-index: 90;
      display: flex; align-items: flex-end; gap: 8px;
    }

    .sf-card-wrap { position: relative; flex: 1; min-width: 0; }

    /* Amb el gos al costat, la targeta es llegeix com la seva bafarada:
     * cantonada de baix a la dreta plana i cua apuntant-lo. */
    .sfr--with-dog .suggestion-float { border-radius: 14px 14px 4px 14px; }

    .sf-tail {
      position: absolute; right: -6px; bottom: 12px;
      width: 11px; height: 11px;
      background: color-mix(in srgb, var(--sc) 8%, var(--c-card));
      border-top: 1.5px solid color-mix(in srgb, var(--sc) 35%, var(--c-border-2));
      border-right: 1.5px solid color-mix(in srgb, var(--sc) 35%, var(--c-border-2));
      transform: rotate(45deg); border-radius: 0 3px 0 0;
      pointer-events: none;
    }

    .sf-figure {
      height: 88px; width: auto; display: block; flex-shrink: 0;
      filter: drop-shadow(0 3px 8px var(--c-shadow-md));
      /* El dibuix acaba a mitja pitrera; sense això la vora recta canta. */
      mask-image: linear-gradient(to bottom, #000 84%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, #000 84%, transparent 100%);
    }

    /* A la cantonada per no robar amplada al text, i a l'esquerra perquè a la
     * dreta hi ha el gos i el taparia. */
    .sf-close {
      position: absolute; top: -9px; left: -7px; z-index: 1;
      width: 26px; height: 26px; border-radius: 50%;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      color: var(--c-text-3); cursor: pointer; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px var(--c-shadow);
      .material-symbols-outlined { font-size: 15px; }
      &:hover { color: var(--c-text-2); background: var(--c-hover); }
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 1px; }
    }
    .suggestion-float {
      display: flex; align-items: center; gap: 10px; width: 100%;
      height: 64px; border-radius: 14px; padding: 0 12px 0 0;
      border: 1.5px solid color-mix(in srgb, var(--sc) 35%, var(--c-border-2));
      background: color-mix(in srgb, var(--sc) 8%, var(--c-card));
      box-shadow: 0 4px 16px var(--c-shadow-md);
      cursor: pointer; touch-action: manipulation; overflow: hidden;
      transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
      &:hover {
        box-shadow: 0 5px 20px var(--c-shadow-md);
        border-color: color-mix(in srgb, var(--sc) 55%, var(--c-border));
        background: color-mix(in srgb, var(--sc) 13%, var(--c-card));
      }
      &:active { transform: scale(0.98); }
      /* Millora d'accessibilitat: anell de focus visible per a teclat. */
      &:focus-visible { outline: 2px solid var(--sc); outline-offset: 2px; }
    }
    .sf-bar { width: 5px; align-self: stretch; flex-shrink: 0; background: var(--sc); }
    .sf-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    /* Pastilla amb el verb del suggeriment. Es tenyeix amb var(--c-card) i
       mai amb transparent: el color ve del tipus d'entrenament i pot ser
       qualsevol (DESIGN.md §1). */
    .sf-go {
      display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0;
      padding: 6px 8px 6px 11px; border-radius: 20px;
      border: 1.5px solid color-mix(in srgb, var(--sc) 75%, var(--c-card));
      background: color-mix(in srgb, var(--sc) 18%, var(--c-card));
      color: color-mix(in srgb, var(--sc) 55%, var(--c-text));
      font-size: 11.5px; font-weight: 800; letter-spacing: 0.1px; white-space: nowrap;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 15px; }
    }
    .suggestion-float:hover .sf-go { background: color-mix(in srgb, var(--sc) 28%, var(--c-card)); }
    .sf-label {
      font-size: 14px; font-weight: 700; color: var(--c-text); line-height: 1.2;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sf-reason {
      font-size: 11.5px; font-weight: 600; letter-spacing: 0.1px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: color-mix(in srgb, var(--sc) 65%, var(--c-text-3));
    }

    /* ── "Nou entrenament" section card ── */
    .card-section {
      margin: 16px 16px 0;
      padding: 14px 14px 16px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .section-icon  { font-size: 21px; color: var(--c-brand); font-variation-settings: 'FILL' 1, 'wght' 400; }
    .section-title { margin: 0; flex: 1; font-size: 17px; font-weight: 800; color: var(--c-text); letter-spacing: 0.1px; }
    .section-config {
      width: 32px; height: 32px; flex-shrink: 0; border-radius: 50%;
      border: none; background: transparent; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 19px; }
      &:hover { background: var(--c-subtle); color: var(--c-text-2); }
    }

    .type-btn--active {
      border-color: var(--cat-color);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--cat-color) 35%, transparent);
    }

    /* ── Template picker bottom sheet ── */
    .tp-sheet { padding: 8px 16px 20px; }
    .tp-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .tp-header-left { display: flex; align-items: center; gap: 10px; }
    .tp-header-info { display: flex; flex-direction: column; gap: 1px; }
    .tp-muscles { font-size: 12px; color: var(--c-text-3); }
    .tp-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
    .tp-title { font-size: 18px; font-weight: 800; color: var(--c-text); }
    .tp-close {
      width: 32px; height: 32px; border-radius: 50%;
      border: none; background: var(--c-subtle); cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
    }
    .tp-section {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.5px;
      padding: 10px 4px 6px;
    }
    .tp-option {
      display: flex; align-items: center; gap: 12px;
      width: 100%; padding: 13px 12px; border-radius: 12px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      text-align: left; cursor: pointer; touch-action: manipulation;
      transition: all 0.15s; margin-bottom: 6px;
      &:hover { background: var(--c-subtle); border-color: var(--c-border); }
      &:active { transform: scale(0.98); }
    }
    .tp-option--primary {
      border-color: rgba(var(--c-brand-rgb), 0.3);
      background: rgba(var(--c-brand-rgb), 0.04);
      .tp-opt-icon { color: var(--c-brand); }
      &:hover { background: rgba(var(--c-brand-rgb), 0.1); border-color: var(--c-brand); }
    }
    .tp-option--create {
      border-style: dashed;
      border-color: rgba(var(--c-brand-rgb), 0.4);
      background: rgba(var(--c-brand-rgb), 0.03);
      margin-top: 6px;
      .tp-opt-icon { color: var(--c-brand); }
      .tp-opt-name { color: var(--c-brand); }
      &:hover { background: rgba(var(--c-brand-rgb), 0.09); border-color: var(--c-brand); border-style: solid; }
    }
    .tp-opt-icon { font-size: 22px; color: var(--c-text-3); flex-shrink: 0; }
    .tp-opt-info { display: flex; flex-direction: column; gap: 2px; flex: 1; }
    .tp-opt-name { font-size: 15px; font-weight: 600; color: var(--c-text); }
    .tp-opt-sub  { font-size: 12px; color: var(--c-text-3); }
    .tp-manage {
      display: flex; align-items: center; justify-content: space-between;
      width: 100%; padding: 14px 12px; border-radius: 12px;
      border: none; background: transparent;
      color: var(--c-text-2); font-size: 14px; font-weight: 600;
      cursor: pointer; touch-action: manipulation; margin-top: 4px;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; color: var(--c-text-3); }
      &:hover { background: var(--c-subtle); }
    }

    /* ── Trainer proposal card ── */
    .date-context {
      display: flex; align-items: center; gap: 11px;
      margin: 14px 16px 0; padding: 10px 12px;
      background: var(--c-card); border-radius: 16px;
      border: 2px solid color-mix(in srgb, var(--c-brand) 30%, transparent);
      box-shadow: 0 2px 10px var(--c-shadow);
      animation: bar-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .date-context--past {
      border-color: color-mix(in srgb, #b26a00 32%, transparent);
      .dc-icon, .dc-eyebrow { color: #b26a00; }
    }
    .dc-icon {
      font-size: 22px; color: var(--c-brand); flex-shrink: 0;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .dc-info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
    .dc-eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.4px; text-transform: uppercase; color: var(--c-brand); }
    .dc-date { font-size: 15px; font-weight: 700; color: var(--c-text); }
    .proposal-card {
      margin: 16px 16px 0;
      padding: 14px 14px 12px;
      background: var(--c-card);
      border-radius: 18px;
      border: 2px solid rgba(0,104,116,0.25);
      box-shadow: 0 2px 10px var(--c-shadow);
      animation: bar-in 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    .proposal-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
    }
    .proposal-icon {
      font-size: 22px; color: var(--c-brand); flex-shrink: 0;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .proposal-header-info { display: flex; flex-direction: column; gap: 1px; }
    .proposal-title  { font-size: 13px; font-weight: 800; color: var(--c-brand); letter-spacing: 0.1px; }
    .proposal-trainer { font-size: 11px; color: var(--c-text-2); }
    .proposal-exercises {
      display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px;
    }
    .proposal-ex {
      font-size: 11px; font-weight: 600; color: var(--c-text-2);
      background: var(--c-subtle); border-radius: 8px; padding: 3px 8px;
    }
    .proposal-ex--more { color: var(--c-text-3); font-style: italic; }
    .proposal-notes {
      margin: 0 0 10px; font-size: 12px; color: var(--c-text-2); font-style: italic; line-height: 1.4;
    }
    .proposal-actions { display: flex; gap: 8px; }
    .proposal-accept {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 9px 14px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 16px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.6; cursor: default; }
    }
    .proposal-ignore {
      display: flex; align-items: center; gap: 5px;
      padding: 9px 14px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card); color: var(--c-text-2);
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .spin { animation: spin 1s linear infinite; }


  `],
})
export class TrainComponent implements OnDestroy {
  readonly workoutService  = inject(WorkoutService);
  private ongoing          = inject(OngoingWorkoutService);
  readonly sportService    = inject(SportService);
  readonly offlineService  = inject(OfflineService);
  readonly trainerService  = inject(TrainerService);
  readonly settingsService = inject(UserSettingsService);
  private templateService  = inject(TemplateService);
  private suggestionService = inject(ExerciseSuggestionService);
  private exerciseService  = inject(ExerciseService);
  private sharedWorkoutService = inject(SharedWorkoutService);
  private profileService   = inject(WorkoutProfileService);
  readonly hintService     = inject(AppHintService);
  readonly router          = inject(Router);
  private route            = inject(ActivatedRoute);
  private navHistory       = inject(NavigationHistoryService);
  private dialog           = inject(MatDialog);
  private feedback         = inject(FeedbackService);
  private confirmDialog    = inject(ConfirmDialogService);
  /** El dia d'avui com a senyal: els càlculs d'"avui" es refan sols quan
   *  passa la mitjanit amb l'app oberta. */
  private readonly today   = inject(TodayService).today;

  @ViewChild('editor') editor?: WorkoutEditorComponent;

  /** Seeded synchronously from the route (like `activeWorkoutId`) so a
   *  `/train?date=YYYY-MM-DD` deep-link — e.g. "registrar" a past day from
   *  the calendar — lands straight on that day instead of flashing today. */
  readonly selectedDate    = signal<string>(
    validDateParam(this.route.snapshot.queryParamMap.get('date')) ?? this.today()
  );
  readonly sportToggling   = signal(false);
  private typeService = inject(TrainingTypeService);
  readonly workoutTypes = computed((): WorkoutTypeItem[] =>
    this.typeService.types().map(t => ({ value: t.id, label: t.name, icon: t.icon, color: t.color }))
  );
  readonly workoutMenuOpen = signal(false);
  /** Off by default — exercises can only be dragged to reorder once the
   *  user turns this on from the workout's three-dot menu. */
  readonly reorderMode     = signal(false);
  /** Off by default — mutually exclusive with reorderMode; lets the user
   *  select 2+ exercises to link into a superset. */
  readonly groupingMode    = signal(false);
  readonly saveTemplateOpen = signal(false);
  saveTemplateName = '';
  /** Seeded synchronously from the route snapshot (rather than starting
   *  null and waiting for the query-param effect below) so a workout opened
   *  via ?workout=<id> renders straight into the editor on first paint,
   *  without a flash of the dashboard first. */
  readonly activeWorkoutId = signal<string | null>(this.route.snapshot.queryParamMap.get('workout'));
  /** L'entrenament que s'ha demanat editar. Un de passat s'obre per llegir-lo
   *  (`editing()`), i això recorda que ja se n'ha demanat l'edició. */
  private readonly editRequestedFor = signal<string | null>(null);
  readonly creating          = signal(false);
  readonly awFeelingOpen     = signal(false);
  readonly feelingLevels5: FeelingLevel[] = [1, 2, 3, 4, 5];
  readonly acceptingProposal = signal(false);

  /** Les propostes ignorades viuen a `user_settings`: ignorar-ne una al mòbil
   *  també la fa fora al portàtil. Reactiu, a més: en ignorar-la la targeta
   *  marxa a l'instant, sense esperar cap altre canvi. */
  private readonly _dismissedDates = computed(() =>
    new Set(this.settingsService.dismissedProposalDates())
  );
  /** Per a qui ja s'ha mirat la clau antiga; per usuari, que en un mateix
   *  navegador se'n poden encadenar dos. */
  private _legacyProposalsDoneFor: string | null = null;

  readonly activeProposal = computed(() => {
    if (!this.trainerService.hasTrainer()) return null;
    const date = this.selectedDate();
    const prop = this.trainerService.getProposalForDate(date);
    if (!prop) return null;
    if (this._dismissedDates().has(date)) return null;
    // Hide if already accepted as a done workout
    const alreadyAccepted = this.workoutService
      .getDoneWorkoutsForDate(date)
      .some(w => w.sourceProposalId === prop.id);
    return alreadyAccepted ? null : prop;
  });

  private readonly auth = inject(AuthService);

  readonly isToday = computed(() => this.selectedDate() === this.today());

  /** True when registering a session for a day that has already passed —
   *  the workout is saved as `done`, not planned, and the UI reads
   *  "Registrant" rather than "Planificant". */
  readonly isSelectedPast = computed(() => this.selectedDate() < this.today());

  /** Human date for the "not today" context banner: Ahir / Demà, otherwise
   *  the capitalised weekday + day + month. */
  readonly selectedDateLabel = computed(() => {
    const sel = this.selectedDate();
    const shift = (n: number) => {
      const d = new Date(this.today() + 'T12:00:00');
      d.setDate(d.getDate() + n);
      return toDateStr(d);
    };
    if (sel === shift(-1)) return 'Ahir';
    if (sel === shift(1))  return 'Demà';
    const label = new Date(sel + 'T12:00:00')
      .toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });


  /** Shown regardless of what's already been done today — always suggests
   *  the next overdue category / sport. */
  readonly todaySuggestion = computed((): TodaySuggestion | null => {
    const today = this.today();
    if (this.selectedDate() !== today) return null;

    const goal    = this.settingsService.fitnessGoal();
    const profile = this.profileService.profile();

    // Score each gym category by how "overdue" it is relative to the user's
    // actual training cycle. Only include categories that have had enough
    // recovery time since the last session.
    const gymCandidates = this.typeService.types().map(t => t.id)
      .map(cat => ({ cat, profile: profile.gym[cat] }))
      .filter(c => !!c.profile) // guard against a momentary types/profile skew
      .map(c => ({ cat: c.cat, ...c.profile }))
      .filter(c => c.daysSinceLast >= profile.minRecovery)
      .sort((a, b) => b.overdueScore - a.overdueScore);

    const nextGymCat = gymCandidates[0]?.cat ?? null;

    // Sport: prefer the most-recently-done sport (maintains momentum),
    // fall back to the 30-day favourite, then first available.
    const nextSport = profile.recentSport ?? profile.favoriteSport
                   ?? this.sportService.sports()[0] ?? null;

    const mkGym = (cat: ExerciseCategory): GymSuggestion => {
      const p = profile.gym[cat];
      const daysStr = p.daysSinceLast === 1 ? 'Fa 1 dia' : `Fa ${p.daysSinceLast} dies`;
      const reason  = p.daysSinceLast >= 99 ? 'Encara no l\'has entrenat' : daysStr;
      return {
        type: 'gym', category: cat,
        label: CATEGORY_LABELS[cat], color: CATEGORY_COLORS[cat], icon: CATEGORY_ICONS[cat],
        reason,
      };
    };
    const mkSport = (s: Sport): SportSuggestion => ({
      type: 'sport', sport: s, label: s.name, color: s.color, icon: s.icon,
      reason: profile.recentSport?.id === s.id ? 'El que vas fer l\'últim cop' : 'El teu esport habitual',
    });

    switch (goal) {
      case 'strength':
      case null:
        return nextGymCat ? mkGym(nextGymCat) : null;
      case 'fitness':
        if (nextGymCat) return mkGym(nextGymCat);
        if (nextSport)  return mkSport(nextSport);
        return null;
      case 'weight':
        if (nextSport)  return mkSport(nextSport);
        if (nextGymCat) return mkGym(nextGymCat);
        return null;
      case 'sport':
        return nextSport ? mkSport(nextSport) : null;
    }
  });

  /**
   * Qui proposa el suggeriment. La divisió és la de sempre: el gimnàs és cosa
   * del Marley i l'esport, del Xoco.
   */
  suggestionMascotId(s: TodaySuggestion): Mascot {
    return s.type === 'gym' ? 'marley' : 'xoco';
  }

  suggestionMascot(s: TodaySuggestion): MascotMeta {
    return MASCOTS[this.suggestionMascotId(s)];
  }

  /**
   * Tancar la bafarada retira el suggeriment sencer: no ha de quedar cap
   * targeta de fons ni cap acció al seu lloc. Viu només a la vista —quan
   * tornes a entrar a la pàgina, el gos torna a proposar.
   */
  readonly suggestionDismissed = signal(false);

  dismissSuggestion(): void {
    this.suggestionDismissed.set(true);
  }

  handleSuggestionClick(s: TodaySuggestion): void {
    if (s.type === 'gym') this.selectType(s.category);
    else void this.startSportSession(s.sport);
  }

  readonly isSelectedFuture = computed(() => this.selectedDate() > this.today());

  readonly pagePaddingBottom = computed(() =>
    '88px' // clear the active-workout menu FAB / the dog's suggestion card
  );

  /** Searches across every already-loaded month (not just `selectedDate`),
   *  since the feed lets you open a workout from any past day the month
   *  cache already covers. */
  readonly activeWorkout = computed((): Workout | null => {
    const id = this.activeWorkoutId();
    if (!id) return null;
    return this.workoutService.workouts().find(w => w.id === id) ?? null;
  });

  /**
   * Si la pàgina és per entrenar o per llegir.
   *
   * Mana si l'entrenament s'ha donat per acabat. Mentre està en marxa —i
   * qualsevol acabat de crear ho està— s'obre a l'editor: hi véns a fer-lo, i
   * un tap des d'Inici t'hi ha de deixar a dins. Un cop acabat s'obre a
   * l'esquema, com una sessió d'esport: hi véns a mirar-te'l, i tocar-lo és
   * un pas que es demana. Un pla també s'obre a l'editor: planificar és
   * escriure-hi.
   *
   * Que estigui acabat o no només ho sap aquest dispositiu
   * (`OngoingWorkoutService`); sense cap notícia, es dona per acabat.
   */
  readonly editing = computed((): boolean => {
    const w = this.activeWorkout();
    if (!w) return false;
    if (this.editRequestedFor() === w.id) return true;
    if (this.isPlannedWorkout(w)) return true;
    return this.ongoing.isOngoing(w.id);
  });

  /** Cert mentre l'entrenament obert no s'hagi donat per acabat. */
  readonly activeIsOngoing = computed((): boolean => {
    const w = this.activeWorkout();
    return !!w && !this.isPlannedWorkout(w) && this.ongoing.isOngoing(w.id);
  });

  readonly activeWorkoutCategories = computed((): string[] => {
    const w = this.activeWorkout();
    return w ? workoutCategories(w) : [];
  });

  readonly activeWorkoutCategoryItems = computed((): WorkoutTypeItem[] =>
    this.activeWorkoutCategories()
      .map(c => ({ value: c, label: CATEGORY_LABELS[c], icon: CATEGORY_ICONS[c], color: CATEGORY_COLORS[c] }))
  );

  /** "Sèrie activa": learned next-exercise guesses for the live workout,
   *  derived from the user's own history + templates. Hidden while
   *  reordering/grouping and for planned days (this is a live-training aid). */
  /** Ticks every minute so time-based gates (staleness) re-evaluate on their
   *  own, not only when the workout changes. */
  private readonly _now = signal(Date.now());
  private _nowTimer?: ReturnType<typeof setInterval>;

  readonly exerciseSuggestions = computed((): ExerciseSuggestion[] => {
    const w = this.activeWorkout();
    if (!w || (w.status ?? 'done') === 'planned') return [];
    // Only for a workout being trained *today*: a past session opened from the
    // calendar/history isn't being performed now, so never suggest a "next"
    // exercise for it.
    if (w.date !== this.today()) return [];
    // Read the reactive deps up-front so the computed still re-runs on their
    // changes even if the body below bails out early or throws.
    const now = this._now();
    const enabled = this.settingsService.nextExerciseSuggestionEnabled();
    const busy = this.reorderMode() || this.groupingMode();
    // The whole derivation is wrapped: this is the ONLY suggestion path that
    // runs for today's active workout, so any throw here (a malformed entry, an
    // engine edge case on the user's own data, …) reads to the user as "opening
    // today's training crashes" — a template expression that re-throws every
    // change-detection pass, blanking the page and spamming the error toast. A
    // live-training nicety must never do that: on any failure, drop the hint.
    try {
      // The user can turn the live next-exercise hint off in Advanced settings
      // (on by default).
      if (!enabled) return [];
      // …only while it's still active: once it's been idle for a couple of hours
      // (last set/edit), assume the session is over and stay quiet.
      if (w.updatedAt && now - w.updatedAt.getTime() > STALE_SUGGESTION_MS) return [];
      if (busy) return [];
      // "Sèrie activa" is your *next* move while training, so it stays quiet
      // until you've actually started — at least one logged set in the session.
      // (`sets` comes straight from stored JSON, so guard against a missing one.)
      if (!w.entries.some(e => (e.sets?.length ?? 0) > 0)) return [];
      const category = (w.category ?? workoutCategories(w)[0]) as ExerciseCategory | undefined;
      if (!category) return [];
      const currentIds = w.entries.map(e => e.exerciseId);
      return this.suggestionService.suggest(category, currentIds, 3);
    } catch (err) {
      console.error('[exerciseSuggestions] failed — dropping the hint', err);
      return [];
    }
  });


  /** Show the "add your bodyweight" nudge when the live workout has a
   *  bodyweight/assisted exercise but no bodyweight is set — so calisthenics
   *  can count towards volume. Dismissible: not adding it is a valid choice
   *  (those sets are still logged, just not in the volume total). */
  readonly needsBodyweightHint = computed(() => {
    const w = this.activeWorkout();
    if (!w || (w.status ?? 'done') === 'planned') return false;
    if (w.date !== this.today()) return false;
    if (this.reorderMode() || this.groupingMode()) return false;
    if (this.settingsService.bodyweightKg() != null) return false;
    if (this.hintService.isDismissed('nudge-bodyweight-volume')) return false;
    try {
      return w.entries.some(e => {
        const lt = this.exerciseService.getById(e.exerciseId)?.loadType;
        return lt === 'bodyweight' || lt === 'assisted';
      });
    } catch (err) {
      // Same reasoning as exerciseSuggestions: a today-only nudge must not blank
      // the training view if resolving an exercise trips on unexpected data.
      console.error('[needsBodyweightHint] exercise lookup failed', err);
      return false;
    }
  });

  readonly pickerCat = signal<ExerciseCategory | null>(null);

  readonly pickerLast = computed(() => {
    const cat = this.pickerCat();
    return cat ? this.workoutService.getLastWorkoutByCategory(cat) : null;
  });

  readonly pickerLabel = computed(() => {
    const cat = this.pickerCat();
    return cat ? (CATEGORY_LABELS[cat] ?? '') : '';
  });

  readonly pickerColor = computed(() => {
    const cat = this.pickerCat();
    return cat ? CATEGORY_COLORS[cat] : '';
  });

  readonly pickerMuscles = computed(() => {
    const cat = this.pickerCat();
    return cat ? CATEGORY_MUSCLES[cat] : '';
  });

  readonly pickerLastAgo = computed(() => {
    const last = this.pickerLast();
    if (!last) return '';
    const diffDays = Math.round(
      (new Date(this.today() + 'T12:00:00').getTime() - new Date(last.date + 'T12:00:00').getTime())
      / 86_400_000
    );
    if (diffDays === 0) return 'avui';
    if (diffDays === 1) return 'ahir';
    if (diffDays < 7)  return `fa ${diffDays} dies`;
    if (diffDays < 14) return 'fa una setmana';
    return `fa ${Math.round(diffDays / 7)} setmanes`;
  });

  readonly pickerUserTemplates = computed(() => {
    const cat = this.pickerCat();
    return cat ? this.templateService.forCategory(cat) : [];
  });

  constructor() {
    this.sportService.ensureLoaded();
    this._nowTimer = setInterval(() => this._now.set(Date.now()), 60_000);

    // ── El que s'està mirant ho diu l'adreça ────────────────────────────
    //
    // S'hi arriba amb `/train?workout=<id>` (des d'Inici o de l'Historial) o
    // amb `/train?date=<dia>` (registrar un dia passat, planificar-ne un de
    // futur), i la pàgina es posa al dia a cada navegació que hi acaba.
    //
    // Es llegeix de l'estat del router, no de `route.queryParamMap`: la ruta
    // es manté viva (AppReuseStrategy) i, quan es reenganxa, aquell
    // observable només torna a emetre si els paràmetres han canviat respecte
    // de l'última vegada que hi eres. Obrir dues vegades el mateix
    // entrenament no els canvia, i el segon cop et quedaves al taulell.
    //
    // I l'adreça es queda com és: abans, tot just consumit el `?workout=`, se
    // n'anava amb una navegació a part. Aquella navegació —relativa a una
    // ruta que podia haver deixat de ser l'activa— és la que de tant en tant
    // et plantava a `/train` en comptes de l'entrenament, i deixava l'adreça
    // dient una cosa i la pantalla una altra: recarregar o tornar enrere ja
    // no hi tornava.
    let firstDateEffectRun = true;
    // Es posa just abans que obrir un entrenament canviï el dia a posta,
    // perquè la reinicialització de sota no tanqui el que s'acaba d'obrir.
    let suppressNextDateReset = false;

    // Arribar-hi *sense* `?date=` vol dir avui. La ruta es manté viva, així
    // que sense això la pàgina es quedava clavada al dia que havies obert
    // abans — tornaves a Inici, hi triaves avui, i Entrenament seguia pensant
    // que eres a l'1 de setembre. Només compta quan s'hi arriba des d'una
    // altra pàgina: navegar dins la mateixa pàgina no t'ha de moure de dia.
    let previousPath = this.router.url.split('?')[0];

    // Arrencada en fred amb `?workout=` a l'adreça: el senyal ja ve sembrat
    // del snapshot perquè la primera pintada sigui l'entrenament i no el
    // taulell (l'outlet pot muntar la pàgina després que la navegació hagi
    // acabat, i llavors no n'arriba cap avís). Les sèries, però, encara
    // s'han de demanar.
    const seededWorkoutId = this.activeWorkoutId();
    if (seededWorkoutId) this.openWorkout(seededWorkoutId);

    const syncFromUrl = (url: string, arrivedNow: boolean): void => {
      // Els paràmetres es llegeixen de l'adreça on ha anat a parar la
      // navegació, que és sempre la bona: ni depèn que un observable d'una
      // ruta reenganxada torni a emetre, ni de l'ordre en què s'actualitza
      // res.
      const params    = this.router.parseUrl(url).queryParams as Record<string, string | undefined>;
      const workoutId = params['workout'] ?? null;
      const linkDate  = validDateParam(params['date'] ?? null);

      const goToDay = (day: string): void => {
        if (this.selectedDate() === day) return;
        // El salt de dia és només de context quan s'obre un entrenament: no
        // ha de tancar el que s'acaba d'obrir.
        if (workoutId) suppressNextDateReset = true;
        this.selectedDate.set(day);
      };

      if (linkDate) goToDay(linkDate);
      else if (arrivedNow) goToDay(this.today());

      if (workoutId && workoutId !== this.activeWorkoutId()) this.openWorkout(workoutId);
    };

    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(e => {
        const path       = e.urlAfterRedirects.split('?')[0];
        const arrivedNow = previousPath !== '/train' && path === '/train';
        previousPath = path;
        if (path !== '/train') return;
        syncFromUrl(e.urlAfterRedirects, arrivedNow);
      });

    effect(() => {
      const date = this.selectedDate();
      const [yearStr, monthStr] = date.split('-');
      const year  = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      this.workoutService.ensureMonthLoaded(year, month);
      this.sportService.ensureMonthLoaded(year, month);
      untracked(() => {
        if (firstDateEffectRun) { firstDateEffectRun = false; return; }
        if (suppressNextDateReset) { suppressNextDateReset = false; return; }
        this.activeWorkoutId.set(null);
        this.editRequestedFor.set(null);
        this.pickerCat.set(null);
      });
    });

    // Les propostes ignorades d'abans vivien només en aquest dispositiu: es
    // pugen un sol cop a la configuració i la clau antiga s'esborra.
    effect(() => {
      const uid = this.auth.uid();
      if (!uid || !this.settingsService.loaded() || this._legacyProposalsDoneFor === uid) return;
      this._legacyProposalsDoneFor = uid;
      untracked(() => this._migrateDismissedProposals(uid));
    });

  }

  // ── Trainer proposal ─────────────────────────────────────────────────────

  async acceptProposal(prop: import('../../core/models/trainer.model').TrainerProposal): Promise<void> {
    this.acceptingProposal.set(true);
    try {
      const id = await this.workoutService.createWorkoutFromProposal(
        this.selectedDate(), prop.id, prop.entries,
      );
      this.openWorkout(id, { edit: true });
    } catch {
      this.feedback.error('Error en acceptar la proposta', 3000);
    } finally {
      this.acceptingProposal.set(false);
    }
  }

  ignoreProposal(): void {
    const date = this.selectedDate();
    const list = this.settingsService.dismissedProposalDates();
    if (list.includes(date)) return;
    // Es talla per quantitat: una data ignorada fa mesos ja no filtra res.
    void this.settingsService.update({
      dismissedProposalDates: [...list, date].slice(-KEEP_DISMISSED_PROPOSALS),
    });
  }

  private _migrateDismissedProposals(uid: string): void {
    const key = `gymgoli_dismissed_proposals_${uid}`;
    let legacy: string[] = [];
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      legacy = Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === 'string') : [];
    } catch { return; }
    if (!legacy.length) return;

    const merged = [...new Set([...this.settingsService.dismissedProposalDates(), ...legacy])].sort();
    void this.settingsService.update({
      dismissedProposalDates: merged.slice(-KEEP_DISMISSED_PROPOSALS),
    });
    try { localStorage.removeItem(key); } catch { /* mode privat */ }
  }

  // ── Workout navigation ────────────────────────────────────────────────────

  /** `edit` per als camins que acaben de crear l'entrenament: l'acabes de
   *  començar, així que no té sentit fer-te'l llegir abans de tocar-lo. */
  openWorkout(id: string, opts: { edit?: boolean } = {}): void {
    // De l'historial vell només se n'ha baixat el resum de la targeta. Obrir
    // la sessió és el moment de demanar-ne les sèries: sense elles l'editor
    // ensenyaria una sessió buida i cap canvi hi arribaria.
    void this.workoutService.ensureWorkoutEntries(id);
    this.activeWorkoutId.set(id);
    this.editRequestedFor.set(opts.edit ? id : null);
    this.pickerCat.set(null);
  }

  /** Un entrenament acabat es llegeix primer; això és el pas de tocar-lo, i
   *  a partir d'aquí és una sessió com la que estàs fent: tot editable. */
  startEditing(): void {
    const w = this.activeWorkout();
    if (w) this.editRequestedFor.set(w.id);
  }

  /**
   * Donar-lo per acabat: es tanca l'editor i la pàgina passa al resum.
   *
   * És el gest que fa de punt final, i per això té botó propi i no viu dins
   * cap menú. No toca l'entrenament —no és cap camp seu—: només aquest
   * dispositiu deixa de considerar-lo en marxa.
   */
  finishWorkout(): void {
    const w = this.activeWorkout();
    if (!w) return;
    this.ongoing.finish(w.id);
    this.editRequestedFor.set(null);
    this.reorderMode.set(false);
    this.groupingMode.set(false);
    this.feedback.success('Entrenament acabat', 2000);
  }

  /** Ni d'avui ni previst: una sessió que ja va passar. */
  isPastWorkout(w: Workout): boolean {
    return !this.isPlannedWorkout(w) && w.date < this.today();
  }

  closeWorkout(): void {
    this.activeWorkoutId.set(null);
    this.editRequestedFor.set(null);
    this.editor?.reset();
    // Return to wherever the workout was opened from — the home feed, the
    // calendar (when registering a past day), etc. — instead of always
    // dumping the user on /home. Falls back to home when there's no history.
    this.navHistory.goBack('/home');
  }

  async startPlan(w: Workout): Promise<void> {
    try {
      // Un planificat de la rutina no és cap fila fins que el comences: el
      // que s'obre és l'entrenament que s'acaba de crear, no el projectat.
      const id = await this.workoutService.startPlannedWorkout(w.id);
      this.openWorkout(id, { edit: true });
    } catch {
      this.feedback.error('Error en iniciar el pla', 2500);
    }
  }

  /** El dia de l'entrenament tal com el diu el feed: «Avui», «Ahir» o escrit.
   *  Viu a la capçalera de la pàgina: la targeta de sota no porta data, com
   *  la del feed. */
  heroDateLabel(w: Workout): string {
    return feedDayLabel(w.date, this.today());
  }

  /** Un pla és el que encara no s'ha fet: ni xifres ni sensació, com a
   *  `sport-session`. */
  isPlannedWorkout(w: Workout): boolean {
    return (w.status ?? 'done') === 'planned';
  }

  workoutLabel(w: Workout): string {
    const cats = workoutCategories(w);
    if (!cats.length) return 'Entrenament';
    return cats.map(c => CATEGORY_LABELS[c as ExerciseCategory] ?? c).join(' + ');
  }

  gridCols(count: number): string {
    return `repeat(${count % 2 === 0 ? 2 : 3}, 1fr)`;
  }

  readonly workoutCardColor    = workoutCardColor;
  readonly workoutPrimaryColor = workoutPrimaryColor;
  readonly workoutPrimaryIcon  = workoutPrimaryIcon;
  readonly workoutTypeLabel    = workoutTypeLabel;

  /** Les xifres de la targeta —exercicis, sèries i volum—, les mateixes que
   *  al feed. El pes corporal hi compta, així les dominades i companyia sumen
   *  volum com la resta. */
  workoutStats(w: Workout): ActivityStat[] {
    return workoutCardStats(w, {
      bodyweightKg: this.settingsService.bodyweightKg(),
      loadTypeOf: this.exerciseService.loadTypeOf,
      bodyweightFactorOf: this.exerciseService.bodyweightFactorOf,
    });
  }

  emojiOf(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  async pickWorkoutFeeling(workoutId: string, level: FeelingLevel | undefined): Promise<void> {
    this.awFeelingOpen.set(false);
    try {
      await this.workoutService.updateWorkoutFeeling(workoutId, level);
    } catch {
      this.feedback.error('Error en guardar la sensació', 2000);
    }
  }

  openSaveAsTemplate(w: Workout): void {
    this.workoutMenuOpen.set(false);
    const cats = w.categories ?? (w.category ? [w.category] : []);
    const cat = cats.length === 1 ? cats[0] as ExerciseCategory : null;
    this.saveTemplateName = cat ? (CATEGORY_LABELS[cat] ?? '') : '';
    this.saveTemplateOpen.set(true);
  }

  /** From the contextual nudge: opening the sheet means the user found the
   *  feature, so dismiss the nudge too. */
  saveTemplateFromNudge(w: Workout): void {
    this.hintService.dismiss('nudge-save-template');
    this.openSaveAsTemplate(w);
  }

  async confirmSaveAsTemplate(): Promise<void> {
    const name = this.saveTemplateName.trim();
    const w = this.activeWorkout();
    if (!name || !w) return;
    const cats = w.categories ?? (w.category ? [w.category] : []);
    const cat: ExerciseCategory | 'mixed' = cats.length === 1
      ? cats[0] as ExerciseCategory
      : 'mixed';
    const entries = w.entries.map(e => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName }));
    try {
      await this.templateService.create(name, cat, entries);
      this.saveTemplateOpen.set(false);
      this.saveTemplateName = '';
      this.feedback.success('Plantilla guardada', 2000);
    } catch {
      this.feedback.error('Error en guardar la plantilla', 3000);
    }
  }

  async shareWorkout(w: Workout): Promise<void> {
    this.workoutMenuOpen.set(false);
    try {
      const cats = w.categories ?? (w.category ? [w.category] : []);
      const cat: ExerciseCategory | 'mixed' = cats.length === 1 ? cats[0] as ExerciseCategory : 'mixed';
      const id  = await this.sharedWorkoutService.share(this.workoutLabel(w), cat, w.entries);
      const url = `${window.location.origin}/share/${id}`;

      if (navigator.share) {
        await navigator.share({ title: this.workoutLabel(w), text: 'T\'he compartit un entrenament!', url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        this.feedback.success('Enllaç copiat', 1800);
      }
    } catch {
      this.feedback.error('Error en compartir l\'entrenament', 3000);
    }
  }

  async deleteActiveWorkout(): Promise<void> {
    if (!await this.confirmDialog.confirm('Eliminar l\'entrenament?', { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    const w = this.activeWorkout();
    if (!w) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
      this.closeWorkout();
    } catch {
      this.feedback.error('Error en eliminar', 2000);
    }
  }

  async confirmDeleteWorkout(w: Workout): Promise<void> {
    if (!await this.confirmDialog.confirm(`Eliminar "${this.workoutLabel(w)}"?`, { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    try {
      await this.workoutService.deleteWorkout(w.id);
    } catch {
      this.feedback.error('Error en eliminar', 2000);
    }
  }

  // ── Workout creation ──────────────────────────────────────────────────────

  selectType(category: ExerciseCategory): void {
    if (this.pickerCat() === category) { this.closePicker(); return; }
    this.pickerCat.set(category);
  }

  ngOnDestroy(): void {
    if (this._nowTimer) clearInterval(this._nowTimer);
  }

  closePicker(): void { this.pickerCat.set(null); }

  /** Dismiss the top-most open overlay with Escape (picker · save sheet ·
   *  action menu), for keyboard and accessibility. Skips while a Material
   *  dialog is open so its own Escape handling wins. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dialog.openDialogs.length) return;
    if (this.saveTemplateOpen()) { this.saveTemplateOpen.set(false); return; }
    if (this.pickerCat())        { this.closePicker(); return; }
    if (this.workoutMenuOpen())  { this.workoutMenuOpen.set(false); }
  }

  /** Create a planned workout (future date) or a live one (today/past), then open it. */
  private async _createForSelectedDate(cat: ExerciseCategory, entries: WorkoutEntry[]): Promise<string> {
    if (this.isSelectedFuture()) {
      return this.workoutService.createPlannedWorkout(this.selectedDate(), cat, entries);
    }
    if (entries.length) {
      return this.workoutService.createWorkoutFromTemplate(this.selectedDate(), cat, entries);
    }
    return this.workoutService.createWorkoutForDate(this.selectedDate(), cat);
  }

  async pickerStartEmpty(): Promise<void> {
    const cat = this.pickerCat();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    try {
      const id = await this._createForSelectedDate(cat, []);
      this.openWorkout(id, { edit: true });
    } catch {
      this.feedback.error('Error en crear l\'entrenament', 3000);
    } finally { this.creating.set(false); }
  }

  async pickerStartFromLast(): Promise<void> {
    const cat  = this.pickerCat();
    const last = this.pickerLast();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    try {
      const id = await this._createForSelectedDate(cat, last?.entries ?? []);
      this.openWorkout(id, { edit: true });
    } catch {
      this.feedback.error('Error en crear l\'entrenament', 3000);
    } finally { this.creating.set(false); }
  }

  async pickerStartFromTemplate(t: WorkoutTemplate): Promise<void> {
    const cat = this.pickerCat();
    if (!cat) return;
    this.closePicker();
    this.creating.set(true);
    this.templateService.recordUse(t.id).catch(() => {});
    try {
      const useCat = t.category === 'mixed' ? cat : t.category as ExerciseCategory;
      const entries: WorkoutEntry[] = t.entries.map(e => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        sets: (e.sets && e.reps && e.sets > 0 && e.reps > 0)
          ? Array.from({ length: e.sets }, () => ({ weight: e.weight ?? 0, reps: e.reps! }))
          : [],
      }));
      const id = await this._createForSelectedDate(useCat, entries);
      this.openWorkout(id, { edit: true });
    } catch {
      this.feedback.error('Error en crear l\'entrenament', 3000);
    } finally { this.creating.set(false); }
  }

  goToTemplates(): void {
    this.closePicker();
    this.router.navigate(['/templates']);
  }

  maxWeight(entry: WorkoutEntry): number {
    return entry.sets.length ? Math.max(...entry.sets.map(s => setMaxWeight(s))) : 0;
  }

  openPicker(newCategory?: ExerciseCategory): void {
    const w               = this.activeWorkout();
    const excludeIds      = w?.entries.map(e => e.exerciseId) ?? [];
    const defaultCategory = (newCategory ?? w?.category) as ExerciseCategory | undefined;
    const suggestions     = defaultCategory
      ? this.suggestionService.suggest(defaultCategory, excludeIds, 5)
          .map(s => ({ exerciseId: s.exerciseId, reason: s.reason }))
      : [];

    const ref = this.dialog.open(ExercisePickerDialogComponent, {
      data: { excludeIds, defaultCategory, suggestions }, width: '420px', maxHeight: '80vh',
    });

    ref.afterClosed().subscribe((exercise: Exercise | undefined) => {
      if (!exercise) return;
      this.addExerciseToActive(exercise.id, exercise.name, defaultCategory);
    });
  }

  /** Adds a suggestion from the "Sèrie activa" strip straight into the live
   *  workout, then opens its set editor — same flow as picking from the dialog. */
  addSuggestion(s: ExerciseSuggestion): void {
    const w = this.activeWorkout();
    if (!w || w.entries.some(e => e.exerciseId === s.exerciseId)) return;
    const defaultCategory = (w.category ?? workoutCategories(w)[0]) as ExerciseCategory | undefined;
    this.addExerciseToActive(s.exerciseId, s.exerciseName, defaultCategory);
  }

  /** Shared add flow: ensures a workout exists for the selected date, appends
   *  the exercise, then jumps into its set editor. */
  private async addExerciseToActive(
    exerciseId: string, exerciseName: string, defaultCategory?: ExerciseCategory,
  ): Promise<void> {
    try {
      let workoutId = this.activeWorkout()?.id;
      if (!workoutId) {
        workoutId = await this.workoutService.createWorkoutForDate(this.selectedDate(), defaultCategory);
        // Acabat de crear i amb un exercici a dins: s'obre per omplir-lo,
        // encara que el dia sigui d'abans d'avui.
        this.openWorkout(workoutId, { edit: true });
      }

      await this.workoutService.addExerciseToWorkout(workoutId, {
        exerciseId, exerciseName, sets: [],
      });

      setTimeout(() => {
        this.editor?.startAddSet({ exerciseId, exerciseName, sets: [] });
      }, 0);
    } catch {
      this.feedback.error('Error en afegir l\'exercici', 3000);
    }
  }

  // ── Sport helpers ─────────────────────────────────────────────────────────

  isSportDone(sportId: string): boolean {
    return this.sportService.hasSportOnDate(this.selectedDate(), sportId);
  }

  sessionSummary(sportId: string): string | null {
    const s = this.sportService.getSessionForDate(this.selectedDate(), sportId);
    if (!s) return null;
    const parts: string[] = [];
    if (s.duration) parts.push(`${s.duration}min`);
    if (s.feeling)  parts.push(formatFeeling(s.feeling, this.settingsService.difficultyScale()));
    return parts.length ? parts.join(' ') : null;
  }

  // ── Registrar un esport ───────────────────────────────────────────────────

  /** La durada que es dona per feta en registrar un esport. La sessió neix
   *  amb una xifra raonable perquè la pàgina no s'obri buida, i canviar-la és
   *  el primer camp del formulari. */
  private static readonly DEFAULT_MINUTES = 60;

  /**
   * Tocar un esport el registra i porta a la seva pàgina — exactament el que
   * fa triar un tipus d'entrenament: es crea l'activitat i s'obre.
   *
   * Si el dia ja en té una, no se'n crea una altra: s'hi va. I un dia que
   * encara ha de venir es planifica en comptes de registrar-se, com passa amb
   * els entrenaments.
   */
  async startSportSession(sport: Sport): Promise<void> {
    this.pickerCat.set(null);

    const date     = this.selectedDate();
    const existing = this.sportService.getSessionForDate(date, sport.id);
    if (existing) { this._openSportSession(existing.id); return; }

    const planning = this.isSelectedFuture();
    this.sportToggling.set(true);
    try {
      const id = await this.sportService.logSession(
        date, sport.id,
        { duration: TrainComponent.DEFAULT_MINUTES },
        planning ? 'planned' : 'done',
        planning ? 'manual' : undefined,
      );
      this._openSportSession(id, true);
    } catch {
      this.feedback.error('Error en registrar', 2500);
    } finally {
      this.sportToggling.set(false);
    }
  }

  /** Una sessió acabada de crear s'obre amb el formulari desplegat: hi vas a
   *  omplir-la, no a mirar-la. */
  private _openSportSession(id: string, isNew = false): void {
    this.router.navigate(['/sport', id], isNew ? { queryParams: { nova: 1 } } : {});
  }
}
