import { Component, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { Sport, SportSession } from '../../core/models/sport.model';
import { Workout } from '../../core/models/workout.model';
import { WorkoutService } from '../../core/services/workout.service';
import { SportService } from '../../core/services/sport.service';
import { OfflineService } from '../../core/services/offline.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { DayFeedCardsComponent, DayFeedEntry } from '../../shared/components/day-feed-cards/day-feed-cards.component';
import { FitnessInsightsComponent } from '../../shared/components/fitness-insights/fitness-insights.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { feedDayLabel } from '../../shared/utils/workout-card.utils';

const TODAY = (): string => new Date().toISOString().split('T')[0];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CalendarComponent, DayFeedCardsComponent, FitnessInsightsComponent, PageHeaderComponent],
  template: `
    <div class="page">

      <app-page-header title="Inici" />

      <div class="calendar-wrap">
        <app-calendar [selectedDate]="selectedDate()" (dateSelected)="selectDate($event)" />
      </div>

      @if (!offlineService.isOffline() && previewFeedEntry() === null) {
        <app-fitness-insights />
      }

      <!-- ── Avui / dia seleccionat ── -->
      <div class="today-card">
        <button class="today-header" (click)="goToTrain()">
          <span class="material-symbols-outlined today-header-icon">today</span>
          <div class="today-header-text">
            <h2 class="today-title">{{ previewTitle() }}</h2>
          </div>
        </button>

        @if (previewFeedEntry(); as day) {
          <app-day-feed-cards [day]="day" (open)="goToWorkout($event)" (openSport)="goToSport($event)" />
        } @else if (!isToday()) {
          <p class="today-empty">Encara no hi ha res aquell dia.</p>
        }

        @if (isToday()) {
          <button class="start-workout-btn" (click)="goToTrain()">
            <span class="material-symbols-outlined">add_circle</span>
            Comença un entrenament
          </button>
        }
      </div>

      @if (showRoutineHint()) {
        <div class="routine-hint-card">
          <button class="routine-hint-dismiss" (click)="dismissRoutineHint()" aria-label="No tornar a mostrar">
            <span class="material-symbols-outlined">close</span>
          </button>
          <div class="routine-hint-top">
            <span class="material-symbols-outlined routine-hint-icon">event_repeat</span>
            <div class="routine-hint-text">
              <span class="routine-hint-title">Encara no tens cap rutina</span>
              <span class="routine-hint-sub">Planifica la setmana i l'app et proposarà entrenaments automàticament</span>
            </div>
          </div>
          <div class="routine-hint-actions">
            <button class="routine-hint-btn" (click)="goToPlanner()">
              <span class="material-symbols-outlined">event_repeat</span>
              Planificar rutines
            </button>
          </div>
        </div>
      }

      <!-- ── Historial ── -->
      <div class="card-section history-card">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon">history</span>
          <h2 class="section-title">Historial</h2>
        </div>

        @if ((workoutService.isLoading() || !sportService.sportsLoaded()) && historyFeedDays().length === 0) {
          <div class="feed-sk">
            @for (_ of [1,2,3]; track $index) {
              <div class="sk-card-ph">
                <div class="sk sk-card-bar"></div>
                <div class="sk-card-body">
                  <div class="sk sk-line sk-line--55"></div>
                  <div class="sk sk-line sk-line--30"></div>
                </div>
              </div>
            }
          </div>
        } @else if (historyFeedDays().length === 0) {
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">fitness_center</span>
            <h2>Encara no hi ha res</h2>
            <p>Els teus entrenaments anteriors apareixeran aquí.</p>
          </div>
        } @else {
          @for (day of historyFeedDays(); track day.date) {
            <div class="feed-day">
              <div class="feed-day-header">{{ dayLabel(day.date) }}</div>
              <app-day-feed-cards [day]="day" (open)="goToWorkout($event)" (openSport)="goToSport($event)" />
            </div>
          }

          <div #feedSentinel class="scroll-sentinel"></div>
          @if (feedLoadingMore()) {
            <div class="loading-state">
              <span class="material-symbols-outlined spin">sync</span>
            </div>
          }
        }
      </div>

    </div>
  `,
  styles: [`
    .page { padding: 0 0 16px; }

    .calendar-wrap {
      margin: 4px 16px 0;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 16px; overflow: hidden;
    }

    /* ── Avui / dia seleccionat: targeta blava (mateix marge que la resta) ── */
    .today-card {
      margin: 16px 16px 0;
      padding: 12px;
      background: color-mix(in srgb, var(--c-brand) 5%, var(--c-card));
      border: 1.5px solid color-mix(in srgb, var(--c-brand) 24%, var(--c-border-2));
      border-radius: 18px;
    }
    .today-header {
      display: flex; align-items: center; gap: 7px; width: 100%;
      margin: 0 0 10px; padding: 0;
      border: none; background: transparent; cursor: pointer; touch-action: manipulation;
      text-align: left;
    }
    .today-header-icon { font-size: 19px; color: var(--c-brand); font-variation-settings: 'FILL' 1, 'wght' 400; }
    .today-header-text { flex: 1; min-width: 0; }
    .today-title { margin: 0; font-size: 15px; font-weight: 800; color: var(--c-text); letter-spacing: 0.1px; text-transform: capitalize; }

    .today-empty {
      margin: 0; font-size: 12.5px; color: var(--c-text-3);
      padding: 6px 0;
    }

    /* ── Botó gros "Comença un entrenament" ── */
    .start-workout-btn {
      display: flex; align-items: center; justify-content: center; gap: 8px;
      width: 100%; height: 52px; margin-top: 10px; padding: 0;
      border: none; border-radius: 14px;
      background: var(--c-brand); color: white;
      font-size: 15px; font-weight: 800; letter-spacing: 0.1px;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s, transform 0.1s;
      box-shadow: 0 4px 14px color-mix(in srgb, var(--c-brand) 35%, transparent);
      .material-symbols-outlined { font-size: 22px; }
      &:hover { background: var(--c-brand-dk); }
      &:active { transform: scale(0.98); }
    }

    /* ── "Encara no tens cap rutina" hint ── */
    .routine-hint-card {
      position: relative;
      display: flex; flex-direction: column; gap: 10px;
      margin: 16px 16px 0; padding: 14px 34px 14px 14px;
      background: var(--c-card);
      border: 1.5px solid var(--c-border-2); border-radius: 16px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .routine-hint-top { display: flex; align-items: flex-start; gap: 10px; }
    .routine-hint-icon { font-size: 22px; color: var(--c-brand); flex-shrink: 0; font-variation-settings: 'FILL' 0, 'wght' 300; }
    .routine-hint-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .routine-hint-title { font-size: 13.5px; font-weight: 800; color: var(--c-text); }
    .routine-hint-sub { font-size: 11.5px; color: var(--c-text-3); line-height: 1.35; }
    .routine-hint-actions { display: flex; justify-content: flex-end; }
    .routine-hint-btn {
      display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0;
      padding: 9px 14px; border: none; border-radius: 11px;
      background: var(--c-brand); color: white;
      font-size: 12.5px; font-weight: 700; letter-spacing: 0.1px;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 16px; }
      &:hover { background: var(--c-brand-dk); }
    }
    .routine-hint-dismiss {
      position: absolute; top: 8px; right: 8px;
      width: 26px; height: 26px; border-radius: 50%; border: none;
      background: transparent; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover { background: var(--c-subtle); color: var(--c-text-2); }
    }

    /* ── "Historial" section card ── */
    .history-card {
      margin: 16px 16px 0;
      padding: 14px 14px 16px;
      background: var(--c-card);
      border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
    .section-icon  { font-size: 18px; color: var(--c-text-3); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }

    /* ── Activity feed ── */
    .feed-day { margin: 0 0 14px; }
    .feed-day-header {
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px;
      margin-bottom: 6px;
    }
    .feed-sk { display: flex; flex-direction: column; gap: 8px; }

    /* ── Loading ── */
    .loading-state {
      display: flex; justify-content: center; padding: 48px;
      .material-symbols-outlined { font-size: 32px; color: var(--c-border); }
    }

    /* ── Infinite scroll ── */
    .scroll-sentinel { height: 1px; }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center;
      gap: 10px; padding: 40px 24px; text-align: center;
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
    .sk-card-ph {
      display: flex; align-items: stretch;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      overflow: hidden; margin-bottom: 12px;
    }
    .sk-card-bar { width: 5px; min-height: 52px; flex-shrink: 0; border-radius: 0; }
    .sk-card-body {
      flex: 1; padding: 10px;
      display: flex; flex-direction: column; gap: 7px;
    }
    .sk-line      { height: 12px; }
    .sk-line--55  { width: 55%; }
    .sk-line--30  { width: 30%; height: 10px; }
  `],
})
export class HomeComponent implements OnDestroy {
  readonly workoutService  = inject(WorkoutService);
  readonly sportService    = inject(SportService);
  readonly offlineService  = inject(OfflineService);
  readonly settingsService = inject(UserSettingsService);
  private router           = inject(Router);
  private confirmDialog    = inject(ConfirmDialogService);

