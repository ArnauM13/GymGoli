import { Component, booleanAttribute, computed, effect, inject, input } from '@angular/core';

import { RECORD_METRICS, Sport, SportMetricDef, SportSession } from '../../../core/models/sport.model';
import { FeelingLevel } from '../../../core/models/workout.model';
import { SportService } from '../../../core/services/sport.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { formatFeeling, sportMetricIcon, sportMetricValue } from '../../utils/workout-card.utils';

/**
 * Una fila del detall: què és, com es diu, què hi diu i què en sabem.
 *
 * `note` és el context que la sessió tota sola no porta ("+18 min que de
 * costum") i `record` corona la millor marca de l'esport — el mateix paper
 * que fa el PR a la sèrie més pesada d'un entrenament.
 */
interface SportDetailRow {
  key: string;
  icon: string;
  label: string;
  value: string;
  note?: string;
  record?: boolean;
}

/**
 * El desglossament d'una sessió d'esport.
 *
 * És el germà de `app-workout-detail`, i té la mateixa feina: llegir-se, no
 * editar-se. Un entrenament té estructura pròpia (exercicis, sèries, PRs) i
 * per això el seu detall diu molt; una sessió d'esport és plana — quatre
 * dades — així que aquí la substància ve del que hi posem al costat: com se
 * situa la durada respecte del que sols fer, quines xifres són la teva millor
 * marca, i quantes en portes d'aquest esport.
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
                  <span class="sdv-value">
                    {{ row.value }}
                    @if (!compact() && row.record) { <span class="sdv-record">RÈCORD</span> }
                  </span>
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

      @if (!compact() && (feelingRow() || session().notes?.trim())) {
        <section class="sdv-block">
          @if (!compact()) { <span class="sdv-block-title">Com ha anat</span> }
          @if (feelingRow(); as row) {
            <div class="sdv-rows">
              <div class="sdv-row">
                <div class="sdv-row-main">
                  <span class="material-symbols-outlined sdv-icon" aria-hidden="true">{{ row.icon }}</span>
                  <span class="sdv-label">{{ row.label }}</span>
                  <span class="sdv-value">{{ row.value }}</span>
                </div>
                @if (!compact() && row.note) { <span class="sdv-note">{{ row.note }}</span> }
              </div>
            </div>
          }
          @if (session().notes?.trim(); as note) {
            <div class="sdv-notes">
              <span class="material-symbols-outlined" aria-hidden="true">notes</span>
              <span class="sdv-notes-text">{{ note }}</span>
            </div>
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
    .sdv-row-main { display: flex; align-items: center; gap: 7px; min-height: 20px; }
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

  /** Quantes dades caben a una ullada abans que el desplegable deixi de
   *  ser-ho. La mateixa xifra per a un entrenament i per a un esport. */
  static readonly COMPACT_ROWS = 5;

  /** Les dades que es pinten: totes a la pàgina, les primeres al desplegable. */
  readonly visibleRows = computed((): SportDetailRow[] =>
    this.compact() ? this.sessionRows().slice(0, SportDetailComponent.COMPACT_ROWS) : this.sessionRows());

  readonly hiddenRowCount = computed(() => this.sessionRows().length - this.visibleRows().length);

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
   *  de l'esport, cadascuna amb el que en sabem. */
  readonly sessionRows = computed((): SportDetailRow[] => {
    const sport   = this.sport();
    const session = this.session();
    const rows: SportDetailRow[] = [];

    if (session.subtypeId) {
      const sub = sport.subtypes.find(s => s.id === session.subtypeId);
      if (sub) rows.push({ key: 'subtype', icon: 'category', label: 'Subtipus', value: sub.name });
    }

    if (session.duration) {
      rows.push({
        key: 'duration', icon: 'timer', label: 'Durada',
        value: `${session.duration} min`,
        note: this._durationNote(session.duration),
        record: this._isRecord(session.duration, this.history().map(s => s.duration)),
      });
    }

    // Les mètriques van en l'ordre que l'esport les té definides: és l'ordre
    // amb què s'omplen en registrar la sessió.
    const metrics = session.metrics ?? {};
    for (const def of sport.metricDefs ?? []) {
      const value = sportMetricValue(def, metrics[def.key]);
      if (value === null) continue;
      rows.push({
        key: `m:${def.key}`, icon: sportMetricIcon(def), label: def.label, value,
        record: this._isMetricRecord(def, metrics[def.key]),
      });
    }
    return rows;
  });

  /** Com ha anat, si consta: la sensació d'aquell dia i com se sol trobar en
   *  aquest esport. */
  readonly feelingRow = computed((): SportDetailRow | null => {
    const feeling = this.session().feeling;
    if (!feeling) return null;
    const scale = this.settingsService.difficultyScale();
    const felt  = this.history().map(s => s.feeling).filter((f): f is FeelingLevel => !!f);
    const avg   = felt.length >= 2
      ? formatFeeling(Math.round(felt.reduce((a, b) => a + b, 0) / felt.length) as FeelingLevel, scale)
      : null;
    return {
      key: 'feeling', icon: 'mood', label: 'Sensació',
      value: formatFeeling(feeling, scale),
      note: avg ? `De costum ${avg}` : undefined,
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
