import { Component, inject, input, output, signal } from '@angular/core';

import { Sport, SportMetricDef, SportSession } from '../../../core/models/sport.model';
import { FeelingLevel, Workout } from '../../../core/models/workout.model';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FeedbackService } from '../../services/feedback.service';
import {
  formatFeeling, getCatLabel, getExerciseNames, isWorkoutPlanned, sportSessionSummary,
  workoutCardColor, workoutCategoryList, workoutPrimaryColor, workoutSetsCount,
  workoutVolumeFmt as workoutVolumeFmtUtil,
} from '../../utils/workout-card.utils';

export interface DayFeedEntry {
  date: string;
  workouts: Workout[];
  sports: { sport: Sport; session: SportSession }[];
}

@Component({
  selector: 'app-day-feed-cards',
  standalone: true,
  template: `
    @for (w of day()?.workouts ?? []; track w.id) {
      <div class="feed-card" [class.feed-card--planned]="isPlanned(w)"
           [style.--wc]="workoutPrimaryColor(w)"
           (click)="handleWorkoutClick(w)">
        <div class="fc-bar" [style.background]="workoutCardColor(w)"></div>
        <div class="fc-info">
          <div class="fc-badges">
            @for (cat of workoutCategoryList(w); track cat) {
              <span class="fc-badge fc-badge--{{ cat }}">{{ getCatLabel(cat) }}</span>
            }
            @if (isPlanned(w)) {
              <span class="fc-badge fc-badge--planned">Planificat</span>
            }
          </div>
          <span class="fc-exercises">{{ w.entries.length ? getExerciseNames(w) : 'Pla buit' }}</span>
          @if (!isPlanned(w)) {
            <div class="fc-stats">
              <span class="fc-stat">
                <span class="material-symbols-outlined">fitness_center</span>
                <strong>{{ w.entries.length }}</strong> exerc
              </span>
              @if (workoutSetsCount(w); as n) {
                <span class="fc-stat-sep">·</span>
                <span class="fc-stat">
                  <span class="material-symbols-outlined">repeat</span>
                  <strong>{{ n }}</strong> sèr
                </span>
              }
              @if (workoutVolumeFmt(w); as vol) {
                <span class="fc-stat-sep">·</span>
                <span class="fc-stat fc-stat--vol">
                  <span class="material-symbols-outlined">weight</span>
                  <strong>{{ vol }}</strong>
                </span>
              }
              @if (w.feeling) {
                <span class="fc-stat-sep">·</span>
                <span class="fc-stat">{{ emojiOf(w.feeling) }}</span>
              }
            </div>
          }
        </div>
        @if (isPlanned(w)) {
          <button class="fc-start" (click)="$event.stopPropagation(); startPlan(w)" title="Comença">
            <span class="material-symbols-outlined">play_arrow</span>
          </button>
        } @else {
          <span class="material-symbols-outlined fc-chevron">chevron_right</span>
        }
      </div>
    }
    @for (item of day()?.sports ?? []; track item.session.id) {
      <div class="feed-sport-card" [class.expanded]="expandedSportId() === item.session.id" [style.--ic]="item.sport.color">
        <button class="feed-sport-row" (click)="toggleSportExpand(item)">
          <span class="material-symbols-outlined feed-sport-icon">{{ item.sport.icon }}</span>
          <div class="fsr-info">
            <span class="feed-sport-name">{{ item.sport.name }}</span>
            @if (sportSummary(item.session, item.sport); as meta) {
              <span class="feed-sport-meta">{{ meta }}</span>
            }
          </div>
          <span class="material-symbols-outlined fsr-chevron">
            {{ expandedSportId() === item.session.id ? 'expand_less' : 'expand_more' }}
          </span>
        </button>

        @if (expandedSportId() === item.session.id) {
          <div class="sport-detail">
            <!-- Durada -->
            <div class="sd-field">
              <span class="sd-field-label">Durada</span>
              <div class="sd-row">
                <div class="sd-quick-btns">
                  @for (t of durationPresets; track t) {
                    <button class="sd-quick-btn" [class.active]="editDuration() === t"
                            (click)="editDuration.set(t)">{{ t }}min</button>
                  }
                </div>
                <div class="sd-stepper">
                  <button class="sd-step-btn" (click)="adjustDuration(-5)">−5</button>
                  <span class="sd-step-val">{{ editDuration() }}<small>min</small></span>
                  <button class="sd-step-btn" (click)="adjustDuration(5)">+5</button>
                </div>
              </div>
            </div>

            <!-- Subtipus -->
            @if (item.sport.subtypes.length) {
              <div class="sd-field">
                <span class="sd-field-label">Subtipus</span>
                <div class="sd-chips">
                  @for (sub of item.sport.subtypes; track sub.id) {
                    <button class="sd-chip" [class.active]="editSubtype() === sub.id"
                            (click)="toggleSubtype(sub.id)">{{ sub.name }}</button>
                  }
                </div>
              </div>
            }

            <!-- Mètriques -->
            @for (def of item.sport.metricDefs; track def.key) {
              <div class="sd-field">
                <span class="sd-field-label">{{ def.label }}@if (def.unit) { <small>({{ def.unit }})</small> }</span>
                @if (def.type === 'select') {
                  <div class="sd-chips">
                    @for (opt of def.options ?? []; track opt.value) {
                      <button class="sd-chip"
                              [class.active]="editMetric(def.key) === opt.value"
                              (click)="setMetric(def.key, editMetric(def.key) === opt.value ? null : opt.value)">
                        {{ opt.label }}
                      </button>
                    }
                  </div>
                } @else {
                  <div class="sd-stepper">
                    <button class="sd-step-btn" (click)="adjustMetric(def, -1)">−</button>
                    <span class="sd-step-val">{{ editMetricNum(def) }}<small>@if (def.unit) { {{ def.unit }} }</small></span>
                    <button class="sd-step-btn" (click)="adjustMetric(def, 1)">+</button>
                  </div>
                }
              </div>
            }

            <!-- Sensació -->
            <div class="sd-field">
              <span class="sd-field-label">Sensació</span>
              <div class="sd-feeling-row">
                @for (level of feelingLevels; track level) {
                  <button class="sd-feeling-btn" [class.active]="editFeeling() === level"
                          (click)="toggleFeeling(level)">{{ emojiOf(level) }}</button>
                }
              </div>
            </div>

            <!-- Notes -->
            <div class="sd-field">
              <span class="sd-field-label">Notes</span>
              <textarea class="sd-notes"
                placeholder="Afegeix una nota opcional..."
                [value]="editNotes()"
                (input)="editNotes.set($any($event.target).value)"
                rows="2"
              ></textarea>
            </div>

            <div class="sd-actions">
              <button class="sd-delete-btn" [disabled]="editSaving()" (click)="deleteSportEdit(item)"
                      aria-label="Eliminar" title="Eliminar">
                <span class="material-symbols-outlined">delete</span>
              </button>
              <div class="sd-main-actions">
                <button class="sd-cancel" (click)="collapseSport()">Cancel·lar</button>
                <button class="sd-save" [disabled]="editSaving()" (click)="saveSportEdit(item)">Guardar</button>
              </div>
            </div>
          </div>
        }
      </div>
    }
  `,
  styles: [`
    /* ── Feed workout cards (bigger, richer than the compact .workout-card) ── */
    .feed-card {
      display: flex; align-items: center;
      margin-bottom: 8px;
      border: 1.5px solid color-mix(in srgb, var(--wc, var(--c-border-2)) 38%, var(--c-border-2));
      border-radius: 16px;
      background: color-mix(in srgb, var(--wc, var(--c-card)) 6%, var(--c-card));
      box-shadow: 0 2px 8px var(--c-shadow); overflow: hidden;
      cursor: pointer; touch-action: manipulation;
      transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
      &:hover {
        box-shadow: 0 3px 12px var(--c-shadow-md);
        background: color-mix(in srgb, var(--wc, var(--c-card)) 10%, var(--c-card));
        border-color: color-mix(in srgb, var(--wc, var(--c-border)) 45%, var(--c-border));
      }
    }
    .feed-card--planned {
      border-style: dashed;
      border-color: color-mix(in srgb, var(--wc, var(--c-brand)) 55%, var(--c-border-2));
      background: color-mix(in srgb, var(--wc, var(--c-brand)) 5%, var(--c-card));
      &:hover { background: color-mix(in srgb, var(--wc, var(--c-brand)) 9%, var(--c-card)); }
    }
    .fc-bar { width: 5px; align-self: stretch; flex-shrink: 0; }
    .fc-info {
      flex: 1; min-width: 0;
      display: flex; flex-direction: column; gap: 5px;
      padding: 13px 12px;
    }
    .fc-badges { display: flex; flex-wrap: wrap; gap: 4px; }
    .fc-badge {
      display: inline-block; padding: 2px 8px; border-radius: 8px;
      font-size: 10px; font-weight: 700; letter-spacing: 0.2px; line-height: 1.4;
    }
    .fc-badge--push { background: rgba(229,115,115,0.15); color: #b71c1c; }
    .fc-badge--pull { background: rgba(100,181,246,0.15); color: #0d47a1; }
    .fc-badge--legs { background: rgba(129,199,132,0.15); color: #1b5e20; }
    html.dark .fc-badge--push { background: rgba(229,115,115,0.18); color: #ef9a9a; }
    html.dark .fc-badge--pull { background: rgba(100,181,246,0.18); color: #90caf9; }
    html.dark .fc-badge--legs { background: rgba(129,199,132,0.18); color: #a5d6a7; }
    .fc-badge--planned { background: rgba(var(--c-brand-rgb), 0.12); color: var(--c-brand); }
    .fc-exercises {
      font-size: 14px; font-weight: 700; color: var(--c-text);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .fc-stats {
      display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
      font-size: 12px; color: var(--c-text-2); font-weight: 500;
    }
    .fc-stat {
      display: inline-flex; align-items: center; gap: 3px;
      .material-symbols-outlined { font-size: 14px; color: color-mix(in srgb, var(--wc, var(--c-text-3)) 60%, var(--c-text-3)); }
      strong { font-weight: 700; color: var(--c-text-2); }
    }
    .fc-stat-sep { color: var(--c-border); }
    .fc-stat--vol strong { color: var(--wc, var(--c-brand)); }
    .fc-chevron { font-size: 22px; color: var(--c-text-3); flex-shrink: 0; margin-right: 8px; }
    .fc-start {
      width: 38px; height: 38px; border: none; border-radius: 10px; flex-shrink: 0;
      margin-right: 10px;
      background: var(--c-brand); color: white;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 20px; }
      &:hover { background: var(--c-brand-dk); }
    }

    .feed-sport-card {
      margin-bottom: 8px;
      border: 1.5px solid var(--c-border-2); border-radius: 16px;
      background: color-mix(in srgb, var(--ic, var(--c-card)) 5%, var(--c-card));
      overflow: hidden;
      transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
      &:hover, &.expanded {
        box-shadow: 0 3px 12px var(--c-shadow-md);
        background: color-mix(in srgb, var(--ic, var(--c-card)) 10%, var(--c-card));
        border-color: color-mix(in srgb, var(--ic, var(--c-border)) 45%, var(--c-border));
      }
    }
    .feed-sport-row {
      display: flex; align-items: center; gap: 12px; width: 100%;
      padding: 13px 14px; border: none; background: transparent; text-align: left;
      cursor: pointer; touch-action: manipulation;
    }
    .feed-sport-icon {
      font-size: 22px; color: var(--ic, var(--c-text-2)); font-variation-settings: 'FILL' 1;
      flex-shrink: 0;
    }
    .fsr-info { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
    .feed-sport-name { font-size: 14px; font-weight: 700; color: var(--c-text); }
    .feed-sport-meta { font-size: 12px; color: var(--c-text-3); }
    .fsr-chevron { font-size: 22px; color: var(--c-text-3); flex-shrink: 0; }

    /* ── Sport session inline edit panel ── */
    .sport-detail {
      padding: 4px 14px 14px; border-top: 1px solid var(--c-border-2);
      display: flex; flex-direction: column;
    }
    .sd-field { margin-top: 14px; }
    .sd-field-label {
      display: block; font-size: 11px; font-weight: 700; color: var(--c-text-2);
      letter-spacing: 0.3px; text-transform: uppercase; margin-bottom: 8px;
      small { font-size: 10px; color: var(--c-text-3); font-weight: 400; text-transform: none; margin-left: 4px; }
    }
    .sd-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .sd-quick-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .sd-quick-btn {
      padding: 6px 12px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sd-stepper { display: flex; align-items: center; gap: 6px; }
    .sd-step-btn {
      width: 32px; height: 32px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 14px; font-weight: 700; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &:hover { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sd-step-val {
      min-width: 50px; text-align: center;
      font-size: 16px; font-weight: 800; color: var(--c-text);
      small { font-size: 11px; color: var(--c-text-3); margin-left: 2px; }
    }
    .sd-chips { display: flex; gap: 7px; flex-wrap: wrap; }
    .sd-chip {
      padding: 7px 14px; border: 1.5px solid var(--c-border); border-radius: 20px;
      background: var(--c-card); font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &.active { background: var(--c-brand); color: white; border-color: var(--c-brand); }
      &:hover:not(.active) { border-color: var(--c-brand); color: var(--c-brand); }
    }
    .sd-feeling-row { display: flex; gap: 8px; }
    .sd-feeling-btn {
      flex: 1; height: 40px; border-radius: 12px;
      border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      font-size: 20px; cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      &.active { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.08); transform: scale(1.1); }
      &:hover:not(.active) { border-color: var(--c-border); background: var(--c-hover); }
    }
    .sd-notes {
      width: 100%; box-sizing: border-box;
      padding: 9px 12px; border: 1.5px solid var(--c-border); border-radius: 10px;
      font-size: 13px; font-family: inherit; color: var(--c-text); resize: none; background: var(--c-card);
      outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); }
      &::placeholder { color: var(--c-text-3); }
    }
    .sd-actions {
      display: flex; align-items: center; gap: 8px;
      margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--c-border-2);
    }
    .sd-delete-btn {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 38px; height: 38px; border-radius: 10px;
      border: 1.5px solid rgba(239,83,80,0.3); background: rgba(239,83,80,0.06);
      color: #ef5350;
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: rgba(239,83,80,0.12); border-color: #ef5350; }
      &:disabled { opacity: 0.6; cursor: default; }
    }
    .sd-main-actions { display: flex; gap: 8px; flex: 1; justify-content: flex-end; }
    .sd-cancel {
      height: 38px; padding: 0 16px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      font-size: 13px; font-weight: 600; color: var(--c-text-2);
      cursor: pointer; transition: all 0.15s; touch-action: manipulation;
      &:hover { border-color: var(--c-text-3); color: var(--c-text); }
    }
    .sd-save {
      height: 38px; padding: 0 18px; border-radius: 10px; border: none;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700;
      cursor: pointer; transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
      &:disabled { opacity: 0.6; cursor: default; }
    }
  `],
})
export class DayFeedCardsComponent {
  private workoutService = inject(WorkoutService);
  private sportService    = inject(SportService);
  private settingsService = inject(UserSettingsService);
  private exerciseService = inject(ExerciseService);
  private feedback       = inject(FeedbackService);

