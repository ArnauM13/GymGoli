import { Component, OnDestroy, effect, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CategoryChip } from '../../../core/models/category.model';
import { ExerciseCategory } from '../../../core/models/exercise.model';

/**
 * Shared search + quick category filter + sort bar. Used identically by the
 * history and progress pages; anything projected via <ng-content> (e.g. a
 * date chip tied to a calendar) renders between the sort button and the
 * category icons.
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="filter-bar">
      @if (showSort()) {
        <button class="sort-btn" (click)="toggleSort()" aria-label="Canviar ordre">
          <span class="material-symbols-outlined">{{ sortDesc() ? 'arrow_downward' : 'arrow_upward' }}</span>
        </button>
      }

      <div class="search-wrap">
        <span class="material-symbols-outlined search-icon">search</span>
        <input class="search-input" type="search" [(ngModel)]="inputValue"
               [placeholder]="searchPlaceholder()" autocomplete="off"
               [attr.aria-label]="searchPlaceholder()">
        @if (searchQuery()) {
          <button class="search-clear" (click)="clearSearch()" aria-label="Esborrar cerca">
            <span class="material-symbols-outlined">close</span>
          </button>
        }
      </div>

      <ng-content />

      <!-- "Tots" (clear category filter) disabled for now — specific filters only.
      <button class="filter-icon" [class.active]="category() === null"
              (click)="category.set(null)" aria-label="Tots" title="Tots">
        <span class="material-symbols-outlined">apps</span>
      </button>
      -->
      @for (cat of categories(); track cat.value) {
        <button class="filter-icon" [class.active]="category() === cat.value"
                [style.--cat]="cat.color"
                [attr.aria-label]="cat.label" [attr.title]="cat.label"
                (click)="category.set(category() === cat.value ? null : cat.value)">
          <span class="material-symbols-outlined">{{ cat.icon }}</span>
        </button>
      }
    </div>
  `,
  styles: [`
    /* ── Filters + search + sort, all inline ── */
    .filter-bar {
      display: flex; align-items: center; gap: 6px;
      padding: 0 16px 12px;
    }

    /* ── Search ── */
    .search-wrap {
      position: relative; flex: 1; min-width: 0;
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

    .sort-btn {
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      width: 34px; height: 34px; border-radius: 10px;
      border: 1.5px solid var(--c-border); background: var(--c-subtle);
      color: var(--c-text-2);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-border-2); color: var(--c-text); }
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
  `],
})
export class FilterBarComponent implements OnDestroy {
  readonly searchPlaceholder = input('Cerca...');
  readonly showSort          = input(true);

  readonly searchQuery = model('');
  readonly sortDesc    = model(true);
  readonly category    = model<ExerciseCategory | null>(null);

  readonly categories = input<CategoryChip[]>([]);

  private readonly _raw = signal('');
  private _timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Keep the visible input in sync if the parent resets searchQuery itself.
    effect(() => this._raw.set(this.searchQuery()));
  }

  get inputValue(): string { return this._raw(); }
  set inputValue(v: string) {
    this._raw.set(v);
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.searchQuery.set(v), 300);
  }

  clearSearch(): void {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._raw.set('');
    this.searchQuery.set('');
  }

  toggleSort(): void { this.sortDesc.update(v => !v); }

  ngOnDestroy(): void { if (this._timer) clearTimeout(this._timer); }
}
