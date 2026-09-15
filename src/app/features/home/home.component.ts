import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

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
import { DiscoveryHintComponent } from '../../shared/components/discovery-hint/discovery-hint.component';
import { WeeklySummaryComponent } from '../train/components/weekly-summary.component';
import { AppHintService } from '../../core/services/app-hint.service';
import { TodayService } from '../../core/services/today.service';
import { feedDayLabel } from '../../shared/utils/workout-card.utils';
import { addDays, mondayOf } from '../../shared/utils/calendar-utils';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, CalendarComponent, DayFeedCardsComponent, FitnessInsightsComponent, PageHeaderComponent, DiscoveryHintComponent, WeeklySummaryComponent],
  template: `
    <div class="page">

      <app-page-header title="Inici" />

      <!-- ── El calendari d'Inici també va endavant ──
           Inici no és només el diari del que ja s'ha fet: hi ha el botó de
           planificar la setmana i el d'un dia futur. Si el calendari es
           plantava a avui, aquelles dues accions no s'hi podien arribar mai i
           calia passar per l'Historial per apuntar el dimarts vinent. Ara les
           setmanes de davant s'obren aquí igual que allà: un sol calendari,
           una sola manera de planificar. -->
      <div class="calendar-wrap">
        <app-calendar [selectedDate]="effectiveDate()"
                      (dateSelected)="selectDate($event)"
                      (weekChanged)="currentWeekMonday.set($event)" />
        <app-weekly-summary [weekDate]="effectiveDate()" />

        @if (canPlanViewedWeek()) {
          <div class="plan-week-strip">
            <a class="plan-week-btn" [routerLink]="['/train/planner']" [queryParams]="{ week: currentWeekMonday() }">
              <span class="material-symbols-outlined" aria-hidden="true">event_repeat</span>
              Planificar la setmana
              <span class="material-symbols-outlined plan-week-arrow" aria-hidden="true">chevron_right</span>
            </a>
          </div>
        }
      </div>

      <!-- ── Acció principal del dia seleccionat ──
           Va just sota el calendari: tries el dia i hi actues. Abans vivia
           sota la targeta del dia, i com que aquesta creix amb l'activitat,
           com més entrenaves més avall queia el botó.

           Els altres dies només admeten una cosa —un de passat es registra,
           un de futur es planifica— i el botó va sencer. Avui n'admet dues, i
           per això es parteix. -->
      <div class="swb-row" [class.swb-row--split]="canPlanToday()">
        <button class="start-workout-btn"
                [class.start-workout-btn--past]="dayAction().kind === 'past'"
                [class.start-workout-btn--plan]="dayAction().kind === 'future'"
                data-tour="day-action"
                (click)="runDayAction()">
          <span class="swb-icon-wrap" aria-hidden="true">
            <span class="material-symbols-outlined swb-icon">{{ dayAction().icon }}</span>
          </span>
          <span class="swb-text">
            <span class="swb-label">{{ dayAction().label }}</span>
            <span class="swb-sub">{{ dayAction().sub }}</span>
          </span>
          <span class="material-symbols-outlined swb-arrow" aria-hidden="true">arrow_forward</span>
        </button>

        <!-- El segon verb d'avui: no fer-lo ara, deixar-lo apuntat. Va del
             violeta de planificar, el mateix que agafa el botó sencer quan el
             dia triat encara ha de venir — l'acció és la mateixa, canvia el
             dia. -->
        @if (canPlanToday()) {
          <button class="swb-plan" (click)="planSelectedDay()"
                  aria-label="Planificar avui per a més tard">
            <span class="material-symbols-outlined" aria-hidden="true">event_upcoming</span>
          </button>
        }
      </div>

      <!-- Els insights són tendències de setmanes, no del dia seleccionat:
           per això ja no depenen que el dia estigui buit. Offline sí que en
           silencia, perquè les dades poden estar a mitges. -->
      @if (!offlineService.isOffline()) {
        <app-fitness-insights />
      }

      <!-- ── Avui / dia seleccionat ── -->
      <div class="today-card">
        <div class="today-header">
          <span class="today-header-icon-wrap">
            <span class="material-symbols-outlined today-header-icon">today</span>
          </span>
          <!-- Un sol títol: «Avui», «Ahir» o el dia escrit. La data sencera a
               sota deia dues vegades el mateix dia amb dues cares diferents. -->
          <h2 class="today-title">{{ previewTitle() }}</h2>
          @if (plannedCount() > 0) {
            <span class="today-plan-pill">
              <span class="material-symbols-outlined">event_upcoming</span>
              {{ plannedCount() }}
            </span>
          }
        </div>

        <div class="today-body">
          @if (previewFeedEntry(); as day) {
            <app-day-feed-cards [day]="day" (open)="goToWorkout($event)"
                                (openSport)="goToSportSession($event)" />
          } @else {
            <div class="today-empty">
              <span class="material-symbols-outlined today-empty-icon">bedtime</span>
              <span class="today-empty-text">Sense activitat</span>
            </div>
          }
        </div>
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
      } @else if (showSeparateGoalsNudge()) {
        <div class="routine-hint-card">
          <button class="routine-hint-dismiss" (click)="hintService.dismiss('nudge-separate-goals')" aria-label="No tornar a mostrar">
            <span class="material-symbols-outlined">close</span>
          </button>
          <div class="routine-hint-top">
            <span class="material-symbols-outlined routine-hint-icon">flag</span>
            <div class="routine-hint-text">
              <span class="routine-hint-title">Fas gym i esport</span>
              <span class="routine-hint-sub">Marca objectius setmanals separats per a cada tipus i segueix-los per separat.</span>
            </div>
          </div>
          <div class="routine-hint-actions">
            <button class="routine-hint-btn" (click)="goToSettings()">
              <span class="material-symbols-outlined">flag</span>
              Objectius separats
            </button>
          </div>
        </div>
      } @else {
        <app-discovery-hint />
      }

      <!-- ── Activitat recent ──
           Una drecera, no una llista. Inici és la pantalla del dia d'avui, i
           tenir-hi el mes sencer plegat a sota volia dir mantenir dues
           lectures de la mateixa cosa: aquí el botó, i l'Historial —que ja hi
           té cerca, filtres i calendari— fa la feina. Hi entra amb els últims
           30 dies filtrats, que és el que la secció ensenyava. -->
      <a class="recent-link" routerLink="/calendar" [queryParams]="{ range: '30d' }">
        <span class="rl-icon-wrap" aria-hidden="true">
          <span class="material-symbols-outlined rl-icon">history</span>
        </span>
        <span class="rl-text">
          <span class="rl-title">Activitat recent</span>
          <span class="rl-sub">Els últims 30 dies a l'Historial</span>
        </span>
        <span class="material-symbols-outlined rl-arrow" aria-hidden="true">chevron_right</span>
      </a>

    </div>
  `,
  styles: [`
    .page { padding: 0 0 var(--page-pad-bottom); }

    .calendar-wrap {
      margin: 4px 16px 0;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 16px; overflow: hidden;
    }

    /* ── "Planificar la setmana" (sota l'objectiu setmanal) ── */
    .plan-week-strip {
      display: flex; justify-content: flex-end;
      padding: 10px 14px;
      border-top: 1px solid var(--c-border-2);
      background: var(--c-card);
    }
    /* Acció secundària: anava plena de marca i, com que queda per sobre de
       l'acció principal, era el primer botó que trobava l'ull. Tenyida
       continua sent ben visible sense competir-hi. */
    .plan-week-btn {
      display: inline-flex; align-items: center; gap: 6px;
      height: 38px; padding: 0 14px; box-sizing: border-box;
      border: 1.5px solid color-mix(in srgb, var(--c-brand) 45%, var(--c-border));
      border-radius: 12px;
      background: color-mix(in srgb, var(--c-brand) 10%, var(--c-card));
      color: color-mix(in srgb, var(--c-brand) 70%, var(--c-text));
      font-size: 13px; font-weight: 700;
      text-decoration: none; cursor: pointer; touch-action: manipulation; transition: background 0.15s, transform 0.1s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: color-mix(in srgb, var(--c-brand) 18%, var(--c-card)); }
      &:active { transform: scale(0.98); }
    }
    .plan-week-arrow { color: color-mix(in srgb, var(--c-brand) 55%, var(--c-text-3)); }

    /* ── Avui / dia seleccionat: targeta destacada amb capçalera de marca ── */
    .today-card {
      margin: 16px 16px 0;
      background: var(--c-card);
      border: 1.5px solid color-mix(in srgb, var(--c-brand) 22%, var(--c-border-2));
      border-radius: 18px; overflow: hidden;
      box-shadow: 0 4px 16px color-mix(in srgb, var(--c-brand) 10%, var(--c-shadow));
    }
    .today-header {
      display: flex; align-items: center; gap: 10px; width: 100%;
      margin: 0; padding: 12px 12px 12px 14px;
      border: none; text-align: left;
      background: color-mix(in srgb, var(--c-brand) 8%, var(--c-card));
    }
    .today-header-icon-wrap {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 38px; height: 38px; border-radius: 12px;
      background: var(--c-brand);
      box-shadow: 0 2px 8px color-mix(in srgb, var(--c-brand) 35%, transparent);
    }
    .today-header-icon { font-size: 21px; color: white; font-variation-settings: 'FILL' 1, 'wght' 400; }
    .today-title {
      flex: 1; min-width: 0; margin: 0;
      font-size: 17px; font-weight: 800; color: var(--c-text);
      letter-spacing: 0.1px; text-transform: capitalize;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .today-plan-pill {
      display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
      padding: 4px 9px; border-radius: 20px;
      background: rgba(var(--c-brand-rgb), 0.14); color: var(--c-brand);
      font-size: 12px; font-weight: 800;
      .material-symbols-outlined { font-size: 15px; }
    }
    .today-body { padding: 12px; }

    .today-empty {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 14px 12px; text-align: center;
    }
    .today-empty-icon { font-size: 32px; color: color-mix(in srgb, var(--c-brand) 35%, var(--c-border)); }
    .today-empty-text { font-size: 13px; color: var(--c-text-3); line-height: 1.4; }

    /* ── Acció principal del dia seleccionat ──
       Botó sòlid i ple, i l'únic d'aquest pes a la pàgina: el verb mana al
       títol i el dia va a sota, perquè el botó digui tot sol què farà. */
    .swb-row { display: flex; align-items: stretch; margin: 12px 16px 0; }
    .start-workout-btn {
      --sc: var(--c-brand);
      position: relative;
      flex: 1; min-width: 0; box-sizing: border-box;
      display: flex; align-items: center; gap: 12px;
      min-height: 66px; padding: 0 14px; border: none; border-radius: 16px;
      background: var(--sc); color: white; text-align: left;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 5px 18px color-mix(in srgb, var(--sc) 40%, transparent);
      transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
      &:hover {
        background: color-mix(in srgb, var(--sc) 88%, black);
        box-shadow: 0 7px 22px color-mix(in srgb, var(--sc) 48%, transparent);
      }
      &:active { transform: scale(0.98); }
      /* Millora d'accessibilitat: anell de focus visible per a teclat. */
      &:focus-visible { outline: 2px solid var(--c-text); outline-offset: 2px; }
    }
    /* Tres batecs en carregar i prou: si la pàgina arriba amb el botó ja
       quiet, l'ull se'n va al calendari i a les targetes i no hi torna.
       L'anell agafa el color del botó, que canvia si el dia és passat. */
    .start-workout-btn::after {
      content: ''; position: absolute; inset: -1px; border-radius: inherit;
      border: 2px solid var(--sc); pointer-events: none; opacity: 0;
      animation: swb-attention 1.4s ease-out 0.6s 3;
    }
    @keyframes swb-attention {
      from { opacity: 0.55; transform: scale(1); }
      to   { opacity: 0;    transform: scale(1.07); }
    }
    @media (prefers-reduced-motion: reduce) {
      .start-workout-btn::after { animation: none; }
    }
    /* Cada cosa que es pot fer amb un dia té el seu color, i es reconeix
       abans de llegir-la: avui s'entrena i això és marca; un dia passat es
       registra, accent càlid; un de futur es planifica, violeta.

       Planificar anava de marca, igual que entrenar, i quedava dit que eren
       la mateixa acció quan són ben bé la contrària: una es fa ara i l'altra
       es deixa apuntada. Els dos accents porten text blanc a més de 4.5:1
       —el càlid es va haver d'enfosquir fins a #a06000, que #b26a00 es
       quedava a 4.2; el violeta hi arriba de sobres. */
    .start-workout-btn--past { --sc: #a06000; }
    .start-workout-btn--plan { --sc: #5e35b1; }

    /* ── El segon verb d'avui ──
       Partit de debò, no dos botons de costat: les vores de fora són les del
       botó sencer i pel mig no hi ha aire. El que separa les dues meitats és
       el color, que és exactament el que han de dir. */
    .swb-row--split {
      .start-workout-btn { border-radius: 16px 0 0 16px; }
      /* L'anell del batec segueix la meitat esquerra i no dibuixa cap filet
         per la juntura. */
      .start-workout-btn::after { border-right-color: transparent; }
    }
    .swb-plan {
      --sc: #5e35b1;
      flex-shrink: 0; width: 62px;
      display: flex; align-items: center; justify-content: center;
      border: none; border-radius: 0 16px 16px 0;
      background: var(--sc); color: white;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 5px 18px color-mix(in srgb, var(--sc) 40%, transparent);
      transition: background 0.15s, box-shadow 0.15s, transform 0.1s;
      .material-symbols-outlined { font-size: 25px; font-variation-settings: 'FILL' 1; }
      &:hover {
        background: color-mix(in srgb, var(--sc) 88%, black);
        box-shadow: 0 7px 22px color-mix(in srgb, var(--sc) 48%, transparent);
      }
      &:active { transform: scale(0.96); }
      &:focus-visible { outline: 2px solid var(--c-text); outline-offset: 2px; }
    }
    .swb-icon-wrap {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 40px; height: 40px; border-radius: 12px;
      background: rgba(255,255,255,0.18);
    }
    .swb-icon { font-size: 23px; font-variation-settings: 'FILL' 1; }
    .swb-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .swb-label { font-size: 16px; font-weight: 800; letter-spacing: -0.1px; line-height: 1.2; }
    .swb-sub {
      font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.85); line-height: 1.2;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .swb-arrow { font-size: 20px; flex-shrink: 0; color: rgba(255,255,255,0.9); }

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

    /* ── Drecera a l'Historial ──
       Fila d'una sola línia de lectura: icona tenyida, què hi trobaràs i el
       xebró que diu que se'n va a una altra pantalla. Tenyida i no plena,
       perquè per pes queda per sota del botó del dia, que és l'acció. */
    .recent-link {
      display: flex; align-items: center; gap: 12px;
      margin: 16px 16px 0; padding: 12px 14px;
      border: 1.5px solid var(--c-border-2); border-radius: 16px;
      background: var(--c-card); box-shadow: 0 2px 10px var(--c-shadow);
      text-decoration: none; cursor: pointer; touch-action: manipulation;
      transition: border-color 0.15s, transform 0.1s, box-shadow 0.15s;
      &:hover {
        border-color: color-mix(in srgb, var(--c-brand) 45%, var(--c-border));
        box-shadow: 0 4px 14px var(--c-shadow);
      }
      &:active { transform: scale(0.99); }
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 2px; }
    }
    .rl-icon-wrap {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 36px; height: 36px; border-radius: 11px;
      background: color-mix(in srgb, var(--c-brand) 12%, transparent);
    }
    .rl-icon { font-size: 21px; color: var(--c-brand); font-variation-settings: 'FILL' 0, 'wght' 400; }
    .rl-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .rl-title { font-size: 14px; font-weight: 800; color: var(--c-text); letter-spacing: -0.1px; }
    .rl-sub {
      font-size: 11.5px; font-weight: 600; color: var(--c-text-3); line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .rl-arrow { font-size: 20px; flex-shrink: 0; color: var(--c-text-3); }
  `],
})
export class HomeComponent {
  readonly workoutService  = inject(WorkoutService);
  readonly sportService    = inject(SportService);
  readonly offlineService  = inject(OfflineService);
  readonly settingsService = inject(UserSettingsService);
  readonly hintService     = inject(AppHintService);
  private router           = inject(Router);
  private confirmDialog    = inject(ConfirmDialogService);
  /** El dia d'avui com a senyal, perquè "Avui" segueixi el rellotge de
   *  l'usuari i canviï a la seva mitjanit sense recarregar. */
  private readonly today   = inject(TodayService).today;

