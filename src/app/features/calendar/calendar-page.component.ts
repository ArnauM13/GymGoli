import {
  Component, computed, effect, ElementRef, inject,
  OnDestroy, signal, untracked, viewChild,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';
import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS,
  ExerciseCategory,
} from '../../core/models/exercise.model';
import { Workout, workoutExerciseNames } from '../../core/models/workout.model';
import { Sport, SportSession } from '../../core/models/sport.model';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { AuthService } from '../../core/services/auth.service';
import { addDays } from '../../shared/utils/calendar-utils';
import { compactDayLabel, feedDayLabel, workoutCategoryList } from '../../shared/utils/workout-card.utils';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';
import { DayFeedCardsComponent, DayFeedEntry } from '../../shared/components/day-feed-cards/day-feed-cards.component';
import { FeedbackService } from '../../shared/services/feedback.service';
import { TrainingTypeService } from '../../core/services/training-type.service';

/**
 * Llegeix `?range=`: `30d` són els últims trenta dies, i qualsevol altra cosa
 * (o res) vol dir tot l'historial. És el contracte que fa servir el botó
 * d'Inici; admet qualsevol nombre de dies perquè un enllaç guardat amb `7d` o
 * `90d` continuï dient el que diu.
 */
function parseRangeParam(raw: string | null | undefined): number | null {
  const m = /^(\d+)d$/.exec(raw ?? '');
  if (!m) return null;
  const days = parseInt(m[1], 10);
  return days > 0 ? days : null;
}

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [RouterLink, CalendarComponent, PageHeaderComponent, FilterBarComponent, DayFeedCardsComponent],
  template: `
    <div class="page">

      <!-- ── Page header ── -->
      <app-page-header title="Historial" />

      <!-- ── Cerca i filtres (sempre visibles) — el calendari és un filtre més ──
           Els filtres van en fila pròpia (stackFilters): aquí n'hi ha de
           tres menes —el període, els tipus d'entrenament i els esports— i
           encabir-los al costat de la cerca els deixava tots estrets. -->
      <app-filter-bar
        searchPlaceholder="Cerca per exercici..."
        [stackFilters]="true"
        [sports]="sportService.sports()"
        [(searchQuery)]="searchQuery"
        [(sortDesc)]="sortDesc"
        [(category)]="filterCat"
        [(sport)]="filterSport">
        <!-- ── El període: un sol xip que diu qui mana ──
             Sempre hi és i sempre diu el que hi ha posat —«Tot», «30 dies» o
             el dia triat—, perquè el filtre que fa feina no es pugui llegir
             en cap altre lloc que aquí. Obre el calendari, que és on es
             canvia; la ✕ només surt quan hi ha res a treure. -->
        <span filterLead class="period-wrap">
          <button class="period-chip" [class.period-chip--on]="hasPeriodFilter()"
                  [class.period-chip--split]="hasPeriodFilter()"
                  (click)="calendarOpen.set(!calendarOpen())"
                  [attr.aria-expanded]="calendarOpen()"
                  [attr.aria-label]="'Període: ' + periodLabel() + '. Tria'">
            <span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>
            <span class="period-label">{{ periodLabel() }}</span>
            <span class="material-symbols-outlined period-chevron" aria-hidden="true">expand_more</span>
          </button>
          @if (hasPeriodFilter()) {
            <button class="period-clear" (click)="clearPeriod()" aria-label="Treure el filtre de període">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          }
        </span>
      </app-filter-bar>

      <!-- ── Calendari plegable: tots els filtres de temps, junts ──
           Els abasts i el dia són la mateixa pregunta feta de dues maneres
           («els últims X dies» o «aquell dia»), així que viuen al mateix
           calaix i s'exclouen: triar-ne un deixa l'altre. -->
      <div class="cal-collapse" [class.cal-collapse--open]="calendarOpen()">
        <div class="cal-collapse-inner">
          <div class="range-row" role="group" aria-label="Període">
            @for (opt of rangeOptions; track opt.days) {
              <button class="range-chip" [class.range-chip--active]="rangeDays() === opt.days"
                      [attr.aria-pressed]="rangeDays() === opt.days"
                      (click)="setRange(opt.days)">
                {{ opt.label }}
              </button>
            }
            <button class="range-chip" [class.range-chip--active]="!hasPeriodFilter()"
                    [attr.aria-pressed]="!hasPeriodFilter()"
                    (click)="clearPeriod()">
              Tot
            </button>
          </div>
          <div class="calendar-wrap">
            <app-calendar [selectedDate]="selectedDate()" [allowFuturePlanning]="true"
                          (dateSelected)="selectDate($event)" />
          </div>
        </div>
      </div>

      @if (selectedDate(); as sel) {

        <!-- ── Dia seleccionat al calendari: què s'hi ha fet ──
             Aquí només s'hi navega de dia en dia. Treure el filtre és feina
             del xip de període de dalt, que és on sempre es llegeix: tenir-hi
             dues ✕ per al mateix filtre, a dos pams l'una de l'altra, era una
             de sobrera. -->
        <div class="date-chip-row">
          <button class="day-nav-btn" (click)="shiftSelectedDate(-1)" aria-label="Dia anterior">
            <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
          <span class="date-chip">
            <span class="material-symbols-outlined" aria-hidden="true">event</span>
            {{ selectedDateLabel() }}
          </span>
          <button class="day-nav-btn" (click)="shiftSelectedDate(1)" aria-label="Dia següent">
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>

        @if (feedDays(); as days) {
          @if (days.length > 0) {
            <div class="feed-wrap">
              @for (day of days; track day.date) {
                <app-day-feed-cards [day]="day" (open)="goToWorkout($event)"
                                    (openSport)="goToSportSession($event)" />
              }
            </div>
          } @else {
            <div class="day-empty">
              <span class="material-symbols-outlined" aria-hidden="true">bedtime</span>
              <p>Cap activitat aquest dia</p>
            </div>
          }
        }

        @if (isFutureOrToday()) {
          <!-- ── Planificar aquest dia ── -->
          <div class="dp-panel">
            <span class="dp-add-label">Afegir al pla</span>
            <div class="dp-chips">
              @for (cat of gymCategories(); track cat) {
                <button class="dp-chip" [class.active]="isGymPlanned(cat)"
                        [attr.aria-pressed]="isGymPlanned(cat)"
                        [style.--cat-color]="getCatColor(cat)" (click)="toggleGymPlan(cat)">
                  <span class="material-symbols-outlined" aria-hidden="true">{{ getCatIcon(cat) }}</span>
                  {{ getCatLabel(cat) }}
                </button>
              }
              @for (sport of sportService.sports(); track sport.id) {
                <button class="dp-chip" [class.active]="isSportPlanned(sport.id)"
                        [attr.aria-pressed]="isSportPlanned(sport.id)"
                        [style.--cat-color]="sport.color" (click)="toggleSportPlan(sport)">
                  <span class="material-symbols-outlined" aria-hidden="true">{{ sport.icon }}</span>
                  {{ sport.name }}
                </button>
              }
            </div>
          </div>
        } @else {
          <a class="register-past-btn" [routerLink]="['/train']" [queryParams]="{ date: sel }">
            <span class="material-symbols-outlined" aria-hidden="true">add</span>
            Registrar entrenament
            <span class="rpb-date">{{ selectedDateLabel() }}</span>
          </a>
        }

      } @else if (isInitialLoading()) {

        <!-- ── Skeleton (primera càrrega) ── -->
        <div class="sk-list">
          @for (_ of [1,2,3,4,5]; track $index) {
            <div class="sk-card-ph">
              <div class="sk sk-card-bar"></div>
              <div class="sk-card-body">
                <div class="sk sk-line sk-line--40"></div>
                <div class="sk sk-line sk-line--60"></div>
                <div class="sk sk-line sk-line--30"></div>
              </div>
            </div>
          }
        </div>

      } @else if (visibleDays().length > 0) {

        <!-- ── L'activitat, dia a dia: la mateixa lectura que a Inici ──
             Se'n pinta una pàgina, no tot el que hi ha carregat: la llista
             creix rascant avall, filtrada o sencera. -->
        <div class="feed-wrap">
          @for (day of visibleDays(); track day.date) {
            <div class="feed-day">
              <div class="feed-day-header">{{ dayLabel(day.date) }}</div>
              <app-day-feed-cards [day]="day" (open)="goToWorkout($event)"
                                    (openSport)="goToSportSession($event)" />
            </div>
          }
        </div>

        <!-- ── Sentinel: una pàgina més, i si s'ha acabat, un mes més ── -->
        <div #sentinel class="scroll-sentinel"></div>

        @if (isLoadingMore()) {
          <div class="load-more-sk">
            @for (_ of [1,2]; track $index) {
              <div class="sk-card-ph">
                <div class="sk sk-card-bar"></div>
                <div class="sk-card-body">
                  <div class="sk sk-line sk-line--40"></div>
                  <div class="sk sk-line sk-line--60"></div>
                </div>
              </div>
            }
          </div>
        } @else if (sportFilterLoading()) {
          <p class="end-of-list">· Carregant-ne més ·</p>
        } @else if (!hasMoreToShow() && !hasMore()) {
          <p class="end-of-list">· {{ loadedRangeLabel() }} ·</p>
        }

      } @else if (sportFilterLoading()) {

        <!-- La consulta d'aquell esport encara viatja: la llista buida
             d'ara no vol dir que no n'hi hagi. -->
        <div class="sk-list">
          @for (_ of [1,2,3]; track $index) {
            <div class="sk-card-ph">
              <div class="sk sk-card-bar"></div>
              <div class="sk-card-body">
                <div class="sk sk-line sk-line--40"></div>
                <div class="sk sk-line sk-line--60"></div>
              </div>
            </div>
          }
        </div>

      } @else if (hasActiveFilter()) {

        <!-- Cap filtre no es contesta rascant mesos: aquí «no n'hi ha» vol dir
             que el servidor ja ho ha dit. -->
        <div class="day-empty">
          <span class="material-symbols-outlined" aria-hidden="true">filter_list_off</span>
          <p>Cap activitat amb aquest filtre</p>
        </div>

      } @else {

        <div class="empty-state">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">calendar_month</span>
          <h2>Cap entrenament</h2>
          <p>Encara no hi ha cap activitat registrada</p>
        </div>

        @if (hasMore()) {
          <div class="load-more-row">
            <button class="load-more-btn" [disabled]="isLoadingMore()" (click)="loadMoreMonths()">
              <span class="material-symbols-outlined" aria-hidden="true">history</span>
              Carregar el mes anterior
            </button>
          </div>
        }

      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 16px; }

    /* ── El xip de període (projectat a la fila de filtres) ──
       Porta text, no només icona: és l'únic filtre que no diu «de quina mena»
       sinó «de quan», i una rodona més no ho hauria explicat. Quan hi ha res
       posat es parteix en dos —el cos obre el calendari, la ✕ el treu— i les
       dues meitats es llegeixen com una sola peça. */
    .period-wrap { display: flex; align-items: center; flex-shrink: 0; }
    .period-chip {
      display: flex; align-items: center; gap: 4px; flex-shrink: 0;
      height: 34px; padding: 0 10px 0 12px; box-sizing: border-box;
      border: 1.5px solid var(--c-border); border-radius: 999px;
      background: var(--c-card); color: var(--c-text-2);
      font-size: 12px; font-weight: 700; white-space: nowrap;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:not(.period-chip--on):hover { border-color: var(--c-brand); color: var(--c-brand); }
      &.period-chip--on {
        background: var(--c-brand); color: white; border-color: var(--c-brand);
        box-shadow: 0 2px 6px color-mix(in srgb, var(--c-brand) 35%, transparent);
      }
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 2px; }
    }
    .period-chip--split { border-radius: 999px 0 0 999px; border-right-color: transparent; padding-right: 6px; }
    /* Xarxa de seguretat: cap etiqueta no empeny els altres filtres fora de
       la vista, per llarga que sigui. */
    .period-label { max-width: 42vw; overflow: hidden; text-overflow: ellipsis; }
    .period-chevron { opacity: 0.75; margin-left: -1px; }
    /* La meitat de treure: mateix fons, vora compartida i prou amplada per al
       dit (34px d'alt, com tota la fila). */
    .period-clear {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 30px; height: 34px; box-sizing: border-box;
      border: 1.5px solid var(--c-brand); border-left: none; border-radius: 0 999px 999px 0;
      background: var(--c-brand); color: white;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { background: var(--c-brand-dk); }
      &:focus-visible { outline: 2px solid var(--c-text); outline-offset: 2px; }
    }

    /* ── Els abasts, dins el calendari ──
       Van amb el calendari i no a la fila de filtres perquè són la mateixa
       pregunta que triar un dia: de quan a quan. La fila de filtres només en
       diu el resultat. */
    .range-row {
      display: flex; align-items: center; gap: 6px;
      margin: 4px 0 0; padding: 8px 16px 0;
      overflow-x: auto; scrollbar-width: none;
      &::-webkit-scrollbar { display: none; }
    }
    .range-chip {
      display: flex; align-items: center; flex-shrink: 0;
      height: 32px; padding: 0 14px; box-sizing: border-box;
      border: 1.5px solid var(--c-border); border-radius: 999px;
      background: var(--c-card); color: var(--c-text-2);
      font-size: 12px; font-weight: 700; white-space: nowrap;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:not(.range-chip--active):hover { border-color: var(--c-brand); color: var(--c-brand); }
      &.range-chip--active {
        background: var(--c-brand); color: white; border-color: var(--c-brand);
        box-shadow: 0 2px 6px color-mix(in srgb, var(--c-brand) 35%, transparent);
      }
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 2px; }
    }

    /* ── Collapsible calendar ── */
    .cal-collapse {
      display: grid; grid-template-rows: 0fr;
      transition: grid-template-rows 0.3s ease;
    }
    .cal-collapse--open { grid-template-rows: 1fr; }
    .cal-collapse-inner { overflow: hidden; min-height: 0; }

    .calendar-wrap {
      margin: 4px 16px 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 16px; overflow: hidden;
    }

    /* ── Prev/next day navigation, next to the "planificar" and selected-date titles ── */
    .day-nav-btn {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 32px; height: 32px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-subtle);
      color: var(--c-text-2); cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
      &:active { transform: scale(0.94); }
    }

    /* ── Data seleccionada (below the filter bar, its own row) ── */
    .date-chip-row {
      display: flex; align-items: center; gap: 8px; margin: 0 16px 12px;
    }
    /* El dia que s'està mirant: rètol, no botó — ja no treu res. */
    .date-chip {
      display: inline-flex; align-items: center; gap: 5px; flex: 1; justify-content: center;
      height: 34px; padding: 0 12px; border-radius: 17px;
      border: 1.5px solid var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.1); color: var(--c-brand);
      font-size: 12px; font-weight: 700; white-space: nowrap;
      .material-symbols-outlined { font-size: 16px; }
    }
    .register-past-btn {
      display: flex; align-items: center; justify-content: center; gap: 7px;
      margin: 2px 16px 14px; padding: 12px; border-radius: 14px;
      border: 1.5px dashed color-mix(in srgb, var(--c-brand) 45%, transparent);
      background: rgba(var(--c-brand-rgb), 0.06); color: var(--c-brand);
      font-size: 14px; font-weight: 700; text-decoration: none;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 19px; }
      &:hover { background: rgba(var(--c-brand-rgb), 0.12); }
      &:active { transform: scale(0.99); }
    }
    .rpb-date {
      padding: 2px 9px; border-radius: 999px;
      background: rgba(var(--c-brand-rgb), 0.14);
      font-size: 12px; font-weight: 700;
    }

    /* ── Activity feed, grouped by day (same cards as Inici) ── */
    .feed-wrap { margin: 0 16px; }
    .feed-day { margin: 0 0 14px; }
    .feed-day-header {
      margin-bottom: 6px;
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px;
    }

    .day-empty {
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      gap: 8px; padding: 32px 24px; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 36px; }
      p { margin: 0; font-size: 14px; }
    }

    /* ── Planificar el dia triat (avui o futur) ── */
    .dp-panel {
      margin: 10px 16px 0; padding: 12px 14px 14px;
      border: 1.5px solid var(--c-border-2); border-radius: 16px; background: var(--c-card);
    }
    .dp-add-label {
      display: block; font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 8px;
    }
    .dp-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .dp-chip {
      display: flex; align-items: center; gap: 4px;
      padding: 6px 12px; border-radius: 20px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 12px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; white-space: nowrap; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover:not(.active) { border-color: var(--cat-color, var(--c-brand)); color: var(--cat-color, var(--c-brand)); }
      &.active { background: var(--cat-color, var(--c-brand)); border-color: var(--cat-color, var(--c-brand)); color: white; }
    }

    /* ── Infinite scroll ── */
    .scroll-sentinel { height: 1px; }
    .end-of-list {
      text-align: center; font-size: 12px; color: var(--c-text-3);
      margin: 4px 0; letter-spacing: 0.3px;
    }
    .load-more-row { display: flex; justify-content: center; margin: 4px 16px 0; }
    .load-more-btn {
      display: inline-flex; align-items: center; gap: 6px;
      height: 38px; padding: 0 16px; border-radius: 12px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      color: var(--c-text-2); font-size: 13px; font-weight: 700;
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover:not(:disabled) { border-color: var(--c-brand); color: var(--c-brand); }
      &:disabled { opacity: 0.6; cursor: default; }
    }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 40px 24px 24px; text-align: center;
      .empty-icon { font-size: 56px; color: var(--c-border); }
      h2 { margin: 0; font-size: 18px; font-weight: 600; color: var(--c-text); }
      p { margin: 0; font-size: 14px; color: var(--c-text-2); }
    }

    /* ── Skeleton ── */
    @keyframes sk-shimmer {
      from { background-position: -300px 0; }
      to   { background-position: calc(300px + 100%) 0; }
    }
    .sk {
      background: linear-gradient(90deg, var(--c-border-2) 0%, var(--c-border) 40%, var(--c-border-2) 80%);
      background-size: 600px 100%;
      animation: sk-shimmer 1.5s ease-in-out infinite;
      border-radius: 8px;
    }
    .sk-list, .load-more-sk { margin: 0 16px; display: flex; flex-direction: column; gap: 8px; }
    .load-more-sk { padding-top: 4px; }
    .sk-card-ph {
      display: flex; align-items: stretch;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden;
    }
    .sk-card-bar { width: 5px; flex-shrink: 0; border-radius: 0; }
    .sk-card-body { flex: 1; padding: 11px 12px; display: flex; flex-direction: column; gap: 7px; }
    .sk-line      { height: 11px; }
    .sk-line--60  { width: 60%; }
    .sk-line--40  { width: 40%; height: 13px; }
    .sk-line--30  { width: 30%; height: 10px; }
  `],
})
export class CalendarPageComponent implements OnDestroy {
  readonly workoutService = inject(WorkoutService);
  private exerciseService = inject(ExerciseService);
  readonly sportService    = inject(SportService);
  private authService     = inject(AuthService);
  private feedback        = inject(FeedbackService);
  private router          = inject(Router);
  private route           = inject(ActivatedRoute);

