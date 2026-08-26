import {
  Component, computed, effect, ElementRef, inject,
  OnDestroy, signal, viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, SUBCATEGORY_LABELS,
  ExerciseCategory,
} from '../../core/models/exercise.model';
import { FeelingLevel, Workout, WorkoutEntry, WorkoutSet, setMaxWeight, setVolume } from '../../core/models/workout.model';
import { Sport, SportSubtype } from '../../core/models/sport.model';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService, matchesHistoryFilters } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { AuthService } from '../../core/services/auth.service';
import { SyncService } from '../../core/services/sync.service';
import { kgToDisplay } from '../../shared/utils/weight.utils';
import { addDays } from '../../shared/utils/calendar-utils';
import { formatFeeling } from '../../shared/utils/workout-card.utils';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { FilterBarComponent } from '../../shared/components/filter-bar/filter-bar.component';
import { FeedbackService } from '../../shared/services/feedback.service';
import { TrainingTypeService } from '../../core/services/training-type.service';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-calendar-page',
  standalone: true,
  imports: [RouterLink, CalendarComponent, PageHeaderComponent, FilterBarComponent],
  template: `
    <div class="page">

      <!-- ── Page header ── -->
      <app-page-header title="Historial" />

      <!-- ── Estat de sincronització. Sense això una cua rebutjada pel
             servidor és invisible: els entrenaments es veuen (amb el seu
             distintiu) però ningú no sap què passa ni com reintentar-ho. ── -->
      @if (showSyncBanner()) {
        <div class="sync-banner" [class.sync-banner--error]="syncStatus() === 'error'" role="status">
          <span class="material-symbols-outlined sync-banner-icon"
                [class.sync-banner-icon--spin]="syncStatus() === 'syncing'" aria-hidden="true">
            {{ syncIcon() }}
          </span>
          <div class="sync-banner-text">
            <strong>{{ syncTitle() }}</strong>
            <span class="sync-banner-detail">{{ syncDetail() }}</span>
          </div>
          <button class="sync-retry-btn" (click)="retrySync()" [disabled]="isRetrying()"
                  aria-label="Torna a sincronitzar els entrenaments pendents">
            <span class="material-symbols-outlined" aria-hidden="true">refresh</span>
            {{ isRetrying() ? 'Provant…' : 'Reintenta' }}
          </button>
        </div>
      }

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

      <!-- ── Registrar un entrenament oblidat en un dia passat, just sota
             el calendari on s'acaba de triar el dia ── -->
      @if (selectedDate() && !isFutureOrToday()) {
        <a class="register-past-btn" [routerLink]="['/train']" [queryParams]="{ date: selectedDate() }">
          <span class="material-symbols-outlined">add</span>
          Registrar entrenament
          <span class="rpb-date">{{ selectedDateLabel() }}</span>
        </a>
      }

      @if (isInitialLoading()) {
        <!-- ── Skeleton (primer càrrega) ── -->
        <div class="sk-list">
          @for (_ of [1,2,3,4,5]; track $index) {
            <div class="sk-workout-card">
              <div class="sk sk-stripe"></div>
              <div class="sk-card-row">
                <div class="sk-date">
                  <div class="sk sk-day"></div>
                  <div class="sk sk-month"></div>
                </div>
                <div class="sk-summary">
                  <div class="sk sk-badge"></div>
                  <div class="sk sk-text"></div>
                </div>
                <div class="sk sk-chevron-ph"></div>
              </div>
            </div>
          }
        </div>
      } @else {

      @if (!isFutureOrToday()) {

        <!-- ── Data seleccionada (sota els filtres, no inline) ── -->
        @if (selectedDate()) {
          <div class="date-chip-row">
            <button class="day-nav-btn" (click)="shiftSelectedDate(-1)" aria-label="Dia anterior">
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <button class="date-chip" (click)="selectDate(selectedDate()!)">
              <span class="material-symbols-outlined">event</span>
              {{ selectedDateLabel() }}
              <span class="material-symbols-outlined date-chip-x">close</span>
            </button>
            <button class="day-nav-btn" (click)="shiftSelectedDate(1)" aria-label="Dia següent">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
        }

        <!-- ── Esports del dia seleccionat ── -->
        @if (selectedDate() && selectedDateSports().length > 0) {
          <div class="sports-row">
            @for (item of selectedDateSports(); track item.sport.id) {
              <span class="sport-tag" [style.--sport-color]="item.sport.color">
                <span class="material-symbols-outlined sport-tag-icon">{{ item.sport.icon }}</span>
                {{ item.sport.name }}
                @if (item.session.subtypeId && getSubtypeName(item.sport, item.session.subtypeId); as subName) {
                  <span class="sport-tag-subtype">· {{ subName }}</span>
                }
                @if (item.session.duration) {
                  <span class="sport-tag-subtype">· {{ item.session.duration }}min</span>
                }
                @if (item.session.feeling) {
                  <span class="sport-tag-subtype">{{ getFeelingEmoji(item.session.feeling) }}</span>
                }
              </span>
            }
          </div>
        }

        @if (items().length > 0) {
          <div class="workout-list-wrap">
            @for (workout of items(); track workout.id) {
              <div class="workout-card" [class.expanded]="expandedId() === workout.id"
                   [style.--wc]="getWorkoutPrimaryColor(workout)">

                <div class="wc-bar" [style.background]="getWorkoutStripe(workout)"></div>

                <button class="workout-header" (click)="toggleExpanded(workout.id)">
                  <div class="wh-date-block">
                    <span class="wh-weekday">{{ getWeekday(workout.date) }}</span>
                    <span class="wh-day">{{ getDay(workout.date) }}</span>
                    <span class="wh-month">{{ getMonthYear(workout.date) }}</span>
                  </div>

                  <div class="wh-content">
                    @let cats = workout.categories ?? (workout.category ? [workout.category] : []);
                    @if (cats.length > 0 || isUnsynced(workout.id)) {
                      <div class="wh-badges">
                        @for (cat of cats; track cat) {
                          <span class="wh-badge wh-badge--{{ cat }}">{{ getCatLabel(cat) }}</span>
                        }
                        @if ((workout.categories ?? []).length > 1) {
                          <span class="wh-badge wh-badge--hybrid">Híbrid</span>
                        }
                        @if (isUnsynced(workout.id)) {
                          <span class="wh-badge wh-badge--unsynced" title="Encara no s'ha desat al servidor">
                            <span class="material-symbols-outlined">cloud_off</span>
                            Sense sincronitzar
                          </span>
                        }
                      </div>
                    }
                    <span class="wh-exercises">{{ getExerciseNames(workout) }}</span>
                    <div class="wh-stats">
                      <span class="wh-stat">
                        <span class="material-symbols-outlined">fitness_center</span>
                        <strong>{{ workout.entries.length }}</strong> exerc
                      </span>
                      <span class="wh-stat-sep">·</span>
                      <span class="wh-stat">
                        <span class="material-symbols-outlined">repeat</span>
                        <strong>{{ totalSets(workout) }}</strong> sèr
                        @if (totalWarmupSets(workout); as warm) {
                          <span class="wh-stat-warmup">
                            +{{ warm }}<span class="material-symbols-outlined">local_fire_department</span>
                          </span>
                        }
                      </span>
                      @if (volumeFmt(workout); as vol) {
                        <span class="wh-stat-sep">·</span>
                        <span class="wh-stat wh-stat--vol">
                          <span class="material-symbols-outlined">weight</span>
                          <strong>{{ vol }}</strong>
                        </span>
                      }
                      @if (workout.feeling) {
                        <span class="wh-stat-sep">·</span>
                        <span class="wh-stat">{{ getFeelingEmoji(workout.feeling) }}</span>
                      }
                    </div>
                  </div>

                  <span class="material-symbols-outlined wh-chevron">
                    {{ expandedId() === workout.id ? 'expand_less' : 'expand_more' }}
                  </span>
                </button>

                @if (expandedId() === workout.id) {
                  <div class="workout-detail">
                    @for (entry of workout.entries; track entry.exerciseId) {
                      <div class="entry-row" [style.--ec]="getEntryCatColor(entry)">
                        <div class="entry-name-row">
                          <span class="entry-cat-dot"></span>
                          <span class="entry-name">{{ entry.exerciseName }}</span>
                          @if (getEntrySubLabel(entry); as sub) {
                            <span class="entry-sub-badge" [style.color]="getEntryCatColor(entry)"
                                  [style.background]="'color-mix(in srgb, ' + getEntryCatColor(entry) + ' 12%, var(--c-card))'">{{ sub }}</span>
                          }
                          @if (entry.feeling) {
                            <span class="entry-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
                          }
                        </div>
                        @if (entry.sets.length > 0) {
                          <div class="entry-sets-col">
                            @for (set of entry.sets; track $index) {
                              <div class="entry-set-line" [class.entry-set-line--max]="isMaxSet(entry, set)"
                                   [class.entry-set-line--warmup]="set.warmup">
                                @if (set.warmup) {
                                  <span class="esl-num esl-num--warmup material-symbols-outlined"
                                        title="Sèrie d'escalfament">local_fire_department</span>
                                } @else {
                                  <span class="esl-num">{{ workingSetNumber(entry, $index) }}</span>
                                }
                                <span class="esl-weight-group">
                                  @if (set.weightLeft != null) {
                                    <span class="esl-weight">E {{ dispW(set.weightLeft) }}<small>{{ unit() }}</small></span>
                                    <span class="esl-weight">D {{ dispW(set.weightRight!) }}<small>{{ unit() }}</small></span>
                                  } @else {
                                    <span class="esl-weight">{{ dispW(set.weight) }}<small>{{ unit() }}</small></span>
                                  }
                                </span>
                                <span class="esl-x">×</span>
                                <span class="esl-reps-group">
                                  <span class="esl-reps">{{ set.reps }}</span>
                                  @for (d of (set.drops ?? []); track $index) {
                                    <span class="esl-drop-stage">
                                      <span class="esl-drop-sep">→</span>
                                      <span class="esl-weight drop">{{ dispW(d.weight) }}<small>{{ unit() }}</small></span>
                                      <span class="esl-x">×</span>
                                      <span class="esl-reps">{{ d.reps }}</span>
                                    </span>
                                  }
                                </span>
                                @if (isMaxSet(entry, set)) { <span class="esl-pr">PR</span> }
                              </div>
                            }
                          </div>
                        } @else {
                          <span class="no-sets">Cap sèrie registrada</span>
                        }
                        @if (entry.notes) {
                          <div class="entry-note">
                            <span class="material-symbols-outlined entry-note-icon">sticky_note_2</span>
                            <span class="entry-note-text">{{ entry.notes }}</span>
                          </div>
                        }
                      </div>
                    }
                    @if (workout.notes) {
                      <div class="workout-notes">
                        <span class="material-symbols-outlined">notes</span>
                        {{ workout.notes }}
                      </div>
                    }
                    <div class="workout-volume-footer">
                      <span>{{ workout.entries.length }} exercici{{ workout.entries.length !== 1 ? 's' : '' }}</span>
                      <span class="wvf-sep">·</span>
                      <span>{{ totalSets(workout) }} sèries@if (totalWarmupSets(workout); as warm) { <span class="wvf-warmup">+{{ warm }} esc</span>}</span>
                      <span class="wvf-sep">·</span>
                      <span>{{ dispW(totalVolume(workout)) }} {{ unit() }} volum</span>
                    </div>
                  </div>
                }

              </div>
            }
          </div>

          <!-- ── Sentinel per a l'infinite scroll ── -->
          <div #sentinel class="scroll-sentinel"></div>

          <!-- ── Skeleton de "carregant més" ── -->
          @if (isLoadingMore()) {
            <div class="load-more-sk">
              @for (_ of [1,2,3]; track $index) {
                <div class="sk-workout-card">
                  <div class="sk sk-stripe"></div>
                  <div class="sk-card-row">
                    <div class="sk-date">
                      <div class="sk sk-day"></div>
                      <div class="sk sk-month"></div>
                    </div>
                    <div class="sk-summary">
                      <div class="sk sk-badge"></div>
                      <div class="sk sk-text"></div>
                    </div>
                    <div class="sk sk-chevron-ph"></div>
                  </div>
                </div>
              }
            </div>
          }

          @if (!hasMore() && items().length > 0) {
            <p class="end-of-list">· {{ items().length }} entrenament{{ items().length !== 1 ? 's' : '' }} ·</p>
          }

        } @else if (!isLoadingMore()) {
          @if (hasActiveFilter()) {
            <div class="filter-empty">
              <span class="material-symbols-outlined">filter_list_off</span>
              <p>Cap entrenament amb aquest filtre</p>
            </div>
          } @else {
            <div class="empty-state">
              <span class="material-symbols-outlined empty-icon">calendar_month</span>
              <h2>Cap entrenament</h2>
              <p>Encara no hi ha cap entrenament registrat</p>
            </div>
          }
        }

      } @else {

        <!-- ── Planificació del dia (avui o futur) ── -->
        <div class="dp-panel">
          <div class="dp-header">
            <button class="day-nav-btn" (click)="shiftSelectedDate(-1)" aria-label="Dia anterior">
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <span class="dp-title">{{ selectedDateLabel() }}</span>
            <button class="day-nav-btn" (click)="shiftSelectedDate(1)" aria-label="Dia següent">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>

          @if (dayWorkouts().length > 0 || daySports().length > 0) {
            <div class="dp-items">
              @for (w of dayWorkouts(); track w.id) {
                <div class="dp-item" [style.--ic]="getWorkoutPrimaryColor(w)">
                  <div class="dp-item-bar" [style.background]="getWorkoutPrimaryColor(w)"></div>
                  <div class="dp-item-info">
                    <span class="dp-item-name">
                      {{ getCatLabel(w.category ?? (w.categories?.[0] ?? '')) }}
                      @if ((w.status ?? 'done') === 'planned') { <span class="dp-item-tag">Planificat</span> }
                    </span>
                    <span class="dp-item-detail">{{ getExerciseNames(w) }}</span>
                  </div>
                  <a class="dp-item-depth" [routerLink]="['/train']" [queryParams]="{ workout: w.id }"
                     title="Planificar en profunditat" aria-label="Planificar en profunditat">
                    <span class="material-symbols-outlined">edit_note</span>
                  </a>
                  <button class="dp-item-remove" (click)="removeDayWorkout(w)" aria-label="Eliminar">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              }
              @for (item of daySports(); track item.session.id) {
                <div class="dp-item" [style.--ic]="item.sport.color">
                  <div class="dp-item-bar" [style.background]="item.sport.color"></div>
                  <div class="dp-item-info">
                    <span class="dp-item-name">
                      {{ item.sport.name }}
                      @if (item.session.status === 'planned') { <span class="dp-item-tag">Planificat</span> }
                    </span>
                    @if (item.session.subtypeId && getSubtypeName(item.sport, item.session.subtypeId); as sub) {
                      <span class="dp-item-detail">{{ sub }}</span>
                    }
                  </div>
                  <button class="dp-item-remove" (click)="removeDaySport(item.session.id)" aria-label="Eliminar">
                    <span class="material-symbols-outlined">delete</span>
                  </button>
                </div>
              }
            </div>
          }

          <div class="dp-add">
            <span class="dp-add-label">Afegir al pla</span>
            <div class="dp-chips">
              @for (cat of gymCategories(); track cat) {
                <button class="dp-chip" [class.active]="isGymPlanned(cat)"
                        [style.--cat-color]="getCatColor(cat)" (click)="toggleGymPlan(cat)">
                  <span class="material-symbols-outlined">{{ getCatIcon(cat) }}</span>
                  {{ getCatLabel(cat) }}
                </button>
              }
              @for (sport of sportService.sports(); track sport.id) {
                <button class="dp-chip" [class.active]="isSportPlanned(sport.id)"
                        [style.--cat-color]="sport.color" (click)="toggleSportPlan(sport)">
                  <span class="material-symbols-outlined">{{ sport.icon }}</span>
                  {{ sport.name }}
                </button>
              }
            </div>
          </div>
        </div>

      }

      } <!-- end @else (not initial loading) -->

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
      display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0;
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

    /* Sports */
    .sports-row {
      display: flex; flex-wrap: wrap; gap: 6px;
      margin: 0 16px 10px;
    }
    .sport-tag {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 4px 10px; border-radius: 20px;
      background: color-mix(in srgb, var(--sport-color) 12%, var(--c-card));
      color: var(--sport-color);
      font-size: 12px; font-weight: 600;
      border: 1px solid color-mix(in srgb, var(--sport-color) 25%, transparent);
    }
    .sport-tag-icon { font-size: 14px; font-variation-settings: 'FILL' 1; }
    .sport-tag-subtype { font-weight: 400; opacity: 0.85; }

    .filter-empty {
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      gap: 8px; padding: 32px 24px; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 36px; }
      p { margin: 0; font-size: 14px; }
    }

    /* ── Day plan panel (today / future dates) ── */
    .dp-panel { margin: 4px 16px 0; }
    .dp-header {
      display: flex; align-items: center;
      gap: 8px; margin-bottom: 10px;
    }
    .dp-title {
      flex: 1; min-width: 0; text-align: center;
      font-size: 15px; font-weight: 700; color: var(--c-text); text-transform: capitalize;
    }

    .dp-items { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .dp-item {
      display: flex; align-items: center;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden;
    }
    .dp-item-bar { width: 5px; align-self: stretch; flex-shrink: 0; }
    .dp-item-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 10px; }
    .dp-item-name {
      display: flex; align-items: center; gap: 6px;
      font-size: 13px; font-weight: 700; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .dp-item-tag {
      font-size: 10px; font-weight: 700; color: var(--c-text-3);
      background: var(--c-subtle); border-radius: 8px; padding: 1px 6px;
    }
    .dp-item-detail { font-size: 11px; color: var(--c-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .dp-item-depth {
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation; transition: color 0.15s, background 0.15s;
      text-decoration: none;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.08); }
    }
    .dp-item-remove {
      width: 36px; height: 36px; flex-shrink: 0; margin-right: 4px;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation; transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
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

    .workout-list-wrap {
      display: flex; flex-direction: column; gap: 1px;
      margin: 4px 16px 0;
    }

    .workout-card {
      position: relative;
      border: 1.5px solid color-mix(in srgb, var(--wc, var(--c-border-2)) 30%, var(--c-border-2));
      border-radius: 14px;
      background: color-mix(in srgb, var(--wc, var(--c-card)) 6%, var(--c-card));
      box-shadow: 0 2px 8px var(--c-shadow); overflow: hidden;
      transition: box-shadow 0.2s, border-color 0.2s, background 0.2s; margin-bottom: 8px;
      &:hover {
        box-shadow: 0 3px 12px var(--c-shadow-md);
        background: color-mix(in srgb, var(--wc, var(--c-card)) 10%, var(--c-card));
        border-color: color-mix(in srgb, var(--wc, var(--c-border)) 45%, var(--c-border));
      }
      &.expanded {
        box-shadow: 0 4px 16px var(--c-shadow-md);
        border-color: color-mix(in srgb, var(--wc, var(--c-border)) 55%, var(--c-border));
      }
    }

    .wc-bar {
      position: absolute; left: 0; top: 0; bottom: 0; width: 5px;
    }

    .workout-header {
      display: flex; align-items: center; gap: 12px; width: 100%;
      padding: 11px 10px 11px 17px; border: none; background: transparent;
      cursor: pointer; text-align: left; touch-action: manipulation;
    }

    .wh-date-block {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      min-width: 42px; flex-shrink: 0;
      padding: 4px 8px 4px 0;
      border-right: 1px solid color-mix(in srgb, var(--wc, var(--c-border-2)) 22%, var(--c-border-2));
      .wh-weekday {
        font-size: 9px; font-weight: 700;
        color: color-mix(in srgb, var(--wc, var(--c-brand)) 80%, var(--c-text-2));
        text-transform: uppercase; letter-spacing: 0.06em; line-height: 1;
      }
      .wh-day { font-size: 22px; font-weight: 800; color: var(--c-text); line-height: 1.1; }
      .wh-month {
        font-size: 9px; color: var(--c-text-2);
        text-transform: uppercase; letter-spacing: 0.04em; margin-top: 1px;
      }
    }

    .wh-content {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 4px;
    }
    /* ── Sync banner ── */
    /* Grid, not a row: the message is long enough that a trailing button
       would squeeze it into a four-line column on a phone. Icon and text
       share the first row, the action sits under the text. */
    .sync-banner {
      display: grid; grid-template-columns: auto 1fr; gap: 6px 10px;
      margin: 0 16px 12px; padding: 10px 12px;
      background: color-mix(in srgb, var(--c-amber) 10%, var(--c-card));
      border: 1px solid color-mix(in srgb, var(--c-amber) 35%, var(--c-card));
      border-radius: 14px;
    }
    .sync-banner--error {
      background: color-mix(in srgb, var(--c-danger) 10%, var(--c-card));
      border-color: color-mix(in srgb, var(--c-danger) 35%, var(--c-card));
    }
    .sync-banner-icon { font-size: 18px; margin-top: 1px; color: var(--c-act-note); }
    .sync-banner--error .sync-banner-icon { color: var(--c-act-danger); }
    .sync-banner-icon--spin { animation: sync-spin 1.1s linear infinite; }
    @keyframes sync-spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { .sync-banner-icon--spin { animation: none; } }
    .sync-banner-text {
      min-width: 0; display: flex; flex-direction: column; gap: 2px;
      strong { font-size: 12.5px; font-weight: 700; color: var(--c-text); }
    }
    .sync-banner-detail {
      font-size: 11.5px; color: var(--c-text-2); line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .sync-retry-btn {
      grid-column: 2; justify-self: start;
      display: inline-flex; align-items: center; gap: 4px;
      padding: 7px 12px; border-radius: 10px; cursor: pointer;
      font-size: 12px; font-weight: 700; font-family: inherit;
      background: var(--c-card); color: var(--c-text);
      border: 1px solid color-mix(in srgb, var(--c-amber) 45%, var(--c-card));
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 15px; }
      &:hover:not(:disabled) { background: var(--c-hover); }
      &:disabled { opacity: 0.55; cursor: default; }
    }
    .sync-banner--error .sync-retry-btn { border-color: color-mix(in srgb, var(--c-danger) 45%, var(--c-card)); }

    .wh-badges { display: flex; flex-wrap: wrap; gap: 4px; }
    .wh-badge {
      display: inline-block; padding: 2px 8px; border-radius: 8px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.2px; line-height: 1.4;
    }
    .wh-badge--push  { background: rgba(229,115,115,0.15); color: #b71c1c; }
    .wh-badge--pull  { background: rgba(100,181,246,0.15); color: #0d47a1; }
    .wh-badge--legs  { background: rgba(129,199,132,0.15); color: #1b5e20; }
    .wh-badge--hybrid {
      background: linear-gradient(90deg, rgba(239,83,80,0.18) 0%, rgba(156,39,176,0.18) 50%, rgba(33,150,243,0.18) 100%);
      color: var(--c-text-2);
    }
    html.dark .wh-badge--push  { background: rgba(229,115,115,0.18); color: #ef9a9a; }
    html.dark .wh-badge--pull  { background: rgba(100,181,246,0.18); color: #90caf9; }
    html.dark .wh-badge--legs  { background: rgba(129,199,132,0.18); color: #a5d6a7; }
    html.dark .wh-badge--hybrid { background: rgba(180,180,180,0.1); }
    .wh-badge--unsynced {
      display: inline-flex; align-items: center; gap: 3px;
      background: rgba(255,152,0,0.15); color: #b26500;
      .material-symbols-outlined { font-size: 12px; }
    }
    html.dark .wh-badge--unsynced { background: rgba(255,152,0,0.18); color: #ffb74d; }
    .wh-exercises {
      font-size: 13px; font-weight: 700; color: var(--c-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      line-height: 1.3;
    }
    .wh-stats {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-size: 11px; color: var(--c-text-2); font-weight: 500;
      margin-top: 1px;
    }
    .wh-stat {
      display: inline-flex; align-items: center; gap: 3px;
      .material-symbols-outlined { font-size: 13px; color: color-mix(in srgb, var(--wc, var(--c-text-3)) 60%, var(--c-text-3)); }
      strong { font-weight: 700; color: var(--c-text-2); }
    }
    .wh-stat-sep { color: var(--c-border); }
    .wh-stat--vol strong { color: var(--wc, var(--c-brand)); }
    .wh-stat-warmup {
      display: inline-flex; align-items: center; gap: 1px; margin-left: 1px; color: #ff9800;
      .material-symbols-outlined { font-size: 13px; color: #ff9800; font-variation-settings: 'FILL' 1, 'wght' 400; }
    }

    .wh-chevron {
      color: var(--c-text-3); font-size: 22px; flex-shrink: 0;
      transition: transform 0.2s ease, color 0.2s;
      .workout-card.expanded & { color: color-mix(in srgb, var(--wc, var(--c-brand)) 70%, var(--c-text-2)); }
    }

    .workout-detail {
      border-top: 1px solid color-mix(in srgb, var(--wc, var(--c-border-2)) 18%, var(--c-border-2));
      background: var(--c-card);
      padding: 12px 14px 10px 17px;
      display: flex; flex-direction: column; gap: 8px;
    }

    .entry-row {
      display: flex; flex-direction: column; gap: 8px;
      padding-bottom: 12px; border-bottom: 1px solid var(--c-border-2);
      &:last-child { border-bottom: none; padding-bottom: 0; }
    }
    .entry-name-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }
    .entry-cat-dot {
      width: 4px; height: 16px; border-radius: 2px; flex-shrink: 0;
      background: var(--ec, var(--c-border));
    }
    .entry-name { font-size: 13px; font-weight: 700; color: var(--c-text); flex: 1; min-width: 0; line-height: 1.25; }
    .entry-sub-badge {
      font-size: 10px; font-weight: 600;
      padding: 1px 6px; border-radius: 8px; flex-shrink: 0;
      line-height: 1.4;
    }
    .entry-feeling { font-size: 16px; line-height: 1; }
    .entry-sets-col {
      display: flex; flex-direction: column; gap: 2px;
      padding-left: 11px;
    }
    .entry-set-line {
      display: grid;
      grid-template-columns: 16px auto auto auto auto;
      justify-content: start;
      align-items: baseline; gap: 5px;
      padding: 3px 6px; border-radius: 6px;
      transition: background 0.15s;
    }
    .entry-set-line--max {
      background: color-mix(in srgb, var(--ec, var(--c-brand)) 8%, transparent);
    }
    .entry-set-line--warmup { opacity: 0.7; }
    .esl-num { font-size: 10px; font-weight: 700; color: var(--c-text-3); text-align: right; }
    .esl-num--warmup {
      font-size: 13px; color: #ff9800; font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .esl-weight {
      font-size: 13px; font-weight: 700; color: var(--c-text);
      small { font-size: 9px; font-weight: 400; color: var(--c-text-3); margin-left: 1px; }
    }
    .esl-x { font-size: 11px; color: var(--c-text-3); }
    .esl-reps { font-size: 12px; font-weight: 600; color: var(--c-text-2); }
    .esl-weight-group, .esl-reps-group { display: flex; align-items: baseline; gap: 5px; flex-wrap: wrap; }
    .esl-drop-stage { display: inline-flex; align-items: baseline; gap: 5px; }
    .esl-weight.drop { font-size: 11px; font-weight: 600; opacity: 0.75; }
    .esl-drop-sep { font-size: 11px; color: var(--c-text-3); }
    .esl-pr {
      font-size: 9px; font-weight: 800; letter-spacing: 0.3px;
      color: #b88500; background: rgba(255, 193, 7, 0.18);
      padding: 1px 6px; border-radius: 6px; line-height: 1.3;
    }
    .entry-set-line--max .esl-weight {
      color: color-mix(in srgb, var(--ec, var(--c-brand)) 75%, var(--c-text));
    }
    .no-sets { font-size: 12px; color: var(--c-text-3); font-style: italic; padding-left: 12px; }
    .entry-note {
      display: flex; align-items: flex-start; gap: 5px;
      margin-top: 4px; padding: 5px 8px; border-radius: 7px;
      background: rgba(var(--c-brand-rgb), 0.06);
    }
    .entry-note-icon { font-size: 13px; color: var(--c-brand); flex-shrink: 0; margin-top: 1px; }
    .entry-note-text { font-size: 12px; color: var(--c-text-2); font-style: italic; line-height: 1.4; }
    .workout-notes {
      display: flex; align-items: flex-start; gap: 6px;
      font-size: 12px; color: var(--c-text-2); font-style: italic;
      padding: 8px 10px; background: var(--c-subtle); border-radius: 8px;
      .material-symbols-outlined { font-size: 15px; color: var(--c-text-3); flex-shrink: 0; margin-top: 1px; }
    }
    .workout-volume-footer {
      display: flex; align-items: center; justify-content: flex-end;
      gap: 6px; flex-wrap: wrap;
      padding-top: 2px;
      font-size: 11px; font-weight: 600; color: var(--c-text-3);
      .wvf-sep { color: var(--c-border-2); }
      .wvf-warmup { color: #ff9800; margin-left: 3px; }
    }

    /* ── Infinite scroll ── */
    .scroll-sentinel { height: 1px; }
    .load-more-sk {
      margin: 0 16px; display: flex; flex-direction: column; gap: 8px; padding-top: 4px;
    }
    .end-of-list {
      text-align: center; font-size: 12px; color: var(--c-text-3);
      margin: 12px 0 4px; letter-spacing: 0.5px;
    }

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
    .sk-list { margin: 0 16px; display: flex; flex-direction: column; gap: 8px; }
    .sk-workout-card {
      position: relative;
      background: var(--c-card); border-radius: 14px;
      border: 1.5px solid var(--c-border-2);
      box-shadow: 0 2px 8px var(--c-shadow); overflow: hidden;
    }
    .sk-stripe { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; border-radius: 0; }
    .sk-card-row {
      display: flex; align-items: center; gap: 12px;
      padding: 11px 10px 11px 17px;
    }
    .sk-date { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 42px; flex-shrink: 0; }
    .sk-day   { width: 24px; height: 22px; }
    .sk-month { width: 32px; height: 9px; }
    .sk-summary { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .sk-badge { width: 52px; height: 16px; border-radius: 8px; }
    .sk-text  { width: 60%; height: 12px; }
    .sk-chevron-ph { width: 22px; height: 22px; border-radius: 4px; flex-shrink: 0; }
  `],
})
export class CalendarPageComponent implements OnDestroy {
  readonly workoutService = inject(WorkoutService);
  private exerciseService = inject(ExerciseService);
  readonly sportService    = inject(SportService);
  private settingsService = inject(UserSettingsService);
  private authService     = inject(AuthService);
  private syncService     = inject(SyncService);
  private feedback        = inject(FeedbackService);

