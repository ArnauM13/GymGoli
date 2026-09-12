import { Component, OnDestroy, computed, effect, inject, input, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CATEGORY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS, ExerciseCategory } from '../../../core/models/exercise.model';
import { Sport } from '../../../core/models/sport.model';
import { TrainingTypeService } from '../../../core/services/training-type.service';

/**
 * Shared search + quick filter + sort bar. Used identically by the history
 * and progress pages; anything projected via <ng-content> (e.g. a date chip
 * tied to a calendar) renders between the sort button and the filters.
 *
 * Els filtres són de dues menes i s'exclouen: un tipus d'entrenament
 * (empenta, tracció...) o un esport dels que l'usuari té configurats. Cap
 * activitat és totes dues coses, així que triar-ne una treu l'altra.
 *
 * Amb `stackFilters` les rodones baixen a una fila pròpia, que rasca de
 * costat. És el que fa l'Historial: amb els tipus **i** els esports, tot en
 * una sola línia deixava la cerca feta un botó.
 */
@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="filter-bar" [class.filter-bar--stacked]="stackFilters()">
      <div class="fb-search-row">
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
      </div>

      <div class="fb-filters">
        <!-- Un filtre que no és ni tipus ni esport (l'abast de dies, a
             l'Historial) obre la fila: és el que escurça la llista abans que
             cap rodona. -->
        <ng-content select="[filterLead]" />

        <!-- "Tots" (clear category filter) disabled for now — specific filters only.
        <button class="filter-icon" [class.active]="category() === null"
                (click)="category.set(null)" aria-label="Tots" title="Tots">
          <span class="material-symbols-outlined">apps</span>
        </button>
        -->
        @for (cat of categories(); track cat) {
          <button class="filter-icon" [class.active]="category() === cat"
                  [style.--cat]="catColor(cat)"
                  [attr.aria-label]="catLabel(cat)" [attr.title]="catLabel(cat)"
                  (click)="selectCategory(cat)">
            <span class="material-symbols-outlined">{{ catIcon(cat) }}</span>
          </button>
        }

        @if (sports().length > 0 && categories().length > 0) {
          <span class="fb-sep" aria-hidden="true"></span>
        }
        @for (s of sports(); track s.id) {
          <button class="filter-icon" [class.active]="sport() === s.id"
                  [style.--cat]="s.color"
                  [attr.aria-label]="s.name" [attr.title]="s.name"
                  (click)="selectSport(s.id)">
            <span class="material-symbols-outlined">{{ s.icon }}</span>
          </button>
        }
      </div>
    </div>
  `,
  styles: [`
    /* ── Filters + search + sort ──
       Per defecte tot va en una línia (poques rodones, hi caben). Amb
       --stacked la cerca es queda sola a dalt i els filtres baixen a una
       fila que rasca de costat. */
    .filter-bar {
      display: flex; align-items: center; gap: 6px;
      padding: 0 16px 12px;
    }
    .fb-search-row { display: contents; }
    .fb-filters { display: contents; }

    .filter-bar--stacked {
      flex-direction: column; align-items: stretch; gap: 8px;
      .fb-search-row {
        display: flex; align-items: center; gap: 6px;
      }
      /* Els filtres, en fila pròpia: hi caben els tipus d'entrenament i els
         esports sense escanyar la cerca, i els que sobren es troben rascant.
         El coixí de sota deixa lloc a l'ombra de la rodona activa. */
      .fb-filters {
        display: flex; align-items: center; gap: 6px;
        margin: 0 -16px; padding: 2px 16px 4px;
        overflow-x: auto; scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
        &::-webkit-scrollbar { display: none; }
      }
    }

    /* Separador entre els tipus d'entrenament i els esports: són dues menes
       de filtre, i sense res al mig semblaven una llista sola. */
    .fb-sep {
      flex-shrink: 0; width: 1.5px; height: 20px; margin: 0 2px;
      border-radius: 1px; background: var(--c-border);
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
  /** Els esports configurats de l'usuari, si la pàgina també hi filtra.
   *  Buit (el que passa a Exercicis i a Progrés) i la fila no en pinta cap. */
  readonly sports            = input<Sport[]>([]);
  /** Els filtres baixen a una fila pròpia. Vegeu el comentari de la classe. */
  readonly stackFilters      = input(false);

  readonly searchQuery = model('');
  readonly sortDesc    = model(true);
  readonly category    = model<ExerciseCategory | null>(null);
  /** L'id de l'esport filtrat, o `null`. Exclusiu amb `category`. */
  readonly sport       = model<string | null>(null);

  private typeService = inject(TrainingTypeService);
  readonly categories = computed<ExerciseCategory[]>(() => this.typeService.types().map(t => t.id));

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

  /** Tornar a prémer el filtre actiu el treu. Triar-ne un de l'altra mena
   *  treu el que hi havia: cap activitat és un tipus d'entrenament **i** un
   *  esport, i tenir-ne dos de posats no hauria ensenyat mai res. */
  selectCategory(cat: ExerciseCategory): void {
    const next = this.category() === cat ? null : cat;
    this.category.set(next);
    if (next) this.sport.set(null);
  }

  selectSport(id: string): void {
    const next = this.sport() === id ? null : id;
    this.sport.set(next);
    if (next) this.category.set(null);
  }

  catColor(cat: ExerciseCategory): string { return CATEGORY_COLORS[cat]; }
  catLabel(cat: ExerciseCategory): string { return CATEGORY_LABELS[cat]; }
  catIcon(cat: ExerciseCategory): string { return CATEGORY_ICONS[cat]; }

  ngOnDestroy(): void { if (this._timer) clearTimeout(this._timer); }
}