  readonly day  = input<DayFeedEntry | null>(null);
  readonly open = output<string>();

  readonly durationPresets: number[] = [30, 45, 60, 90];
  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  readonly expandedSportId = signal<string | null>(null);
  readonly editSaving      = signal(false);
  readonly editDuration    = signal(60);
  readonly editSubtype     = signal<string | null>(null);
  readonly editFeeling     = signal<FeelingLevel | null>(null);
  readonly editMetrics     = signal<Record<string, string | number>>({});
  readonly editNotes       = signal('');

  readonly isPlanned          = isWorkoutPlanned;
  readonly workoutPrimaryColor = workoutPrimaryColor;
  readonly workoutCardColor    = workoutCardColor;
  readonly workoutCategoryList = workoutCategoryList;
  readonly getCatLabel         = getCatLabel;
  readonly getExerciseNames    = getExerciseNames;
  readonly workoutSetsCount    = workoutSetsCount;
  /** Bodyweight-aware total volume label (folds in the user's bodyweight for
   *  bodyweight/assisted exercises). */
  workoutVolumeFmt(w: Workout): string {
    return workoutVolumeFmtUtil(w, {
      bodyweightKg: this.settingsService.bodyweightKg(),
      loadTypeOf: this.exerciseService.loadTypeOf,
    });
  }

