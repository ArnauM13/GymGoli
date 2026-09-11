import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { goalForWeek } from '../../core/models/weekly-goal.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { FitnessMetricsService } from '../../core/services/fitness-metrics.service';
import { SportService } from '../../core/services/sport.service';
import { TodayService } from '../../core/services/today.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { WorkoutStatsService } from '../../core/services/workout-stats.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import {
  MONTHS_CA, addDays, mondayOf, monthLabelOf, monthStartOf, sameSpanLastMonth, weekRangeLabel,
} from '../../shared/utils/calendar-utils';
import { countSessions } from '../../shared/utils/session-group.utils';
import { workoutSetsCount, workoutVolume } from '../../shared/utils/workout-card.utils';

/** Fins on mira enrere la ratxa de setmanes, i per tant quin tram de resums
 *  necessita la pàgina. */
const STREAK_WEEKS = 52;

/** Una xifra del mes, amb el seu mateix tram del mes passat al costat. */
interface MonthStat {
  key: string;
  icon: string;
  label: string;
  value: string;
  /** Diferència amb el mateix tram del mes passat, ja escrita («+2», «−1,2 t»).
   *  `null` quan les dues xifres són iguals: un «=» no diu res. */
  delta: string | null;
  /** Cap on va. Mai el color tot sol: la fletxa hi és sempre. */
  dir: 'up' | 'down' | null;
}

/** Una barra del mes: una setmana, retallada als dies que són del mes. */
interface WeekBarChart {
  label: string;
  count: number;
  pct: number;
  current: boolean;
}

/** Una fila de «Aquesta setmana». `target` a `null` = recompte sense objectiu. */
interface WeekBar {
  icon: string;
  label: string;
  count: number;
  target: number | null;
  pct: number;
  done: boolean;
  /** Desglossa la fila de sobre en comptes de dir una cosa nova. */
  sub: boolean;
}

function fmtVolume(kg: number): string {
  if (kg <= 0) return '0';
  if (kg >= 1000) return `${(kg / 1000).toFixed(1).replace('.', ',')} t`;
  return `${Math.round(kg)} kg`;
}

/**
 * Progrés: on es veu com va la cosa, de gran a petit.
 *
 * A dalt el mes —el tros de temps on un canvi ja es nota— i a sota la setmana,
 * que és la que encara es pot moure avui. Del detall no n'hi ha res aquí: qui
 * el vulgui entra a Insights (què hem vist a les teves dades) o a Exercicis i
 * esports (com evoluciona cada un), que són pantalles pròpies perquè són dues
 * preguntes diferents i barrejades no es llegia cap de les dues.
 */
