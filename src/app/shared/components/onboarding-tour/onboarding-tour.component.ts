import { DOCUMENT } from '@angular/common';
import {
  Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild,
} from '@angular/core';

import { MASCOTS } from '../../../core/models/mascot.model';
import { OnboardingTourService } from '../../../core/services/onboarding-tour.service';

/** Rectangle il·luminat, en coordenades de finestra. */
interface Spot { top: number; left: number; width: number; height: number; }

/** Marge de foscor al voltant de l'element il·luminat. */
const PAD = 8;
/** Separació entre el focus i la targeta. */
const GAP = 14;
/** Frames buscant l'element abans de rendir-se (~2s a 60fps). Una pàgina
 *  carregada mandrosament pot trigar; passat això es mostra el missatge
 *  centrat, que sempre és millor que un tour encallat. */
const MAX_MISSES = 120;

/**
 * La capa del tour guiat: enfosqueix la pantalla, retalla un forat sobre
 * l'element del qual parla la parada i hi posa la targeta del gos al costat.
 *
 * El punt de tot plegat és que **el que s'il·lumina és l'app de veritat**, no
 * una captura: la pàgina de sota és la que l'usuari es trobarà quan tanqui el
 * tour, amb les seves dades. Per això la posició es mesura cada frame en
 * comptes de calcular-se un cop — així el forat segueix l'element mentre la
 * pàgina fa scroll, entra amb animació o es recol·loca.
 *
 * Mentre és obert, tot el que hi ha a sota queda bloquejat: el recorregut el
 * porten els botons de la targeta. Si l'usuari pogués tocar el que hi ha al
 * darrere acabaria en una pantalla que el tour no espera.
 */