  private typeService     = inject(TrainingTypeService);
  readonly gymCategories = computed(() => this.typeService.types().map(t => t.id));

  /** The calendar starts collapsed — this is primarily a list page and the
   *  calendar acts as an optional date filter you expand on demand. */
  readonly calendarOpen  = signal(false);
  readonly selectedDate  = signal<string | null>(null);
  readonly sortDesc      = signal(true);
  readonly filterCat     = signal<ExerciseCategory | null>(null);
  /** L'id de l'esport filtrat. Exclusiu amb `filterCat` — ho mana la barra. */
  readonly filterSport   = signal<string | null>(null);
  readonly searchQuery   = signal('');

  // ── Quant se'n pinta ─────────────────────────────────────────────────────
  //
  // La llista creix de pàgina en pàgina, i és **la mateixa** filtrada o
  // sencera: pintar de cop tot el que hi ha carregat és el que fa que una
  // pàgina vagi bé amb dos mesos i s'arrossegui amb vuit anys.

  /** Quantes activitats s'afegeixen a la llista cada cop. */
  static readonly PAGE_SIZE = 20;

  readonly visibleCount = signal(CalendarPageComponent.PAGE_SIZE);

  /** Una consulta d'esport en marxa: la llista encara no és la definitiva. */
  private readonly _sportLoading = signal(false);
  readonly sportFilterLoading = this._sportLoading.asReadonly();