  readonly selectedDate = signal<string | null>(null);

  /** Monday of whichever week the calendar widget currently has in view,
   *  powering the "Planificar la setmana" quick action below the weekly goal. */
  readonly currentWeekMonday = signal<string>(mondayOf(this.today()));
  /** Planning only makes sense from today onward — the shortcut disappears
   *  when the week in view has already fully passed. */
  readonly canPlanViewedWeek = computed(() =>
    addDays(this.currentWeekMonday(), 6) >= this.today());

  /** Contextual nudge: the user trains both gym and sport but tracks a single
   *  combined weekly goal — suggest splitting it into separate goals. */
  readonly showSeparateGoalsNudge = computed(() => {
    if (this.hintService.isDismissed('nudge-separate-goals')) return false;
    const s = this.settingsService.settings();
    if ((s.goalMode ?? 'combined') !== 'combined') return false;
    if (!s.weeklyActivityGoal) return false;
    return this.workoutService.doneWorkouts().length > 0
        && this.sportService.sessions().length > 0;
  });

  readonly effectiveDate = computed(() => this.selectedDate() ?? this.today());

  readonly hasRoutine = computed(() => {
    const p = this.settingsService.weeklyPlan();
    return p.recurring || p.days.some(items => items.length > 0);
  });

  readonly showRoutineHint = computed(() =>
    !this.hasRoutine() && !this.settingsService.settings().routineHintDismissed
  );

