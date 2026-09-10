import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { FitnessInsight, INSIGHT_LEVEL } from '../../core/models/insight.model';
import { MASCOTS, MascotMeta } from '../../core/models/mascot.model';
import { FitnessMetricsService } from '../../core/services/fitness-metrics.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import {
  InsightDetailSheetComponent,
} from '../../shared/components/fitness-insights/insight-detail-sheet.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

/** Les famílies, en l'ordre en què manen. El text de sota diu què hi busques,
 *  que és el que fa que la llista es pugui recórrer sense llegir-la tota. */
const FAMILIES: { level: number; label: string; hint: string }[] = [
  { level: INSIGHT_LEVEL.objectiu,  label: 'Objectiu',  hint: 'El que hi ha en joc més enllà de la setmana en curs' },
  { level: INSIGHT_LEVEL.ruptura,   label: 'Ruptura',   hint: 'Un canvi prou gran per voler saber-lo ara' },
  { level: INSIGHT_LEVEL.progres,   label: 'Progrés',   hint: 'Millores que no es veuen des d\'una targeta' },
  { level: INSIGHT_LEVEL.tendencia, label: 'Tendència', hint: 'Cap on va el teu ritme' },
  { level: INSIGHT_LEVEL.patro,     label: 'Patró',     hint: 'Com és realment la teva rutina' },
];

interface InsightFamily {
  level: number;
  label: string;
  hint: string;
  insights: FitnessInsight[];
}

/**
 * Tots els insights que avui són certs, per famílies.
 *
 * A Inici en surt **un**, el que toca avui, i es tanca. Aquí hi són tots i no
 * se'n tanca cap: és el lloc on s'hi va a mirar, no una cosa que t'interromp.
 * Per això aquesta pàgina no apunta res —ni «mostrat avui» ni fites
 * celebrades—: veure una llista no és que t'ho hagin dit.
 */
@Component({
  selector: 'app-progress-insights',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, InsightDetailSheetComponent],
  template: `
    <div class="page">
      <app-page-header title="Insights" [showBack]="true" backFallback="/charts" />

      @if (!metricsEnabled()) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon" aria-hidden="true">visibility_off</span>
            <p>Tens els insights desactivats. Es poden tornar a engegar des del Perfil.</p>
            <div class="empty-actions">
              <a class="btn-primary" routerLink="/settings" [queryParams]="{ section: 'advanced' }">Obrir Perfil</a>
            </div>
          </div>
        </div>
      } @else if (families().length === 0) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon" aria-hidden="true">lightbulb</span>
            <p>Encara no hi ha res a dir. Amb un mes d'activitat registrada ja hi ha contra què comparar.</p>
            <div class="empty-actions">
              <a class="btn-primary" routerLink="/train">Anar a Entrena</a>
            </div>
          </div>
        </div>
      } @else {
        <p class="lede">
          {{ total() === 1 ? 'Una cosa' : total() + ' coses' }} que hem vist a les teves dades.
          Toca'n una per veure d'on surt.
        </p>

        @for (fam of families(); track fam.level) {
          <div class="card-section">
            <div class="section-header">
              <span class="material-symbols-outlined section-icon" aria-hidden="true">{{ famIcon(fam.level) }}</span>
              <h2 class="section-title">{{ fam.label }}</h2>
              <span class="section-count">{{ fam.insights.length }}</span>
            </div>
            <p class="fam-hint">{{ fam.hint }}</p>

            @for (ins of fam.insights; track ins.type) {
              <button class="ins-row" [style.--ic]="ins.color" (click)="open(ins)"
                      [attr.aria-label]="openLabel(ins)">
                <span class="ins-bar" aria-hidden="true"></span>
                <span class="ins-who" [class.ins-who--pair]="mascotsOf(ins).length > 1">
                  @for (m of mascotsOf(ins); track m.name) {
                    <img class="ins-avatar" [src]="m.avatar" [alt]="m.alt">
                  }
                  <span class="ins-emoji" aria-hidden="true">{{ ins.emoji }}</span>
                </span>
                <span class="ins-body">
                  <span class="ins-title">{{ ins.title }}</span>
                  <span class="ins-stat">{{ ins.stat }}</span>
                  <span class="ins-msg">{{ ins.message }}</span>
                </span>
                <span class="material-symbols-outlined ins-go" aria-hidden="true">chevron_right</span>
              </button>
            }
          </div>
        }
      }
    </div>

    @if (selected(); as ins) {
      <app-insight-detail-sheet [insight]="ins" (close)="close()" />
    }
  `,
  styles: [`
    .page { padding: 0 0 88px; }

    .lede {
      margin: 0 16px; padding-top: 2px;
      font-size: 12.5px; font-weight: 500; color: var(--c-text-3); line-height: 1.4;
    }

    /* ── Section card ── */
    .card-section {
      margin: 12px 16px 0; padding: 14px 14px 10px;
      background: var(--c-card); border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
    .section-icon {
      font-size: 18px; color: var(--c-text-2);
      font-variation-settings: 'FILL' 0, 'wght' 300;
    }
    .section-title {
      margin: 0; flex: 1;
      font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px;
    }
    .section-count {
      font-size: 11px; font-weight: 700; color: var(--c-text-2);
      background: var(--c-border-2); border-radius: 10px; padding: 2px 8px;
    }
    .fam-hint {
      margin: 0 0 11px;
      font-size: 11.5px; font-weight: 500; color: var(--c-text-3); line-height: 1.35;
    }

    /* ── Una fila d'insight ── */
    .ins-row {
      display: flex; align-items: center; gap: 0;
      width: 100%; margin-bottom: 8px; padding: 0 8px 0 0; overflow: hidden;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); font: inherit; color: inherit; text-align: left;
      cursor: pointer; touch-action: manipulation;
      transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
      &:last-child { margin-bottom: 4px; }
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); background: color-mix(in srgb, var(--ic) 5%, var(--c-card)); }
      &:active { background: color-mix(in srgb, var(--ic) 8%, var(--c-card)); }
      &:focus-visible { outline: 2px solid var(--ic); outline-offset: -2px; }
    }
    .ins-bar { width: 5px; align-self: stretch; min-height: 58px; flex-shrink: 0; background: var(--ic); }

    .ins-who {
      position: relative; flex-shrink: 0;
      display: flex; align-items: center;
      padding: 10px 9px 10px 10px;
    }
    .ins-avatar {
      width: 34px; height: 34px; border-radius: 50%;
      object-fit: cover; display: block;
      background: var(--c-subtle); box-shadow: 0 1px 4px var(--c-shadow);
    }
    .ins-who--pair .ins-avatar {
      width: 28px; height: 28px; border: 2px solid var(--c-card);
      &:not(:first-child) { margin-left: -11px; }
    }
    .ins-emoji {
      position: absolute; right: 1px; bottom: 5px;
      width: 17px; height: 17px; border-radius: 50%;
      display: grid; place-items: center;
      font-size: 11px; line-height: 1;
      background: var(--c-card); box-shadow: 0 1px 3px var(--c-shadow);
    }

    .ins-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 11px 4px 11px 0; }
    .ins-title, .ins-stat, .ins-msg { display: block; }
    .ins-title {
      font-size: 13px; font-weight: 800; line-height: 1.2;
      color: color-mix(in srgb, var(--ic) 60%, var(--c-text));
    }
    .ins-stat { font-size: 12.5px; font-weight: 700; color: var(--c-text); line-height: 1.35; }
    .ins-msg  { font-size: 12px; font-weight: 500; color: var(--c-text-2); line-height: 1.4; }
    .ins-go   { flex-shrink: 0; font-size: 18px; color: var(--c-text-3); opacity: 0.65; }

    /* ── Empty state ── */
    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px;
      padding: 28px 16px; text-align: center; color: var(--c-text-2);
      .empty-icon {
        font-size: 48px; color: var(--c-border);
        font-variation-settings: 'FILL' 0, 'wght' 200;
      }
      p { margin: 0; font-size: 14px; font-weight: 500; max-width: 34ch; line-height: 1.4; }
    }
    .empty-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
    .btn-primary {
      padding: 9px 18px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white; text-decoration: none;
      font-size: 13px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation;
      &:hover { background: var(--c-brand-dk); }
      &:active { transform: scale(0.97); }
    }

    @media (prefers-reduced-motion: reduce) {
      .ins-row { transition: none; }
    }
  `],
})
export class ProgressInsightsComponent {
  private metricsService  = inject(FitnessMetricsService);
  private settingsService = inject(UserSettingsService);