  readonly unit = this.settingsService.weightUnit;
  dispW(kg: number): number { return kgToDisplay(kg, this.unit()); }

  private typeService     = inject(TrainingTypeService);
  readonly gymCategories = computed(() => this.typeService.types().map(t => t.id));

  /** The calendar starts collapsed — this is primarily a list page and the
   *  calendar acts as an optional date filter you expand on demand. */
  readonly calendarOpen  = signal(false);
  readonly selectedDate  = signal<string | null>(null);
  readonly expandedId    = signal<string | null>(null);
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

  async removeDayWorkout(w: Workout): Promise<void> {
    try { await this.workoutService.deleteWorkout(w.id); }
    catch { this.feedback.error('Error en eliminar', 2500); }
  }

  async removeDaySport(sessionId: string): Promise<void> {
    const date = this.selectedDate();
    if (!date) return;
    try { await this.sportService.deleteSession(sessionId, date); }
    catch { this.feedback.error('Error en eliminar', 2500); }
  }

  // ── Pagination state ────────────────────────────────────────────────────
  private readonly _serverItems = signal<Workout[]>([]);
  private readonly _total    = signal(0);
  private readonly _page     = signal(0);
  readonly isInitialLoading  = signal(true);
  readonly isLoadingMore     = signal(false);