  readonly previewFeedEntry = computed((): DayFeedEntry | null => {
    const date    = this.effectiveDate();
    // Depend on the raw data signals directly (same as the calendar) so this
    // recomputes the moment workouts/sports finish loading — not only when the
    // selected day changes. The per-date helpers below read memoised indexes
    // (byDate / _sessionsByDate); touching the source signals here keeps the
    // feed and the "Avui" card in lock-step with the calendar on first load.
    this.workoutService.workouts(); this.sportService.sessions(); this.sportService.sports();
    // Planned workouts belong to whichever day they sit on, not just today —
    // selecting a day on the calendar should surface its plan so it can be
    // started, edited or removed straight from here.
    const planned = this.workoutService.getPlannedForDate(date);
    const done    = this.workoutService.getDoneWorkoutsForDate(date);
    const workouts: Workout[] = [...planned, ...done];
    // Els esports planificats es llegeixen igual que els entrenaments
    // planificats: si aquí només hi entraven les sessions fetes, un pàdel
    // apuntat per avui no sortia enlloc de la portada.
    const sports: { sport: Sport; session: SportSession }[] = [
      ...this.sportService.getPlannedSportSessionsForDate(date),
      ...this.sportService.getSportSessionsForDate(date),
    ];
    if (workouts.length === 0 && sports.length === 0) return null;
    return { date, workouts, sports };
  });