  readonly selectedDate = signal<string | null>(null);

  readonly effectiveDate = computed(() => this.selectedDate() ?? TODAY());

  readonly hasRoutine = computed(() => {
    const p = this.settingsService.weeklyPlan();
    return p.recurring || p.days.some(items => items.length > 0);
  });

  readonly showRoutineHint = computed(() =>
    !this.hasRoutine() && !this.settingsService.settings().routineHintDismissed
  );

  readonly previewFeedEntry = computed((): DayFeedEntry | null => {
    const date    = this.effectiveDate();
    const planned = date === TODAY() ? this.workoutService.getPlannedForDate(date) : [];
    const done    = this.workoutService.getDoneWorkoutsForDate(date);
    const workouts: Workout[] = [...planned, ...done];
    const sports: { sport: Sport; session: SportSession }[] = this.sportService.getSportSessionsForDate(date);
    if (workouts.length === 0 && sports.length === 0) return null;
    return { date, workouts, sports };
  });

  readonly previewTitle = computed(() => feedDayLabel(this.effectiveDate(), TODAY()));

  readonly isToday = computed(() => this.effectiveDate() === TODAY());

  dayLabel(date: string): string {
    return feedDayLabel(date, TODAY());
  }

  selectDate(date: string): void {
    this.selectedDate.set(this.selectedDate() === date ? null : date);
  }

