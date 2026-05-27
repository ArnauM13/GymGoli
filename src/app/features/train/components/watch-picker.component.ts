import { Component, ViewEncapsulation, computed, output, signal } from '@angular/core';

export type WatchFormat = 'fit' | 'apple_xml';

interface WatchBrand {
  id: string;
  name: string;
  format: WatchFormat;
  color: string;
  icon: string;
  keywords: string[];
}

const BRANDS: WatchBrand[] = [
  {
    id: 'garmin', name: 'Garmin', format: 'fit',
    color: '#006B3C', icon: 'watch',
    keywords: ['forerunner', 'fenix', 'fēnix', 'vivoactive', 'instinct',
               'venu', 'tactix', 'epix', 'edge', 'lily', 'vivomove',
               'enduro', 'quatix', 'marq'],
  },
  {
    id: 'apple', name: 'Apple Watch', format: 'apple_xml',
    color: '#1C1C1E', icon: 'watch',
    keywords: ['series', 'ultra', 'se', 'apple', 'health', 'salut',
               'fitness', 'watchos'],
  },
  {
    id: 'polar', name: 'Polar', format: 'fit',
    color: '#D72027', icon: 'favorite',
    keywords: ['vantage', 'pacer', 'grit', 'ignite', 'unite', 'h10',
               'h9', 'm430', 'a370', 'oh1'],
  },
  {
    id: 'suunto', name: 'Suunto', format: 'fit',
    color: '#007F9F', icon: 'explore',
    keywords: ['9 peak', '5 peak', 'vertical', 'race', 'core', 'spartan',
               'traverse', 'ambit'],
  },
  {
    id: 'coros', name: 'COROS', format: 'fit',
    color: '#E85D04', icon: 'speed',
    keywords: ['pace', 'apex', 'vertix', 'dura'],
  },
  {
    id: 'wahoo', name: 'Wahoo', format: 'fit',
    color: '#C8102E', icon: 'pedal_bike',
    keywords: ['elemnt', 'bolt', 'roam', 'kickr', 'rival'],
  },
];

