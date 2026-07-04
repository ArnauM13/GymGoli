import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';

import { Sport } from '../../core/models/sport.model';
import { SportService } from '../../core/services/sport.service';
import { SportFormDialogComponent } from '../library/components/sport-form-dialog.component';
import { ConfirmDialogService } from '../../shared/services/confirm-dialog.service';
import { FeedbackService } from '../../shared/services/feedback.service';

@Component({
  selector: 'app-sports-config',
  standalone: true,
  imports: [],
  template: `
    <div class="page">

      <header class="page-header">
        <button class="back-btn" (click)="goBack()" aria-label="Enrere">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>
        <h1>Esports</h1>
      </header>

      @if (sports().length === 0) {
        <div class="card-section">
          <div class="empty-state">
            <span class="material-symbols-outlined empty-icon">sports_soccer</span>
            <p>Cap esport configurat</p>
            <button class="btn-primary" (click)="openForm()">Afegeix el primer</button>
          </div>
        </div>
      } @else {
        <div class="card-section">
          <div class="section-header">
            <span class="material-symbols-outlined section-icon">sports_soccer</span>
            <h2 class="section-title">Els teus esports</h2>
            <span class="section-count">{{ sports().length }}</span>
          </div>

          @for (sport of sports(); track sport.id) {
            <div class="item-card">
              <div class="ic-bar" [style.background]="sport.color"></div>
              <span class="material-symbols-outlined sport-icon" [style.color]="sport.color">
                {{ sport.icon }}
              </span>
              <div class="ic-info">
                <span class="ic-name">{{ sport.name }}</span>
                @if (sport.metricDefs.length || sport.subtypes.length) {
                  <span class="ic-detail">
                    @if (sport.metricDefs.length) { {{ sport.metricDefs.length }} mètr }
                    @if (sport.metricDefs.length && sport.subtypes.length) { · }
                    @if (sport.subtypes.length) { {{ sport.subtypes.length }} subtipus }
                  </span>
                }
              </div>
              <button class="ic-action" (click)="openForm(sport)" aria-label="Editar">
                <span class="material-symbols-outlined">edit</span>
              </button>
              <button class="ic-action ic-action--danger" (click)="deleteSport(sport)" aria-label="Eliminar">
                <span class="material-symbols-outlined">delete</span>
              </button>
            </div>
          }
        </div>
      }

      <!-- FAB -->
      <button class="fab" (click)="openForm()" aria-label="Afegir esport">
        <span class="material-symbols-outlined">add</span>
      </button>
    </div>
  `,
  styles: [`
    .page { padding: 0 0 88px; }

    .page-header {
      display: flex; align-items: center; gap: 10px;
      padding: 16px 16px 10px;
      h1 { margin: 0; font-size: 22px; font-weight: 700; color: var(--c-text); letter-spacing: -0.3px; }
    }
    .back-btn {
      display: flex; align-items: center; justify-content: center;
      width: 36px; height: 36px; border-radius: 50%;
      border: none; background: var(--c-subtle); color: var(--c-text-2);
      cursor: pointer; flex-shrink: 0; transition: background 0.15s;
      span { font-size: 20px; }
      &:hover { background: var(--c-hover); }
    }

    .card-section {
      margin: 12px 16px 0; padding: 14px 14px 10px;
      background: var(--c-card); border-radius: 18px;
      box-shadow: 0 2px 10px var(--c-shadow);
    }
    .section-header { display: flex; align-items: center; gap: 7px; margin-bottom: 12px; }
    .section-icon { font-size: 18px; color: var(--c-text-2); font-variation-settings: 'FILL' 0, 'wght' 300; }
    .section-title { margin: 0; flex: 1; font-size: 14px; font-weight: 700; color: var(--c-text-2); letter-spacing: 0.2px; }
    .section-count { font-size: 11px; font-weight: 700; color: var(--c-text-2); background: var(--c-border-2); border-radius: 10px; padding: 2px 8px; }

    .item-card {
      display: flex; align-items: center; margin-bottom: 6px;
      border: 1.5px solid var(--c-border-2); border-radius: 14px;
      background: var(--c-card); overflow: hidden; transition: box-shadow 0.15s, border-color 0.15s;
      &:last-child { margin-bottom: 4px; }
      &:hover { box-shadow: 0 2px 8px var(--c-shadow); border-color: var(--c-border); }
    }
    .ic-bar { width: 5px; align-self: stretch; flex-shrink: 0; }
    .sport-icon {
      font-size: 22px; flex-shrink: 0; padding: 0 2px 0 10px;
      font-variation-settings: 'FILL' 1, 'wght' 400;
    }
    .ic-info {
      flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; padding: 10px;
    }
    .ic-name { font-size: 13px; font-weight: 700; color: var(--c-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ic-detail { font-size: 11px; color: var(--c-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; &:empty { display: none; } }
    .ic-action {
      width: 36px; height: 36px; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      border: none; background: transparent; cursor: pointer;
      color: var(--c-text-3); touch-action: manipulation; transition: color 0.15s, background 0.15s;
      .material-symbols-outlined { font-size: 17px; }
      &:hover { color: var(--c-text-2); background: var(--c-hover); }
      &.ic-action--danger:hover { color: #ef5350; background: rgba(239,83,80,0.08); }
      &:last-child { margin-right: 4px; }
    }

    .empty-state {
      display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 28px 16px;
      text-align: center; color: var(--c-text-2);
      .empty-icon { font-size: 48px; color: var(--c-border); font-variation-settings: 'FILL' 0, 'wght' 200; }
      p { margin: 0; font-size: 14px; font-weight: 500; }
    }
    .btn-primary {
      padding: 8px 16px; border: none; border-radius: 10px;
      background: var(--c-brand); color: white; font-size: 13px; font-weight: 700;
      cursor: pointer; transition: background 0.15s;
      &:hover { background: var(--c-brand-dk); }
    }

    .fab {
      position: fixed; bottom: calc(var(--nav-height) + 16px); right: 20px; z-index: 89;
      width: 56px; height: 56px; border-radius: 50%; border: none;
      background: var(--c-brand); color: white;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; touch-action: manipulation;
      box-shadow: 0 4px 16px rgba(var(--c-brand-rgb), 0.4), 0 1px 4px var(--c-shadow);
      transition: background 0.15s, transform 0.15s;
      .material-symbols-outlined { font-size: 28px; }
      &:hover { background: var(--c-brand-dk); transform: scale(1.06); }
      &:active { transform: scale(0.94); }
    }
  `],
})
export class SportsConfigComponent {
  private sportService = inject(SportService);
  private dialog       = inject(MatDialog);
  private feedback     = inject(FeedbackService);
  private confirmDialog = inject(ConfirmDialogService);
  private router       = inject(Router);

  readonly sports = this.sportService.sports;

  goBack(): void { this.router.navigate(['/settings']); }

  openForm(sport?: Sport): void {
    const ref = this.dialog.open(SportFormDialogComponent, {
      data: { sport }, width: '360px', maxHeight: '90vh',
    });
    ref.afterClosed().subscribe(async result => {
      if (!result) return;
      try {
        if (sport) {
          await this.sportService.updateSport(sport.id, result);
          this.feedback.success('Esport actualitzat', 2000);
        } else {
          await this.sportService.createSport(result);
          this.feedback.success('Esport creat', 2000);
        }
      } catch (err) {
        this.feedback.error(`Error: ${(err as { message?: string }).message ?? 'desconegut'}`, 5000);
      }
    });
  }

  async deleteSport(sport: Sport): Promise<void> {
    if (!await this.confirmDialog.confirm(`Eliminar "${sport.name}"?`, { variant: 'danger', confirmLabel: 'Eliminar' })) return;
    try {
      await this.sportService.deleteSport(sport.id);
      this.feedback.success('Esport eliminat', 2000);
    } catch {
      this.feedback.error('Error en eliminar', 3000);
    }
  }
}