  /** Ids of the listed workouts that only exist locally — flagged in the list
   *  so an entrenament that never reached Supabase is visible as such instead
   *  of silently missing from the history. */
  readonly unsyncedIds = computed(
    () => new Set(this.workoutService.unsyncedWorkouts().map(w => w.id))
  );
  isUnsynced(id: string): boolean { return this.unsyncedIds().has(id); }

  // ── Sync status + manual retry ──────────────────────────────────────────
  readonly syncStatus  = this.syncService.status;
  readonly syncPending = this.syncService.pendingCount;
  readonly isRetrying   = signal(false);

  readonly showSyncBanner = computed(
    () => this.syncPending() > 0 || this.syncStatus() === 'error'
  );

  readonly syncIcon = computed(() => {
    switch (this.syncStatus()) {
      case 'syncing': return 'sync';
      case 'error':   return 'sync_problem';
      default:        return 'cloud_off';
    }
  });

  readonly syncTitle = computed(() => {
    if (this.syncStatus() === 'syncing') return 'Sincronitzant…';
    const n = this.syncPending();
    return n === 1
      ? '1 entrenament sense sincronitzar'
      : `${n} entrenaments sense sincronitzar`;
  });

  readonly syncDetail = computed(() => {
    if (this.syncStatus() === 'syncing') return 'Desant els canvis pendents al servidor.';
    const err = this.syncService.lastError();
    if (err) return `El servidor ha rebutjat el desat: ${err}`;
    return 'Es desen sols cada minut, en recuperar la connexió i en tornar a l\'app.';
  });