  goToTrain(): void {
    this.router.navigate(['/train']);
  }

  goToWorkout(workoutId: string): void {
    this.router.navigate(['/train'], { queryParams: { workout: workoutId } });
  }

  goToSport(event: { sportId: string; date: string }): void {
    this.router.navigate(['/train'], { queryParams: { sport: event.sportId, date: event.date } });
  }

  goToPlanner(): void {
    this.router.navigate(['/train/planner']);
  }

  async dismissRoutineHint(): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Si l\'amagues, no tornaràs a veure aquest avís. Podràs reactivar-lo des del teu Perfil.',
      { title: 'Amagar avís de rutina', confirmLabel: 'Amagar', cancelLabel: 'Cancel·lar' },
    );
    if (!ok) return;
    this.settingsService.update({ routineHintDismissed: true });
  }

  // ── Activity feed (grouped by day, infinite scroll backwards in time) ────

  /** How many months before the current one are loaded — 0 means only the
   *  current month (already loaded via the effectiveDate effect below). */
  private readonly feedMonthsBack = signal(0);
  readonly feedLoadingMore = signal(false);
  private readonly feedSentinelRef = viewChild<ElementRef<HTMLElement>>('feedSentinel');
  private _feedObserver: IntersectionObserver | null = null;

  readonly feedDays = computed(() => {
    const monthsBack = this.feedMonthsBack();
    const today      = new Date();
    const todayStr   = TODAY();
    const earliest   = new Date(today.getFullYear(), today.getMonth() - monthsBack, 1);
    const days: DayFeedEntry[] = [];

    const cursor = new Date(today);
    while (cursor >= earliest) {
      const dateStr  = cursor.toISOString().split('T')[0];
      const done     = this.workoutService.getDoneWorkoutsForDate(dateStr);
      const planned  = dateStr === todayStr ? this.workoutService.getPlannedForDate(dateStr) : [];
      const workouts = [...planned, ...done];
      const sports   = this.sportService.getSportSessionsForDate(dateStr);
      if (workouts.length > 0 || sports.length > 0) days.push({ date: dateStr, workouts, sports });
      cursor.setDate(cursor.getDate() - 1);
    }
    return days;
  });

  /** Whichever day is already shown up in the "Avui" preview is excluded
   *  from the historical list below, whether that's today or a selected
   *  past date. */
  readonly historyFeedDays = computed(() =>
    this.feedDays().filter(d => d.date !== this.effectiveDate())
  );

  async loadMoreFeedMonths(): Promise<void> {
    if (this.feedLoadingMore()) return;
    this.feedLoadingMore.set(true);
    try {
      const next   = this.feedMonthsBack() + 1;
      const today  = new Date();
      const target = new Date(today.getFullYear(), today.getMonth() - next, 1);
      await Promise.all([
        this.workoutService.ensureMonthLoaded(target.getFullYear(), target.getMonth()),
        this.sportService.ensureMonthLoaded(target.getFullYear(), target.getMonth()),
      ]);
      this.feedMonthsBack.set(next);
    } finally {
      this.feedLoadingMore.set(false);
    }
  }

  constructor() {
    this.sportService.ensureLoaded();

    effect(() => {
      const date = this.effectiveDate();
      const [yearStr, monthStr] = date.split('-');
      const year  = parseInt(yearStr);
      const month = parseInt(monthStr) - 1;
      this.workoutService.ensureMonthLoaded(year, month);
      this.sportService.ensureMonthLoaded(year, month);
    });

    // Re-attach the infinite-scroll observer whenever the feed's sentinel
    // element (re)appears — e.g. after the empty/skeleton state resolves.
    effect(() => {
      const el = this.feedSentinelRef()?.nativeElement;
      this._feedObserver?.disconnect();
      if (!el) return;
      this._feedObserver = new IntersectionObserver(
        entries => { if (entries[0].isIntersecting && !this.feedLoadingMore()) this.loadMoreFeedMonths(); },
        { rootMargin: '200px' }
      );
      this._feedObserver.observe(el);
    });
  }

  ngOnDestroy(): void {
    this._feedObserver?.disconnect();
  }
}