  readonly previewTitle = computed(() => feedDayLabel(this.effectiveDate(), this.today()));

  /** Full, human date under the day label (e.g. "Dimarts, 29 de juliol") —
   *  only the first letter is capitalised, Catalan style. */
  readonly todayDateLabel = computed(() => {
    const d = new Date(this.effectiveDate() + 'T00:00:00');
    const s = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  });

  /** How many planned (not-yet-done) activities sit on the previewed day —
   *  gym and sport alike — so the header can flag that there's something
   *  planned. */
  readonly plannedCount = computed(() => {
    const day = this.previewFeedEntry();
    if (!day) return 0;
    return day.workouts.filter(w => (w.status ?? 'done') === 'planned').length
         + day.sports.filter(s => s.session.status === 'planned').length;
  });

  readonly isToday = computed(() => this.effectiveDate() === this.today());

  /** Avui és l'únic dia amb dos verbs: fer-ho ara o deixar-ho apuntat. Un de
   *  passat ja ha passat i un de futur només es pot planificar —el botó
   *  sencer ja ho és—, o sigui que només avui es parteix. */
  readonly canPlanToday = computed(() => this.isToday());

  /** A day that has already passed — the "Comença un entrenament" primary
   *  action is swapped for "Registra un entrenament", which opens the train
   *  passthrough already pinned to that day. */
  readonly isPast = computed(() => this.effectiveDate() < this.today());

