import { Component, computed, inject, input } from '@angular/core';

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
 * Els rècords i les mitjanes surten de l'historial sencer (`loadAllSessions`),
 * mai dels mesos que hi hagi carregats: una fita calculada a mitges és pitjor
 * que no dir-ne res, i per això no surt fins que l'historial hi és tot.
 */
@Component({
  selector: 'app-sport-detail',
  standalone: true,
  template: `
    <div class="sport-detail">

      <section class="sdv-block">
        <span class="sdv-block-title">Sessió</span>
        @if (sessionRows().length) {
          <div class="sdv-rows">
            @for (row of sessionRows(); track row.key) {
              <div class="sdv-row" [class.sdv-row--record]="row.record">
                <span class="material-symbols-outlined sdv-icon" aria-hidden="true">{{ row.icon }}</span>
                <span class="sdv-label">{{ row.label }}</span>
                <span class="sdv-value-col">
                  <span class="sdv-value">
                    {{ row.value }}
                    @if (row.record) { <span class="sdv-record">RÈCORD</span> }
                  </span>
                  @if (row.note; as note) { <span class="sdv-note">{{ note }}</span> }
                </span>
              </div>
            }
          </div>
        } @else {
          <span class="sdv-none">Cap dada registrada</span>
        }
      </section>

      @if (feelingRow() || session().notes?.trim()) {
        <section class="sdv-block">
          <span class="sdv-block-title">Com ha anat</span>
          @if (feelingRow(); as row) {
            <div class="sdv-rows">
              <div class="sdv-row">
                <span class="material-symbols-outlined sdv-icon" aria-hidden="true">{{ row.icon }}</span>
                <span class="sdv-label">{{ row.label }}</span>
                <span class="sdv-value-col">
                  <span class="sdv-value">{{ row.value }}</span>
                  @if (row.note; as note) { <span class="sdv-note">{{ note }}</span> }
                </span>
              </div>
            </div>
          }
          @if (session().notes?.trim(); as note) {
            <div class="sdv-notes">
              <span class="material-symbols-outlined" aria-hidden="true">notes</span>
              {{ note }}
            </div>
          }
        </section>
      }

      <div class="sdv-footer">
        @for (part of footer(); track part; let i = $index) {
          @if (i > 0) { <span class="sdvf-sep" aria-hidden="true">·</span> }
          <span>{{ part }}</span>
        }
      </div>
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
    /* Etiqueta a l'esquerra i valor a la dreta: la columna de valors queda
       alineada i la sessió es llegeix d'una passada vertical. */
    .sdv-row {
      display: flex; align-items: baseline; gap: 7px;
      padding: 5px 6px; border-radius: 7px; transition: background 0.15s;
      &:nth-child(odd) { background: color-mix(in srgb, var(--ac, var(--c-subtle)) 5%, var(--c-subtle)); }
    }
    /* La fila d'una millor marca es tenyeix del color de l'esport, com la
       sèrie més pesada d'un entrenament. */
    .sdv-row--record {
      background: color-mix(in srgb, var(--ac, var(--c-brand)) 10%, transparent);
      &:nth-child(odd) { background: color-mix(in srgb, var(--ac, var(--c-brand)) 10%, transparent); }
      .sdv-value { color: color-mix(in srgb, var(--ac, var(--c-brand)) 75%, var(--c-text)); }
    }
    .sdv-icon {
      flex-shrink: 0; align-self: center; font-size: 14px;
      color: color-mix(in srgb, var(--ac, var(--c-text-3)) 60%, var(--c-text-3));
    }
    .sdv-label {
      flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sdv-value-col {
      flex-shrink: 0; max-width: 62%;
      display: flex; flex-direction: column; align-items: flex-end; gap: 1px;
    }
    .sdv-value {
      display: inline-flex; align-items: baseline; gap: 5px; text-align: right;
      font-size: 13px; font-weight: 700; color: var(--c-text); line-height: 1.3;
    }
    .sdv-record {
      flex-shrink: 0; padding: 1px 6px; border-radius: 6px; line-height: 1.3;
      font-size: 9px; font-weight: 800; letter-spacing: 0.3px;
      color: #b88500; background: rgba(255, 193, 7, 0.18);
    }
    /* El context va sota el valor i en veu baixa: hi és per a qui s'hi fixa,
       no per competir amb la xifra. */
    .sdv-note { font-size: 10.5px; font-weight: 600; color: var(--c-text-3); line-height: 1.3; }
    .sdv-none { padding-left: 6px; font-size: 12px; color: var(--c-text-3); font-style: italic; }

    .sdv-notes {
      display: flex; align-items: flex-start; gap: 6px;
      padding: 8px 10px; border-radius: 8px; background: var(--c-subtle);
      font-size: 12px; color: var(--c-text-2); font-style: italic; line-height: 1.4;
      .material-symbols-outlined { font-size: 15px; color: var(--c-text-3); flex-shrink: 0; margin-top: 1px; }
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

  constructor() {
    // El detall només es dibuixa quan algú desplega la targeta, i llavors sí
    // que val la pena tenir l'historial sencer: és una crida i prou, que la
    // resta de vegades es queda al primer `if`.
    this.sportService.loadAllSessions();
  }

  /** Les sessions fetes d'aquest esport, l'actual a part: el llistó contra el
   *  qual es mesura. Buit mentre l'historial no hi sigui tot. */
  private readonly history = computed((): SportSession[] => {
    if (!this.sportService.allSessionsLoaded()) return [];
    const sportId = this.sport().id;
    const own     = this.session().id;
    return this.sportService.sessions().filter(s => s.sportId === sportId && s.id !== own);
  });

  /** Quantes sessions d'aquest esport porta el compte, aquesta inclosa. */
  private readonly sessionNumber = computed(() => {
    if (!this.sportService.allSessionsLoaded()) return 0;
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
