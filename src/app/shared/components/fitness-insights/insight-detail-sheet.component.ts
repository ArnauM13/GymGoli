import { Component, HostListener, computed, inject, input, output } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
import { MatDialog } from '@angular/material/dialog';

import { SheetDragDirective } from '../../directives/sheet-drag.directive';

import { FitnessInsight, InsightBar } from '../../../core/models/insight.model';
import { MASCOTS, MascotMeta } from '../../../core/models/mascot.model';

/**
 * El «per què em dius això» d'un insight.
 *
 * La targeta d'Inici diu la conclusió en una línia; aquí hi ha el que hi ha
 * al darrere: què hem mirat, un gràfic amb les teves dades i què vol dir. Va
 * en un full que puja des de baix i no en una pantalla perquè no és un lloc
 * on l'usuari va: és una nota al peu de la targeta que ja estava mirant.
 *
 * Norma de llenguatge (veure `InsightDetail`): cap percentatge, cap paraula
 * d'entrenador. Dues xifres seves i una frase que les lligui.
 */
@Component({
  selector: 'app-insight-detail-sheet',
  standalone: true,
  imports: [A11yModule, SheetDragDirective],
  template: `
    <div #backdrop class="bottom-sheet-backdrop" (click)="close.emit()" aria-hidden="true"></div>

    <!-- El full es tanca amb la creu, amb l'Escape, tocant el fosc… i
         arrossegant-lo cap avall, que al mòbil és el primer que es prova. -->
    <div class="ids-sheet bottom-sheet" role="dialog" aria-modal="true"
         aria-labelledby="ids-title" cdkTrapFocus cdkTrapFocusAutoCapture
         appSheetDrag [appSheetDragBackdrop]="backdrop" (sheetDragDismiss)="close.emit()"
         [style.--ic]="insight().color">
      <span class="bottom-sheet-handle" aria-hidden="true"></span>

      <!-- Qui parla i de què: la mateixa capçalera de la targeta, més gran. -->
      <div class="ids-head">
        <div class="ids-who" [class.ids-who--pair]="mascots().length > 1">
          @for (m of mascots(); track m.name) {
            <img class="ids-avatar" [src]="m.avatar" [alt]="m.alt">
          }
        </div>
        <div class="ids-head-text">
          <span class="ids-title" id="ids-title">{{ insight().title }}</span>
          <span class="ids-stat">{{ insight().stat }}</span>
        </div>
        <button class="ids-close" (click)="close.emit()" aria-label="Tancar">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>

      <p class="ids-headline">{{ detail().headline }}</p>

      <!-- ── El gràfic ── -->
      <div class="ids-chart">
        <span class="ids-caption">{{ chart().caption }}</span>
        <!-- De quan parla. Un gràfic sense dates fa endevinar el període, i
             endevinar és el contrari del que ve a fer aquest full. -->
        <span class="ids-range">{{ chart().range }}</span>

        <div class="ids-plot" role="img" [attr.aria-label]="chartLabel()">
          <div class="ids-cols">
            @if (chart().reference; as ref) {
              <div class="ids-ref" [style.bottom.%]="pct(ref.value)">
                <span class="ids-ref-label">{{ ref.label }}</span>
              </div>
            }
            @for (bar of chart().bars; track $index) {
              <div class="ids-col" [style.--ic]="bar.color || null">
                @if ($index === valueIndex()) {
                  <span class="ids-val">{{ bar.display ?? bar.value }}</span>
                }
                <div class="ids-bar"
                     [class.ids-bar--muted]="bar.muted"
                     [class.ids-bar--hi]="bar.highlight"
                     [style.height.%]="pct(bar.value)"></div>
              </div>
            }
          </div>
          <!-- Les etiquetes van en una fila a part perquè l'alçada de les
               barres es mesuri només contra el gràfic, no contra el text. -->
          <div class="ids-xrow">
            @for (bar of chart().bars; track $index) {
              <span class="ids-x">{{ showXLabel($index) ? bar.label : '' }}</span>
            }
          </div>
        </div>
      </div>

      <!-- ── Les xifres, una per línia ── -->
      <dl class="ids-facts">
        @for (f of detail().facts; track f.label) {
          <div class="ids-fact">
            <dt>
              {{ f.label }}
              @if (f.note) { <span class="ids-note">{{ f.note }}</span> }
            </dt>
            <dd>{{ f.value }}</dd>
          </div>
        }
      </dl>

      <!-- ── Què vol dir ── -->
      <div class="ids-meaning">
        <span class="material-symbols-outlined" aria-hidden="true">lightbulb</span>
        <p>{{ detail().meaning }}</p>
      </div>
    </div>
  `,
  styles: [`
    .ids-sheet { padding: 8px 18px 22px; }
    /* La nansa és el que es veu agafable: amb el ratolí, que ho digui el cursor. */
    .ids-sheet .bottom-sheet-handle { cursor: grab; }

    /* ── Capçalera ── */
    .ids-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }

    .ids-who { flex-shrink: 0; display: flex; align-items: center; }
    .ids-avatar {
      width: 42px; height: 42px; border-radius: 50%;
      object-fit: cover; display: block;
      background: var(--c-subtle); box-shadow: 0 1px 4px var(--c-shadow);
    }
    .ids-who--pair .ids-avatar {
      width: 34px; height: 34px; border: 2px solid var(--c-card);
      &:not(:first-child) { margin-left: -13px; }
    }

    .ids-head-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .ids-title {
      font-size: 16px; font-weight: 800; line-height: 1.2;
      color: color-mix(in srgb, var(--ic) 60%, var(--c-text));
    }
    .ids-stat { font-size: 12.5px; font-weight: 600; color: var(--c-text-2); line-height: 1.35; }

    .ids-close {
      width: 34px; height: 34px; flex-shrink: 0; border-radius: 50%;
      border: none; background: var(--c-subtle); cursor: pointer;
      color: var(--c-text-3); touch-action: manipulation;
      display: flex; align-items: center; justify-content: center;
      transition: background 0.15s;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); }
      &:focus-visible { outline: 2px solid var(--ic); outline-offset: 2px; }
    }

    .ids-headline {
      margin: 0 0 16px; font-size: 13.5px; font-weight: 600;
      color: var(--c-text); line-height: 1.45;
    }

    /* ── Gràfic ──
     * Barres i prou: és l'única forma que s'entén sense saber llegir gràfics.
     * Una sola sèrie, així que no hi ha llegenda; el número només surt a la
     * barra de la qual parlem, perquè un número a cada barra no es llegeix. */
    .ids-chart { margin-bottom: 16px; }
    .ids-caption {
      display: block;
      font-size: 11px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.4px;
    }
    .ids-range {
      display: block; margin: 2px 0 8px;
      font-size: 11px; font-weight: 600; color: var(--c-text-3);
      &:empty { display: none; }
    }

    .ids-plot { padding-top: 16px; }

    .ids-cols { position: relative; display: flex; align-items: flex-end; gap: 5px; height: 104px; }
    .ids-col {
      flex: 1; min-width: 0; height: 100%;
      display: flex; flex-direction: column; justify-content: flex-end;
    }

    .ids-val {
      flex-shrink: 0;
      font-size: 10px; font-weight: 800; color: var(--c-text);
      text-align: center; white-space: nowrap; margin-bottom: 3px;
    }

    .ids-bar {
      flex-shrink: 0;
      min-height: 3px; border-radius: 4px 4px 0 0;
      background: color-mix(in srgb, var(--ic) 42%, var(--c-card));
      transition: height 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
    }
    .ids-bar--hi    { background: var(--ic); }
    .ids-bar--muted { background: color-mix(in srgb, var(--c-text-3) 28%, var(--c-card)); }

    /* Els colors dels insights estan pensats sobre blanc: sobre el fons fosc
       s'apaguen, així que s'aclareixen cap al text. */
    html.dark .ids-bar        { background: color-mix(in srgb, var(--ic) 34%, var(--c-text)); }
    html.dark .ids-bar--hi    { background: color-mix(in srgb, var(--ic) 62%, var(--c-text)); }
    /* Va després de les dues d'abans a propòsit: si no, el fosc es menjaria
       la diferència entre les barres de context i les altres. */
    html.dark .ids-bar--muted { background: color-mix(in srgb, var(--c-text-3) 45%, var(--c-card)); }

    .ids-xrow { display: flex; gap: 5px; margin-top: 5px; }
    .ids-x {
      flex: 1; min-width: 0; min-height: 12px;
      font-size: 9.5px; font-weight: 600; color: var(--c-text-3);
      text-align: center; white-space: nowrap; overflow: hidden;
    }

    /* Línia de referència: l'objectiu o el ritme habitual. Va etiquetada
       sempre — una ratlla sense nom obliga a endevinar-la. */
    .ids-ref {
      position: absolute; left: 0; right: 0;
      border-top: 1px dashed color-mix(in srgb, var(--c-text-3) 65%, transparent);
      pointer-events: none;
    }
    .ids-ref-label {
      position: absolute; right: 0; top: -13px;
      font-size: 9.5px; font-weight: 700; color: var(--c-text-3);
      background: var(--c-card); padding: 0 3px;
    }

    /* ── Xifres ── */
    .ids-facts {
      margin: 0 0 14px; padding: 4px 12px;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
    }
    .ids-fact {
      display: flex; align-items: baseline; justify-content: space-between; gap: 12px;
      padding: 8px 0;
      &:not(:last-child) { border-bottom: 1px solid var(--c-border-2); }
      /* El nom es queda l'espai que sobra: si no, un valor llarg li parteix
         la paraula per la meitat i la fila deixa de llegir-se. */
      dt {
        flex: 1; min-width: 0;
        font-size: 12px; font-weight: 600; color: var(--c-text-3);
        display: flex; flex-direction: column; gap: 1px;
      }
      dd {
        flex-shrink: 0; max-width: 58%;
        margin: 0; font-size: 12.5px; font-weight: 700; color: var(--c-text);
        text-align: right;
      }
    }

    /* ── Què vol dir ── */
    /* Les dates de cada xifra: hi són sempre que la xifra es compari amb una
       altra, i es llegeixen per sota del seu nom. */
    .ids-note { font-size: 10.5px; font-weight: 500; opacity: 0.85; }

    .ids-meaning {
      display: flex; align-items: flex-start; gap: 9px;
      padding: 11px 12px; border-radius: 14px;
      background: color-mix(in srgb, var(--ic) 9%, var(--c-card));
      .material-symbols-outlined {
        font-size: 17px; flex-shrink: 0; margin-top: 1px;
        color: color-mix(in srgb, var(--ic) 65%, var(--c-text));
        font-variation-settings: 'FILL' 0, 'wght' 300;
      }
      p { margin: 0; font-size: 12.5px; font-weight: 500; color: var(--c-text-2); line-height: 1.5; }
    }
  `],
})
export class InsightDetailSheetComponent {
  private dialog = inject(MatDialog);

