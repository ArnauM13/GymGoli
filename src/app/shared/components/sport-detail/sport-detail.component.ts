import { Component, computed, inject, input } from '@angular/core';

import { Sport, SportSession } from '../../../core/models/sport.model';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { formatFeeling, sportMetricIcon, sportMetricValue } from '../../utils/workout-card.utils';

/** Una fila del detall: què és, com es diu i què hi diu. */
interface SportDetailRow { key: string; icon: string; label: string; value: string; }

/**
 * El desglossament d'una sessió d'esport: subtipus, durada, mètriques,
 * sensació i notes.
 *
 * És el germà de `app-workout-detail` — la targeta d'activitat es desplega
 * igual tant si és gimnàs com esport, i el que hi surt a dins és una lectura,
 * no un formulari. Editar-la és un pas més, amb el seu botó.
 */
@Component({
  selector: 'app-sport-detail',
  standalone: true,
  template: `
    <div class="sport-detail">
      @if (rows().length) {
        <div class="sdv-rows">
          @for (row of rows(); track row.key) {
            <div class="sdv-row">
              <span class="material-symbols-outlined sdv-icon" aria-hidden="true">{{ row.icon }}</span>
              <span class="sdv-label">{{ row.label }}</span>
              <span class="sdv-value">{{ row.value }}</span>
            </div>
          }
        </div>
      } @else {
        <span class="sdv-none">Cap dada registrada</span>
      }

      @if (session().notes?.trim(); as note) {
        <div class="sdv-notes">
          <span class="material-symbols-outlined" aria-hidden="true">notes</span>
          {{ note }}
        </div>
      }

      @if (footer(); as parts) {
        <div class="sdv-footer">
          @for (part of parts; track part; let i = $index) {
            @if (i > 0) { <span class="sdvf-sep" aria-hidden="true">·</span> }
            <span>{{ part }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .sport-detail {
      display: flex; flex-direction: column; gap: 8px;
      padding: 10px 12px 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--ac, var(--c-border-2)) 18%, var(--c-border-2));
      background: var(--c-card);
    }

    .sdv-rows { display: flex; flex-direction: column; gap: 2px; }
    /* Etiqueta a l'esquerra i valor a la dreta: la columna de valors queda
       alineada i la sessió es llegeix d'una passada vertical. */
    .sdv-row {
      display: flex; align-items: baseline; gap: 7px;
      padding: 5px 6px; border-radius: 7px;
      &:nth-child(odd) { background: color-mix(in srgb, var(--ac, var(--c-subtle)) 5%, var(--c-subtle)); }
    }
    .sdv-icon {
      flex-shrink: 0; align-self: center; font-size: 14px;
      color: color-mix(in srgb, var(--ac, var(--c-text-3)) 60%, var(--c-text-3));
    }
    .sdv-label {
      flex: 1; min-width: 0; font-size: 12px; font-weight: 600; color: var(--c-text-2);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .sdv-value {
      flex-shrink: 0; max-width: 60%; text-align: right;
      font-size: 13px; font-weight: 700; color: var(--c-text); line-height: 1.3;
    }
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

  readonly sport   = input.required<Sport>();
  readonly session = input.required<SportSession>();

  /** Tot el que la sessió porta a dins, en l'ordre que es llegeix: primer què
   *  ha estat (subtipus), després quant (durada), després les dades pròpies de
   *  l'esport i, al final, com ha anat. */
  readonly rows = computed((): SportDetailRow[] => {
    const sport   = this.sport();
    const session = this.session();
    const rows: SportDetailRow[] = [];

    if (session.subtypeId) {
      const sub = sport.subtypes.find(s => s.id === session.subtypeId);
      if (sub) rows.push({ key: 'subtype', icon: 'category', label: 'Subtipus', value: sub.name });
    }
    if (session.duration) {
      rows.push({ key: 'duration', icon: 'timer', label: 'Durada', value: `${session.duration} min` });
    }

    // Les mètriques van en l'ordre que l'esport les té definides: és l'ordre
    // amb què l'usuari les omple quan registra la sessió.
    const metrics = session.metrics ?? {};
    for (const def of sport.metricDefs ?? []) {
      const value = sportMetricValue(def, metrics[def.key]);
      if (value === null) continue;
      rows.push({ key: `m:${def.key}`, icon: sportMetricIcon(def), label: def.label, value });
    }

    if (session.feeling) {
      rows.push({
        key: 'feeling', icon: 'mood', label: 'Sensació',
        value: formatFeeling(session.feeling, this.settingsService.difficultyScale()),
      });
    }
    return rows;
  });

  /** El resum de sota, com el peu d'un entrenament: el que s'ha fet, en curt.
   *  Un pla encara no s'ha fet, i el peu ho diu abans que res. */
  readonly footer = computed((): string[] | null => {
    const session = this.session();
    const parts: string[] = [];
    if (session.status === 'planned') parts.push('Planificat');
    if (session.duration) parts.push(`${session.duration} min`);

    const data = this.rows().filter(r => r.key.startsWith('m:')).length;
    if (data) parts.push(`${data} ${data === 1 ? 'dada' : 'dades'}`);

    return parts.length ? parts : null;
  });
}
