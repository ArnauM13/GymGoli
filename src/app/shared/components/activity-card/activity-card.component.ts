import { Component, booleanAttribute, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { ActivityIconComponent } from '../activity-icon/activity-icon.component';
import { Mascot } from '../../../core/models/mascot.model';
import { ActivityStat } from '../../utils/workout-card.utils';

/**
 * La targeta d'una activitat: barra de color, icona amb el gos, què és i les
 * xifres que la resumeixen.
 *
 * És la mateixa a tot arreu —al feed d'Inici, a l'Historial i coronant la
 * pàgina d'una activitat oberta— perquè una activitat s'ha de reconèixer
 * igual la miris on la miris. Abans la del feed i la de la pàgina eren dos
 * blocs de marcatge diferents, i la de la pàgina es va anar quedant amb coses
 * que la del feed no té (la data) i sense les que sí (les xifres d'un cop
 * d'ull).
 *
 * No sap res d'entrenaments ni d'esports: qui la fa servir li dona el color,
 * la icona, el títol i les xifres ja calculades. El que sí que sap és com es
 * comporta —desplegar-se, obrir-se, portar botons al costat— i ho fa igual
 * per a tots dos.
 *
 * La data no hi surt a posta: al feed ja la diu el dia que agrupa les
 * targetes, i a la pàgina d'una activitat la diu la capçalera.
 */
@Component({
  selector: 'app-activity-card',
  standalone: true,
  imports: [ActivityIconComponent, NgTemplateOutlet],
  template: `
    <div class="act-card" [class.act-card--planned]="planned()" [class.expanded]="expanded()"
         [class.act-card--static]="!interactive()" [style.--ac]="accent()">
      <span class="ac-bar" [style.background]="barColor() || accent()" aria-hidden="true"></span>

      <div class="ac-head">
        @if (interactive()) {
          <button class="ac-main" (click)="cardClick.emit()"
                  [attr.aria-expanded]="expandable() ? expanded() : null">
            <ng-container [ngTemplateOutlet]="body" />
          </button>
        } @else {
          <div class="ac-main ac-main--static">
            <ng-container [ngTemplateOutlet]="body" />
          </div>
        }

        <ng-content select="[cardActions]" />
      </div>

      <ng-content />
    </div>

    <ng-template #body>
      <app-activity-icon [icon]="icon()" [color]="accent()" [mascot]="mascot()" />
      <div class="ac-info">
        <div class="ac-title-row">
          <span class="ac-title">{{ title() }}</span>
          @if (subtype(); as sub) { <span class="ac-subtype">{{ sub }}</span> }
          @if (note().trim(); as n) { <span class="ac-detail">{{ n }}</span> }
        </div>
        @if (stats().length) {
          <div class="ac-stats">
            @for (stat of stats(); track stat.text; let i = $index) {
              @if (i > 0) { <span class="ac-stat-sep" aria-hidden="true">·</span> }
              <span class="ac-stat" [class.ac-stat--vol]="stat.accent">
                <span class="material-symbols-outlined" aria-hidden="true">{{ stat.icon }}</span>
                <strong>{{ stat.text }}</strong>
                @if (stat.warmup) {
                  <span class="ac-stat-warmup">
                    +{{ stat.warmup }}<span class="material-symbols-outlined" aria-hidden="true">local_fire_department</span>
                  </span>
                }
              </span>
            }
          </div>
        }
      </div>

      <!-- Un pla encara no s'ha viscut: hi diu que està previst, i la
           sensació no hi té res a dir fins que es faci. -->
      @if (planned() && plannedPill()) {
        <span class="ac-pill">
          <span class="material-symbols-outlined" aria-hidden="true">event_upcoming</span>
          Planificat
        </span>
      } @else if (feelingEditable()) {
        <!-- A la pàgina de l'activitat la sensació no només es llegeix: es
             posa des d'aquí mateix, sense baixar enlloc. -->
        <button class="aw-feeling-btn" [class.aw-feeling-btn--set]="feeling()"
                (click)="$event.stopPropagation(); feelingClick.emit()"
                [attr.aria-label]="feeling() ? 'Canviar sensació' : 'Afegir sensació'"
                [attr.aria-expanded]="feelingOpen()">
          @if (feeling(); as f) {
            <span class="aw-feeling-emoji">{{ f }}</span>
          } @else {
            <span class="material-symbols-outlined">sentiment_neutral</span>
          }
        </button>
      } @else {
        <span class="ac-feeling">@if (feeling(); as f) { {{ f }} }</span>
      }

      @if (expandable()) {
        <span class="material-symbols-outlined ac-chevron" aria-hidden="true">
          {{ expanded() ? 'expand_less' : 'expand_more' }}
        </span>
      } @else if (navigable()) {
        <!-- Aquesta no es desplega: porta a un altre lloc, i el glif ho diu. -->
        <span class="material-symbols-outlined ac-chevron" aria-hidden="true">chevron_right</span>
      }
    </ng-template>
  `,
  styles: [`
    :host { display: block; }

    .act-card {
      position: relative;
      border: 1.5px solid color-mix(in srgb, var(--ac, var(--c-border-2)) 34%, var(--c-border-2));
      border-radius: 14px; overflow: hidden;
      background: color-mix(in srgb, var(--ac, var(--c-card)) 6%, var(--c-card));
      box-shadow: 0 2px 8px var(--c-shadow);
      transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
      &:hover:not(.act-card--static) {
        box-shadow: 0 3px 12px var(--c-shadow-md);
        background: color-mix(in srgb, var(--ac, var(--c-card)) 10%, var(--c-card));
        border-color: color-mix(in srgb, var(--ac, var(--c-border)) 45%, var(--c-border));
      }
      &.expanded {
        box-shadow: 0 4px 16px var(--c-shadow-md);
        border-color: color-mix(in srgb, var(--ac, var(--c-border)) 55%, var(--c-border));
      }
    }
    .act-card--planned {
      border-style: dashed;
      border-color: color-mix(in srgb, var(--ac, var(--c-brand)) 55%, var(--c-border-2));
      background: color-mix(in srgb, var(--ac, var(--c-brand)) 5%, var(--c-card));
      &:hover:not(.act-card--static) { background: color-mix(in srgb, var(--ac, var(--c-brand)) 9%, var(--c-card)); }
    }
    .ac-bar { position: absolute; left: 0; top: 0; bottom: 0; width: 5px; }

    .ac-head { display: flex; align-items: stretch; }
    .ac-main {
      display: flex; align-items: center; gap: 11px; flex: 1; min-width: 0;
      padding: 13px 6px 13px 14px; border: none; background: transparent; text-align: left;
      cursor: pointer; touch-action: manipulation;
      &:focus-visible { outline: 2px solid var(--ac, var(--c-brand)); outline-offset: -3px; }
    }
    /* Coronant una pàgina la targeta ja no porta enlloc: és el que estàs
       mirant, així que no es comporta com un botó. */
    .ac-main--static { cursor: default; }

    /* Identitat a dalt (títol, subtipus i nota) i xifres a sota. L'alçada
     * mínima es reserva encara que la targeta porti poca cosa, perquè totes
     * les activitats d'un dia facin la mateixa mida; només creix si les
     * xifres no caben en una línia. */
    .ac-info {
      flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;
      gap: 7px; min-height: 46px;
    }
    .ac-title-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
    .ac-title {
      flex: 0 1 auto; min-width: 0; font-size: 14px; font-weight: 800; line-height: 1.25;
      color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* El subtipus és part de la identitat («Yoga · Vinyasa»), així que va al
     * costat del títol i no en una línia pròpia. */
    .ac-subtype {
      flex-shrink: 0; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      padding: 1px 7px; border-radius: 8px;
      background: color-mix(in srgb, var(--ac, var(--c-brand)) 14%, transparent);
      color: color-mix(in srgb, var(--ac, var(--c-brand)) 65%, var(--c-text));
      font-size: 10.5px; font-weight: 700; line-height: 1.5;
    }
    /* La fatiga té columna pròpia a la dreta, just abans del chevron: sempre
     * al mateix lloc, hi sigui o no, perquè les targetes s'alineïn entre elles. */
    .ac-feeling {
      flex-shrink: 0; width: 22px; text-align: center;
      font-size: 15px; font-weight: 700; line-height: 1.2; color: var(--c-text-2);
    }
    /* La nota va al costat del títol, no a sota: és el subtítol de
     * l'activitat i és la primera que cedeix amplada quan no hi cap tot. */
    .ac-detail {
      flex: 1 1 auto; min-width: 0;
      font-size: 11.5px; font-weight: 500; color: var(--c-text-2); line-height: 1.3;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    /* Xifres juntes: prou estret perquè les tres d'un entrenament
     * (exercicis, sèries i volum) càpiguen d'una tirada. Si un esport en
     * porta més, embolcallen a la línia següent en comptes de quedar
     * tallades a mitges. */
    .ac-stats {
      display: flex; align-items: center; column-gap: 4px; row-gap: 2px; flex-wrap: wrap;
      min-width: 0;
      font-size: 11px; font-weight: 500; color: var(--c-text-3);
    }
    .ac-stat {
      display: inline-flex; align-items: center; gap: 2px; flex-shrink: 0; white-space: nowrap;
      .material-symbols-outlined { font-size: 11px; color: color-mix(in srgb, var(--ac, var(--c-text-3)) 60%, var(--c-text-3)); }
      strong { font-weight: 700; color: var(--c-text-2); }
    }
    .ac-stat-warmup {
      display: inline-flex; align-items: center; gap: 1px; margin-left: 1px; color: #ff9800;
      .material-symbols-outlined { font-size: 11px; color: #ff9800; font-variation-settings: 'FILL' 1, 'wght' 400; }
    }
    .ac-stat-sep { flex-shrink: 0; color: var(--c-border); }
    .ac-stat--vol strong { color: var(--ac, var(--c-brand)); }
    .ac-chevron {
      flex-shrink: 0; margin-right: 4px; font-size: 20px; color: var(--c-text-3);
      transition: color 0.2s;
      .act-card.expanded & { color: color-mix(in srgb, var(--ac, var(--c-brand)) 70%, var(--c-text-2)); }
    }

    .ac-pill {
      display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
      padding: 4px 9px; border-radius: 20px;
      background: color-mix(in srgb, var(--ac, var(--c-brand)) 14%, transparent);
      color: color-mix(in srgb, var(--ac, var(--c-brand)) 70%, var(--c-text));
      font-size: 11px; font-weight: 800;
      .material-symbols-outlined { font-size: 14px; }
    }

    .aw-feeling-btn {
      width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
      border: none; background: transparent; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      touch-action: manipulation; transition: background 0.15s;
      color: var(--c-text-3);
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-hover); }
      &.aw-feeling-btn--set { color: var(--c-text-2); }
    }
    .aw-feeling-emoji { font-size: 18px; line-height: 1; }
  `],
})
export class ActivityCardComponent {
  /** El color de l'activitat: tenyeix la vora, el fons i les xifres. */
  readonly accent = input<string>('');
  /** La barra de l'esquerra, quan no és un color pla (un entrenament amb més
   *  d'un tipus la parteix en trams). Buit → el color de l'activitat. */
  readonly barColor = input<string>('');
  readonly icon    = input.required<string>();
  readonly mascot  = input<Mascot | null>(null);

  readonly title   = input.required<string>();
  /** La xapa del costat del títol, si l'activitat en té («Vinyasa»). */
  readonly subtype = input<string>('');
  /** La nota de l'activitat, com a subtítol. */
  readonly note    = input<string>('');
  readonly stats   = input<ActivityStat[]>([]);
  /** La sensació ja escrita com toca (emoji o número, segons l'usuari). */
  readonly feeling = input<string>('');

  readonly planned     = input(false, { transform: booleanAttribute });
  /** Un pla coronant una pàgina ho diu amb una xapa; al feed en té prou amb
   *  la vora de ratlles i els botons del costat. */
  readonly plannedPill = input(false, { transform: booleanAttribute });

  /** Tocar la targeta fa alguna cosa (desplegar-la, començar un pla). */
  readonly interactive = input(false, { transform: booleanAttribute });
  /** Porta chevron i diu si està desplegada. */
  readonly expandable  = input(false, { transform: booleanAttribute });
  readonly expanded    = input(false, { transform: booleanAttribute });
  /** Tocar-la no desplega res: porta a la pàgina de l'activitat, i el
   *  chevron apunta a la dreta en comptes d'avall. */
  readonly navigable   = input(false, { transform: booleanAttribute });

  readonly feelingEditable = input(false, { transform: booleanAttribute });
  readonly feelingOpen     = input(false, { transform: booleanAttribute });

  readonly cardClick   = output<void>();
  readonly feelingClick = output<void>();
}