  // ── El període ───────────────────────────────────────────────────────────
  //
  // «Els últims X dies» i «aquell dia» són la mateixa pregunta —de quan a
  // quan— feta de dues maneres, i per això **s'exclouen**: triar un dia al
  // calendari treu l'abast i triar un abast treu el dia. Si convisquessin, el
  // xip de la fila diria una cosa i la llista n'ensenyaria una altra.

  /** Els abasts que s'ofereixen, del més curt al més llarg. */
  readonly rangeOptions: { days: number; label: string }[] = [
    { days: 7,  label: '7 dies'  },
    { days: 30, label: '30 dies' },
    { days: 90, label: '3 mesos' },
  ];

  /** Quants dies enrere arriba la llista, o `null` per tot l'historial.
   *  Inici hi entra amb l'abast de 30 dies (`/calendar?range=30d`). */
  readonly rangeDays = signal<number | null>(null);

  /** Posa un abast. Treu el dia: el període és un de sol. */
  setRange(days: number | null): void {
    this.rangeDays.set(days);
    if (days !== null) this.selectedDate.set(null);
  }

  /** Tot l'historial: ni abast ni dia. */
  clearPeriod(): void {
    this.rangeDays.set(null);
    this.selectedDate.set(null);
  }

  readonly hasPeriodFilter = computed(() => !!this.selectedDate() || this.rangeDays() !== null);