@Component({
  selector: 'app-onboarding-tour',
  standalone: true,
  template: `
    @if (tour.stop(); as stop) {
      <div class="tour" role="dialog" aria-modal="true" [attr.aria-label]="stop.title">

        <!-- Bloqueja el que hi ha sota. El fosc no el pinta aquest: el pinta
             l'ombra enorme del focus, perquè així el forat queda net. -->
        <div class="tour-blocker"></div>

        @if (spot(); as s) {
          <div class="tour-spot"
               [style.top.px]="s.top" [style.left.px]="s.left"
               [style.width.px]="s.width" [style.height.px]="s.height"></div>
        } @else {
          <div class="tour-dim"></div>
        }

        <div #card class="tour-card"
             [class.tour-card--center]="!spot()"
             [class.tour-card--above]="above()"
             [style.left.px]="cardLeft()" [style.width.px]="cardWidth()"
             [style.top.px]="cardTop()" [style.bottom.px]="cardBottom()"
             tabindex="-1">

          <div class="tour-progress" aria-hidden="true">
            <span class="tour-progress-fill" [style.width.%]="progress()"></span>
          </div>

          @if (spot()) {
            <span class="tour-arrow" [style.left.px]="arrowLeft()" aria-hidden="true"></span>
          }

          <div class="tour-body">
            <div class="tour-text">
              <span class="tour-eyebrow">Pas {{ tour.index() + 1 }} de {{ tour.total }}</span>
              <h2 class="tour-title">{{ stop.title }}</h2>
              <p class="tour-desc">{{ stop.body }}</p>
              @if (stop.line) {
                <p class="tour-line">{{ stop.line }}</p>
              }
            </div>
            <img class="tour-dog" [class.tour-dog--pair]="stop.mascot === 'both'"
                 [src]="dog().figure" [alt]="dog().alt">
          </div>

          <div class="tour-actions">
            <button type="button" class="tour-skip" (click)="tour.skip()">Salta el tour</button>
            <span class="tour-gap"></span>
            @if (!tour.isFirst()) {
              <button type="button" class="tour-back" (click)="tour.prev()" aria-label="Parada anterior">
                <span class="material-symbols-outlined">arrow_back</span>
              </button>
            }
            <button type="button" class="tour-next" (click)="tour.next()">
              {{ tour.isLast() ? 'Ja ho tinc!' : 'Següent' }}
              @if (!tour.isLast()) {
                <span class="material-symbols-outlined">arrow_forward</span>
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 1900; pointer-events: none; }
    .tour { position: fixed; inset: 0; }

    .tour-blocker { position: fixed; inset: 0; pointer-events: auto; }

    /* Sense focus (obertura i tancament) el fosc el pinta un panell sencer. */
    .tour-dim {
      position: fixed; inset: 0; pointer-events: auto;
      background: var(--tour-dim);
      animation: tour-fade 0.25s ease both;
    }

    /* El forat: l'element no es tapa, i tot el que l'envolta l'enfosqueix una
     * sola ombra escampada. Un rectangle transparent amb ombra surt més barat
     * (i queda més net als cantons) que quatre panells encaixats. */
    .tour-spot {
      position: fixed; z-index: 1; pointer-events: none;
      border-radius: 16px;
      background: transparent;
      box-shadow: 0 0 0 9999px var(--tour-dim);
      transition: top 0.3s cubic-bezier(0.4, 0, 0.2, 1), left 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                  width 0.3s cubic-bezier(0.4, 0, 0.2, 1), height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* L'anell que batega. Va en un pseudo-element per no barallar-se amb
     * l'ombra gegant del pare. */
    .tour-spot::after {
      content: ''; position: absolute; inset: -3px;
      border: 2px solid var(--c-brand); border-radius: 19px;
      animation: tour-pulse 1.9s ease-in-out infinite;
    }

    @keyframes tour-pulse {
      0%, 100% { opacity: 1;   transform: scale(1); }
      50%      { opacity: 0.5; transform: scale(1.035); }
    }
    @keyframes tour-fade { from { opacity: 0; } to { opacity: 1; } }

    /* ── Targeta ── */
    .tour-card {
      position: fixed; z-index: 2; pointer-events: auto;
      box-sizing: border-box;
      background: var(--c-card);
      border: 1px solid var(--c-border-2);
      border-radius: 20px;
      box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28), 0 3px 10px rgba(0, 0, 0, 0.12);
      padding: 14px 16px 12px;
      display: flex; flex-direction: column; gap: 10px;
      animation: tour-card-in 0.28s cubic-bezier(0.34, 1.2, 0.64, 1) both;
      &:focus-visible { outline: none; }
    }
    .tour-card--center { top: 50%; transform: translateY(-50%); }

    @keyframes tour-card-in {
      from { opacity: 0; transform: translateY(8px) scale(0.985); }
      to   { opacity: 1; transform: none; }
    }
    .tour-card--center { animation: none; }

    /* La fletxa apunta al forat: la targeta i el focus han de llegir-se com
     * una sola cosa, no com dos elements que casualment són a prop. */
    .tour-arrow {
      position: absolute; width: 12px; height: 12px;
      background: var(--c-card);
      border: 1px solid var(--c-border-2);
      transform: translateX(-50%) rotate(45deg);
      top: -7px; border-right: none; border-bottom: none; border-radius: 3px 0 0 0;
    }
    .tour-card--above .tour-arrow {
      top: auto; bottom: -7px;
      border: 1px solid var(--c-border-2); border-left: none; border-top: none;
      border-radius: 0 0 3px 0;
    }

    .tour-progress {
      height: 3px; border-radius: 2px; background: var(--c-border-2); overflow: hidden;
    }
    .tour-progress-fill {
      display: block; height: 100%; background: var(--c-brand);
      transition: width 0.3s ease;
    }

    .tour-body { display: flex; align-items: flex-end; gap: 8px; }
    .tour-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

    .tour-eyebrow {
      font-size: 9.5px; font-weight: 700; line-height: 1; color: var(--c-brand);
      text-transform: uppercase; letter-spacing: 0.6px;
    }
    .tour-title {
      margin: 0; font-size: 16px; font-weight: 800; color: var(--c-text);
      letter-spacing: -0.2px; line-height: 1.25;
    }
    .tour-desc {
      margin: 0; font-size: 12.5px; font-weight: 500; color: var(--c-text-3); line-height: 1.45;
    }
    /* La frase del gos: la seva, no la de l'app. Va en cursiva i tenyida
     * perquè es llegeixi com una veu i no com més text d'ajuda. */
    .tour-line {
      margin: 2px 0 0; font-size: 12.5px; font-weight: 700; font-style: italic;
      color: var(--c-brand); line-height: 1.3;
    }

    /* Aquí surten grans i retallats del fons, com a la bafarada: la silueta ja
     * diu qui és i emmarcar-los només els faria petits. */
    .tour-dog {
      height: 74px; width: auto; display: block; flex-shrink: 0;
      align-self: flex-end; margin-bottom: -12px;
      filter: drop-shadow(0 3px 8px var(--c-shadow-md));
      mask-image: linear-gradient(to bottom, #000 84%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, #000 84%, transparent 100%);
    }
    .tour-dog--pair { height: 64px; }

    .tour-actions { display: flex; align-items: center; gap: 8px; }
    .tour-gap { flex: 1; }

    .tour-skip {
      padding: 8px 2px; border: none; background: none;
      font-size: 12.5px; font-weight: 600; color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation; transition: color 0.15s;
      &:hover { color: var(--c-text-2); }
    }

    .tour-back {
      width: 38px; height: 38px; border-radius: 12px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      display: flex; align-items: center; justify-content: center;
      color: var(--c-text-2); cursor: pointer; touch-action: manipulation;
      transition: border-color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { border-color: var(--c-border); background: var(--c-subtle); }
    }

    .tour-next {
      display: inline-flex; align-items: center; gap: 5px;
      padding: 10px 16px; border: none; border-radius: 12px;
      background: var(--c-brand); color: white;
      font-size: 13px; font-weight: 700; letter-spacing: 0.1px;
      cursor: pointer; touch-action: manipulation; transition: background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { background: var(--c-brand-dk); }
    }

    @media (prefers-reduced-motion: reduce) {
      .tour-spot, .tour-spot::after, .tour-card, .tour-dim, .tour-progress-fill {
        animation: none; transition: none;
      }
    }
  `],
})
export class OnboardingTourComponent {
  readonly tour = inject(OnboardingTourService);
  private doc   = inject(DOCUMENT);

