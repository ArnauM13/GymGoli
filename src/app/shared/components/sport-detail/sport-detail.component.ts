import { Component, booleanAttribute, computed, effect, inject, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';

import { RECORD_METRICS, Sport, SportMetricDef, SportMetricOption, SportSession } from '../../../core/models/sport.model';
import { FeelingLevel } from '../../../core/models/workout.model';
import { SportService } from '../../../core/services/sport.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { formatFeeling, sportMetricIcon, sportMetricValue } from '../../utils/workout-card.utils';

/** El que una fila pot canviar de la sessió. Qui rep el retall el fusiona amb
 *  el que la sessió ja porta i el guarda: aquí no es toca res del magatzem.
 *
 *  Una clau amb `undefined` vol dir «treu-ho», no «no ho toquis» — per això hi
 *  són totes explícitament i el retall es fusiona amb un `spread`. */
export type SportSessionPatch =
  Partial<Pick<SportSession, 'subtypeId' | 'duration' | 'feeling' | 'metrics' | 'notes'>>;

/** On escriu una fila editable. `m:<clau>` és una mètrica de l'esport. */
type RowTarget = 'duration' | 'subtype' | 'feeling' | `m:${string}`;

/** El control que una fila porta quan el detall és editable. Cada mena té la
 *  seva forma i totes caben a la dreta de l'etiqueta, que és el que fa que la
 *  fila sigui d'una línia i no d'un bloc. */
type RowEdit =
  | { kind: 'number';  value: number | null; min: number; max: number; step: number }
  | { kind: 'options'; value: string | null; options: SportMetricOption[]; sheet: boolean }
  | { kind: 'feeling'; value: FeelingLevel | null };

/**
 * Una fila del detall: què és, com es diu, què hi diu i què en sabem.
 *
 * `note` és el context que la sessió tota sola no porta ("+18 min que de
 * costum") i `record` corona la millor marca de l'esport — el mateix paper
 * que fa el PR a la sèrie més pesada d'un entrenament. `edit`, quan hi és,
 * la converteix en el formulari d'aquella dada.
 */
interface SportDetailRow {
  key: string;
  icon: string;
  label: string;
  value: string;
  note?: string;
  record?: boolean;
  target?: RowTarget;
  edit?: RowEdit;
}

/** Fins a quantes opcions caben com a segmentat dins la fila. A partir d'aquí
 *  la tria s'obre en una fulla: els 17 estils de ioga eren un mur de pastilles
 *  que feia més alt el formulari que tota la resta de la sessió junta. */
const INLINE_OPTIONS_MAX = 3;

/** Quant es mou la durada per toc. Els minuts van de cinc en cinc perquè és
 *  com es diuen: «una hora i quart», no «seixanta-tres minuts». */
const DURATION_STEP = 5;

/**
 * El desglossament d'una sessió d'esport, que també és com s'edita.
 *
 * És el germà de `app-workout-detail`, i té la mateixa feina: dir què va
 * passar. Un entrenament té estructura pròpia (exercicis, sèries, PRs) i per
 * això el seu detall diu molt; una sessió d'esport és plana — quatre dades —
 * així que aquí la substància ve del que hi posem al costat: com se situa la
 * durada respecte del que sols fer, quines xifres són la teva millor marca, i
 * quantes en portes d'aquest esport.
 *
 * Amb `editable`, la mateixa fila que llegeix la dada la deixa canviar: el
 * valor es torna un control i el canvi surt per `patch`. No hi ha un mode de
 * consulta i un altre d'edició —com al gimnàs, on toques la sèrie allà on
 * és—, i per això el context no desapareix mentre toques la xifra, que és
 * justament quan diu alguna cosa. Abans aquestes dades es pintaven dues
 * vegades, aquí per llegir-les i a `sport-session` per tocar-les, amb dos jocs
 * de classes i dues idees de què és una dada.
 *
 * Els rècords i les mitjanes surten de totes les sessions **d'aquest esport**
 * (`loadSessionsForSport`), mai dels mesos que hi hagi carregats: una fita
 * calculada a mitges és pitjor que no dir-ne res, i per això no surt fins que
 * han arribat. Abans es baixaven les de tots els esports, i qui obria una
 * sessió de córrer s'enduia també cada partit de pàdel que hagués jugat mai.
 */
@Component({
  selector: 'app-sport-detail',
  standalone: true,
  imports: [NgTemplateOutlet],
  template: `
    <div class="sport-detail" [class.sport-detail--compact]="compact()">

      <section class="sdv-block">
        @if (!compact()) { <span class="sdv-block-title">Sessió</span> }
        @if (visibleRows().length) {
          <div class="sdv-rows">
            @for (row of visibleRows(); track row.key) {
              <div class="sdv-row" [class.sdv-row--record]="!compact() && row.record">
                <div class="sdv-row-main">
                  <span class="material-symbols-outlined sdv-icon" aria-hidden="true">{{ row.icon }}</span>
                  <span class="sdv-label">{{ row.label }}</span>
                  @if (row.edit; as ed) {
                    @if (!compact() && row.record) { <span class="sdv-record">RÈCORD</span> }
                    <ng-container [ngTemplateOutlet]="control"
                                  [ngTemplateOutletContext]="{ row: row, ed: ed }" />
                  } @else {
                    <span class="sdv-value">
                      {{ row.value }}
                      @if (!compact() && row.record) { <span class="sdv-record">RÈCORD</span> }
                    </span>
                  }
                </div>
                @if (!compact() && row.note) { <span class="sdv-note">{{ row.note }}</span> }
              </div>
            }
          </div>
          @if (hiddenRowCount(); as more) {
            <span class="sdv-more">+{{ more }} dada{{ more === 1 ? '' : 'es' }} més</span>
          }
        } @else {
          <span class="sdv-none">Cap dada registrada</span>
        }
      </section>

      @if (!compact() && (feelingRow() || editable() || session().notes?.trim())) {
        <section class="sdv-block">
          <span class="sdv-block-title">Com ha anat</span>
          @if (feelingRow(); as row) {
            <div class="sdv-rows">
              <div class="sdv-row">
                <div class="sdv-row-main">
                  <span class="material-symbols-outlined sdv-icon" aria-hidden="true">{{ row.icon }}</span>
                  <span class="sdv-label">{{ row.label }}</span>
                  @if (row.edit; as ed) {
                    <ng-container [ngTemplateOutlet]="control"
                                  [ngTemplateOutletContext]="{ row: row, ed: ed }" />
                  } @else {
                    <span class="sdv-value">{{ row.value }}</span>
                  }
                </div>
                @if (row.note) { <span class="sdv-note">{{ row.note }}</span> }
              </div>
            </div>
          }
          @if (editable()) {
            <!-- La nota es guarda en deixar-la, no lletra a lletra: escriure
                 no és decidir, i cada tecla seria una pujada. -->
            <textarea class="sdv-notes-input" rows="2" placeholder="Afegeix una nota…"
                      aria-label="Nota de la sessió"
                      [value]="session().notes ?? ''"
                      (change)="setNotes($any($event.target).value)"></textarea>
          } @else {
            @if (session().notes?.trim(); as note) {
              <div class="sdv-notes">
                <span class="material-symbols-outlined" aria-hidden="true">notes</span>
                <span class="sdv-notes-text">{{ note }}</span>
              </div>
            }
          }
        </section>
      }

      @if (!compact()) {
        <div class="sdv-footer">
          @for (part of footer(); track part; let i = $index) {
            @if (i > 0) { <span class="sdvf-sep" aria-hidden="true">·</span> }
            <span>{{ part }}</span>
          }
        </div>
      }
    </div>

    <!-- ── La tria llarga ──
         Les opcions que no caben a la fila s'obren en la fulla de sempre, la
         mateixa de tota l'app. -->
    @if (sheetRow(); as row) {
      <div class="bottom-sheet-backdrop" (click)="closeSheet()" aria-hidden="true"></div>
      <div class="sdv-sheet bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="sdv-sheet-title">
        <span class="bottom-sheet-handle" aria-hidden="true"></span>
        <span class="sdv-sheet-title" id="sdv-sheet-title">{{ row.label }}</span>
        <div class="sdv-sheet-opts">
          @for (opt of sheetOptions(row); track opt.value) {
            <button type="button" class="sdv-sheet-opt"
                    [class.sdv-sheet-opt--on]="sheetValue(row) === opt.value"
                    (click)="pickOption(row, opt.value); closeSheet()">
              <span>{{ opt.label }}</span>
              @if (sheetValue(row) === opt.value) {
                <span class="material-symbols-outlined" aria-hidden="true">check</span>
              }
            </button>
          }
          @if (sheetValue(row) !== null) {
            <button type="button" class="sdv-sheet-opt sdv-sheet-opt--clear"
                    (click)="pickOption(row, null); closeSheet()">
              <span>Treure</span>
            </button>
          }
        </div>
      </div>
    }

    <!-- ── Els controls ──
         Un per mena de dada, tots de la mateixa alçada perquè la fila no
         salti d'una a l'altra. -->
    <ng-template #control let-row="row" let-ed="ed">
      @switch (ed.kind) {
        @case ('number') {
          <span class="sdv-ctrl num-input num-input--sm">
            <button type="button" [attr.aria-label]="'Menys ' + row.label" (click)="bump(row, -1)">−</button>
            <input type="number" [attr.aria-label]="row.label" placeholder="—"
                   [value]="ed.value ?? ''" [min]="ed.min" [max]="ed.max" [step]="ed.step"
                   (change)="setNumber(row, $any($event.target).value)"
                   (focus)="$any($event.target).select()">
            <button type="button" [attr.aria-label]="'Més ' + row.label" (click)="bump(row, 1)">+</button>
          </span>
        }
        @case ('options') {
          @if (ed.sheet) {
            <button type="button" class="sdv-ctrl sdv-pick" [class.sdv-pick--empty]="!ed.value"
                    [attr.aria-label]="row.label" (click)="openSheet(row)">
              <span class="sdv-pick-label">{{ row.value || 'Triar' }}</span>
              <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
            </button>
          } @else {
            <span class="sdv-ctrl sdv-seg">
              @for (opt of ed.options; track opt.value) {
                <button type="button" [class.sdv-seg-on]="ed.value === opt.value"
                        [attr.aria-pressed]="ed.value === opt.value"
                        (click)="pickOption(row, ed.value === opt.value ? null : opt.value)">{{ opt.label }}</button>
              }
            </span>
          }
        }
        @case ('feeling') {
          <span class="sdv-ctrl sdv-feel">
            @for (level of feelingLevels; track level) {
              <button type="button" [class.sdv-feel-on]="ed.value === level"
                      [attr.aria-pressed]="ed.value === level"
                      [attr.aria-label]="emojiOf(level)"
                      (click)="pickFeeling(level)">{{ emojiOf(level) }}</button>
            }
          </span>
        }
      }
    </ng-template>
  `,
  styles: [`
    .sport-detail {
      display: flex; flex-direction: column; gap: 12px;
      padding: 10px 12px 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--ac, var(--c-border-2)) 18%, var(--c-border-2));
      background: var(--c-card);
    }

    .sdv-block { display: flex; flex-direction: column; gap: 6px; }
    .sdv-block-title {
      font-size: 10.5px; font-weight: 700; color: var(--c-text-3);
      text-transform: uppercase; letter-spacing: 0.3px;
    }

    .sdv-rows { display: flex; flex-direction: column; gap: 2px; }
    /* La fila és una columna: a dalt la dada (etiqueta a l'esquerra, xifra a
       la dreta) i, si n'hi ha, el context a sota. Abans el context anava dins
       la columna del valor i li estirava l'alçada, així que la fila deixava
       d'estar alineada amb les del costat i el comentari es llegia com un
       tros del número. */
    .sdv-row {
      display: flex; flex-direction: column; gap: 3px;
      padding: 5px 6px; border-radius: 7px; transition: background 0.15s;
      &:nth-child(odd) { background: color-mix(in srgb, var(--ac, var(--c-subtle)) 5%, var(--c-subtle)); }
    }
    /* Amb un control a la dreta la fila pot no cabre d'una tirada —un
       segmentat de tres opcions amb text llarg—, i llavors el control baixa a
       la seva línia en comptes d'esprémer l'etiqueta. */
    .sdv-row-main { display: flex; align-items: center; gap: 7px; min-height: 20px; flex-wrap: wrap; }
    /* La fila d'una millor marca es tenyeix del color de l'esport, com la
       sèrie més pesada d'un entrenament. */
    .sdv-row--record {
      background: color-mix(in srgb, var(--ac, var(--c-brand)) 10%, transparent);
      &:nth-child(odd) { background: color-mix(in srgb, var(--ac, var(--c-brand)) 10%, transparent); }
      .sdv-value { color: color-mix(in srgb, var(--ac, var(--c-brand)) 75%, var(--c-text)); }
    }
    .sdv-icon {
      flex-shrink: 0; font-size: 14px;
      color: color-mix(in srgb, var(--ac, var(--c-text-3)) 60%, var(--c-text-3));
    }
    .sdv-label {
      flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sdv-value {
      flex-shrink: 0; max-width: 62%;
      display: inline-flex; align-items: center; gap: 5px; text-align: right;
      font-size: 13px; font-weight: 700; color: var(--c-text); line-height: 1.3;
    }
    .sdv-record {
      flex-shrink: 0; padding: 1px 6px; border-radius: 6px; line-height: 1.3;
      font-size: 9px; font-weight: 800; letter-spacing: 0.3px;
      color: #b88500; background: rgba(255, 193, 7, 0.18);
    }
    /* El context és un subcomentari de la dada: línia pròpia, sagnat sota
       l'etiqueta i amb un filet a l'esquerra que diu de qui penja. */
    .sdv-note {
      margin-left: 21px; padding: 1px 0 1px 8px;
      border-left: 2px solid color-mix(in srgb, var(--ac, var(--c-border)) 40%, var(--c-border-2));
      font-size: 11px; font-weight: 600; color: var(--c-text-3); line-height: 1.45;
    }
    .sdv-none { padding-left: 6px; font-size: 12px; color: var(--c-text-3); font-style: italic; }

    /* ── Els controls ──
       Tots 28px d'alt i alineats a la dreta de la fila: el que canvia d'una
       dada a l'altra és la forma de dir-la, no la mida de la línia. */
    .sdv-ctrl { flex-shrink: 0; margin-left: auto; }
    .sdv-ctrl.num-input { width: 104px; }

    .sdv-seg {
      display: inline-flex; height: 28px; border-radius: 9px; overflow: hidden;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      button {
        padding: 0 9px; border: none; border-left: 1.5px solid var(--c-border-2);
        background: transparent; color: var(--c-text-2);
        font-size: 12px; font-weight: 600; font-family: inherit;
        cursor: pointer; touch-action: manipulation; transition: background 0.15s, color 0.15s;
        &:first-child { border-left: none; }
        &:hover:not(.sdv-seg-on) { background: var(--c-hover); }
      }
      .sdv-seg-on {
        background: var(--ac, var(--c-brand)); color: #fff;
        border-left-color: var(--ac, var(--c-brand));
      }
    }

    .sdv-pick {
      display: inline-flex; align-items: center; gap: 2px; max-width: 62%;
      height: 28px; padding: 0 6px 0 10px; border-radius: 9px;
      border: 1.5px solid var(--c-border); background: var(--c-card);
      color: var(--c-text); font-size: 12.5px; font-weight: 700; font-family: inherit;
      cursor: pointer; touch-action: manipulation; transition: border-color 0.15s;
      .material-symbols-outlined { font-size: 16px; color: var(--c-text-3); }
      &:hover { border-color: var(--ac, var(--c-brand)); }
    }
    .sdv-pick-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sdv-pick--empty { border-style: dashed; color: var(--c-text-3); font-weight: 600; }

    .sdv-feel {
      display: inline-flex; gap: 4px;
      button {
        width: 30px; height: 28px; border-radius: 8px;
        border: 1.5px solid transparent; background: var(--c-subtle);
        font-size: 15px; cursor: pointer; touch-action: manipulation; transition: all 0.15s;
        &:hover:not(.sdv-feel-on) { background: var(--c-hover); }
      }
      .sdv-feel-on {
        border-color: var(--ac, var(--c-brand));
        background: color-mix(in srgb, var(--ac, var(--c-brand)) 12%, var(--c-card));
      }
    }

    .sdv-notes-input {
      width: 100%; box-sizing: border-box;
      padding: 8px 10px; border-radius: 9px;
      border: 1.5px solid var(--c-border-2); background: var(--c-subtle);
      font-size: 12px; font-family: inherit; color: var(--c-text); line-height: 1.45;
      resize: none; outline: none; transition: border-color 0.15s;
      &:focus { border-color: var(--ac, var(--c-brand)); background: var(--c-card); }
      &::placeholder { color: var(--c-text-3); font-style: italic; }
    }

    /* ── La fulla de la tria llarga ──
       El continent és el de tota l'app (styles.scss); d'aquí surt el que hi
       va dins. */
    .sdv-sheet { padding: 14px 12px 20px; }
    .sdv-sheet-title {
      display: block; margin: 0 4px 10px;
      font-size: 15px; font-weight: 800; color: var(--c-text);
    }
    .sdv-sheet-opts { display: flex; flex-direction: column; gap: 2px; }
    .sdv-sheet-opt {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 10px;
      border: none; background: transparent; text-align: left;
      color: var(--c-text); font-size: 14px; font-weight: 600; font-family: inherit;
      cursor: pointer; touch-action: manipulation; transition: background 0.12s;
      .material-symbols-outlined { font-size: 19px; color: var(--ac, var(--c-brand)); }
      &:hover { background: var(--c-subtle); }
    }
    .sdv-sheet-opt--on {
      background: color-mix(in srgb, var(--ac, var(--c-brand)) 9%, var(--c-card));
      color: color-mix(in srgb, var(--ac, var(--c-brand)) 70%, var(--c-text));
    }
    .sdv-sheet-opt--clear { color: var(--c-text-3); font-weight: 500; }

    /* El comentari de la sessió, amb la mateixa forma de subcomentari que les
       notes de context: filet a l'esquerra i veu baixa. */
    .sdv-notes {
      display: flex; align-items: flex-start; gap: 7px;
      padding: 8px 10px; border-radius: 8px; background: var(--c-subtle);
      border-left: 3px solid color-mix(in srgb, var(--ac, var(--c-border)) 45%, var(--c-border-2));
      font-size: 12px; color: var(--c-text-2); line-height: 1.45;
      .material-symbols-outlined { font-size: 15px; color: var(--c-text-3); flex-shrink: 0; margin-top: 1px; }
    }
    .sdv-notes-text { flex: 1; min-width: 0; font-style: italic; overflow-wrap: anywhere; }

    /* El que no hi cap, comptat: la ullada diu quantes dades s'ha deixat i
       la pàgina de la sessió les diu totes. */
    .sdv-more {
      padding-left: 6px; font-size: 11px; font-weight: 600; color: var(--c-text-3);
    }

    /* Plegat dins una targeta del feed el detall és una ullada: només les
       primeres dades de la sessió, sense titolets, ni rècords, ni context, ni
       la sensació i la nota (que ja són a la targeta), ni peu. Tot això té la
       seva pàgina, que és on s'hi entra a fons. */
    .sport-detail--compact {
      gap: 8px; padding: 8px 12px 10px 14px;
      .sdv-block { gap: 4px; }
    }

    .sdv-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: wrap;
      padding-top: 2px; font-size: 11px; font-weight: 600; color: var(--c-text-3);
      .sdvf-sep { color: var(--c-border-2); }
    }
  `],
})
export class SportDetailComponent {
  private settingsService = inject(UserSettingsService);
  private sportService    = inject(SportService);

  readonly sport   = input.required<Sport>();
  readonly session = input.required<SportSession>();

  /** Plegat dins una targeta del feed: només les primeres dades de la sessió,
   *  sense titolets, ni rècords, ni el context de l'historial, ni el peu. El
   *  desplegable és una ullada al que ja diu la targeta; qui vulgui la
   *  lectura sencera obre la sessió. És la mateixa regla que a
   *  `app-workout-detail`: una activitat es llegeix igual sigui del gimnàs o
   *  d'un esport. */
  readonly compact = input(false, { transform: booleanAttribute });

  /** Les files deixen tocar el que diuen. Les dades buides també hi surten
   *  —una mètrica sense valor és un lloc on posar-n'hi un—, cosa que llegint
   *  no passa: allà una dada que no hi és no s'inventa una fila. */
  readonly editable = input(false, { transform: booleanAttribute });

  /** Un pla del futur encara no s'ha viscut: la sensació no hi té res a dir,
   *  i la fila no hi surt. Qui obre la sessió sap si el dia ha arribat. */
  readonly feelingEditable = input(true, { transform: booleanAttribute });

  /** El que s'ha canviat, perquè qui mana sobre la sessió ho guardi. */
  readonly patch = output<SportSessionPatch>();

  /** Quina fila té la fulla de tria oberta. */
  private readonly sheetKey = signal<string | null>(null);

  readonly feelingLevels: FeelingLevel[] = [1, 2, 3, 4, 5];

  /** Quantes dades caben a una ullada abans que el desplegable deixi de
   *  ser-ho. La mateixa xifra per a un entrenament i per a un esport. */
  static readonly COMPACT_ROWS = 5;

  /** Les dades que es pinten: totes a la pàgina, les primeres al desplegable. */
  readonly visibleRows = computed((): SportDetailRow[] =>
    this.compact() ? this.sessionRows().slice(0, SportDetailComponent.COMPACT_ROWS) : this.sessionRows());

  readonly hiddenRowCount = computed(() => this.sessionRows().length - this.visibleRows().length);

  readonly sheetRow = computed((): SportDetailRow | null => {
    const key = this.sheetKey();
    return key ? this.sessionRows().find(r => r.key === key) ?? null : null;
  });

  constructor() {
    // L'historial de l'esport només fa falta per al que només diu la pàgina:
    // rècords, mitjanes i quantes sessions en portes. La ullada del feed no
    // en diu res, així que tampoc no el demana —seria baixar-se totes les
    // sessions d'un esport per pintar dues files que la targeta ja tenia.
    // Quan sí que cal, és una crida i prou: la resta de vegades es queda a la
    // guarda de «ja el tinc».
    effect(() => {
      if (this.compact()) return;
      void this.sportService.loadSessionsForSport(this.sport().id);
    });
  }

  /** Les sessions fetes d'aquest esport, l'actual a part: el llistó contra el
   *  qual es mesura. Buit mentre l'historial no hi sigui tot. */
  private readonly history = computed((): SportSession[] => {
    const sportId = this.sport().id;
    if (!this.sportService.sportHistoryLoaded(sportId)) return [];
    const own     = this.session().id;
    return this.sportService.sessions().filter(s => s.sportId === sportId && s.id !== own);
  });

  /** Quantes sessions d'aquest esport porta el compte, aquesta inclosa. */
  private readonly sessionNumber = computed(() => {
    if (!this.sportService.sportHistoryLoaded(this.sport().id)) return 0;
    const date = this.session().date;
    // Es compta per data, no pel total: una sessió de fa mig any és la 12a
    // d'aleshores, no la 30a d'ara.
    return this.history().filter(s => s.date <= date).length + 1;
  });

  /** El que sols fer en aquest esport, per situar-hi la sessió. */
  private readonly avgDuration = computed((): number | null => {
    const durations = this.history().map(s => s.duration).filter((d): d is number => !!d);
    if (durations.length < 2) return null;
    return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
  });

  /** Les dades de la sessió: què ha estat, quant ha durat i les xifres pròpies
   *  de l'esport, cadascuna amb el que en sabem.
   *
   *  Llegint, una dada que no consta no fa fila. Editant sí: la fila buida és
   *  on es posa el valor, i per això surten totes les que l'esport defineix. */
  readonly sessionRows = computed((): SportDetailRow[] => {
    const sport   = this.sport();
    const session = this.session();
    const edit    = this.editable();
    const rows: SportDetailRow[] = [];

    const sub = session.subtypeId ? sport.subtypes.find(s => s.id === session.subtypeId) : undefined;
    if (sub || (edit && sport.subtypes.length)) {
      rows.push({
        key: 'subtype', icon: 'category', label: 'Subtipus', value: sub?.name ?? '',
        target: 'subtype',
        edit: edit
          ? {
              kind: 'options', value: session.subtypeId ?? null,
              options: sport.subtypes.map(s => ({ value: s.id, label: s.name })),
              sheet: sport.subtypes.length > INLINE_OPTIONS_MAX,
            }
          : undefined,
      });
    }

    if (session.duration || edit) {
      rows.push({
        key: 'duration', icon: 'timer', label: 'Durada',
        value: session.duration ? `${session.duration} min` : '',
        note: session.duration ? this._durationNote(session.duration) : undefined,
        record: this._isRecord(session.duration, this.history().map(s => s.duration)),
        target: 'duration',
        edit: edit
          ? { kind: 'number', value: session.duration ?? null, min: 0, max: 600, step: DURATION_STEP }
          : undefined,
      });
    }

    // Les mètriques van en l'ordre que l'esport les té definides: és l'ordre
    // amb què s'omplen en registrar la sessió.
    const metrics = session.metrics ?? {};
    for (const def of sport.metricDefs ?? []) {
      const raw   = metrics[def.key];
      const value = sportMetricValue(def, raw);
      if (value === null && !edit) continue;
      rows.push({
        key: `m:${def.key}`, icon: sportMetricIcon(def), label: def.label, value: value ?? '',
        record: this._isMetricRecord(def, raw),
        target: `m:${def.key}`,
        edit: edit ? this._metricEdit(def, raw) : undefined,
      });
    }
    return rows;
  });

  /** Com ha anat, si consta: la sensació d'aquell dia i com se sol trobar en
   *  aquest esport. Editant hi és encara que no consti —és la pregunta, no la
   *  resposta—, tret d'un pla que encara no s'ha viscut. */
  readonly feelingRow = computed((): SportDetailRow | null => {
    const feeling = this.session().feeling;
    const edit    = this.editable() && this.feelingEditable();
    if (!feeling && !edit) return null;

    const scale = this.settingsService.difficultyScale();
    const felt  = this.history().map(s => s.feeling).filter((f): f is FeelingLevel => !!f);
    const avg   = felt.length >= 2
      ? formatFeeling(Math.round(felt.reduce((a, b) => a + b, 0) / felt.length) as FeelingLevel, scale)
      : null;
    return {
      key: 'feeling', icon: 'mood', label: 'Sensació',
      value: feeling ? formatFeeling(feeling, scale) : '',
      note: avg ? `De costum ${avg}` : undefined,
      target: 'feeling',
      edit: edit ? { kind: 'feeling', value: feeling ?? null } : undefined,
    };
  });

  /** El peu situa la sessió dins l'esport: quantes en portes i, si encara no
   *  s'ha fet, que és un pla. */
  readonly footer = computed((): string[] => {
    const session = this.session();
    const parts: string[] = [];
    if (session.status === 'planned') parts.push('Planificat');

    // "sessió" és femení: 1a, 2a, 12a — l'ordinal no canvia de forma.
    const n = this.sessionNumber();
    parts.push(n > 0 ? `${n}a sessió de ${this.sport().name}` : this.sport().name);

    if (session.duration) parts.push(`${session.duration} min`);
    return parts;
  });

  emojiOf(level: FeelingLevel): string {
    return formatFeeling(level, this.settingsService.difficultyScale());
  }

  // ── Editar ────────────────────────────────────────────────────────────────

  openSheet(row: SportDetailRow): void { this.sheetKey.set(row.key); }
  closeSheet(): void { this.sheetKey.set(null); }

  sheetOptions(row: SportDetailRow): SportMetricOption[] {
    return row.edit?.kind === 'options' ? row.edit.options : [];
  }

  sheetValue(row: SportDetailRow): string | null {
    return row.edit?.kind === 'options' ? row.edit.value : null;
  }

  /** Un toc al `−` o al `+`. Sense valor, el primer toc parteix del mínim:
   *  pujar des de no-res és començar per baix, no per zero. */
  bump(row: SportDetailRow, delta: number): void {
    const ed = row.edit;
    if (ed?.kind !== 'number') return;
    const from = ed.value ?? ed.min;
    const next = ed.value === null && delta > 0 ? Math.max(ed.min, ed.step) : from + delta * ed.step;
    this._writeNumber(row, Math.max(ed.min, Math.min(ed.max, Math.round(next * 100) / 100)));
  }

  /** El que s'ha escrit a mà. Buit vol dir treure-ho: és l'única manera de
   *  desdir-se d'una xifra un cop posada. */
  setNumber(row: SportDetailRow, raw: string): void {
    const ed = row.edit;
    if (ed?.kind !== 'number') return;
    const text = raw.trim();
    if (!text) { this._writeNumber(row, null); return; }
    const n = Number(text);
    if (!Number.isFinite(n)) return;
    this._writeNumber(row, Math.max(ed.min, Math.min(ed.max, n)));
  }

  pickOption(row: SportDetailRow, value: string | null): void {
    if (row.target === 'subtype') { this.patch.emit({ subtypeId: value ?? undefined }); return; }
    this._writeMetric(row, value ?? undefined);
  }

  /** Tornar a tocar la sensació que ja hi era la treu: és la manera de dir
   *  que no en vols dir res. */
  pickFeeling(level: FeelingLevel): void {
    const current = this.session().feeling;
    this.patch.emit({ feeling: current === level ? undefined : level });
  }

  setNotes(raw: string): void {
    this.patch.emit({ notes: raw.trim() || undefined });
  }

  /** Una xifra a zero és una xifra (zero gols és un resultat); la durada no,
   *  que zero minuts és no haver-hi posat res. */
  private _writeNumber(row: SportDetailRow, value: number | null): void {
    if (row.target === 'duration') { this.patch.emit({ duration: value || undefined }); return; }
    this._writeMetric(row, value ?? undefined);
  }

  private _writeMetric(row: SportDetailRow, value: string | number | undefined): void {
    const key = row.target?.startsWith('m:') ? row.target.slice(2) : null;
    if (!key) return;
    const metrics = { ...(this.session().metrics ?? {}) };
    if (value === undefined) delete metrics[key]; else metrics[key] = value;
    this.patch.emit({ metrics: Object.keys(metrics).length ? metrics : undefined });
  }

  private _metricEdit(def: SportMetricDef, raw: string | number | undefined): RowEdit {
    if (def.type === 'select') {
      const options = def.options ?? [];
      return {
        kind: 'options',
        value: typeof raw === 'string' ? raw : null,
        options,
        sheet: options.length > INLINE_OPTIONS_MAX,
      };
    }
    return {
      kind: 'number',
      value: typeof raw === 'number' ? raw : null,
      min:  def.min  ?? 0,
      max:  def.max  ?? 9999,
      step: def.step ?? 1,
    };
  }

  private _durationNote(duration: number): string | undefined {
    const avg = this.avgDuration();
    if (avg === null) return undefined;
    const diff = duration - avg;
    // Cinc minuts amunt o avall no és res a dir: la sessió és com sempre.
    if (Math.abs(diff) < 5) return 'Com de costum';
    return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} min que de costum`;
  }

  private _isMetricRecord(def: SportMetricDef, value: string | number | undefined): boolean {
    if (def.type !== 'number' || !RECORD_METRICS.includes(def.key)) return false;
    return this._isRecord(value, this.history().map(s => s.metrics?.[def.key]));
  }

  /** Una marca és rècord si cap altra sessió de l'esport no la supera. Amb una
   *  sola sessió no hi ha res a batre, i per això no es corona la primera. */
  private _isRecord(value: string | number | undefined, previous: (string | number | undefined)[]): boolean {
    if (typeof value !== 'number') return false;
    const others = previous.filter((v): v is number => typeof v === 'number');
    if (others.length === 0) return false;
    return others.every(v => v < value);
  }
}