  /** El que diu el xip de la fila de filtres: sempre el filtre que fa feina,
   *  mai una etiqueta fixa. */
  readonly periodLabel = computed(() => {
    const sel = this.selectedDate();
    // Curt a posta: el dia sencer («dilluns, 8 de setembre») es menjava la
    // fila de filtres ell sol i deixava els tipus i els esports fora de vista.
    if (sel) return compactDayLabel(sel, this.workoutService.todayDateString());
    const days = this.rangeDays();
    if (days === null) return 'Tot';
    return this.rangeOptions.find(o => o.days === days)?.label ?? `${days} dies`;
  });

  /** El primer dia de l'abast (avui inclòs), o `null` si no n'hi ha cap. */
  private readonly rangeStart = computed(() => {
    const days = this.rangeDays();
    if (days === null) return null;
    const from = new Date(this.workoutService.todayDateString() + 'T12:00:00');
    from.setDate(from.getDate() - (days - 1));
    return this._toDateStr(from);
  });

  // ── Day planning (today / future dates) ─────────────────────────────────
  readonly isFutureOrToday = computed(() => {
    const d = this.selectedDate();
    return !!d && d >= this.workoutService.todayDateString();
  });

  readonly dayWorkouts = computed(() => {
    const d = this.selectedDate();
    return d && this.isFutureOrToday() ? this.workoutService.getWorkoutsForDate(d) : [];
  });