  /** Retries the whole queue at once, ignoring the per-workout backoff. On
   *  success the server page is reloaded so the newly-stored workouts come
   *  back as real rows instead of merged-in local ones. */
  async retrySync(): Promise<void> {
    if (this.isRetrying()) return;
    this.isRetrying.set(true);
    try {
      const done = await this.syncService.retryNow();
      if (done) {
        this.feedback.success('Tot sincronitzat');
        this._resetAndLoad();
      } else {
        this.feedback.error(this.syncService.lastError() ?? 'No s\'han pogut sincronitzar tots els entrenaments');
      }
    } finally {
      this.isRetrying.set(false);
    }
  }

  /**
   * The server page(s) plus every workout still queued for sync that matches
   * the active filters. Without this merge the history silently drops any
   * session that hasn't reached Supabase — it stays visible on Inici (which
   * reads the local month cache) but never appears here.
   */
  readonly items = computed((): Workout[] => {
    const server  = this._serverItems();
    const known   = new Set(server.map(w => w.id));
    const filters = {
      category: this.filterCat() ?? undefined,
      date:     this.selectedDate() ?? undefined,
      search:   this.searchQuery().trim() || undefined,
    };
    const pending = this.workoutService.unsyncedWorkouts()
      .filter(w => !known.has(w.id) && matchesHistoryFilters(w, filters));
    if (pending.length === 0) return server;
    return [...server, ...pending].sort((a, b) => this._compare(a, b));
  });

