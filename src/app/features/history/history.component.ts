import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, ExerciseCategory } from '../../core/models/exercise.model';
import { FEELING_EMOJI, FeelingLevel, Workout, WorkoutEntry, WorkoutSet } from '../../core/models/workout.model';
import { Sport, SportSubtype } from '../../core/models/sport.model';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { WorkoutService } from '../../core/services/workout.service';
import { ExerciseService } from '../../core/services/exercise.service';
import { SportService } from '../../core/services/sport.service';
import { kgToDisplay } from '../../shared/utils/weight.utils';
import { CalendarComponent } from '../../shared/components/calendar/calendar.component';
import { ExerciseProgressInlineComponent } from '../../shared/components/exercise-progress-inline.component';

@Component({
  selector: 'app-history',
  standalone: true,
  imports: [CalendarComponent, ExerciseProgressInlineComponent, FormsModule],
  template: `
    <div class="page">

      <!-- ── Page header ── -->
      <header class="page-header">
        <div class="page-header-top">
          <h1>Historial</h1>
          <!-- View mode toggle -->
          <div class="view-seg">
            <button class="view-seg-btn" [class.active]="viewMode() === 'calendar'"
                    (click)="viewMode.set('calendar')" aria-label="Vista calendari">
              <span class="material-symbols-outlined">calendar_month</span>
            </button>
            <button class="view-seg-btn" [class.active]="viewMode() === 'list'"
                    (click)="viewMode.set('list')" aria-label="Vista llista">
              <span class="material-symbols-outlined">format_list_bulleted</span>
            </button>
          </div>
        </div>
        <span class="count">
          @if (isLoading() && allWorkouts().length === 0) { ··· }
          @else { {{ allWorkouts().length }} entrenaments }
        </span>
      </header>

      <!-- ══════════════════════════════════
           MODE: CALENDARI
      ═════════════════════════════════════ -->
      @if (viewMode() === 'calendar') {

        <div class="calendar-wrap">
          <app-calendar [selectedDate]="selectedDate()" (dateSelected)="selectDate($event)" />
        </div>

        @if (!selectedDate()) {
          <div class="select-day-hint">
            <span class="material-symbols-outlined">touch_app</span>
            Selecciona un dia per veure el detall
          </div>
        }

        @if (selectedDate()) {
          <div class="detail-section">

            @if (selectedWorkout()) {
              <div class="detail-color-bar" [style.background]="workoutBarStyle()"></div>
            }

            <div class="detail-header">
              <h2 class="detail-title">{{ selectedDateLabel() }}</h2>
            </div>

            <!-- Esports del dia -->
            @if (selectedDateSports().length > 0) {
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

            @if (!selectedWorkout()) {
              <div class="detail-empty">
                @if (selectedDateSports().length === 0) {
                  <span class="material-symbols-outlined empty-icon">fitness_center</span>
                  <p>Cap activitat registrada</p>
                } @else {
                  <span class="material-symbols-outlined empty-icon">sports_soccer</span>
                  <p>Sense entrenament al gimnàs</p>
                }
              </div>
            } @else {

              <!-- Grid de targetes d'exercicis (preview gran) -->
              <div class="ex-grid">
                @for (entry of selectedWorkout()!.entries; track entry.exerciseId) {
                  <button class="ex-card"
                    [class.active]="selectedExerciseId() === entry.exerciseId"
                    [style.--cat]="getEntryCatColor(entry)"
                    (click)="selectExercise(entry.exerciseId)">
                    <div class="ex-card-bar"></div>
                    <div class="ex-card-body">
                      <div class="ex-card-name-row">
                        <span class="ex-card-name">{{ entry.exerciseName }}</span>
                        @if (entry.feeling) {
                          <span class="ex-card-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
                        }
                      </div>
                      @if (entry.sets.length > 0) {
                        <div class="ex-card-stats-row">
                          <span class="ex-card-max">{{ dispW(getMaxWeight(entry)) }}<small>{{ unit() }}</small></span>
                          <span class="ex-card-sets-badge">{{ entry.sets.length }} sèr</span>
                        </div>
                        <div class="ex-card-progress">
                          @for (set of entry.sets; track $index; let last = $last) {
                            <span class="ex-cp-w" [class.ex-cp-max]="isMaxSet(entry, set)">{{ dispW(set.weight) }}</span>
                            @if (!last) { <span class="ex-cp-sep">›</span> }
                          }
                        </div>
                      }
                    </div>
                  </button>
                }
              </div>

              <!-- Detall de l'exercici seleccionat (mateix format que la llista) -->
              @if (selectedExerciseId() && selectedEntry(); as e) {
                <div class="ex-detail-panel" [style.--ec]="getEntryCatColor(e)">
                  @if (e.sets.length > 0) {
                    <div class="ex-sets-col">
                      @for (set of e.sets; track $index) {
                        <div class="ex-set-line" [class.ex-set-line--max]="isMaxSet(e, set)">
                          <span class="exs-num">{{ $index + 1 }}</span>
                          <span class="exs-weight">{{ dispW(set.weight) }}<small>{{ unit() }}</small></span>
                          <span class="exs-x">×</span>
                          <span class="exs-reps">{{ set.reps }}</span>
                          @if (isMaxSet(e, set)) { <span class="exs-pr">PR</span> }
                        </div>
                      }
                    </div>
                  }
                  <div class="ex-card-analysis">
                    <app-exercise-progress-inline
                      [exerciseId]="selectedExerciseId()"
                      [exerciseName]="e.exerciseName" />
                  </div>
                </div>
              }

            }
          </div>
        }

        @if (allWorkouts().length === 0 && !isLoading()) {
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">calendar_month</span>
            <h2>Cap entrenament</h2>
            <p>Encara no hi ha cap entrenament registrat</p>
          </div>
        }

      }

      <!-- ══════════════════════════════════
           MODE: LLISTA
      ═════════════════════════════════════ -->
      @if (viewMode() === 'list') {

        @if (isLoading() && allWorkouts().length === 0) {
          <!-- ── Skeleton (initial data load) ── -->
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

        <!-- ── Cerca ── -->
        <div class="search-wrap">
          <span class="material-symbols-outlined search-icon">search</span>
          <input class="search-input" type="search" [(ngModel)]="searchQueryValue"
                 placeholder="Cerca per exercici..." autocomplete="off">
          @if (searchQuery()) {
            <button class="search-clear" (click)="searchQuery.set('')">
              <span class="material-symbols-outlined">close</span>
            </button>
          }
        </div>

        <!-- ── Filtres i ordenació ── -->
        <div class="filter-bar">
          <button class="sort-btn" (click)="sortDesc.set(!sortDesc())" aria-label="Canviar ordre">
            <span class="material-symbols-outlined">{{ sortDesc() ? 'arrow_downward' : 'arrow_upward' }}</span>
          </button>
          <div class="filter-divider"></div>
          <button class="filter-icon" [class.active]="filterCat() === null"
                  (click)="filterCat.set(null)" aria-label="Tots" title="Tots">
            <span class="material-symbols-outlined">apps</span>
          </button>
          @for (cat of ['push','pull','legs']; track cat) {
            <button class="filter-icon" [class.active]="filterCat() === cat"
                    [style.--cat]="getCatColor(cat)"
                    [attr.aria-label]="getCatLabel(cat)" [attr.title]="getCatLabel(cat)"
                    (click)="filterCat.set(filterCat() === cat ? null : cat)">
              <span class="material-symbols-outlined">{{ getCatIcon(cat) }}</span>
            </button>
          }
        </div>

        @if (filteredWorkouts().length > 0) {
          <div class="workout-list-wrap">
            @for (workout of filteredWorkouts(); track workout.id) {
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
                    @if ((workout.categories ?? (workout.category ? [workout.category] : [])).length > 0) {
                      <div class="wh-badges">
                        @for (cat of (workout.categories ?? (workout.category ? [workout.category] : [])); track cat) {
                          <span class="wh-badge" [style.background]="getCatColor(cat)">{{ getCatLabel(cat) }}</span>
                        }
                        @if ((workout.categories ?? []).length > 1) {
                          <span class="wh-badge wh-badge--hybrid">Híbrid</span>
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
                      </span>
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
                          @if (entry.feeling) {
                            <span class="entry-feeling">{{ getFeelingEmoji(entry.feeling) }}</span>
                          }
                        </div>
                        @if (entry.sets.length > 0) {
                          <div class="entry-sets-col">
                            @for (set of entry.sets; track $index) {
                              <div class="entry-set-line" [class.entry-set-line--max]="isMaxSet(entry, set)">
                                <span class="esl-num">{{ $index + 1 }}</span>
                                <span class="esl-weight">{{ dispW(set.weight) }}<small>{{ unit() }}</small></span>
                                <span class="esl-x">×</span>
                                <span class="esl-reps">{{ set.reps }}</span>
                                @if (isMaxSet(entry, set)) { <span class="esl-pr">PR</span> }
                              </div>
                            }
                          </div>
                        } @else {
                          <span class="no-sets">Cap sèrie registrada</span>
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
                      <span>{{ totalSets(workout) }} sèries</span>
                      <span class="wvf-sep">·</span>
                      <span>{{ dispW(totalVolume(workout)) }} {{ unit() }} volum</span>
                    </div>
                  </div>
                }

              </div>
            }
          </div>
        } @else if (allWorkouts().length > 0) {
          <!-- Filtre actiu sense resultats -->
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

        } <!-- end @else (not loading) -->

      }

    </div>
  `,
  styles: [`
    .page { padding: 0 0 16px; }

    /* ── Page header ── */
    .page-header {
      padding: 16px 16px 10px;
    }
    .page-header-top {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;
      h1 { margin: 0; font-size: 22px; font-weight: 700; }
    }
    .count { font-size: 12px; color: var(--c-text-2); }

    /* ── View mode segmented control ── */
    .view-seg {
      display: flex; align-items: center;
      border: 1.5px solid var(--c-border); border-radius: 10px; overflow: hidden;
      flex-shrink: 0;
    }
    .view-seg-btn {
      width: 38px; height: 34px; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--c-text-2); transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &.active { background: var(--c-brand); color: white; }
      &:not(.active):hover { background: rgba(var(--c-brand-rgb), 0.08); color: var(--c-brand); }
    }

    /* ════════════════════════════════
       CALENDAR MODE
    ════════════════════════════════ */
    .calendar-wrap {
      margin: 4px 16px 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.08);
      border-radius: 16px; overflow: hidden;
    }

    .detail-section {
      margin: 0 16px 12px;
      background: var(--c-card); border-radius: 16px;
      box-shadow: 0 2px 12px var(--c-shadow); overflow: hidden;
    }

    .detail-color-bar { height: 5px; width: 100%; }

    .detail-header {
      padding: 14px 16px 10px;
      border-bottom: 1px solid var(--c-border-2);
    }
    .detail-title {
      margin: 0; font-size: 16px; font-weight: 700; color: var(--c-text);
      text-transform: capitalize;
    }

    /* Sports */
    .sports-row {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 10px 16px 8px; border-bottom: 1px solid var(--c-border-2);
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

    .detail-empty {
      display: flex; flex-direction: column; align-items: center;
      gap: 8px; padding: 24px; text-align: center;
      .empty-icon { font-size: 36px; color: var(--c-border); }
      p { margin: 0; font-size: 14px; color: var(--c-text-2); }
    }

    /* Exercise grid (preview tiles) */
    .ex-grid {
      display: grid; grid-template-columns: repeat(2, 1fr);
      gap: 10px; padding: 12px 14px;
    }

    .ex-card {
      position: relative;
      display: flex; align-items: stretch;
      border-radius: 14px; padding: 0;
      border: 1.5px solid color-mix(in srgb, var(--cat) 28%, var(--c-border-2));
      background: color-mix(in srgb, var(--cat) 6%, var(--c-card));
      cursor: pointer; text-align: left;
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.1s;
      min-height: 124px; overflow: hidden; touch-action: manipulation;
      &:hover {
        border-color: color-mix(in srgb, var(--cat) 50%, var(--c-border));
        background: color-mix(in srgb, var(--cat) 11%, var(--c-card));
        box-shadow: 0 3px 12px var(--c-shadow);
      }
      &:active { transform: scale(0.97); }
      &.active {
        border-color: var(--cat);
        background: color-mix(in srgb, var(--cat) 15%, var(--c-card));
        box-shadow: 0 4px 16px color-mix(in srgb, var(--cat) 24%, transparent);
      }
    }
    .ex-card-bar {
      width: 5px; align-self: stretch; flex-shrink: 0;
      background: var(--cat);
    }
    .ex-card-body {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 6px;
      padding: 13px 12px 12px 12px;
    }
    .ex-card-name-row {
      display: flex; align-items: flex-start; gap: 6px;
    }
    .ex-card-name {
      flex: 1; min-width: 0;
      font-size: 14px; font-weight: 700; color: var(--c-text);
      line-height: 1.3; word-break: break-word;
    }
    .ex-card-feeling { font-size: 18px; line-height: 1; flex-shrink: 0; }
    .ex-card-stats-row {
      display: flex; align-items: baseline; gap: 8px;
      margin-top: 2px;
    }
    .ex-card-max {
      font-size: 26px; font-weight: 800; color: var(--cat); line-height: 1;
      small { font-size: 13px; font-weight: 500; color: var(--c-text-2); margin-left: 2px; }
    }
    .ex-card-sets-badge {
      font-size: 10px; font-weight: 700; color: var(--c-text-2);
      padding: 2px 8px; border-radius: 10px;
      background: color-mix(in srgb, var(--cat) 12%, var(--c-card));
      border: 1px solid color-mix(in srgb, var(--cat) 25%, var(--c-border-2));
      line-height: 1.3;
    }
    .ex-card-progress {
      display: flex; flex-wrap: wrap; align-items: center; gap: 3px;
    }
    .ex-cp-w { font-size: 12px; font-weight: 600; color: var(--c-text-2); }
    .ex-cp-max { font-weight: 800; color: var(--cat); }
    .ex-cp-sep { font-size: 11px; color: var(--c-border); }

    /* Exercise detail panel (same format as list mode: vertical sets only) */
    .ex-detail-panel {
      margin: 0 14px 14px;
      background: var(--c-subtle); border-radius: 12px; overflow: hidden;
      border-left: 3px solid color-mix(in srgb, var(--ec, var(--c-brand)) 70%, transparent);
    }
    .ex-sets-col {
      display: flex; flex-direction: column; gap: 3px;
      padding: 12px 14px;
    }
    .ex-set-line {
      display: grid;
      grid-template-columns: 18px auto auto auto auto;
      justify-content: start;
      align-items: baseline; gap: 6px;
      padding: 5px 8px; border-radius: 8px;
      background: var(--c-card);
      box-shadow: 0 1px 2px var(--c-shadow);
      transition: background 0.15s, transform 0.15s;
    }
    .ex-set-line--max {
      background: color-mix(in srgb, var(--ec, var(--c-brand)) 10%, var(--c-card));
      box-shadow: 0 1px 4px color-mix(in srgb, var(--ec, var(--c-brand)) 18%, transparent);
    }
    .exs-num { font-size: 10px; font-weight: 700; color: var(--c-text-3); text-align: right; }
    .exs-weight {
      font-size: 14px; font-weight: 800; color: var(--c-text);
      small { font-size: 9px; font-weight: 400; color: var(--c-text-3); margin-left: 1px; }
    }
    .ex-set-line--max .exs-weight {
      color: color-mix(in srgb, var(--ec, var(--c-brand)) 80%, var(--c-text));
    }
    .exs-x { font-size: 11px; color: var(--c-text-3); }
    .exs-reps { font-size: 13px; font-weight: 600; color: var(--c-text-2); }
    .exs-pr {
      font-size: 9px; font-weight: 800; letter-spacing: 0.3px;
      color: #b88500; background: rgba(255, 193, 7, 0.2);
      padding: 1px 6px; border-radius: 6px; line-height: 1.3;
    }
    .ex-card-analysis { border-top: 1px solid var(--c-hover); }

    /* ════════════════════════════════
       LIST MODE
    ════════════════════════════════ */
    /* ── Search ── */
    .search-wrap {
      position: relative; margin: 0 16px 10px;
      display: flex; align-items: center;
    }
    .search-icon {
      position: absolute; left: 12px; font-size: 18px;
      color: var(--c-text-3); pointer-events: none;
    }
    .search-input {
      width: 100%; padding: 10px 36px 10px 38px;
      border: 1.5px solid var(--c-border); border-radius: 12px;
      font-size: 14px; background: var(--c-card); color: var(--c-text);
      outline: none; box-sizing: border-box;
      &:focus { border-color: var(--c-brand); }
      &::-webkit-search-cancel-button { display: none; }
    }
    .search-clear {
      position: absolute; right: 10px;
      width: 24px; height: 24px; border-radius: 50%;
      border: none; background: var(--c-border-2); cursor: pointer;
      color: var(--c-text-3); display: flex; align-items: center; justify-content: center;
      .material-symbols-outlined { font-size: 14px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
    }

    .filter-bar {
      display: flex; align-items: center; gap: 6px;
      padding: 0 16px 12px; overflow-x: auto;
      scrollbar-width: none; &::-webkit-scrollbar { display: none; }
    }
    .sort-btn {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 34px; height: 34px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-subtle);
      color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-border-2); color: var(--c-text); }
    }
    .filter-divider {
      width: 1px; height: 20px; background: var(--c-border); flex-shrink: 0; margin: 0 2px;
    }
    .filter-icon {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 34px; height: 34px; border-radius: 50%;
      border: 1.5px solid color-mix(in srgb, var(--cat, var(--c-border)) 35%, var(--c-border));
      background: color-mix(in srgb, var(--cat, var(--c-card)) 8%, var(--c-card));
      color: var(--cat, var(--c-text-2));
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &.active {
        background: var(--cat, var(--c-brand));
        color: white;
        border-color: var(--cat, var(--c-brand));
        box-shadow: 0 2px 6px color-mix(in srgb, var(--cat, var(--c-brand)) 35%, transparent);
      }
      &:not(.active):hover {
        background: color-mix(in srgb, var(--cat, var(--c-card)) 18%, var(--c-card));
        border-color: var(--cat, var(--c-border));
      }
    }
    .filter-empty {
      display: flex; align-items: center; justify-content: center; flex-direction: column;
      gap: 8px; padding: 32px 24px; color: var(--c-text-3);
      .material-symbols-outlined { font-size: 36px; }
      p { margin: 0; font-size: 14px; }
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
        font-size: 9px; color: var(--c-text-3);
        text-transform: uppercase; letter-spacing: 0.04em; margin-top: 1px;
      }
    }

    .wh-content {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 4px;
    }
    .wh-badges { display: flex; flex-wrap: wrap; gap: 4px; }
    .wh-badge {
      display: inline-block; padding: 2px 8px; border-radius: 8px;
      font-size: 10px; font-weight: 700; color: white; letter-spacing: 0.2px;
      line-height: 1.4;
    }
    .wh-badge--hybrid {
      background: linear-gradient(90deg, #ef5350 0%, #9c27b0 50%, #2196f3 100%) !important;
    }
    .wh-exercises {
      font-size: 13px; font-weight: 700; color: var(--c-text);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      line-height: 1.3;
    }
    .wh-stats {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-size: 11px; color: var(--c-text-3); font-weight: 500;
      margin-top: 1px;
    }
    .wh-stat {
      display: inline-flex; align-items: center; gap: 3px;
      .material-symbols-outlined { font-size: 13px; color: color-mix(in srgb, var(--wc, var(--c-text-3)) 60%, var(--c-text-3)); }
      strong { font-weight: 700; color: var(--c-text-2); }
    }
    .wh-stat-sep { color: var(--c-border); }

    .wh-chevron {
      color: var(--c-text-3); font-size: 22px; flex-shrink: 0;
      transition: transform 0.2s ease, color 0.2s;
      .workout-card.expanded & { color: color-mix(in srgb, var(--wc, var(--c-brand)) 70%, var(--c-text-2)); }
    }

    .workout-detail {
      border-top: 1px solid color-mix(in srgb, var(--wc, var(--c-border-2)) 18%, var(--c-border-2));
      background: var(--c-card);
      padding: 12px 14px 12px 17px;
      display: flex; flex-direction: column; gap: 14px;
    }

    .entry-row {
      display: flex; flex-direction: column; gap: 8px;
      padding-bottom: 12px; border-bottom: 1px solid var(--c-border-2);
      &:last-child { border-bottom: none; padding-bottom: 0; }
    }
    .entry-name-row { display: flex; align-items: center; gap: 7px; }
    .entry-cat-dot {
      width: 4px; height: 16px; border-radius: 2px; flex-shrink: 0;
      background: var(--ec, var(--c-border));
    }
    .entry-name { font-size: 13px; font-weight: 700; color: var(--c-text); flex: 1; line-height: 1.25; }
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
    .esl-num { font-size: 10px; font-weight: 700; color: var(--c-text-3); text-align: right; }
    .esl-weight {
      font-size: 13px; font-weight: 700; color: var(--c-text);
      small { font-size: 9px; font-weight: 400; color: var(--c-text-3); margin-left: 1px; }
    }
    .esl-x { font-size: 11px; color: var(--c-text-3); }
    .esl-reps { font-size: 12px; font-weight: 600; color: var(--c-text-2); }
    .esl-pr {
      font-size: 9px; font-weight: 800; letter-spacing: 0.3px;
      color: #b88500; background: rgba(255, 193, 7, 0.18);
      padding: 1px 6px; border-radius: 6px; line-height: 1.3;
    }
    .entry-set-line--max .esl-weight {
      color: color-mix(in srgb, var(--ec, var(--c-brand)) 75%, var(--c-text));
    }
    .no-sets { font-size: 12px; color: var(--c-text-3); font-style: italic; padding-left: 12px; }
    .workout-notes {
      display: flex; align-items: flex-start; gap: 6px;
      font-size: 12px; color: var(--c-text-2); font-style: italic;
      padding: 8px 10px; background: var(--c-subtle); border-radius: 8px;
      .material-symbols-outlined { font-size: 15px; color: var(--c-text-3); flex-shrink: 0; margin-top: 1px; }
    }
    .workout-volume-footer {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      padding-top: 8px;
      font-size: 11px; font-weight: 600; color: var(--c-text-3);
      .wvf-sep { color: var(--c-border-2); }
    }

    /* ── Select-day hint ── */
    .select-day-hint {
      display: flex; align-items: center; justify-content: center; gap: 6px;
      margin: 0 16px 12px; padding: 12px 16px;
      background: rgba(var(--c-brand-rgb), 0.06); border-radius: 12px;
      font-size: 13px; font-weight: 500; color: var(--c-brand);
      .material-symbols-outlined { font-size: 17px; }
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
      background: linear-gradient(90deg, #f0f0f0 0%, #e8e8e8 40%, #f0f0f0 80%);
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
export class HistoryComponent {
  private workoutService  = inject(WorkoutService);
  private exerciseService = inject(ExerciseService);
  private sportService    = inject(SportService);
  private settingsService = inject(UserSettingsService);

  readonly isLoading = computed(() => this.workoutService.isLoading());
  readonly unit = this.settingsService.weightUnit;
  dispW(kg: number): number { return kgToDisplay(kg, this.unit()); }

  readonly viewMode     = signal<'calendar' | 'list'>('calendar');
  readonly selectedDate = signal<string | null>(null);
  readonly expandedId   = signal<string | null>(null);
  readonly selectedExerciseId = signal<string | null>(null);

  readonly sortDesc    = signal(true);
  readonly filterCat   = signal<string | null>(null);
  readonly searchQuery = signal('');
  get searchQueryValue(): string { return this.searchQuery(); }
  set searchQueryValue(v: string) { this.searchQuery.set(v); }

  readonly allWorkouts = this.workoutService.workouts;

  readonly filteredWorkouts = computed(() => {
    const cat   = this.filterCat();
    const query = this.searchQuery().trim().toLowerCase();
    let list = this.allWorkouts();
    if (cat) {
      list = list.filter(w => {
        const cats = w.categories?.length ? w.categories : (w.category ? [w.category] : []);
        return cats.includes(cat);
      });
    }
    if (query) {
      list = list.filter(w => w.entries.some(e => e.exerciseName.toLowerCase().includes(query)));
    }
    return this.sortDesc() ? list : [...list].reverse();
  });

  readonly selectedWorkout = computed(() => {
    const d = this.selectedDate();
    return d ? this.workoutService.getWorkoutForDate(d) : null;
  });

  readonly selectedDateSports = computed(() => {
    const d = this.selectedDate();
    return d ? this.sportService.getSportSessionsForDate(d) : [];
  });

  readonly selectedEntry = computed((): WorkoutEntry | null => {
    const id = this.selectedExerciseId();
    const w  = this.selectedWorkout();
    if (!id || !w) return null;
    return w.entries.find(e => e.exerciseId === id) ?? null;
  });

  readonly selectedDateLabel = computed(() => {
    const sel = this.selectedDate();
    if (!sel) return '';
    const today = this.workoutService.todayDateString();
    if (sel === today) return 'Avui';
    const yesterday = (() => {
      const d = new Date(today + 'T00:00:00');
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    })();
    if (sel === yesterday) return 'Ahir';
    const d = new Date(sel + 'T00:00:00');
    const label = d.toLocaleDateString('ca-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  readonly workoutBarStyle = computed((): string => {
    const w = this.selectedWorkout();
    if (!w) return '';
    const cats = w.categories?.length ? w.categories : (w.category ? [w.category] : []);
    if (cats.length === 0) return 'background: var(--c-border-2)';
    if (cats.length === 1) return `background: ${this.getCatColor(cats[0])}`;
    const stops = cats.map((c, i) => {
      const p1 = Math.round((i / cats.length) * 100);
      const p2 = Math.round(((i + 1) / cats.length) * 100);
      return `${this.getCatColor(c)} ${p1}% ${p2}%`;
    }).join(', ');
    return `background: linear-gradient(90deg, ${stops})`;
  });

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

  getFeelingEmoji(level: FeelingLevel): string { return FEELING_EMOJI[level]; }
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
  getMaxWeight(entry: WorkoutEntry): number {
    if (!entry.sets.length) return 0;
    return Math.max(...entry.sets.map(s => s.weight));
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
    return workout.entries.reduce((s, e) => s + e.sets.length, 0);
  }
  totalVolume(workout: Workout): number {
    return Math.round(workout.entries.reduce((t, e) =>
      t + e.sets.reduce((s, set) => s + set.weight * set.reps, 0), 0
    ));
  }
  getExerciseNames(workout: Workout): string {
    const names = workout.entries.map(e => e.exerciseName);
    if (names.length === 0) return '—';
    if (names.length <= 2) return names.join(' · ');
    return names.slice(0, 2).join(' · ') + ` +${names.length - 2}`;
  }
  isMaxSet(entry: WorkoutEntry, set: WorkoutSet): boolean {
    if (entry.sets.length <= 1) return false;
    const max = this.getMaxWeight(entry);
    if (max === 0) return false;
    return entry.sets.some(s => s.weight !== max) && set.weight === max;
  }

  selectDate(date: string): void {
    this.selectedDate.set(this.selectedDate() === date ? null : date);
    this.selectedExerciseId.set(null);
  }

  selectExercise(exerciseId: string): void {
    const next = this.selectedExerciseId() === exerciseId ? null : exerciseId;
    this.selectedExerciseId.set(next);
    if (next) this.workoutService.loadAllWorkouts();
  }

  toggleExpanded(id: string): void {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }
}