  readonly metricsEnabled = computed(() => this.settingsService.metricsEnabled());

  /**
   * Tots els candidats d'avui, per famílies i en el mateix ordre que fa servir
   * Inici per triar-ne un: primer el nivell, i dins d'un nivell la força del
   * senyal. Aquí no es filtra res per «ja mostrat»: qui entra ve a mirar.
   */
  readonly families = computed((): InsightFamily[] => {
    if (!this.metricsEnabled()) return [];
    const all = this.metricsService.insights();
    return FAMILIES
      .map(f => ({ ...f, insights: all.filter(i => i.level === f.level) }))
      .filter(f => f.insights.length > 0);
  });

  readonly total = computed(() => this.families().reduce((n, f) => n + f.insights.length, 0));

  private readonly _selected = signal<FitnessInsight | null>(null);
  readonly selected = this._selected.asReadonly();

  famIcon(level: number): string {
    switch (level) {
      case INSIGHT_LEVEL.objectiu:  return 'flag';
      case INSIGHT_LEVEL.ruptura:   return 'change_circle';
      case INSIGHT_LEVEL.progres:   return 'trending_up';
      case INSIGHT_LEVEL.tendencia: return 'timeline';
      default:                      return 'pattern';
    }
  }

  /** El botó ha de dir on porta, no repetir el títol que ja es llegeix. */
  openLabel(insight: FitnessInsight): string {
    return `Veure per què t'ho diem: ${insight.title}`;
  }

  /** `both` es pinta com els dos avatars encavalcats, no com una foto de grup. */
  mascotsOf(insight: FitnessInsight): MascotMeta[] {
    return insight.mascot === 'both'
      ? [MASCOTS.marley, MASCOTS.xoco]
      : [MASCOTS[insight.mascot]];
  }

  open(insight: FitnessInsight): void { this._selected.set(insight); }
  close(): void { this._selected.set(null); }
}
