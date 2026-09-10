import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';

import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { RECORD_METRICS, Sport, SportMetricDef, SportSession } from '../../core/models/sport.model';
import { ExerciseService } from '../../core/services/exercise.service';
import { TrainingTypeService } from '../../core/services/training-type.service';
import { SportService } from '../../core/services/sport.service';
import { TodayService } from '../../core/services/today.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutStatsService } from '../../core/services/workout-stats.service';
import { MONTHS_SHORT } from '../../shared/utils/calendar-utils';
import { kgToDisplay } from '../../shared/utils/weight.utils';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ExerciseProgressInlineComponent } from '../../shared/components/exercise-progress-inline.component';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';

/** Quants mesos ensenya la tira de barres d'un esport. */
const SPORT_MONTHS = 6;

/** Què s'està mirant: els exercicis del gimnàs o els esports. */
type Scope = 'exercises' | 'sports';

/** Una xifra del resum d'un esport. */
interface SportFact { label: string; value: string; note?: string; }

/** Una barra de la tira mensual d'un esport. */
interface MonthBar { label: string; count: number; pct: number; }

function fmtDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00')
    .toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Un número tal com es llegeix en català: 12,5 i no 12.5. */
function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10).replace('.', ',');
}

/**
 * El detall del progrés: com evoluciona cada exercici i cada esport, d'un en un.
 *
 * És la meitat «dades» de Progrés —l'altra és Insights, que és la meitat
 * «què hi hem vist»—. Aquí no s'hi resumeix res: la pàgina de Progrés ja diu
 * com va el mes i la setmana, i qui entra aquí ve a buscar una cosa concreta.
 */