  emojiOf(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  sportSummary(sub: { duration?: number; feeling?: FeelingLevel; subtypeId?: string }, sport: Sport): string {
    return sportSessionSummary(sub, sport, this.settingsService.difficultyScale());
  }

  handleWorkoutClick(w: Workout): void {
    if (this.isPlanned(w)) this.startPlan(w);
    else this.open.emit(w.id);
  }

  async startPlan(w: Workout): Promise<void> {
    try {
      await this.workoutService.startPlannedWorkout(w.id);
      this.open.emit(w.id);
    } catch {
      this.feedback.error('Error en iniciar el pla', 2500);
    }
  }

  // ── Sport session inline expand/edit ────────────────────────────────────

  toggleSportExpand(item: { sport: Sport; session: SportSession }): void {
    if (this.expandedSportId() === item.session.id) { this.collapseSport(); return; }
    this.expandedSportId.set(item.session.id);
    this.editDuration.set(item.session.duration ?? 60);
    this.editSubtype.set(item.session.subtypeId ?? null);
    this.editFeeling.set(item.session.feeling ?? null);
    this.editMetrics.set({ ...(item.session.metrics ?? {}) });
    this.editNotes.set(item.session.notes ?? '');
  }

  collapseSport(): void {
    this.expandedSportId.set(null);
  }

  editMetric(key: string): string | number | null {
    return this.editMetrics()[key] ?? null;
  }

  editMetricNum(def: SportMetricDef): number {
    const v = this.editMetrics()[def.key];
    return typeof v === 'number' ? v : (def.min ?? 0);
  }

  adjustMetric(def: SportMetricDef, delta: number): void {
    const step = def.step ?? 1;
    const next = Math.max(def.min ?? 0, Math.min(def.max ?? 9999, this.editMetricNum(def) + delta * step));
    this.editMetrics.update(m => ({ ...m, [def.key]: next }));
  }

  setMetric(key: string, value: string | number | null): void {
    this.editMetrics.update(m => {
      const copy = { ...m };
      if (value === null) delete copy[key]; else copy[key] = value;
      return copy;
    });
  }

  toggleSubtype(id: string): void {
    this.editSubtype.update(v => v === id ? null : id);
  }

  adjustDuration(delta: number): void {
    this.editDuration.update(v => Math.max(5, v + delta));
  }

  toggleFeeling(level: FeelingLevel): void {
    this.editFeeling.update(v => v === level ? null : level);
  }

  async saveSportEdit(item: { sport: Sport; session: SportSession }): Promise<void> {
    this.editSaving.set(true);
    try {
      const metrics = this.editMetrics();
      await this.sportService.updateSession(item.session.id, item.session.date, {
        subtypeId: this.editSubtype() ?? undefined,
        duration:  this.editDuration() || undefined,
        feeling:   this.editFeeling() ?? undefined,
        metrics:   Object.keys(metrics).length ? metrics : undefined,
        notes:     this.editNotes().trim() || undefined,
      });
      this.collapseSport();
    } catch {
      this.feedback.error('Error en guardar', 2500);
    } finally {
      this.editSaving.set(false);
    }
  }

  async deleteSportEdit(item: { sport: Sport; session: SportSession }): Promise<void> {
    this.editSaving.set(true);
    try {
      await this.sportService.deleteSession(item.session.id, item.session.date);
      this.collapseSport();
    } catch {
      this.feedback.error('Error en eliminar', 2500);
    } finally {
      this.editSaving.set(false);
    }
  }
}
