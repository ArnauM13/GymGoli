import { Component, computed, input, output } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';

import { FeelingLevel, WorkoutEntry, setTotalReps } from '../../../core/models/workout.model';
import { DifficultyScale } from '../../../core/models/user-settings.model';
import { kgToDisplay } from '../../utils/weight.utils';
import { formatFeeling } from '../../utils/workout-card.utils';

@Component({
  selector: 'app-exercise-entry-card',
  standalone: true,
  imports: [DragDropModule],
  template: `
    <!-- Placeholder while dragging -->
    <div class="eec-placeholder" *cdkDragPlaceholder></div>

    <div class="eec-wrap" [style.--cat]="catColor()">
      @if (draggable()) {
        <span class="eec-drag material-symbols-outlined" cdkDragHandle>drag_indicator</span>
      }

      <div class="eec-card" [class.eec-card--open]="!collapsed()" [class.eec-card--selected]="selectable() && selected()">

        <!-- ── Header (always visible, same look as history ex-card) ──
             The name/meta area is a real <button> so collapsing an exercise
             works with the keyboard; the action buttons stay outside it, as
             nesting them inside would be invalid markup. -->
        <div class="eec-header" [class.eec-header--minimal]="hideMetaWhenCollapsed()">
          <button type="button" class="eec-header-main" (click)="headerClick.emit()"
            [attr.aria-label]="headerAriaLabel()"
            [attr.aria-expanded]="selectable() ? null : !collapsed()"
            [attr.aria-pressed]="selectable() ? selected() : null">
            <span class="eec-bar" [class.eec-bar--loading]="catLoading()" aria-hidden="true"></span>
            <span class="eec-body">
              <span class="eec-name">{{ entry().exerciseName }}</span>
              @if (feelingLevel()) {
                <span class="eec-feeling" aria-hidden="true">{{ emoji(feelingLevel()!) }}</span>
              }
              @if (maxWeight() > 0) {
                <span class="eec-max" aria-hidden="true">{{ dispW(maxWeight()) }}<small>{{ unit() }}</small></span>
              } @else if (totalReps() > 0) {
                <span class="eec-max" aria-hidden="true">{{ totalReps() }}<small>r</small></span>
              }
              @if ((workingSetsCount() > 0 || warmupSetsCount() > 0) && showSetsBadge()) {
                <span class="eec-sets-badge" aria-hidden="true">
                  {{ workingSetsCount() }} sèr
                  @if (warmupSetsCount() > 0) {
                    <span class="eec-sets-badge__warmup">
                      +{{ warmupSetsCount() }}<span class="material-symbols-outlined">local_fire_department</span>
                    </span>
                  }
                </span>
              }
              @if (prBadge()) {
                <span class="eec-pr" aria-hidden="true">PR</span>
              }
            </span>
          </button>
          <div class="eec-actions">
            @if (collapsed() && entry().sets.length === 0) {
              @if (showStatsAction()) {
                <button type="button" class="eec-header-action-btn" aria-label="Estadístiques"
                  (click)="statsClick.emit()">
                  <span class="material-symbols-outlined" aria-hidden="true">bar_chart</span>
                </button>
              }
              @if (showDeleteAction()) {
                <button type="button" class="eec-header-action-btn eec-header-action-btn--danger" aria-label="Eliminar exercici"
                  (click)="deleteClick.emit()">
                  <span class="material-symbols-outlined" aria-hidden="true">delete</span>
                </button>
              }
            }
            @if (showMenu() && (!collapsed() || !hideMetaWhenCollapsed())) {
              <button type="button" class="eec-menu-btn" aria-label="Opcions"
                (click)="menuClick.emit()">
                <span class="material-symbols-outlined" aria-hidden="true">more_vert</span>
              </button>
            }
            @if (selectable()) {
              <span class="material-symbols-outlined eec-select-check" [class.eec-select-check--on]="selected()" aria-hidden="true">
                {{ selected() ? 'check_circle' : 'radio_button_unchecked' }}
              </span>
            } @else {
              <!-- Redundant hit target: the whole header already toggles, but the
                   chevron is what people aim at, so it toggles too. Hidden from
                   assistive tech and the tab order — the header button owns both. -->
              <button type="button" class="eec-chevron-btn" (click)="headerClick.emit()"
                tabindex="-1" aria-hidden="true">
                <span class="material-symbols-outlined eec-chevron"
                  [class.eec-chevron--big]="hideMetaWhenCollapsed()" aria-hidden="true">
                  {{ collapsed() ? 'expand_more' : 'expand_less' }}
                </span>
              </button>
            }
          </div>
        </div>

        <!-- ── Expandable body (grid-rows animation) ── -->
        <div class="eec-expanded" [class.collapsed]="collapsed()">
          <div class="eec-expanded-inner">
            <ng-content></ng-content>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .eec-placeholder {
      height: 58px;
      border: 2px dashed rgba(var(--c-brand-rgb), 0.22);
      border-radius: 12px;
      background: rgba(var(--c-brand-rgb), 0.04);
    }

    .eec-wrap {
      display: flex; align-items: stretch;
    }

    .eec-drag {
      font-size: 22px; color: var(--c-text-3);
      cursor: grab; user-select: none; touch-action: none;
      display: flex; align-items: center;
      padding: 0 2px 0 6px; flex-shrink: 0;
      align-self: stretch;
      &:active { cursor: grabbing; }
    }

    .eec-card {
      flex: 1; min-width: 0;
      border-radius: 12px; overflow: hidden;
      border: 1.5px solid color-mix(in srgb, var(--cat) 25%, var(--c-border-2));
      background: var(--c-card);
      box-shadow: 0 2px 8px var(--c-shadow);
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
    }
    .eec-card--open {
      border-color: color-mix(in srgb, var(--cat) 55%, var(--c-border));
      background: var(--c-card);
      box-shadow: 0 3px 12px color-mix(in srgb, var(--cat) 18%, var(--c-shadow));
    }
    .eec-card--selected {
      border-color: var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.06);
    }
    :host(.cdk-drag-preview) .eec-card {
      box-shadow: 0 8px 24px var(--c-shadow-md);
      opacity: 0.96;
    }

    .eec-header {
      display: flex; align-items: stretch;
      background: color-mix(in srgb, var(--cat) 9%, var(--c-card));
    }

    /* The tappable name/meta area — a bare button that keeps the row layout. */
    .eec-header-main {
      flex: 1; min-width: 0;
      display: flex; align-items: stretch; text-align: left;
      padding: 0; border: none; background: transparent;
      font: inherit; color: inherit;
      cursor: pointer; touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
      &:focus-visible { outline: 2px solid var(--c-brand); outline-offset: -2px; }
    }

    .eec-bar {
      width: 4px; align-self: stretch; flex-shrink: 0;
      background: var(--cat);
      &.eec-bar--loading {
        background: linear-gradient(180deg, var(--c-border-2) 0%, var(--c-border) 40%, var(--c-border-2) 80%);
        background-size: 100% 300px;
        animation: eec-bar-shimmer 1.5s ease-in-out infinite;
      }
    }
    @keyframes eec-bar-shimmer {
      from { background-position: 0 -150px; }
      to   { background-position: 0 calc(150px + 100%); }
    }

    .eec-body {
      flex: 1; min-width: 0;
      display: flex; align-items: center; gap: 8px;
      padding: 13px 8px 13px 12px;
    }

    .eec-name {
      flex: 1; min-width: 0;
      font-size: 14px; font-weight: 700; color: var(--c-text);
      line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }

    .eec-feeling {
      font-size: 16px; line-height: 1; flex-shrink: 0;
    }

    .eec-max {
      font-size: 14px; font-weight: 800; color: var(--cat); line-height: 1; flex-shrink: 0;
      small { font-size: 10px; font-weight: 500; color: var(--c-text-2); margin-left: 1px; }
    }

    .eec-sets-badge {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 11px; font-weight: 700; color: var(--c-text-2);
      padding: 3px 8px; border-radius: 10px; flex-shrink: 0;
      background: color-mix(in srgb, var(--cat) 10%, var(--c-card));
      border: 1px solid color-mix(in srgb, var(--cat) 22%, var(--c-border-2));
      line-height: 1.3;
    }
    .eec-sets-badge__warmup {
      display: inline-flex; align-items: center; gap: 1px;
      color: #ff9800;
      .material-symbols-outlined {
        font-size: 13px; font-variation-settings: 'FILL' 1, 'wght' 400;
      }
    }

    .eec-pr {
      font-size: 9px; font-weight: 800; letter-spacing: 0.3px;
      color: #b88500; background: rgba(255, 193, 7, 0.2);
      padding: 1px 6px; border-radius: 6px; line-height: 1.3; flex-shrink: 0;
    }

    .eec-actions {
      display: flex; align-items: center; flex-shrink: 0;
      padding-right: 6px;
    }

    .eec-menu-btn {
      width: 36px; height: 36px; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--c-text-3); border-radius: 8px;
      touch-action: manipulation; transition: background 0.1s, color 0.1s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
    }

    .eec-header-action-btn {
      width: 36px; height: 36px; border: none; background: transparent;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; color: var(--c-text-3); border-radius: 8px;
      touch-action: manipulation; transition: background 0.1s, color 0.1s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); color: var(--c-text-2); }
      &.eec-header-action-btn--danger:hover { background: rgba(239, 83, 80, 0.1); color: #ef5350; }
    }

    .eec-chevron-btn {
      display: flex; align-items: center; justify-content: center;
      padding: 8px 4px; margin: 0; border: none; background: transparent;
      cursor: pointer; touch-action: manipulation; border-radius: 8px;
      -webkit-tap-highlight-color: transparent;
      &:hover { background: var(--c-hover); }
    }
    .eec-chevron {
      font-size: 20px; color: var(--c-text-3);
      align-self: center; transition: color 0.15s, font-size 0.15s;
    }
    .eec-chevron--big { font-size: 28px; }
    .eec-card--open .eec-chevron { color: var(--cat); }

    .eec-select-check {
      font-size: 24px; color: var(--c-border); align-self: center;
      transition: color 0.15s;
      &.eec-select-check--on { color: var(--c-brand); }
    }

    .eec-header--minimal { min-height: 54px; }

    /* Grid-rows collapse animation */
    .eec-expanded {
      display: grid; grid-template-rows: 1fr;
      transition: grid-template-rows 0.22s ease;
    }
    .eec-expanded.collapsed { grid-template-rows: 0fr; }
    .eec-expanded-inner { overflow: hidden; }
  `],
})
export class ExerciseEntryCardComponent {
  readonly entry                = input.required<WorkoutEntry>();
  readonly catColor             = input<string>('#ccc');
  readonly catLoading           = input<boolean>(false);
  readonly collapsed            = input<boolean>(true);
  readonly draggable            = input<boolean>(false);
  readonly showMenu             = input<boolean>(false);
  readonly prBadge              = input<boolean>(false);
  readonly maxWeight            = input<number>(0);
  readonly unit                 = input<string>('kg');
  readonly feelingLevel         = input<FeelingLevel | undefined>(undefined);
  readonly difficultyScale      = input<DifficultyScale>('emoji');
  readonly showSetsBadge         = input<boolean>(true);
  readonly hideMetaWhenCollapsed = input<boolean>(false);
  /** Stats/delete buttons shown in the header instead of the (hidden) footer
   *  when the card is collapsed and has no sets yet. */
  readonly showStatsAction  = input<boolean>(false);
  readonly showDeleteAction = input<boolean>(false);
  /** Superset-grouping selection mode — shows a checkbox instead of the
   *  chevron; `headerClick` means "toggle selection" while this is true. */
  readonly selectable = input<boolean>(false);
  readonly selected   = input<boolean>(false);