  readonly insight = input.required<FitnessInsight>();
  readonly close   = output<void>();

  readonly detail = computed(() => this.insight().detail);
  readonly chart  = computed(() => this.detail().chart);

  /** `both` es pinta com els dos avatars encavalcats, com a la targeta. */
  readonly mascots = computed((): MascotMeta[] =>
    this.insight().mascot === 'both'
      ? [MASCOTS.marley, MASCOTS.xoco]
      : [MASCOTS[this.insight().mascot]]
  );

  /**
   * L'escala inclou la línia de referència: si l'objectiu queda per sobre de
   * totes les barres, ha de continuar sent visible dins del gràfic.
   */
  private readonly max = computed((): number => {
    const c = this.chart();
    return Math.max(1, ...c.bars.map(b => b.value), c.reference?.value ?? 0);
  });

  /** L'última barra destacada: l'única que porta el número escrit. */
  readonly valueIndex = computed((): number => {
    const bars = this.chart().bars;
    for (let i = bars.length - 1; i >= 0; i--) if (bars[i].highlight) return i;
    return -1;
  });

  pct(value: number): number {
    return Math.max(0, Math.min(100, (value / this.max()) * 100));
  }

  /**
   * Amb més de vuit barres les etiquetes es toquen: se'n queden les de les
   * puntes i la de la barra de la qual parlem. Les dades no es toquen, només
   * el que hi cap escrit.
   */
  showXLabel(index: number): boolean {
    const bars = this.chart().bars;
    if (bars.length <= 8) return true;
    return index === 0 || index === bars.length - 1 || index === this.valueIndex();
  }

  /** El gràfic sencer llegit en veu alta, per a qui no el veu. */
  chartLabel(): string {
    const c = this.chart();
    const bars = c.bars.map((b: InsightBar) => `${b.label}: ${b.display ?? b.value}`).join(', ');
    return `${c.caption}, ${c.range}. ${bars}.${c.reference ? ` Referència: ${c.reference.label}.` : ''}`;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.dialog.openDialogs.length) return;
    this.close.emit();
  }
}