  readonly daySports = computed(() => {
    const d = this.selectedDate();
    if (!d || !this.isFutureOrToday()) return [];
    return [
      ...this.sportService.getSportSessionsForDate(d),
      ...this.sportService.getPlannedSportSessionsForDate(d),
    ];
  });

  isGymPlanned(cat: ExerciseCategory): boolean {
    return this.dayWorkouts().some(w => (w.categories ?? (w.category ? [w.category] : [])).includes(cat));
  }

  async toggleGymPlan(cat: ExerciseCategory): Promise<void> {
    const date = this.selectedDate();
    if (!date) return;
    const existing = this.dayWorkouts().find(w => (w.categories ?? (w.category ? [w.category] : [])).includes(cat));
    try {
      if (existing) await this.workoutService.deleteWorkout(existing.id);
      else await this.workoutService.createPlannedWorkout(date, cat, [], 'manual');
    } catch {
      this.feedback.error('Error en planificar', 2500);
    }
  }

  isSportPlanned(sportId: string): boolean {
    return this.daySports().some(item => item.sport.id === sportId);
  }

  async toggleSportPlan(sport: Sport): Promise<void> {
    const date = this.selectedDate();
    if (!date) return;
    const existing = this.daySports().find(item => item.sport.id === sport.id);
    try {
      if (existing) await this.sportService.deleteSession(existing.session.id, date);
      else await this.sportService.logSession(date, sport.id, {}, 'planned', 'manual');
    } catch {
      this.feedback.error('Error en planificar', 2500);
    }
  }

  // ── Activitat carregada (paginació mensual) ─────────────────────────────

  /** Quants mesos abans de l'actual hi ha carregats. 0 = només aquest mes;
   *  cada tirada d'infinite scroll n'afegeix un. */
  private readonly monthsBack   = signal(0);
  readonly isInitialLoading     = signal(true);
  readonly isLoadingMore        = signal(false);
  /** Es queda a `true` fins que un mes tornat del servidor ve buit i ja no
   *  queda res més enrere per ensenyar. */
  private readonly _reachedEnd  = signal(false);
  /** Mesos seguits carregats sense trobar-hi res. */
  private _emptyStreak = 0;

  /**
   * Queden mesos per anar a buscar?
   *
   * Només quan la llista és la sencera. Tots els filtres tenen **resposta
   * completa** sense rascar mesos enrere: la cerca i el tipus els contesta el
   * servidor amb totes les coincidències de tot l'historial, un esport es
   * demana sencer (`loadSessionsForSport`) i un abast és un tram, que té
   * final per definició. Anar a pescar mesos amb un filtre posat era demanar
   * dotze consultes per no trobar el pàdel de fa tres anys.
   */
  readonly hasMore = computed(() =>
    !this._reachedEnd() && this.rangeDays() === null && !this.filterSport()
    && !this.searchQuery().trim() && !this.filterCat()
  );

  /**
   * Els dies que es pinten: els més nous fins a omplir la pàgina.
   *
   * Es talla per dies sencers i no per activitats: un dia partit per la meitat
   * entre el que es veu i el que no seria una targeta òrfena amb la data a
   * sobre i res a sota.
   */
  readonly visibleDays = computed((): DayFeedEntry[] => {
    const max  = this.visibleCount();
    const out: DayFeedEntry[] = [];
    let count = 0;
    for (const day of this.feedDays()) {
      out.push(day);
      count += day.workouts.length + day.sports.length;
      if (count >= max) break;
    }
    return out;
  });

  /** Queda activitat ja carregada que encara no es pinta. */
  readonly hasMoreToShow = computed(() => this.visibleDays().length < this.feedDays().length);

  /** Una pàgina més de la llista. No demana res: això ja ha arribat. */
  showMore(): void {
    this.visibleCount.update(n => n + CalendarPageComponent.PAGE_SIZE);
  }