  readonly headerClick  = output<void>();
  readonly menuClick    = output<void>();
  readonly statsClick   = output<void>();
  readonly deleteClick  = output<void>();

  /** The header button's spoken name — the visual meta (emoji, max weight,
   *  set badge) is aria-hidden, so it is spelled out here instead of being
   *  read as a string of loose numbers. */
  readonly headerAriaLabel = computed(() => {
    const parts = [this.entry().exerciseName];
    if (this.workingSetsCount() > 0) parts.push(`${this.workingSetsCount()} sèries`);
    if (this.maxWeight() > 0) parts.push(`${this.dispW(this.maxWeight())} ${this.unit()} màxim`);
    return this.selectable() ? `Seleccionar ${parts.join(', ')}` : parts.join(', ');
  });

  readonly totalReps = computed(() =>
    this.entry().sets.reduce((s, set) => set.warmup ? s : s + setTotalReps(set), 0));
  readonly workingSetsCount = computed(() => this.entry().sets.filter(set => !set.warmup).length);
  readonly warmupSetsCount = computed(() => this.entry().sets.filter(set => set.warmup).length);

  emoji(l: FeelingLevel): string { return formatFeeling(l, this.difficultyScale()); }
  dispW(v: number): number { return kgToDisplay(v, this.unit() as 'kg' | 'lb'); }

}
