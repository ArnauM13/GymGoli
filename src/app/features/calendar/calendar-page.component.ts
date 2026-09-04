import {
  Component, computed, effect, ElementRef, inject,
  OnDestroy, signal, viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS,
  ExerciseCategory,
} from '../../core/models/exercise.model';
import { Workout } from '../../core/models/workout.model';
import { Sport, SportSession } from '../../core/models/sport.model';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { AuthService } from '../../core/services/auth.service';
import { addDays } from '../../shared/utils/calendar-utils';
import { feedDayLabel, workoutCategoryList } from '../../shared/utils/workout-card.utils';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';
import { DayFeedCardsComponent, DayFeedEntry } from '../../shared/components/day-feed-cards/day-feed-cards.component';
import { FeedbackService } from '../../shared/services/feedback.service';
import { TrainingTypeService } from '../../core/services/training-type.service';

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [RouterLink, CalendarComponent, PageHeaderComponent, FilterBarComponent, DayFeedCardsComponent],
  template: `
    <div class="page">

      <!-- ── Page header ── -->
      <app-page-header title="Historial" />

      <!-- ── Cerca i filtres (sempre visibles) — el calendari és un filtre més ── -->
      <app-filter-bar
        searchPlaceholder="Cerca per exercici..."
        [(searchQuery)]="searchQuery"
        [(sortDesc)]="sortDesc"
        [(category)]="filterCat">
        <button class="cal-filter-btn"
                [class.cal-filter-btn--active]="calendarOpen() || !!selectedDate()"
                (click)="calendarOpen.set(!calendarOpen())"
                [attr.aria-label]="calendarOpen() ? 'Amaga el calendari' : 'Filtra per data'"
                [attr.aria-expanded]="calendarOpen()" title="Filtra per data">
          <span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>
          @if (selectedDate()) { <span class="cal-filter-dot" aria-hidden="true"></span> }
        </button>
      </app-filter-bar>

      <!-- ── Calendari plegable (filtre per data) ── -->
      <div class="cal-collapse" [class.cal-collapse--open]="calendarOpen()">
        <div class="cal-collapse-inner">
          <div class="calendar-wrap">
            <app-calendar [selectedDate]="selectedDate()" [allowFuturePlanning]="true"
                          (dateSelected)="selectDate($event)" />
          </div>
        </div>
      </div>

      @if (selectedDate(); as sel) {

        <!-- ── Dia seleccionat al calendari: què s'hi ha fet ── -->
        <div class="date-chip-row">
          <button class="day-nav-btn" (click)="shiftSelectedDate(-1)" aria-label="Dia anterior">
            <span class="material-symbols-outlined" aria-hidden="true">chevron_left</span>
          </button>
          <button class="date-chip" (click)="selectDate(sel)" aria-label="Treure el filtre de data">
            <span class="material-symbols-outlined" aria-hidden="true">event</span>
            {{ selectedDateLabel() }}
            <span class="material-symbols-outlined date-chip-x" aria-hidden="true">close</span>
          </button>
          <button class="day-nav-btn" (click)="shiftSelectedDate(1)" aria-label="Dia següent">
            <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
          </button>
        </div>

        @if (feedDays(); as days) {
          @if (days.length > 0) {
            <div class="feed-wrap">
              @for (day of days; track day.date) {
                <app-day-feed-cards [day]="day" expandWorkouts (open)="goToWorkout($event)" />
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

      } @else if (feedDays().length > 0) {

        <!-- ── L'activitat, dia a dia: la mateixa lectura que a Inici ── -->
        <div class="feed-wrap">
          @for (day of feedDays(); track day.date) {
            <div class="feed-day">
              <div class="feed-day-header">{{ dayLabel(day.date) }}</div>
              <app-day-feed-cards [day]="day" expandWorkouts (open)="goToWorkout($event)" />
            </div>
          }
        </div>

        <!-- ── Sentinel per a l'infinite scroll (un mes més cada cop) ── -->
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
        } @else if (!hasMore()) {
          <p class="end-of-list">· {{ loadedRangeLabel() }} ·</p>
        }

      } @else if (hasActiveFilter()) {

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

    /* ── Calendar-as-filter toggle (projected into the filter bar) ── */
    .cal-filter-btn {
      position: relative;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 34px; height: 34px; border-radius: 50%;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:not(.cal-filter-btn--active):hover { border-color: var(--c-brand); color: var(--c-brand); }
      &.cal-filter-btn--active {
        background: var(--c-brand); color: white; border-color: var(--c-brand);
        box-shadow: 0 2px 6px color-mix(in srgb, var(--c-brand) 35%, transparent);
      }
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 2px; }
    }
    /* Small dot marking that a specific day is currently filtering the list. */
    .cal-filter-dot {
      position: absolute; top: 4px; right: 4px;
      width: 7px; height: 7px; border-radius: 50%;
      background: #fff; box-shadow: 0 0 0 2px var(--c-brand);
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
    .date-chip {
      display: inline-flex; align-items: center; gap: 4px; flex: 1; justify-content: center;
      height: 34px; padding: 0 6px 0 10px; border-radius: 17px;
      border: 1.5px solid var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.1); color: var(--c-brand);
      font-size: 12px; font-weight: 700; text-transform: capitalize;
      cursor: pointer; touch-action: manipulation; white-space: nowrap;
      .material-symbols-outlined { font-size: 16px; }
      .date-chip-x {
        font-size: 16px; border-radius: 50%; background: rgba(var(--c-brand-rgb), 0.18);
        padding: 1px;
      }
      &:hover { background: rgba(var(--c-brand-rgb), 0.16); }
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
      font-size: 12px; font-weight: 700; text-transform: capitalize;
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

  private typeService     = inject(TrainingTypeService);
  readonly gymCategories = computed(() => this.typeService.types().map(t => t.id));

  /** The calendar starts collapsed — this is primarily a list page and the
   *  calendar acts as an optional date filter you expand on demand. */
  readonly calendarOpen  = signal(false);
  readonly selectedDate  = signal<string | null>(null);
  readonly sortDesc      = signal(true);
  readonly filterCat     = signal<ExerciseCategory | null>(null);
  readonly searchQuery   = signal('');

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

  readonly hasMore = computed(() => !this._reachedEnd());

  /** El primer dia carregat: l'1 del mes més antic que s'ha demanat. */
  private readonly windowStart = computed(() => {
    const today = new Date(this.workoutService.todayDateString() + 'T12:00:00');
    const start = new Date(today.getFullYear(), today.getMonth() - this.monthsBack(), 1);
    return this._toDateStr(start);
  });

  readonly hasActiveFilter = computed(
    () => !!this.filterCat() || !!this.searchQuery() || !!this.selectedDate()
  );

  /**
   * L'activitat agrupada per dia — exactament la mateixa lectura que fa Inici
   * (entrenaments + esports del mes carregat), però aquí sense límit de dies i
   * passada pels filtres de la pàgina.
   */
  readonly feedDays = computed((): DayFeedEntry[] => {
    // Reactivitat sobre les dades crues: el feed s'omple tot sol quan acaba de
    // carregar un mes, sense haver de tocar res.
    this.workoutService.workouts(); this.sportService.sessions(); this.sportService.sports();

    const sel    = this.selectedDate();
    const today  = this.workoutService.todayDateString();
    const from   = sel ?? this.windowStart();
    const to     = sel ?? today;
    const search = this.searchQuery().trim().toLowerCase();
    const cat    = this.filterCat();

    const days: DayFeedEntry[] = [];
    const cursor = new Date(to + 'T12:00:00');
    while (this._toDateStr(cursor) >= from) {
      const dateStr = this._toDateStr(cursor);
      const workouts = [
        ...this.workoutService.getPlannedForDate(dateStr),
        ...this.workoutService.getDoneWorkoutsForDate(dateStr),
      ].filter(w => this._matchesWorkout(w, cat, search));
      const sports = [
        ...this.sportService.getSportSessionsForDate(dateStr),
        // Un dia d'avui endavant també ensenya el que hi ha planificat.
        ...(dateStr >= today ? this.sportService.getPlannedSportSessionsForDate(dateStr) : []),
      ].filter(item => this._matchesSport(item, cat, search));
      if (workouts.length > 0 || sports.length > 0) days.push({ date: dateStr, workouts, sports });
      cursor.setDate(cursor.getDate() - 1);
    }
    return this.sortDesc() ? days : [...days].reverse();
  });

  /** El rang que hi ha carregat, per tancar la llista amb alguna cosa útil. */
  readonly loadedRangeLabel = computed(() => {
    const start = new Date(this.windowStart() + 'T12:00:00');
    const label = start.toLocaleDateString('ca-ES', { month: 'long', year: 'numeric' });
    return `Des de ${label}`;
  });

  private _matchesWorkout(w: Workout, cat: ExerciseCategory | null, search: string): boolean {
    if (cat && !workoutCategoryList(w).includes(cat)) return false;
    if (search) {
      const haystack = w.entries.map(e => e.exerciseName).join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  }

  /** Un filtre de tipus d'entrenament (empenta, tracció...) no aplica als
   *  esports, així que els amaga; la cerca sí que hi busca pel nom. */
  private _matchesSport(item: { sport: Sport; session: SportSession }, cat: ExerciseCategory | null, search: string): boolean {
    if (cat) return false;
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
      const needsAll = !!this.searchQuery().trim() || !!this.filterCat();
      if (!needsAll || !this.authService.uid()) return;
      this._loadEverything();
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
      this._observer = new IntersectionObserver(
        entries => { if (entries[0].isIntersecting && this.hasMore() && !this.isLoadingMore()) this.loadMoreMonths(); },
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
      const before = this.feedDays().length;
      await this._ensureMonth(target.getFullYear(), target.getMonth());
      this.monthsBack.set(next);
      // Dotze mesos seguits sense res nou: donem l'historial per esgotat i
      // parem de demanar mesos buits.
      if (this.feedDays().length === before) this._emptyStreak++;
      else this._emptyStreak = 0;
      if (this._emptyStreak >= 12) this._reachedEnd.set(true);
    } finally {
      this.isLoadingMore.set(false);
    }
  }

  private async _ensureMonth(year: number, month: number): Promise<void> {
    await Promise.all([
      this.workoutService.ensureMonthLoaded(year, month),
      this.sportService.ensureMonthLoaded(year, month),
    ]);
  }

  private async _loadEverything(): Promise<void> {
    await Promise.all([
      this.workoutService.loadAllWorkouts(),
      this.sportService.loadAllSessions(),
    ]);
    this._reachedEnd.set(true);
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

  selectDate(date: string): void {
    this.selectedDate.set(this.selectedDate() === date ? null : date);
  }

  shiftSelectedDate(delta: number): void {
    const base = this.selectedDate() ?? this.workoutService.todayDateString();
    this.selectedDate.set(addDays(base, delta));
  }

  goToWorkout(workoutId: string): void {
    this.router.navigate(['/train'], { queryParams: { workout: workoutId } });
  }

  // ── Visual helpers ───────────────────────────────────────────────────────

  getCatColor(cat: string): string { return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#bbb'; }
  getCatLabel(cat: string): string { return CATEGORY_LABELS[cat as ExerciseCategory] ?? cat; }
  getCatIcon(cat: string): string { return CATEGORY_ICONS[cat as ExerciseCategory] ?? 'fitness_center'; }

}