@Component({
  selector: 'app-progress-detail',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, ExerciseProgressInlineComponent, FilterBarComponent],
  template: `
    <div class="page">
      <app-page-header title="Exercicis i esports" [showBack]="true" backFallback="/charts" />

      <!-- Dues llistes, no una de barrejada: un exercici i un esport no es
           comparen amb res del mateix. -->
      <div class="scope">
        <button class="scope-btn" [class.active]="scope() === 'exercises'"
                [attr.aria-pressed]="scope() === 'exercises'" (click)="scope.set('exercises')">
          <span class="material-symbols-outlined" aria-hidden="true">fitness_center</span>
          Exercicis
          @if (exerciseCount() > 0) { <span class="scope-n">{{ exerciseCount() }}</span> }
        </button>
        <button class="scope-btn" [class.active]="scope() === 'sports'"
                [attr.aria-pressed]="scope() === 'sports'" (click)="scope.set('sports')">
          <span class="material-symbols-outlined" aria-hidden="true">sports_soccer</span>
          Esports
          @if (sportRows().length > 0) { <span class="scope-n">{{ sportRows().length }}</span> }
        </button>
      </div>

      @if (scope() === 'exercises') {
        <!-- Cerca i filtres (ordenació desactivada de moment) -->
        @if (exerciseGroups().length > 0 || hasActiveFilter()) {
          <app-filter-bar
            searchPlaceholder="Cerca per exercici..."
            [showSort]="false"
            [(searchQuery)]="searchQuery"
            [(category)]="filterCat" />
        }

        @if (exerciseGroups().length > 0) {
          @for (group of exerciseGroups(); track group.cat) {
            <div class="card-section">
              <div class="section-header">
                <span class="material-symbols-outlined section-icon"
                      [style.color]="group.color" aria-hidden="true">{{ group.icon }}</span>
                <h2 class="section-title">{{ group.label }}</h2>
                <span class="section-count">{{ group.records.length }}</span>
              </div>

              @for (r of group.records; track r.exercise.id) {
                <div class="item-card" [class.item-card--open]="expandedExerciseId() === r.exercise.id"
                     [id]="'ex-' + r.exercise.id">
                  <button class="ic-row" (click)="toggleExercise(r.exercise.id)"
                          [attr.aria-expanded]="expandedExerciseId() === r.exercise.id">
                    <span class="ic-bar" [style.background]="r.color" aria-hidden="true"></span>
                    <span class="ic-name">{{ r.exercise.name }}</span>
                    @if (r.display !== null) {
                      <span class="ic-pr">{{ r.display }} {{ unit() }}</span>
                    }
                    <span class="material-symbols-outlined ic-chevron" aria-hidden="true">expand_more</span>
                  </button>

                  @if (expandedExerciseId() === r.exercise.id) {
                    <div class="ic-panel">
                      <app-exercise-progress-inline
                        [exerciseId]="r.exercise.id" [exerciseName]="r.exercise.name" />
                    </div>
                  }
                </div>
              }
            </div>
          }
        } @else if (isLoadingRecords()) {
          <!-- Skeleton: same shape as the real list, so nothing jumps on arrival -->
          <div class="card-section">
            <div class="section-header">
              <div class="sk sk-icon"></div>
              <div class="sk sk-title"></div>
              <div class="sk sk-count"></div>
            </div>
            @for (sk of [1,2,3,4]; track sk) {
              <div class="item-card sk-card">
                <div class="ic-bar sk"></div>
                <div class="sk-body"><div class="sk sk-line"></div></div>
              </div>
            }
          </div>
        } @else if (hasActiveFilter()) {
          <div class="card-section">
            <div class="empty-state">
              <span class="material-symbols-outlined empty-icon" aria-hidden="true">search_off</span>
              <p>Cap exercici trobat</p>
            </div>
          </div>
        } @else {
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
      } @else {
        @if (sportRows().length > 0) {
          <div class="card-section">
            <div class="section-header">
              <span class="material-symbols-outlined section-icon" aria-hidden="true">sports_soccer</span>
              <h2 class="section-title">Esports</h2>
              <span class="section-count">{{ sportRows().length }}</span>
            </div>

            @for (row of sportRows(); track row.sport.id) {
              <div class="item-card" [class.item-card--open]="expandedSportId() === row.sport.id">
                <button class="ic-row" (click)="toggleSport(row.sport.id)"
                        [attr.aria-expanded]="expandedSportId() === row.sport.id">
                  <span class="ic-bar" [style.background]="row.sport.color" aria-hidden="true"></span>
                  <span class="material-symbols-outlined sp-icon"
                        [style.color]="row.sport.color" aria-hidden="true">{{ row.sport.icon }}</span>
                  <span class="ic-name">{{ row.sport.name }}</span>
                  <span class="ic-n">{{ row.recent }} sess</span>
                  <span class="material-symbols-outlined ic-chevron" aria-hidden="true">expand_more</span>
                </button>

                @if (expandedSportId() === row.sport.id) {
                  <div class="ic-panel">
                    @if (!sportLoaded(row.sport.id)) {
                      <p class="sp-loading">Carregant l'historial de {{ row.sport.name }}…</p>
                    } @else {
                      <dl class="sp-facts">
                        @for (f of sportFacts(row.sport); track f.label) {
                          <div class="sp-fact">
                            <dt>
                              {{ f.label }}
                              @if (f.note) { <span class="sp-note">{{ f.note }}</span> }
                            </dt>
                            <dd>{{ f.value }}</dd>
                          </div>
                        }
                      </dl>

                      @if (sportMonths(row.sport.id); as bars) {
                        <div class="mc">
                          <span class="mc-caption">Sessions per mes</span>
                          <div class="mc-plot" role="img" [attr.aria-label]="monthsLabel(row.sport)">
                            <div class="mc-cols">
                              @for (b of bars; track b.label) {
                                <div class="mc-col" [style.--sc]="row.sport.color">
                                  @if (b.count > 0) { <span class="mc-val">{{ b.count }}</span> }
                                  <div class="mc-bar" [style.height.%]="b.pct"></div>
                                </div>
                              }
                            </div>
                            <div class="mc-xrow">
                              @for (b of bars; track b.label) { <span class="mc-x">{{ b.label }}</span> }
                            </div>
                          </div>
                        </div>
                      }
                    }
                  </div>
                }
              </div>
            }
          </div>
        } @else {
          <div class="card-section">
            <div class="empty-state">
              <span class="material-symbols-outlined empty-icon" aria-hidden="true">sports_soccer</span>
              <p>Encara no hi ha cap sessió d'esport registrada</p>
              <div class="empty-actions">
                <a class="btn-primary" routerLink="/train">Anar a Entrena</a>
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [`
    .page { padding: 0 0 88px; }

    /* ── Exercicis / Esports ── */
    .scope {
      display: flex; gap: 6px;
      margin: 4px 16px 0; padding: 4px;
      background: var(--c-card); border-radius: 14px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .scope-btn {
      flex: 1;
      display: flex; align-items: center; justify-content: center; gap: 5px;
      padding: 9px 8px; border: none; border-radius: 10px;
      background: transparent; color: var(--c-text-2);
      font-size: 13px; font-weight: 700; font-family: inherit;
      cursor: pointer; touch-action: manipulation;
      transition: background 0.15s, color 0.15s;
      .material-symbols-outlined { font-size: 17px; font-variation-settings: 'FILL' 0, 'wght' 300; }
      &:hover:not(.active) { background: var(--c-hover); }
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: -2px; }
      &.active {
        background: var(--c-brand); color: white;
        .material-symbols-outlined { font-variation-settings: 'FILL' 1, 'wght' 400; }
        .scope-n { background: rgba(255, 255, 255, 0.24); color: white; }
      }
    }
    .scope-n {
      font-size: 10.5px; font-weight: 700; color: var(--c-text-2);
      background: var(--c-border-2); border-radius: 9px; padding: 1px 6px;
    }

    /* ── Section card ── */
    .card-section {
      margin: 12px 16px 0; padding: 14px 14px 10px;
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
    }

    /* ── Filter bar ── */
    app-filter-bar { display: block; margin-top: 14px; margin-bottom: -12px; }

    /* ── Item card ── */
    .item-card {
      margin-bottom: 6px; overflow: hidden;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card);
      transition: box-shadow 0.15s, border-color 0.15s;
      &:last-child { margin-bottom: 4px; }
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
      &--open { border-color: var(--c-border); }
    }
    .ic-row {
      display: flex; align-items: center; gap: 10px;
      width: 100%; padding: 0 10px 0 0;
      border: none; background: none; font: inherit; text-align: left;
      cursor: pointer; touch-action: manipulation;
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: -2px; }
    }
    .ic-bar { width: 5px; align-self: stretch; min-height: 44px; flex-shrink: 0; }
    .sp-icon { font-size: 19px; flex-shrink: 0; margin-right: -4px; font-variation-settings: 'FILL' 0, 'wght' 300; }
    .ic-name {
      flex: 1; min-width: 0; padding: 12px 0;
      font-size: 13px; font-weight: 700; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* La marca personal és la xifra que es ve a buscar: xapa ambre, com la
       nota a la resta de l'app. */
    .ic-pr {
      flex-shrink: 0;
      font-size: 12px; font-weight: 700; color: var(--c-act-note);
      background: color-mix(in srgb, var(--c-amber) 14%, var(--c-card));
      border-radius: 7px; padding: 2px 7px;
    }
    /* Un recompte no és una marca: xapa neutra, que l'ambre es reserva per
       al rècord de l'exercici. */
    .ic-n {
      flex-shrink: 0;
      font-size: 11px; font-weight: 700; color: var(--c-text-2);
      background: var(--c-border-2); border-radius: 7px; padding: 2px 7px;
    }
    .ic-chevron {
      font-size: 18px; color: var(--c-text-3); flex-shrink: 0;
      transition: transform 0.2s ease;
    }
    .item-card--open .ic-chevron { transform: rotate(180deg); }
    .ic-panel {
      padding: 2px 10px 10px;
      border-top: 1px solid var(--c-border-2);
      animation: panel-in 0.18s ease-out;
    }
    @keyframes panel-in {
      from { opacity: 0; transform: translateY(-4px); }
      to   { opacity: 1; transform: none; }
    }

    /* ── El resum d'un esport ── */
    .sp-loading {
      margin: 12px 0; text-align: center;
      font-size: 12px; font-weight: 500; color: var(--c-text-3);
    }
    .sp-facts { margin: 10px 0 0; }
    .sp-fact {
      display: flex; align-items: baseline; gap: 10px;
      padding: 8px 2px;
      border-bottom: 1px solid var(--c-border-2);
      &:last-child { border-bottom: none; }
      dt { flex: 1; min-width: 0; margin: 0; font-size: 12px; font-weight: 500; color: var(--c-text-2); }
      dd { margin: 0; flex-shrink: 0; font-size: 13px; font-weight: 700; color: var(--c-text); }
    }
    .sp-note { display: block; font-size: 10.5px; font-weight: 500; color: var(--c-text-3); }

    /* ── La tira mensual ── */
    .mc { margin-top: 14px; }
    .mc-caption {
      display: block; margin-bottom: 8px;
      font-size: 11px; font-weight: 600; color: var(--c-text-3); letter-spacing: 0.2px;
    }
    /* Dues files, no una: l'alçada d'una barra es mesura contra el gràfic i
       mai contra el text de sota. */
    .mc-plot { display: flex; flex-direction: column; gap: 4px; padding-top: 15px; }
    .mc-cols { display: flex; align-items: flex-end; gap: 6px; height: 68px; }
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
      background: color-mix(in srgb, var(--sc, var(--c-brand)) 55%, var(--c-card));
      transition: height 0.4s ease;
    }
    .mc-col:last-child .mc-bar { background: var(--sc, var(--c-brand)); }
    .mc-xrow { display: flex; gap: 6px; }
    .mc-x {
      flex: 1; min-width: 0; text-align: center;
      font-size: 10px; font-weight: 500; color: var(--c-text-3);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

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

    /* ── Skeleton ── */
    @keyframes sk-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .sk { background: var(--c-border-2); animation: sk-pulse 1.4s ease-in-out infinite; }
    .sk-icon  { width: 18px; height: 18px; border-radius: 4px; }
    .sk-title { flex: 1; max-width: 120px; height: 13px; border-radius: 6px; }
    .sk-count { width: 28px; height: 18px; border-radius: 10px; }
    .sk-card  { display: flex; align-items: stretch; pointer-events: none; }
    .sk-body  { flex: 1; padding: 15px 10px; }
    .sk-line  { height: 13px; width: 52%; border-radius: 6px; }

    @media (prefers-reduced-motion: reduce) {
      .ic-chevron, .mc-bar, .scope-btn { transition: none; }
      .ic-panel { animation: none; }
      .sk { animation: none; }
    }
  `],
})
export class ProgressDetailComponent {
  private exerciseService = inject(ExerciseService);
  /** Els rècords i el total, comptats al servidor. Vegeu `WorkoutStatsService`. */
  private stats           = inject(WorkoutStatsService);
  private settingsService = inject(UserSettingsService);
  private sportService    = inject(SportService);
  private typeService     = inject(TrainingTypeService);
  private todayService    = inject(TodayService);
  private route           = inject(ActivatedRoute);

  private readonly queryExerciseId = toSignal(
    this.route.queryParams.pipe(map(p => (p['exerciseId'] as string) ?? '')),
    { initialValue: '' },
  );

  readonly unit = this.settingsService.weightUnit;

  readonly isLoadingRecords = computed(() => this.stats.loading() || !this.stats.loaded());

  readonly scope = signal<Scope>('exercises');

  readonly expandedExerciseId = signal<string | null>(null);
  readonly expandedSportId    = signal<string | null>(null);

  readonly searchQuery = signal('');
  readonly filterCat   = signal<ExerciseCategory | null>(null);
  readonly hasActiveFilter = computed(() => !!this.searchQuery() || !!this.filterCat());

  // ── Exercicis ────────────────────────────────────────────────────────────

  readonly exerciseCount = computed(() => this.stats.records().size);

  /**
   * La llista d'exercicis amb el seu rècord.
   *
   * El rècord el compta el servidor (`exercise_records`, migració 033): és una
   * fila per exercici. Abans, per treure'l, es baixava tota la vida de
   * l'usuari amb totes les sèries de tots els exercicis — i un rècord calculat
   * amb el que hi hagués carregat no hauria estat un rècord, així que no hi
   * havia manera de fer-ho a mitges.
   */
  readonly exerciseGroups = computed(() => {
    const exercises = this.exerciseService.exercises();
    const stats     = this.stats.records();
    const unit      = this.unit();
    const query     = this.searchQuery().trim().toLowerCase();
    const records = exercises
      .filter(e => stats.has(e.id))
      .filter(e => !query || e.name.toLowerCase().includes(query))
      .map(ex => {
        const max = stats.get(ex.id)?.maxWeight ?? 0;
        return {
          exercise: ex,
          display:  max > 0 ? kgToDisplay(max, unit) : null,
          color:    CATEGORY_COLORS[ex.category],
        };
      });

    const catFilter = this.filterCat();
    // User's types plus any category still present in the data (orphans from
    // deleted types), so no record ever becomes invisible.
    const typeIds  = this.typeService.types().map(t => t.id);
    const present  = [...new Set(records.map(r => r.exercise.category))];
    const cats = catFilter
      ? [catFilter]
      : [...typeIds, ...present.filter(c => !typeIds.includes(c))];
    return cats
      .map(cat => ({
        cat,
        label: CATEGORY_LABELS[cat],
        color: CATEGORY_COLORS[cat],
        icon:  CATEGORY_ICONS[cat] ?? 'fitness_center',
        records: records.filter(r => r.exercise.category === cat),
      }))
      .filter(g => g.records.length > 0);
  });

  toggleExercise(exerciseId: string): void {
    this.expandedExerciseId.update(current => current === exerciseId ? null : exerciseId);
  }

  // ── Esports ──────────────────────────────────────────────────────────────

  /**
   * Els esports que tenen alguna sessió, amb quantes en porten del que hi ha
   * carregat. La xifra de la fila plegada surt dels mesos que hi ha; el
   * desglossament de dins, de tot l'historial d'aquell esport, i per això no
   * es demana fins que s'obre.
   */
  readonly sportRows = computed(() => {
    const sessions = this.sportService.sessions();
    const counts   = new Map<string, number>();
    for (const s of sessions) counts.set(s.sportId, (counts.get(s.sportId) ?? 0) + 1);
    return this.sportService.sports()
      .filter(sp => counts.has(sp.id))
      .map(sport => ({ sport, recent: counts.get(sport.id) ?? 0 }))
      .sort((a, b) => b.recent - a.recent);
  });

  sportLoaded(sportId: string): boolean {
    return this.sportService.sportHistoryLoaded(sportId);
  }

  private sessionsOf(sportId: string): SportSession[] {
    return this.sportService.sessions().filter(s => s.sportId === sportId);
  }

  /**
   * Les xifres d'un esport: quantes en portes, quant hi dediques i quines són
   * les teves millors marques.
   *
   * Surten de **totes** les sessions d'aquest esport, mai dels mesos que hi
   * hagi carregats: una millor marca calculada a mitges no és una marca.
   */
  sportFacts(sport: Sport): SportFact[] {
    const all = this.sessionsOf(sport.id);
    if (!all.length) return [];

    const dates     = all.map(s => s.date).sort();
    const durations = all.map(s => s.duration ?? 0).filter(d => d > 0);
    const total     = durations.reduce((sum, d) => sum + d, 0);

    const facts: SportFact[] = [
      { label: 'Sessions', value: String(all.length), note: `des del ${fmtDate(dates[0])}` },
    ];

    if (durations.length) {
      const longest = all
        .filter(s => (s.duration ?? 0) === Math.max(...durations))
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      facts.push({ label: 'Temps total', value: fmtMinutes(total) });
      facts.push({ label: 'Durada mitjana', value: fmtMinutes(Math.round(total / durations.length)) });
      facts.push({
        label: 'La més llarga', value: fmtMinutes(longest.duration ?? 0),
        note: fmtDate(longest.date),
      });
    }

    // Les mètriques que tenen sentit com a rècord: la millor de totes, amb el
    // dia en què la vas fer.
    for (const def of sport.metricDefs.filter(d => RECORD_METRICS.includes(d.key))) {
      const best = this.bestOf(all, def);
      if (best) facts.push({ label: `Millor ${def.label.toLowerCase()}`, value: best.value, note: fmtDate(best.date) });
    }

    facts.push({ label: 'Última sessió', value: fmtDate(dates[dates.length - 1]) });
    return facts;
  }

  private bestOf(sessions: SportSession[], def: SportMetricDef): { value: string; date: string } | null {
    let bestVal = -Infinity;
    let bestDate = '';
    for (const s of sessions) {
      const raw = s.metrics?.[def.key];
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (raw === undefined || raw === null || Number.isNaN(num)) continue;
      if (num > bestVal || (num === bestVal && s.date > bestDate)) { bestVal = num; bestDate = s.date; }
    }
    if (bestDate === '') return null;
    return { value: `${fmtNum(bestVal)}${def.unit ? ` ${def.unit}` : ''}`, date: bestDate };
  }

  /** Els últims mesos d'aquest esport, per veure si hi vas més o menys. */
  sportMonths(sportId: string): MonthBar[] | null {
    const all = this.sessionsOf(sportId);
    if (!all.length) return null;

    const today = new Date(this.todayService.today() + 'T12:00:00');
    const bars: MonthBar[] = [];
    for (let i = SPORT_MONTHS - 1; i >= 0; i--) {
      const d      = new Date(today.getFullYear(), today.getMonth() - i, 1, 12);
      const prefix = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      bars.push({
        label: MONTHS_SHORT[d.getMonth()],
        count: all.filter(s => s.date.startsWith(prefix)).length,
        pct:   0,
      });
    }
    const top = Math.max(1, ...bars.map(b => b.count));
    return bars.map(b => ({ ...b, pct: Math.round((b.count / top) * 100) }));
  }

  /** El gràfic és una imatge: s'ha de poder sentir sencer. */
  monthsLabel(sport: Sport): string {
    const bars = this.sportMonths(sport.id) ?? [];
    return `Sessions de ${sport.name} per mes. ${bars.map(b => `${b.label}: ${b.count}`).join(', ')}`;
  }

  /** Obrir un esport demana el seu historial sencer — el d'aquell esport i
   *  prou, que és el que cal per parlar de marques i mitjanes. */
  toggleSport(sportId: string): void {
    const next = this.expandedSportId() === sportId ? null : sportId;
    this.expandedSportId.set(next);
    if (next) void this.sportService.loadSessionsForSport(next);
  }

  constructor() {
    this.exerciseService.ensureLoaded();
    this.sportService.ensureLoaded();
    // Els rècords i el total: dues consultes que tornen números i que no
    // creixen amb l'historial. Abans, aquí es baixava tota la vida de
    // l'usuari amb totes les sèries.
    void this.stats.ensureLoaded();

    // Deep-link support: expand the requested exercise when navigated here
    // via ?exerciseId=... (e.g. from the "veure gràfiques avançades" button).
    effect(() => {
      const exId = this.queryExerciseId();
      if (!exId) return;
      const found = this.exerciseGroups().some(g => g.records.some(r => r.exercise.id === exId));
      if (found) {
        this.scope.set('exercises');
        this.expandedExerciseId.set(exId);
        queueMicrotask(() =>
          document.getElementById('ex-' + exId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        );
      }
    });
  }
}