  /** Mirrors the server's total order (date → created_at → id) so merged-in
   *  local workouts land where they belong in the list. */
  private _compare(a: Workout, b: Workout): number {
    const dir = this.sortDesc() ? -1 : 1;
    if (a.date !== b.date) return a.date.localeCompare(b.date) * dir;
    const at = a.createdAt?.getTime() ?? 0;
    const bt = b.createdAt?.getTime() ?? 0;
    if (at !== bt) return (at - bt) * dir;
    return a.id.localeCompare(b.id) * dir;
  }

  /** Only the server list paginates — the local ones are all loaded already. */
  readonly hasMore = computed(() => this._serverItems().length < this._total());

  readonly hasActiveFilter = computed(
    () => !!this.filterCat() || !!this.searchQuery() || !!this.selectedDate()
  );

  // ── IntersectionObserver sentinel ───────────────────────────────────────
  readonly sentinelRef = viewChild<ElementRef<HTMLElement>>('sentinel');
  private _observer: IntersectionObserver | null = null;

  constructor() {
    this.exerciseService.ensureLoaded();
    this.sportService.ensureLoaded();

    // Reload from page 0 whenever any filter, sort, or auth state changes.
    // Tracking uid() ensures the first load fires once auth resolves on cold start.
    effect(() => {
      const uid = this.authService.uid();
      this.filterCat(); this.selectedDate(); this.searchQuery(); this.sortDesc();
      if (!uid) return;
      this._resetAndLoad();
    });

    // Re-attach observer whenever the sentinel element appears
    effect(() => {
      const el = this.sentinelRef()?.nativeElement;
      this._observer?.disconnect();
      if (!el) return;
      this._observer = new IntersectionObserver(
        entries => { if (entries[0].isIntersecting && this.hasMore() && !this.isLoadingMore()) this._loadNextPage(); },
        { rootMargin: '200px' }
      );
      this._observer.observe(el);
    });
  }