  /** El primer dia carregat: l'1 del mes més antic que s'ha demanat, o el
   *  primer dia de l'abast si n'hi ha cap de posat. */
  private readonly windowStart = computed(() => {
    const from = this.rangeStart();
    if (from) return from;
    const today = new Date(this.workoutService.todayDateString() + 'T12:00:00');
    const start = new Date(today.getFullYear(), today.getMonth() - this.monthsBack(), 1);
    return this._toDateStr(start);
  });

  readonly hasActiveFilter = computed(
    () => !!this.filterCat() || !!this.filterSport() || !!this.searchQuery()
       || this.hasPeriodFilter()
  );

  /**
   * L'activitat agrupada per dia — exactament la mateixa lectura que fa Inici
   * (entrenaments + esports del mes carregat), però aquí sense límit de dies i
   * passada pels filtres de la pàgina.
   */
  readonly feedDays = computed((): DayFeedEntry[] => {
    // Reactivitat sobre les dades crues: el feed s'omple tot sol quan acaba
    // d'arribar un tram, sense haver de tocar res.
    const all = this.workoutService.workouts();
    this.sportService.sessions(); this.sportService.sports();

    const sel     = this.selectedDate();
    const today   = this.workoutService.todayDateString();
    const search  = this.searchQuery().trim().toLowerCase();
    const cat     = this.filterCat();
    const sportId = this.filterSport();
    // L'abast curt talla per baix sigui quin sigui l'altre filtre: buscar un
    // exercici amb els «30 dies» posats pregunta pels últims 30 dies, no per
    // tota la vida.
    const floor   = this.rangeStart();

    // ── Amb cerca o filtre: des de les coincidències ────────────────────────
    // La resposta del servidor porta les que hi ha, escampades per anys. Fer
    // el bucle dia a dia des de la finestra visible no les trobaria (era el
    // que passava: buscar un exercici antic no ensenyava res, i el botó de
    // «carregar-ne més» quedava desactivat), i fer-lo des de la primera
    // coincidència voldria dir recórrer milers de dies buits per pintar-ne
    // quatre.
    if (!sel && (search || cat || sportId)) {
      const byDate = new Map<string, DayFeedEntry>();
      const bucket = (date: string): DayFeedEntry => {
        let d = byDate.get(date);
        if (!d) { d = { date, workouts: [], sports: [] }; byDate.set(date, d); }
        return d;
      };
      // Un filtre d'esport deixa els entrenaments fora d'entrada: un esport no
      // és cap tipus d'entrenament.
      if (!sportId) {
        for (const w of all) {
          if (floor && w.date < floor) continue;
          if (!this._matchesWorkout(w, cat, search)) continue;
          bucket(w.date).workouts.push(w);
        }
      }
      if (!cat) {
        for (const item of this.sportService.allSportSessionPairs()) {
          if (floor && item.session.date < floor) continue;
          if (!this._matchesSport(item, cat, sportId, search)) continue;
          bucket(item.session.date).sports.push(item);
        }
      }
      const days = [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
      return this.sortDesc() ? days : days.reverse();
    }

    // ── Sense filtre: dia a dia per la finestra visible ─────────────────────
    const from = sel ?? this.windowStart();
    const to   = sel ?? today;

    const days: DayFeedEntry[] = [];
    const cursor = new Date(to + 'T12:00:00');
    while (this._toDateStr(cursor) >= from) {
      const dateStr = this._toDateStr(cursor);
      const workouts = sportId ? [] : [
        ...this.workoutService.getPlannedForDate(dateStr),
        ...this.workoutService.getDoneWorkoutsForDate(dateStr),
      ].filter(w => this._matchesWorkout(w, cat, search));
      const sports = [
        ...this.sportService.getSportSessionsForDate(dateStr),
        // Un dia d'avui endavant també ensenya el que hi ha planificat.
        ...(dateStr >= today ? this.sportService.getPlannedSportSessionsForDate(dateStr) : []),
      ].filter(item => this._matchesSport(item, cat, sportId, search));
      if (workouts.length > 0 || sports.length > 0) days.push({ date: dateStr, workouts, sports });
      cursor.setDate(cursor.getDate() - 1);
    }
    return this.sortDesc() ? days : [...days].reverse();
  });

  /**
   * Com es tanca la llista: dient fins on arriba el que s'acaba de llegir.
   *
   * Un filtre no es tanca amb el mes més antic carregat —la seva resposta no
   * té res a veure amb la finestra de mesos—, sinó dient que allò és tot el
   * que hi ha.
   */
  readonly loadedRangeLabel = computed(() => {
    const days = this.rangeDays();
    if (days !== null) return `Últims ${this.periodLabel()}`;

    const sportId = this.filterSport();
    if (sportId) {
      const name = this.sportService.sports().find(s => s.id === sportId)?.name;
      return name ? `Tot l'historial de ${name}` : "Tot l'historial";
    }
    if (this.searchQuery().trim() || this.filterCat()) return 'Totes les coincidències';

    const start = new Date(this.windowStart() + 'T12:00:00');
    const label = start.toLocaleDateString('ca-ES', { month: 'long', year: 'numeric' });
    return `Des de ${label}`;
  });

  private _matchesWorkout(w: Workout, cat: ExerciseCategory | null, search: string): boolean {
    if (cat && !workoutCategoryList(w).includes(cat)) return false;
    if (search) {
      // Els noms surten del resum quan la sessió encara no s'ha baixat
      // sencera, així la cerca arriba a tot l'historial igualment.
      if (!workoutExerciseNames(w).toLowerCase().includes(search)) return false;
    }
    return true;
  }

  /** Un filtre de tipus d'entrenament (empenta, tracció...) no aplica als
   *  esports, així que els amaga; un filtre d'esport en deixa passar el seu i
   *  prou, i la cerca hi busca pel nom. */
  private _matchesSport(
    item: { sport: Sport; session: SportSession },
    cat: ExerciseCategory | null, sportId: string | null, search: string,
  ): boolean {
    if (cat) return false;
    if (sportId && item.sport.id !== sportId) return false;
    if (!search) return true;
    const sub = item.session.subtypeId
      ? (item.sport.subtypes.find(s => s.id === item.session.subtypeId)?.name ?? '')
      : '';
    return `${item.sport.name} ${sub}`.toLowerCase().includes(search);
  }

  private _toDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── IntersectionObserver sentinel ───────────────────────────────────────
  readonly sentinelRef = viewChild<ElementRef<HTMLElement>>('sentinel');
  private _observer: IntersectionObserver | null = null;

  constructor() {
    this.exerciseService.ensureLoaded();
    this.sportService.ensureLoaded();

    // ── El període el diu l'adreça ─────────────────────────────────────
    //
    // Inici hi entra amb `/calendar?range=30d`: el seu botó és una drecera a
    // «l'últim mes» i qui hi arriba no ha de tornar a filtrar res. Entrar-hi
    // sense el paràmetre (la pestanya de baix) vol dir tot l'historial.
    //
    // Es llegeix a cada arribada, no només al muntar-se: la ruta es manté
    // viva (AppReuseStrategy), i sense això el segon cop que toquessis el
    // botó d'Inici et trobaries l'Historial tal com l'havies deixat.
    this.setRange(parseRangeParam(this.route.snapshot.queryParamMap.get('range')));

    let previousPath = this.router.url.split('?')[0];
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(e => {
        const path       = e.urlAfterRedirects.split('?')[0];
        const arrivedNow = previousPath !== '/calendar' && path === '/calendar';
        previousPath = path;
        // Només en arribar-hi de fora: navegar dins la mateixa pàgina no ha de
        // desfer el filtre que acabes de treure amb el dit.
        if (!arrivedNow) return;
        const params = this.router.parseUrl(e.urlAfterRedirects).queryParams as Record<string, string | undefined>;
        const days   = parseRangeParam(params['range'] ?? null);
        // Arribar-hi sense abast vol dir tot l'historial, i això inclou treure
        // el dia que hi hagués: el període és el que digui l'adreça.
        if (days === null) this.clearPeriod();
        else this.setRange(days);
      });

    // Un abast pot arrencar mesos enrere (tres, el més llarg) i la llista es
    // tallaria a l'1 del mes carregat. Es demana **d'una sola tirada**: el
    // tram és la unitat de consulta, i preguntar-ho mes a mes eren tres o
    // quatre viatges per contestar la mateixa pregunta.
    effect(() => {
      const from = this.rangeStart();
      if (!from || !this.authService.uid()) return;
      untracked(() => { void this._ensureSpan(from, this.workoutService.todayDateString()); });
    });

    // Càrrega inicial: l'últim mes. Tracking uid() so the first load fires
    // once auth resolves on cold start.
    effect(() => {
      const uid = this.authService.uid();
      if (!uid) return;
      this._loadInitialMonth();
    });

    // Cercar o filtrar per tipus mira tot l'historial, no només els mesos que
    // ja s'han carregat: si no, buscar un exercici antic no trobaria res.
    effect(() => {
      const search = this.searchQuery().trim();
      const cat    = this.filterCat();
      if ((!search && !cat) || !this.authService.uid()) return;
      untracked(() => { void this._runSearch(); });
    });

    // ── Filtrar per un esport és una consulta d'aquell esport ──────────────
    //
    // Es demanen **totes** les seves sessions —una consulta, acotada per
    // l'esport, paginada per dins (`fetchAllRows`)— i s'incorporen sense
    // podar res: una resposta filtrada diu qui coincideix, no qui hi ha.
    // Abans això es contestava rascant mes a mes el que ja hi havia
    // carregat, que per a un pàdel de fa tres anys volien dir trenta-sis
    // consultes i, si es cansava abans, cap resposta.
    effect(() => {
      const sportId = this.filterSport();
      if (!sportId || !this.authService.uid()) return;
      untracked(() => {
        if (this.sportService.sportHistoryLoaded(sportId)) return;
        this._sportLoading.set(true);
        void this.sportService.loadSessionsForSport(sportId)
          .finally(() => this._sportLoading.set(false));
      });
    });

    // Canviar de filtre és tornar a començar la llista: si no, el que es veia
    // amb el filtre vell decidia quant es veu del nou.
    effect(() => {
      this.searchQuery(); this.filterCat(); this.filterSport();
      this.rangeDays(); this.selectedDate(); this.sortDesc();
      untracked(() => this.visibleCount.set(CalendarPageComponent.PAGE_SIZE));
    });

    // Un dia triat al calendari pot ser d'un mes que encara no s'ha carregat.
    effect(() => {
      const date = this.selectedDate();
      if (!date) return;
      const [y, m] = date.split('-');
      this.workoutService.ensureMonthLoaded(parseInt(y), parseInt(m) - 1);
      this.sportService.ensureMonthLoaded(parseInt(y), parseInt(m) - 1);
    });

    // Re-attach observer whenever the sentinel element appears
    effect(() => {
      const el = this.sentinelRef()?.nativeElement;
      this._observer?.disconnect();
      if (!el) return;
      // Primer s'ensenya el que ja ha arribat i encara no es pinta; només
      // quan s'ha acabat es va a buscar un mes més. Així rascar avall no
      // demana res mentre hi hagi llista per ensenyar.
      this._observer = new IntersectionObserver(
        entries => {
          if (!entries[0].isIntersecting) return;
          if (this.hasMoreToShow()) { this.showMore(); return; }
          if (this.hasMore() && !this.isLoadingMore()) this.loadMoreMonths();
        },
        { rootMargin: '200px' }
      );
      this._observer.observe(el);
    });
  }

  ngOnDestroy(): void {
    this._observer?.disconnect();
  }

  // ── Data loading ─────────────────────────────────────────────────────────

  private async _loadInitialMonth(): Promise<void> {
    this.isInitialLoading.set(true);
    try {
      const today = new Date(this.workoutService.todayDateString() + 'T12:00:00');
      await this._ensureMonth(today.getFullYear(), today.getMonth());
    } finally {
      this.isInitialLoading.set(false);
    }
  }

  /** Carrega un mes més enrere. Es dispara sol amb l'infinite scroll. */
  async loadMoreMonths(): Promise<void> {
    if (this.isLoadingMore() || this._reachedEnd()) return;
    this.isLoadingMore.set(true);
    try {
      const next   = this.monthsBack() + 1;
      const today  = new Date(this.workoutService.todayDateString() + 'T12:00:00');
      const target = new Date(today.getFullYear(), today.getMonth() - next, 1);
      // Es mira el que ha arribat, no el que es pinta. Amb un filtre posat la
      // llista pot no créixer perquè aquell mes no té **aquell esport**, que
      // no vol dir que no hi hagi historial: comptant dies pintats, dotze
      // mesos sense pàdel tancaven la paginació de la pàgina sencera, i
      // quedava tancada també en treure el filtre.
      const before = this._loadedCount();
      await this._ensureMonth(target.getFullYear(), target.getMonth());
      this.monthsBack.set(next);
      // Dotze mesos seguits sense res nou: donem l'historial per esgotat i
      // parem de demanar mesos buits.
      if (this._loadedCount() === before) this._emptyStreak++;
      else this._emptyStreak = 0;
      if (this._emptyStreak >= 12) this._reachedEnd.set(true);
    } finally {
      this.isLoadingMore.set(false);
    }
  }

  /** Quanta activitat hi ha carregada, filtres a part: és el que diu si un
   *  mes més enrere ha portat res o no. */
  private _loadedCount(): number {
    return this.workoutService.workouts().length + this.sportService.sessions().length;
  }

  private async _ensureMonth(year: number, month: number): Promise<void> {
    await Promise.all([
      this.workoutService.ensureMonthLoaded(year, month),
      this.sportService.ensureMonthLoaded(year, month),
    ]);
  }

  /** Un tram de dies, sigui quants mesos sigui: una consulta. */
  private async _ensureSpan(from: string, to: string): Promise<void> {
    await Promise.all([
      this.workoutService.ensureRange(from, to),
      this.sportService.ensureRange(from, to),
    ]);
  }

  /**
   * Buscar o filtrar pregunta al servidor.
   *
   * Abans es baixava tot l'historial amb totes les sèries i es filtrava aquí.
   * Ara la pregunta la contesta qui té índexs per contestar-la, i el que
   * viatja són només les coincidències —sense sèries—, encara que siguin de fa
   * vuit anys.
   *
   * Els esports no hi entren: no tenen ni noms d'exercici ni tipus
   * d'entrenament, o sigui que amb qualsevol dels dos filtres queden fora
   * igualment, i sense filtre no s'arriba mai aquí.
   */
  private async _runSearch(): Promise<void> {
    await this.workoutService.searchHistory({
      search:   this.searchQuery().trim(),
      category: this.filterCat() ?? undefined,
    });
  }

  // ── Calendar ─────────────────────────────────────────────────────────────

  readonly selectedDateLabel = computed(() => {
    const sel = this.selectedDate();
    if (!sel) return '';
    return feedDayLabel(sel, this.workoutService.todayDateString());
  });

  dayLabel(date: string): string {
    return feedDayLabel(date, this.workoutService.todayDateString());
  }

  /** Triar un dia és triar un període: treu l'abast que hi hagués, perquè el
   *  xip de la fila no pugui dir «30 dies» mentre la llista n'ensenya un. */
  selectDate(date: string): void {
    const next = this.selectedDate() === date ? null : date;
    this.selectedDate.set(next);
    if (next) this.rangeDays.set(null);
  }

  shiftSelectedDate(delta: number): void {
    const base = this.selectedDate() ?? this.workoutService.todayDateString();
    this.selectedDate.set(addDays(base, delta));
  }

  goToWorkout(workoutId: string): void {
    this.router.navigate(['/train'], { queryParams: { workout: workoutId } });
  }

  /** Una sessió d'esport té pàgina pròpia, igual que un entrenament. */
  goToSportSession(item: { session: SportSession }): void {
    this.router.navigate(['/sport', item.session.id]);
  }

  // ── Visual helpers ───────────────────────────────────────────────────────

  getCatColor(cat: string): string { return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#bbb'; }
  getCatLabel(cat: string): string { return CATEGORY_LABELS[cat as ExerciseCategory] ?? cat; }
  getCatIcon(cat: string): string { return CATEGORY_ICONS[cat as ExerciseCategory] ?? 'fitness_center'; }

}