@Component({
  selector: 'app-watch-picker',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="wp-backdrop" (click)="closed.emit()"></div>
    <div class="wp-sheet">

      <div class="wp-header">
        <span class="material-symbols-outlined wp-header-icon">watch</span>
        <span class="wp-header-title">Selecciona el rellotge</span>
        <button class="wp-close" (click)="closed.emit()">
          <span class="material-symbols-outlined">close</span>
        </button>
      </div>

      <div class="wp-search-wrap">
        <span class="material-symbols-outlined wp-search-icon">search</span>
        <input class="wp-search" type="search" placeholder="Cerca marca o model…"
               autocomplete="off" autocorrect="off" spellcheck="false"
               [value]="query()"
               (input)="query.set($any($event.target).value)">
        @if (query()) {
          <button class="wp-search-clear" (click)="query.set('')">
            <span class="material-symbols-outlined">close</span>
          </button>
        }
      </div>

      @if (filtered().length === 0) {
        <div class="wp-empty">
          <span class="material-symbols-outlined wp-empty-icon">search_off</span>
          <p>Cap rellotge trobat per "<strong>{{ query() }}</strong>"</p>
          <p class="wp-empty-sub">Prova amb el nom de la marca (Garmin, Polar…)</p>
        </div>
      } @else {
        <div class="wp-grid">
          @for (b of filtered(); track b.id) {
            <button class="wp-tile" [style.--wc]="b.color" (click)="pick(b)">
              <span class="material-symbols-outlined wp-tile-icon">{{ b.icon }}</span>
              <span class="wp-tile-name">{{ b.name }}</span>
            </button>
          }
        </div>
      }

      <p class="wp-hint">
        <span class="material-symbols-outlined">info</span>
        Garmin, Polar, Suunto i COROS exporten fitxers <strong>.FIT</strong>.
        Apple Watch usa l'export de l'app <strong>Salut</strong> (XML).
      </p>

    </div>
  `,
  styles: [`
    .wp-backdrop {
      position: fixed; inset: 0; z-index: 200;
      background: rgba(0,0,0,0.4); animation: wp-fade 0.18s ease;
    }
    @keyframes wp-fade { from { opacity: 0; } to { opacity: 1; } }

    .wp-sheet {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 201;
      background: var(--c-card); border-radius: 24px 24px 0 0;
      padding: 0 16px calc(env(safe-area-inset-bottom) + 20px);
      max-height: 80vh; overflow-y: auto;
      box-shadow: 0 -4px 24px rgba(0,0,0,0.16);
      animation: wp-up 0.22s cubic-bezier(0.34, 1.2, 0.64, 1);
    }
    @keyframes wp-up { from { transform: translateY(100%); } to { transform: translateY(0); } }

    .wp-header {
      display: flex; align-items: center; gap: 8px;
      padding: 16px 0 14px; border-bottom: 1px solid var(--c-border-2);
      margin-bottom: 14px;
    }
    .wp-header-icon {
      font-size: 20px; color: var(--c-brand);
      font-variation-settings: 'FILL' 1;
    }
    .wp-header-title { flex: 1; font-size: 16px; font-weight: 800; color: var(--c-text); }
    .wp-close {
      width: 32px; height: 32px; border-radius: 50%; border: none;
      background: var(--c-subtle); cursor: pointer; color: var(--c-text-2);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: var(--c-hover); }
    }

    .wp-search-wrap {
      position: relative; margin-bottom: 16px;
    }
    .wp-search-icon {
      position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
      font-size: 18px; color: var(--c-text-3); pointer-events: none;
    }
    .wp-search {
      width: 100%; box-sizing: border-box;
      padding: 10px 36px 10px 36px;
      border: 1.5px solid var(--c-border); border-radius: 12px;
      font-size: 14px; font-family: inherit; color: var(--c-text);
      background: var(--c-subtle); outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--c-brand); background: var(--c-card); }
      &::placeholder { color: var(--c-text-3); }
      &::-webkit-search-cancel-button { display: none; }
    }
    .wp-search-clear {
      position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
      width: 24px; height: 24px; border-radius: 50%; border: none;
      background: var(--c-hover); cursor: pointer; color: var(--c-text-3);
      display: flex; align-items: center; justify-content: center;
      .material-symbols-outlined { font-size: 14px; }
    }

    .wp-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .wp-tile {
      aspect-ratio: 1;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; border-radius: 16px; border: none; cursor: pointer;
      background: color-mix(in srgb, var(--wc) 12%, var(--c-card));
      border: 1.5px solid color-mix(in srgb, var(--wc) 30%, var(--c-border));
      transition: all 0.15s; touch-action: manipulation;
      &:hover { background: color-mix(in srgb, var(--wc) 20%, var(--c-card)); transform: translateY(-2px); }
      &:active { transform: scale(0.96); }
    }
    .wp-tile-icon {
      font-size: 30px;
      color: var(--wc);
      font-variation-settings: 'FILL' 1;
    }
    .wp-tile-name {
      font-size: 11px; font-weight: 700;
      color: color-mix(in srgb, var(--wc) 80%, var(--c-text));
      text-align: center; line-height: 1.2;
    }

    .wp-empty {
      text-align: center; padding: 28px 16px;
      .wp-empty-icon { font-size: 40px; color: var(--c-text-3); display: block; margin-bottom: 8px; }
      p { margin: 0 0 4px; font-size: 14px; color: var(--c-text-2); }
      .wp-empty-sub { font-size: 12px; color: var(--c-text-3); }
    }

    .wp-hint {
      display: flex; align-items: flex-start; gap: 6px;
      margin: 0; padding: 10px 12px; border-radius: 10px;
      background: var(--c-subtle); font-size: 12px; color: var(--c-text-3); line-height: 1.5;
      .material-symbols-outlined { font-size: 15px; flex-shrink: 0; margin-top: 1px; }
      strong { color: var(--c-text-2); }
    }
  `],
})
export class WatchPickerComponent {
  readonly closed   = output<void>();
  readonly selected = output<WatchFormat>();

  readonly query    = signal('');

  readonly filtered = computed(() => {
    const q = this.query().toLowerCase().trim();
    if (!q) return BRANDS;
    return BRANDS.filter(b =>
      b.name.toLowerCase().includes(q) ||
      b.keywords.some(k => k.includes(q))
    );
  });

  pick(brand: WatchBrand): void {
    this.selected.emit(brand.format);
    this.closed.emit();
  }
}