  private readonly cardEl = viewChild<ElementRef<HTMLElement>>('card');

  /** Rectangle il·luminat, o null si la parada no en té (o no s'ha trobat). */
  readonly spot = signal<Spot | null>(null);
  /** Mides de la finestra, rellegides al bucle: la targeta es col·loca
   *  respecte d'elles i han de sobreviure a un gir de pantalla. */
  readonly viewport = signal({ w: 0, h: 0 });

  readonly dog      = computed(() => MASCOTS[this.tour.stop()?.mascot ?? 'both']);
  readonly progress = computed(() => ((this.tour.index() + 1) / this.tour.total) * 100);

  /** Amb el focus a la meitat de baix, la targeta va a sobre; si no, a sota.
   *  Sempre a l'altra banda, perquè mai el tapi. */
  readonly above = computed(() => {
    const s = this.spot(), h = this.viewport().h;
    return !!s && h > 0 && s.top + s.height / 2 > h / 2;
  });

  readonly cardWidth = computed(() => Math.min(480, Math.max(240, this.viewport().w - 28)));
  readonly cardLeft  = computed(() => Math.round((this.viewport().w - this.cardWidth()) / 2));

  readonly cardTop = computed(() => {
    const s = this.spot();
    return s && !this.above() ? Math.round(s.top + s.height + GAP) : null;
  });
  readonly cardBottom = computed(() => {
    const s = this.spot();
    return s && this.above() ? Math.round(this.viewport().h - s.top + GAP) : null;
  });

  /** Posició de la fletxa dins la targeta, alineada amb el centre del focus i
   *  retallada perquè no se surti dels cantons arrodonits. */
  readonly arrowLeft = computed(() => {
    const s = this.spot();
    if (!s) return 0;
    const w = this.cardWidth();
    return Math.round(Math.min(Math.max(s.left + s.width / 2 - this.cardLeft(), 22), w - 22));
  });