  ngOnDestroy(): void {
    this._observer?.disconnect();
  }

  // ── Data loading ─────────────────────────────────────────────────────────
  private _resetAndLoad(): void {
    this._serverItems.set([]);
    this._total.set(0);
    this._page.set(0);
    this.isInitialLoading.set(true);
    this._fetchPage(0).finally(() => this.isInitialLoading.set(false));
  }

  private _loadNextPage(): void {
    if (!this.hasMore() || this.isLoadingMore()) return;
    const next = this._page() + 1;
    this.isLoadingMore.set(true);
    // The cursor only advances once the page is actually in: bumping it
    // up-front means a single failed request skips those 20 workouts for
    // good, since the next intersection would ask for the page after it.
    this._fetchPage(next)
      .then(loaded => { if (loaded) this._page.set(next); })
      .finally(() => this.isLoadingMore.set(false));
  }

  /** Resolves to whether the page was actually loaded. */
  private async _fetchPage(page: number): Promise<boolean> {
    try {
      const { workouts, total } = await this.workoutService.loadWorkoutPage({
        page,
        pageSize: PAGE_SIZE,
        category: this.filterCat() ?? undefined,
        date:     this.selectedDate() ?? undefined,
        search:   this.searchQuery().trim() || undefined,
        ascending: !this.sortDesc(),
      });
      this._total.set(total);
      this._serverItems.update(prev => page === 0 ? workouts : [...prev, ...workouts]);
      return true;
    } catch {
      // Network failure — keep current state, and let this page be retried.
      return false;
    }
  }