  /** L'acció del dia seleccionat: entrenar avui, registrar un dia passat o
   *  planificar-ne un de futur.
   *
   *  Sempre n'hi ha una. Abans un dia futur no en tenia cap i la fila
   *  desapareixia, que és la pitjor manera d'amagar l'acció principal:
   *  qui toca un dia de la setmana vinent es queda sense res a prémer. */
  readonly dayAction = computed(() => {
    if (this.isToday()) return {
      kind: 'today', icon: 'add_circle',
      label: 'Comença un entrenament', sub: "Registra la sessió d'avui",
    };
    if (this.isPast()) return {
      kind: 'past', icon: 'history',
      label: 'Registra un entrenament', sub: this.todayDateLabel(),
    };
    return {
      kind: 'future', icon: 'event_upcoming',
      label: 'Planifica aquest dia', sub: this.todayDateLabel(),
    };
  });

  runDayAction(): void {
    if (this.isToday()) { this.goToTrain(); return; }
    this.registerPastWorkout();
  }

  /** Open the train page to log a forgotten workout on the selected past day
   *  (e.g. "ahir vaig jugar a padel i no ho vaig apuntar"), or to plan a
   *  future one — the train page reads the day off the query param either
   *  way and shows "Registrant" or "Planificant" accordingly. */
  registerPastWorkout(): void {
    this.router.navigate(['/train'], { queryParams: { date: this.effectiveDate() } });
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

  /** Una sessió d'esport té pàgina pròpia, igual que un entrenament. */
  goToSportSession(item: { session: SportSession }): void {
    this.router.navigate(['/sport', item.session.id]);
  }

  goToPlanner(): void {
    this.router.navigate(['/train/planner']);
  }

  /** Deixar apuntat el dia sense començar-lo: la pàgina d'Entrenar rep el dia
   *  i que el que s'hi faci és un pla, no una sessió que comenci ara. És el
   *  que un dia futur ja fa tot sol —allà `planning()` surt de la data—, dit
   *  expressament perquè avui també s'hi pugui arribar. */
  planSelectedDay(): void {
    this.router.navigate(['/train'], { queryParams: { date: this.effectiveDate(), plan: 1 } });
  }

  /** El botó porta a definir objectius, no al Perfil en general: hi arriba
   *  amb la secció ja oberta. */
  goToSettings(): void {
    this.router.navigateByUrl('/settings?section=goal');
  }

  async dismissRoutineHint(): Promise<void> {
    const ok = await this.confirmDialog.confirm(
      'Si l\'amagues, no tornaràs a veure aquest avís.',
      { title: 'Amagar avís de rutina', confirmLabel: 'Amagar', cancelLabel: 'Cancel·lar' },
    );
    if (!ok) return;
    this.settingsService.update({ routineHintDismissed: true });
  }

  constructor() {
    this.sportService.ensureLoaded();

    effect(() => {
      const date = this.effectiveDate();
      const [yearStr, monthStr] = date.split('-');
      this._ensureMonthLoaded(parseInt(yearStr), parseInt(monthStr) - 1);
    });

  }

  private _ensureMonthLoaded(year: number, month: number): void {
    this.workoutService.ensureMonthLoaded(year, month);
    this.sportService.ensureMonthLoaded(year, month);
  }
}