  private raf = 0;
  private misses = 0;
  private scrolledFor = '';
  private lastRoute = '';

  constructor() {
    inject(DestroyRef).onDestroy(() => this._stopTracking());

    // Cada parada torna a començar la cerca: l'element de la següent encara
    // pot no existir.
    effect(() => {
      const stop = this.tour.stop();
      if (!stop) { this._stopTracking(); this.spot.set(null); this.lastRoute = ''; return; }

      this.misses = 0;
      // Dins d'una mateixa pantalla el forat es queda on és i llisca fins al
      // nou element — dues parades seguides a Inici es llegeixen com un sol
      // moviment. Quan la pantalla canvia no hi ha res a què lliscar: el que
      // s'il·luminava ja no existeix, i deixar-lo encès seria mentida.
      if (stop.route !== this.lastRoute) this.spot.set(null);
      this.lastRoute = stop.route;

      this._startTracking();
      queueMicrotask(() => this.cardEl()?.nativeElement.focus({ preventScroll: true }));
    });
  }

  private _startTracking(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(this._tick);
  }

  private _stopTracking(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * Un sol bucle busca l'element, l'acosta a la vista i el segueix. Mesurar
   * cada frame sembla excessiu i no ho és: és una lectura de
   * `getBoundingClientRect()` mentre el tour és obert, i estalvia haver
   * d'endevinar quan es mou (scroll, animació d'entrada de pàgina, teclat,
   * rotació...). El senyal només es toca quan el rectangle canvia de debò.
   */
  private _tick = (): void => {
    const stop = this.tour.stop();
    if (!stop) { this._stopTracking(); return; }

    const win = this.doc.defaultView;
    if (win) {
      const w = win.innerWidth, h = win.innerHeight;
      const v = this.viewport();
      if (v.w !== w || v.h !== h) this.viewport.set({ w, h });
    }

    if (!stop.targets.length) {
      this.spot.set(null);
      this.raf = requestAnimationFrame(this._tick);
      return;
    }

    const els = stop.targets
      .map(sel => this.doc.querySelector(sel) as HTMLElement | null)
      .filter((el): el is HTMLElement => !!el);

    if (els.length !== stop.targets.length) {
      // Encara no hi és (pàgina carregant). Es reintenta fins a rendir-se, i
      // llavors la parada es diu igualment amb la targeta centrada.
      if (++this.misses > MAX_MISSES) this.spot.set(null);
      this.raf = requestAnimationFrame(this._tick);
      return;
    }
    this.misses = 0;

    if (this.scrolledFor !== stop.id) {
      this.scrolledFor = stop.id;
      els[0].scrollIntoView({ block: 'center', behavior: this._motionOk() ? 'smooth' : 'auto' });
    }

    const next = this._union(els.map(el => el.getBoundingClientRect()));
    const cur  = this.spot();
    if (!cur || Math.abs(cur.top - next.top) > 0.5 || Math.abs(cur.left - next.left) > 0.5
             || Math.abs(cur.width - next.width) > 0.5 || Math.abs(cur.height - next.height) > 0.5) {
      this.spot.set(next);
    }

    this.raf = requestAnimationFrame(this._tick);
  };

  /** El rectangle que conté tots els objectius, amb marge. Per això les
   *  parades només agrupen elements veïns: la unió de dues coses llunyanes
   *  il·luminaria tot el que hi ha entremig. */
  private _union(rects: DOMRect[]): Spot {
    const top    = Math.min(...rects.map(r => r.top));
    const left   = Math.min(...rects.map(r => r.left));
    const bottom = Math.max(...rects.map(r => r.bottom));
    const right  = Math.max(...rects.map(r => r.right));
    return {
      top:    Math.round(top - PAD),
      left:   Math.round(left - PAD),
      width:  Math.round(right - left + PAD * 2),
      height: Math.round(bottom - top + PAD * 2),
    };
  }

  private _motionOk(): boolean {
    return !this.doc.defaultView?.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}