  // ── Calendar ─────────────────────────────────────────────────────────────
  readonly selectedDateSports = computed(() => {
    const d = this.selectedDate();
    return d ? this.sportService.getSportSessionsForDate(d) : [];
  });

  readonly selectedDateLabel = computed(() => {
    const sel = this.selectedDate();
    if (!sel) return '';
    const today = this.workoutService.todayDateString();
    if (sel === today) return 'Avui';
    const yesterday = (() => {
      // Anchor at noon: `toISOString()` on a local-midnight date rolls back a
      // day in positive-offset timezones (e.g. UTC+2), which mislabelled the
      // day-before-yesterday as "Ahir".
      const d = new Date(today + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    })();
    if (sel === yesterday) return 'Ahir';
    const d = new Date(sel + 'T12:00:00');
    const label = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  selectDate(date: string): void {
    this._setSelectedDate(this.selectedDate() === date ? null : date);
  }

  shiftSelectedDate(delta: number): void {
    const base = this.selectedDate() ?? this.workoutService.todayDateString();
    this._setSelectedDate(addDays(base, delta));
  }

  private _setSelectedDate(date: string | null): void {
    this.selectedDate.set(date);
    if (date) {
      const found = this.items().find(w => w.date === date)
                 ?? this.workoutService.getWorkoutForDate(date);
      this.expandedId.set(found?.id ?? null);
    } else {
      this.expandedId.set(null);
    }
  }

  toggleExpanded(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  // ── Visual helpers ───────────────────────────────────────────────────────
  getWorkoutStripe(workout: Workout): string {
    const cats = workout.categories?.length ? workout.categories : (workout.category ? [workout.category] : []);
    if (cats.length === 0) return '#e0e0e0';
    if (cats.length === 1) return this.getCatColor(cats[0]);
    const stops = cats.map((c, i) => {
      const p1 = Math.round((i / cats.length) * 100);
      const p2 = Math.round(((i + 1) / cats.length) * 100);
      return `${this.getCatColor(c)} ${p1}% ${p2}%`;
    }).join(', ');
    return `linear-gradient(180deg, ${stops})`;
  }

  getWorkoutPrimaryColor(workout: Workout): string {
    const cats = workout.categories?.length ? workout.categories : (workout.category ? [workout.category] : []);
    return cats.length > 0 ? this.getCatColor(cats[0]) : 'var(--c-border-2)';
  }

  getFeelingEmoji(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }
  getCatColor(cat: string): string { return CATEGORY_COLORS[cat as ExerciseCategory] ?? '#bbb'; }
  getCatLabel(cat: string): string { return CATEGORY_LABELS[cat as ExerciseCategory] ?? cat; }
  getCatIcon(cat: string): string { return CATEGORY_ICONS[cat as ExerciseCategory] ?? 'fitness_center'; }

  getSubtypeName(sport: Sport, subtypeId: string): string | null {
    return sport.subtypes.find((s: SportSubtype) => s.id === subtypeId)?.name ?? null;
  }

  getEntryCategory(entry: WorkoutEntry): ExerciseCategory {
    return this.exerciseService.getById(entry.exerciseId)?.category ?? 'push';
  }
  getEntryCatColor(entry: WorkoutEntry): string {
    return CATEGORY_COLORS[this.getEntryCategory(entry)] ?? '#bbb';
  }
  getEntrySubLabel(entry: WorkoutEntry): string {
    const sub = this.exerciseService.getById(entry.exerciseId)?.subcategory;
    return sub ? (SUBCATEGORY_LABELS[sub] ?? sub) : '';
  }
  getMaxWeight(entry: WorkoutEntry): number {
    const workingSets = entry.sets.filter(s => !s.warmup);
    if (!workingSets.length) return 0;
    return Math.max(...workingSets.map(s => setMaxWeight(s)));
  }

  getDay(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { day: 'numeric' });
  }
  getMonthYear(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('ca-ES', { month: 'short', year: '2-digit' });
  }
  getWeekday(date: string): string {
    const days = ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'];
    return days[new Date(date + 'T12:00:00').getDay()];
  }

  totalSets(workout: Workout): number {
    return workout.entries.reduce((s, e) => s + e.sets.filter(set => !set.warmup).length, 0);
  }
  totalWarmupSets(workout: Workout): number {
    return workout.entries.reduce((s, e) => s + e.sets.filter(set => set.warmup).length, 0);
  }
  /** 1-based position of a working set within its entry (warm-ups skipped),
   *  matching the numbering used in the workout editor. */
  workingSetNumber(entry: WorkoutEntry, index: number): number {
    let n = 0;
    for (let i = 0; i <= index; i++) if (!entry.sets[i].warmup) n++;
    return n;
  }
  totalVolume(workout: Workout): number {
    const bodyweightKg = this.settingsService.bodyweightKg();
    return Math.round(workout.entries.reduce((t, e) => {
      const ex = this.exerciseService.getById(e.exerciseId);
      const ctx = { bodyweightKg, loadType: ex?.loadType, bodyweightFactor: ex?.bodyweightFactor };
      return t + e.sets.reduce((s, set) => set.warmup ? s : s + setVolume(set, ctx), 0);
    }, 0));
  }
  volumeFmt(workout: Workout): string {
    const vol = this.dispW(this.totalVolume(workout));
    if (vol <= 0) return '';
    const u = this.unit();
    if (u === 'kg' && vol >= 1000) return `${(vol / 1000).toFixed(1)}t`;
    return `${Math.round(vol)}${u}`;
  }
  getExerciseNames(workout: Workout): string {
    const names = workout.entries.map(e => e.exerciseName);
    if (names.length === 0) return '—';
    if (names.length <= 2) return names.join(' · ');
    return names.slice(0, 2).join(' · ') + ` +${names.length - 2}`;
  }
  isMaxSet(entry: WorkoutEntry, set: WorkoutSet): boolean {
    if (set.warmup || entry.sets.length <= 1) return false;
    const max = this.getMaxWeight(entry);
    if (max === 0) return false;
    return entry.sets.some(s => setMaxWeight(s) !== max) && setMaxWeight(set) === max;
  }
}