@Component({
  selector: 'app-progress',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <div class="page">
      <app-page-header title="Progrés" />

      @if (hasData()) {
        <!-- ── Aquest mes ── -->
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon" aria-hidden="true">calendar_month</span>
            <h2 class="section-title">Aquest mes</h2>
            <span class="section-count">{{ monthLabel() }}</span>
          </div>

          <div class="stat-grid">
            @for (s of monthStats(); track s.key) {
              <div class="stat-tile">
                <span class="material-symbols-outlined stat-icon" aria-hidden="true">{{ s.icon }}</span>
                <span class="stat-val">{{ s.value }}</span>
                <span class="stat-lbl">{{ s.label }}</span>
                @if (s.delta; as d) {
                  <span class="stat-delta" [class.stat-delta--up]="s.dir === 'up'"
                        role="img" [attr.aria-label]="deltaLabel(s)">
                    <span class="material-symbols-outlined" aria-hidden="true">
                      {{ s.dir === 'up' ? 'trending_up' : 'trending_down' }}
                    </span>
                    {{ d }}
                  </span>
                }
              </div>
            }
          </div>

          <p class="month-split">{{ monthGym() }} de gimnàs · {{ monthSport() }} d'esport</p>
          @if (hasDelta()) {
            <p class="month-cmp">Les fletxes comparen amb els mateixos dies del mes passat</p>
          }

          <!-- Com s'han repartit: una barra per setmana, retallada al mes. -->
          @if (monthWeeks().length > 1) {
            <div class="mc">
              <span class="mc-caption">Activitats per setmana</span>
              <!-- De quan parla. Un gràfic sense dates fa endevinar el període. -->
              <span class="mc-range">{{ monthRange() }}</span>
              <div class="mc-plot" role="img" [attr.aria-label]="weeksChartLabel()">
                <div class="mc-cols">
                  @if (chartGoal(); as goal) {
                    <div class="mc-ref" [style.bottom.%]="pctOf(goal)">
                      <span class="mc-ref-label">objectiu {{ goal }}</span>
                    </div>
                  }
                  @for (w of monthWeeks(); track w.label) {
                    <div class="mc-col">
                      @if (w.count > 0) { <span class="mc-val">{{ w.count }}</span> }
                      <div class="mc-bar" [class.mc-bar--now]="w.current" [style.height.%]="w.pct"></div>
                    </div>
                  }
                </div>
                <div class="mc-xrow">
                  @for (w of monthWeeks(); track w.label) {
                    <span class="mc-x">{{ w.label }}</span>
                  }
                </div>
              </div>
            </div>
          }

          @if (totalWorkouts() > 0) {
            <p class="month-total">
              <span class="material-symbols-outlined" aria-hidden="true">history</span>
              {{ totalWorkouts() }} entrenaments en total
            </p>
          }
        </div>

        <!-- ── Aquesta setmana ── -->
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon" aria-hidden="true">calendar_view_week</span>
            <h2 class="section-title">Aquesta setmana</h2>
            <span class="section-count">{{ weekLabel() }}</span>
          </div>

          @for (bar of weekBars(); track bar.label) {
            <div class="goal-row" [class.goal-row--done]="bar.done" [class.goal-row--sub]="bar.sub">
              <span class="material-symbols-outlined goal-icon" aria-hidden="true">{{ bar.icon }}</span>
              <span class="goal-name">{{ bar.label }}</span>
              @if (bar.target) {
                <div class="goal-track">
                  <div class="goal-fill" [style.width.%]="bar.pct"></div>
                </div>
              }
              <span class="goal-badge">
                {{ bar.count }}@if (bar.target) {<span class="goal-target">/{{ bar.target }}</span>}
              </span>
            </div>
          }

          @if (weekStreak() > 1) {
            <p class="streak">
              <span class="material-symbols-outlined" aria-hidden="true">local_fire_department</span>
              {{ weekStreak() }} setmanes seguides amb activitat
            </p>
          }
        </div>
      }

      <!-- ── Les dues portes ── -->
      <div class="card-section">
        <div class="section-header">
          <span class="material-symbols-outlined section-icon" aria-hidden="true">travel_explore</span>
          <h2 class="section-title">Mira-t'ho de prop</h2>
        </div>

        <a class="nav-card" routerLink="/charts/insights">
          <span class="nc-bar" style="background: #7e57c2" aria-hidden="true"></span>
          <span class="material-symbols-outlined nc-icon" aria-hidden="true">lightbulb</span>
          <span class="nc-text">
            <span class="nc-title">Insights</span>
            <span class="nc-desc">Què hem vist a les teves dades: ratxes, càrrega, patrons i tendències</span>
          </span>
          @if (insightCount() > 0) { <span class="nc-count">{{ insightCount() }}</span> }
          <span class="material-symbols-outlined nc-go" aria-hidden="true">chevron_right</span>
        </a>

        <a class="nav-card" routerLink="/charts/exercises">
          <span class="nc-bar" style="background: #26a69a" aria-hidden="true"></span>
          <span class="material-symbols-outlined nc-icon" aria-hidden="true">monitoring</span>
          <span class="nc-text">
            <span class="nc-title">Exercicis i esports</span>
            <span class="nc-desc">Marques, gràfiques i evolució d'un en un</span>
          </span>
          @if (detailCount() > 0) { <span class="nc-count">{{ detailCount() }}</span> }
          <span class="material-symbols-outlined nc-go" aria-hidden="true">chevron_right</span>
        </a>
      </div>

      @if (!hasData() && !isLoading()) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon" aria-hidden="true">monitoring</span>
            <p>Registra els teus primers entrenaments i aquí hi sortirà com evoluciones</p>
            <div class="empty-actions">
              <a class="btn-primary" routerLink="/train">Anar a Entrena</a>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .page { padding: 0 0 88px; }

    /* ── Section card ── */
    .card-section {
      margin: 12px 16px 0; padding: 14px 14px 12px;
      background: var(--c-card); border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
    .section-icon {
      font-size: 18px; color: var(--c-text-2);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .section-title {
      margin: 0; flex: 1;
      font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px;
    }
    .section-count {
      font-size: 11px; font-weight: 700; color: var(--c-text-2);
      background: var(--c-border-2); border-radius: 10px; padding: 2px 8px;
      white-space: nowrap;
    }

    /* ── Les xifres del mes ── */
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .stat-tile {
      position: relative;
      display: flex; flex-direction: column; align-items: center; gap: 3px;
      padding: 12px 8px 10px; text-align: center;
      background: var(--c-subtle); border: 1.5px solid var(--c-border-2); border-radius: 14px;
    }
    .stat-icon {
      font-size: 17px; color: var(--c-text-3);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .stat-val { font-size: 21px; font-weight: 700; color: var(--c-text); line-height: 1.1; }
    .stat-lbl { font-size: 11px; font-weight: 500; color: var(--c-text-2); }
    /* Baixar no és una falta: cap avall es diu en gris, no en vermell. La
       fletxa hi és sempre, que el color mai és l'únic senyal. */
    .stat-delta {
      display: flex; align-items: center; gap: 2px; margin-top: 1px;
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 13px; }
    }
    .stat-delta--up { color: #43a047; }

    .month-split {
      margin: 10px 0 0; text-align: center;
      font-size: 12px; font-weight: 600; color: var(--c-text-2); line-height: 1.4;
    }
    .month-cmp {
      margin: 3px 0 0; text-align: center;
      font-size: 10.5px; font-weight: 500; color: var(--c-text-3); line-height: 1.4;
    }

    /* ── El repartiment del mes ── */
    .mc { margin-top: 14px; }
    .mc-caption {
      display: block;
      font-size: 11px; font-weight: 600; color: var(--c-text-3); letter-spacing: 0.2px;
    }
    .mc-range {
      display: block; margin-bottom: 6px;
      font-size: 10px; font-weight: 500; color: var(--c-text-3); opacity: 0.85;
    }
    /* Dues files, no una: l'alçada d'una barra es mesura contra el gràfic i
       mai contra el text de sota. La xifra i la ratlla de l'objectiu poden
       sortir per sobre, i per això el gràfic hi deixa lloc. */
    .mc-plot { display: flex; flex-direction: column; gap: 4px; padding-top: 15px; }
    .mc-cols { position: relative; display: flex; align-items: flex-end; gap: 6px; height: 74px; }
    .mc-col {
      flex: 1; min-width: 0; height: 100%;
      display: flex; flex-direction: column; justify-content: flex-end;
    }
    .mc-val {
      flex-shrink: 0; margin-bottom: 3px;
      text-align: center; white-space: nowrap;
      font-size: 10px; font-weight: 800; color: var(--c-text-2);
    }
    .mc-bar {
      width: 100%; min-height: 3px; border-radius: 5px 5px 2px 2px;
      background: color-mix(in srgb, var(--c-brand) 32%, var(--c-card));
      transition: height 0.4s ease;
    }
    .mc-bar--now { background: var(--c-brand); }
    .mc-ref {
      position: absolute; left: 0; right: 0;
      border-top: 1px dashed color-mix(in srgb, var(--c-text-3) 65%, transparent);
      pointer-events: none;
    }
    .mc-ref-label {
      position: absolute; right: 0; top: -13px;
      font-size: 9.5px; font-weight: 700; color: var(--c-text-3);
      background: var(--c-card); padding: 0 3px;
    }
    .mc-xrow { display: flex; gap: 6px; }
    .mc-x {
      flex: 1; min-width: 0; text-align: center;
      font-size: 10px; font-weight: 500; color: var(--c-text-3);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .month-total, .streak {
      display: flex; align-items: center; justify-content: center; gap: 5px;
      margin: 12px 0 2px; padding-top: 10px;
      border-top: 1px solid var(--c-border-2);
      font-size: 12px; font-weight: 600; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 15px; font-variation-settings: 'FILL' 0, 'wght' 300; }
    }
    .streak .material-symbols-outlined { color: #f57c00; font-variation-settings: 'FILL' 1, 'wght' 400; }

    /* ── Aquesta setmana ── */
    .goal-row { display: flex; align-items: center; gap: 9px; padding: 9px 2px; }
    .goal-row + .goal-row:not(.goal-row--sub) { border-top: 1px solid var(--c-border-2); }
    /* El desglossament s'arrenglera sota el nom de la barra i afluixa el pes:
       no és un objectiu més, és d'on surt la xifra de dalt. */
    .goal-row--sub {
      padding: 4px 2px 4px 26px;
      .goal-icon  { font-size: 15px; }
      .goal-name  { font-size: 12px; font-weight: 500; color: var(--c-text-2); }
      .goal-badge { font-size: 12px; font-weight: 600; color: var(--c-text-2); }
    }
    .goal-row--sub:first-of-type { padding-top: 8px; }
    .goal-icon {
      font-size: 17px; color: var(--c-text-3); flex-shrink: 0;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .goal-name { font-size: 13px; font-weight: 600; color: var(--c-text); flex-shrink: 0; }
    .goal-track { flex: 1; height: 5px; border-radius: 3px; overflow: hidden; background: var(--c-border); }
    .goal-fill {
      height: 100%; border-radius: 3px; max-width: 100%;
      background: linear-gradient(90deg, var(--c-brand) 0%, color-mix(in srgb, var(--c-brand) 75%, white) 100%);
      transition: width 0.4s ease;
    }
    .goal-badge { margin-left: auto; flex-shrink: 0; font-size: 13px; font-weight: 700; color: var(--c-text); }
    .goal-target { font-size: 12px; font-weight: 500; color: var(--c-text-3); }
    /* Assolit: el verd va a la barra i a la xifra, i la icona s'omple —el
       color mai és l'únic senyal. */
    .goal-row--done {
      .goal-icon  { color: #43a047; font-variation-settings: 'FILL' 1, 'wght' 400; }
      .goal-fill  { background: #43a047; }
      .goal-badge { color: #43a047; }
    }

    /* ── Les portes al detall ── */
    .nav-card {
      display: flex; align-items: center; gap: 10px;
      margin-bottom: 8px; padding: 0 10px 0 0; overflow: hidden;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); text-decoration: none;
      transition: box-shadow 0.15s, border-color 0.15s, transform 0.1s;
      touch-action: manipulation;
      &:last-child { margin-bottom: 2px; }
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
      &:active { transform: scale(0.99); }
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: 2px; }
    }
    .nc-bar { width: 5px; align-self: stretch; min-height: 58px; flex-shrink: 0; }
    .nc-icon {
      font-size: 22px; color: var(--c-text-2); flex-shrink: 0; margin-left: 4px;
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .nc-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 11px 0; }
    .nc-title { font-size: 13.5px; font-weight: 700; color: var(--c-text); }
    .nc-desc { font-size: 11.5px; font-weight: 500; color: var(--c-text-3); line-height: 1.35; }
    .nc-count {
      flex-shrink: 0;
      font-size: 11px; font-weight: 700; color: var(--c-text-2);
      background: var(--c-border-2); border-radius: 10px; padding: 2px 8px;
    }
    .nc-go { font-size: 18px; color: var(--c-text-3); flex-shrink: 0; }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      padding: 28px 16px; text-align: center; color: var(--c-text-2);
      .empty-icon {
        font-size: 48px; color: var(--c-border);
        font-variation-settings: 'FILL' 0, 'wght' 200;
      }
      p { margin: 0; font-size: 14px; font-weight: 500; max-width: 32ch; line-height: 1.4; }
    }
    .empty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .btn-primary {
      padding: 9px 18px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white; text-decoration: none;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
      &:active { transform: scale(0.97); }
    }

    @media (prefers-reduced-motion: reduce) {
      .goal-fill, .mc-bar, .nav-card { transition: none; }
    }
  `],
})
export class ProgressComponent {
  private exerciseService = inject(ExerciseService);
  private workoutService  = inject(WorkoutService);
  private stats           = inject(WorkoutStatsService);
  private settingsService = inject(UserSettingsService);
  private sportService    = inject(SportService);
  private metricsService  = inject(FitnessMetricsService);
  private todayService    = inject(TodayService);
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);

  /** Els enllaços vells apuntaven a `/charts?exerciseId=…`, quan aquesta
   *  pàgina era la llista d'exercicis. Ara la llista és una subpàgina, i
   *  aquells enllaços —el d'una gràfica compartida, la snapshot del service
   *  worker d'algú— hi han de continuar anant a parar. */
  private readonly queryExerciseId = toSignal(
    this.route.queryParams.pipe(map(p => (p['exerciseId'] as string) ?? '')),
    { initialValue: '' },
  );

  readonly isLoading = computed(() => this.stats.loading() || !this.stats.loaded());

  /** De tota la vida de l'usuari: és un `count` al servidor, no baixar-se
   *  l'historial per comptar-lo. */
  readonly totalWorkouts = computed(() => this.stats.totals()?.totalDone ?? 0);

  readonly hasData = computed(() =>
    this.totalWorkouts() > 0 || this.sportService.sessions().length > 0
  );

  // ── El mes ───────────────────────────────────────────────────────────────

  private readonly month = computed(() => {
    const today = this.todayService.today();
    return { from: monthStartOf(today), to: today, prev: sameSpanLastMonth(today) };
  });

  readonly monthLabel = computed(() => monthLabelOf(this.todayService.today()));

  /** Quins dies del mes s'hi veuen: «1 – 10 de setembre». */
  readonly monthRange = computed(() => {
    const today = this.todayService.today();
    const d     = new Date(today + 'T12:00:00');
    return `1 – ${d.getDate()} de ${MONTHS_CA[d.getMonth()].toLowerCase()}`;
  });

  private readonly volumeCtx = computed(() => ({
    bodyweightKg: this.settingsService.bodyweightKg(),
    loadTypeOf: this.exerciseService.loadTypeOf,
    bodyweightFactorOf: this.exerciseService.bodyweightFactorOf,
  }));

  /** Les xifres d'un tram: el que després es compara amb el mes passat. */
  private span(from: string, to: string) {
    const ctx      = this.volumeCtx();
    const workouts = this.workoutService.doneWorkouts().filter(w => w.date >= from && w.date <= to);
    const sports   = this.sportService.sessions().filter(s => s.date >= from && s.date <= to);
    return {
      activities: countSessions([...workouts, ...sports]),
      gym:        workouts.length,
      sport:      sports.length,
      sets:       workouts.reduce((sum, w) => sum + workoutSetsCount(w), 0),
      volume:     workouts.reduce((sum, w) => sum + workoutVolume(w, ctx), 0),
      minutes:    sports.reduce((sum, s) => sum + (s.duration ?? 0), 0),
    };
  }

  private readonly thisMonth = computed(() => {
    const { from, to } = this.month();
    return this.span(from, to);
  });

  private readonly lastMonth = computed(() => {
    const { prev } = this.month();
    return this.span(prev.from, prev.to);
  });

  readonly monthGym   = computed(() => this.thisMonth().gym);
  readonly monthSport = computed(() => this.thisMonth().sport);

  readonly monthStats = computed((): MonthStat[] => {
    const now  = this.thisMonth();
    const prev = this.lastMonth();

    const num = (n: number) => String(n);
    const stat = (
      key: string, icon: string, label: string,
      value: number, was: number, fmt: (n: number) => string,
    ): MonthStat => {
      const diff = value - was;
      return {
        key, icon, label,
        value: fmt(value),
        delta: diff === 0 ? null : `${diff > 0 ? '+' : '−'}${fmt(Math.abs(diff))}`,
        dir:   diff === 0 ? null : diff > 0 ? 'up' : 'down',
      };
    };

    return [
      stat('activities', 'bolt',           'Activitats',   now.activities, prev.activities, num),
      stat('sets',       'repeat',         'Sèries',       now.sets,       prev.sets,       num),
      stat('volume',     'weight',         'Volum',        now.volume,     prev.volume,     fmtVolume),
      stat('minutes',    'timer',          'Min d\'esport', now.minutes,   prev.minutes,    num),
    ];
  });

  /** Cert quan alguna xifra s'ha mogut: si no, no hi ha res a explicar. */
  readonly hasDelta = computed(() => this.monthStats().some(s => s.delta !== null));

  /**
   * La ratlla de referència del gràfic: l'objectiu d'una setmana, sigui com
   * sigui que se l'hagi marcat. Sense objectiu no hi ha ratlla — una línia
   * sense nom seria una decoració que l'usuari hauria d'endevinar.
   *
   * I si l'objectiu va canviar enmig del mes, tampoc: l'objectiu és de cada
   * setmana (vegeu `core/models/weekly-goal.model.ts`), i una sola ratlla
   * diria que unes setmanes es van quedar curtes quan van complir el seu.
   */
  readonly chartGoal = computed((): number | null => {
    const { from, to } = this.month();
    const settings = this.settingsService.settings();
    const today    = this.todayService.today();

    const totals = new Set<number>();
    for (let monday = mondayOf(from); monday <= mondayOf(to); monday = addDays(monday, 7)) {
      const g = goalForWeek(settings, monday, today);
      if (g.has) totals.add(g.total);
    }
    if (totals.size !== 1) return null;
    const total = [...totals][0];
    return total > 0 ? total : null;
  });

  /** El que llegeix un lector de pantalla d'una fletxa: la fletxa sola no diu
   *  ni cap on va ni contra què es compara. El signe escrit («−1,2 t») tampoc
   *  es llegeix bé, així que aquí va en paraules. */
  deltaLabel(s: MonthStat): string {
    const dir = s.dir === 'up' ? 'puja' : 'baixa';
    const amount = (s.delta ?? '').replace(/^[+−]/, '');
    return `${s.label}: ${dir} ${amount} respecte dels mateixos dies del mes passat`;
  }

  /**
   * Una barra per setmana del mes, retallada als dies que són del mes: la
   * primera i l'última no són setmanes senceres i no s'han de llegir com si
   * ho fossin.
   */
  readonly monthWeeks = computed((): WeekBarChart[] => {
    const { from, to } = this.month();
    const workouts = this.workoutService.doneWorkouts();
    const sports   = this.sportService.sessions();
    const thisMon  = mondayOf(to);

    const out: WeekBarChart[] = [];
    for (let monday = mondayOf(from); monday <= thisMon; monday = addDays(monday, 7)) {
      const start = monday < from ? from : monday;
      const end   = addDays(monday, 6) > to ? to : addDays(monday, 6);
      const day   = Number(start.slice(8));
      out.push({
        label:   `${day}`,
        count:   countSessions([
          ...workouts.filter(w => w.date >= start && w.date <= end),
          ...sports.filter(s => s.date >= start && s.date <= end),
        ]),
        pct:     0,
        current: monday === thisMon,
      });
    }

    // L'escala inclou l'objectiu: una ratlla de referència fora del gràfic no
    // es podria comparar amb res.
    const top = Math.max(1, ...out.map(w => w.count), this.chartGoal() ?? 0);
    return out.map(w => ({ ...w, pct: Math.round((w.count / top) * 100) }));
  });

  pctOf(value: number): number {
    const top = Math.max(1, ...this.monthWeeks().map(w => w.count), this.chartGoal() ?? 0);
    return Math.min(100, Math.round((value / top) * 100));
  }

  /** El gràfic és una imatge: s'ha de poder sentir sencer. */
  weeksChartLabel(): string {
    const bars = this.monthWeeks().map(w => `setmana del ${w.label}: ${w.count}`).join(', ');
    return `Activitats per setmana. ${this.monthRange()}. ${bars}`;
  }

  // ── La setmana ───────────────────────────────────────────────────────────

  /** El dilluns i el diumenge de la setmana en curs, en hora local. */
  private readonly thisWeek = computed(() => {
    const monday = mondayOf(this.todayService.today());
    return { monday, sunday: addDays(monday, 6) };
  });

  readonly weekLabel = computed(() => weekRangeLabel(this.thisWeek().monday));

  readonly thisWeekCount = computed(() => {
    const { monday, sunday } = this.thisWeek();
    return this.workoutService.doneWorkouts().filter(w => w.date >= monday && w.date <= sunday).length;
  });

  readonly thisWeekSportCount = computed(() => {
    const { monday, sunday } = this.thisWeek();
    return this.sportService.sessions().filter(s => s.date >= monday && s.date <= sunday).length;
  });

  readonly goalMode        = computed(() => this.settingsService.goalMode());
  readonly weeklyGoal      = computed(() => this.settingsService.weeklyActivityGoal());
  readonly weeklyGymGoal   = computed(() => this.settingsService.weeklyGymGoal());
  readonly weeklySportGoal = computed(() => this.settingsService.weeklySportGoal());

  /**
   * Les files de «Aquesta setmana», amb la mateixa forma tant si l'objectiu és
   * combinat com si va per separat: icona, nom, barra i xifra. Sense objectiu
   * la barra desapareix i queda el recompte, que segueix dient alguna cosa.
   */
  readonly weekBars = computed((): WeekBar[] => {
    const gym   = this.thisWeekCount();
    const sport = this.thisWeekSportCount();

    const bar = (icon: string, label: string, count: number, target: number | null, sub = false): WeekBar => ({
      icon, label, count, target, sub,
      pct:  target ? Math.min(100, Math.round((count / target) * 100)) : 0,
      done: !!target && count >= target,
    });

    if (this.goalMode() === 'separate') {
      return [
        bar('fitness_center', 'Gimnàs', gym,   this.weeklyGymGoal()),
        bar('sports_soccer',  'Esport', sport, this.weeklySportGoal()),
      ];
    }
    // Objectiu combinat: una sola barra, i el gimnàs i l'esport a sota com el
    // que són —el desglossament de la xifra de dalt, no dos objectius més.
    return [
      bar('bolt',           'Activitats', gym + sport, this.weeklyGoal()),
      bar('fitness_center', 'Gimnàs',     gym,   null, true),
      bar('sports_soccer',  'Esport',     sport, null, true),
    ];
  });

  readonly weekStreak = computed(() => {
    const workouts = this.workoutService.doneWorkouts();
    const sports   = this.sportService.sessions();
    if (workouts.length === 0 && sports.length === 0) return 0;
    let streak = 0;
    let weekStart = this.thisWeek().monday;
    for (let i = 0; i < STREAK_WEEKS; i++) {
      const weekEnd = addDays(weekStart, 6);
      const active = workouts.some(w => w.date >= weekStart && w.date <= weekEnd)
                  || sports.some(s => s.date >= weekStart && s.date <= weekEnd);
      if (!active) break;
      streak++;
      weekStart = addDays(weekStart, -7);
    }
    return streak;
  });

  // ── Les portes ───────────────────────────────────────────────────────────

  readonly insightCount = computed(() => this.metricsService.insights().length);

  readonly detailCount = computed(() => {
    const sportIds = new Set(this.sportService.sessions().map(s => s.sportId));
    return this.stats.records().size + sportIds.size;
  });

  constructor() {
    this.exerciseService.ensureLoaded();
    this.sportService.ensureLoaded();
    // El total i els rècords: dues consultes que tornen números i que no
    // creixen amb l'historial.
    void this.stats.ensureLoaded();
    // I un any de resums, sense cap sèrie: és el que necessiten la ratxa, el
    // mes i la comparació amb el mes passat.
    void this.workoutService.ensureRange(
      addDays(this.workoutService.todayDateString(), -STREAK_WEEKS * 7),
      this.workoutService.todayDateString(),
    );

    effect(() => {
      const exId = this.queryExerciseId();
      if (!exId) return;
      void this.router.navigate(['/charts/exercises'], {
        queryParams: { exerciseId: exId }, replaceUrl: true,
      });
    });
  }
}
