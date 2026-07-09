import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { UserSettingsService } from '../../core/services/user-settings.service';
import { CATEGORY_LABELS } from '../../core/models/exercise.model';
import { SharedWorkout, SharedWorkoutEntry } from '../../core/models/shared-workout.model';
import { kgToDisplay } from '../../shared/utils/weight.utils';

type Status = 'loading' | 'confirm' | 'importing' | 'success' | 'error' | 'needs-auth';

@Component({
  selector: 'app-share-import',
  standalone: true,
  imports: [],
  template: `
    <div class="share-page">
      <div class="share-card">
        <span class="material-symbols-outlined share-icon">forward_to_inbox</span>
        <h1>Entrenament compartit</h1>

        @if (status() === 'loading') {
          <p class="share-desc">Carregant l'entrenament...</p>
          <span class="material-symbols-outlined spin">sync</span>
        } @else if (status() === 'confirm') {
          @if (workout(); as w) {
            <p class="share-desc">
              Algú ha compartit aquest entrenament amb tu. Vols importar-lo com a entrenament d'avui?
            </p>
            <div class="share-preview">
              <div class="share-preview-header">
                <span class="share-preview-name">{{ w.name }}</span>
                <span class="share-preview-cat">{{ categoryLabel(w.category) }}</span>
              </div>
              @if (w.entries.length > 0) {
                <ul class="share-ex-list">
                  @for (e of w.entries; track e.exerciseName) {
                    <li>
                      <span class="share-ex-name">{{ e.exerciseName }}</span>
                      @if (e.sets.length > 0) {
                        <span class="share-ex-sets">{{ setsSummary(e) }}</span>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <p class="share-empty">Sense exercicis</p>
              }
            </div>
            <div class="share-actions">
              <button class="btn-secondary" (click)="goHome()">Cancel·lar</button>
              <button class="btn-primary" (click)="confirmImport()">Importar</button>
            </div>
          }
        } @else if (status() === 'importing') {
          <p class="share-desc">Important l'entrenament...</p>
          <span class="material-symbols-outlined spin">sync</span>
        } @else if (status() === 'success') {
          <span class="material-symbols-outlined success-icon">check_circle</span>
          <p class="share-desc">
            Entrenament afegit al teu dia d'avui.
            @if (skippedCount() > 0) {
              <br>{{ skippedNote() }}
            }
          </p>
          <button class="btn-primary" (click)="goTrain()">Anar a Entrena</button>
        } @else if (status() === 'error') {
          <span class="material-symbols-outlined error-icon">error</span>
          <p class="share-desc">{{ errorMessage() }}</p>
          <button class="btn-primary" (click)="goHome()">Anar a l'app</button>
        } @else if (status() === 'needs-auth') {
          <p class="share-desc">Has d'iniciar sessió per importar aquest entrenament.</p>
          <button class="btn-primary" (click)="goLogin()">Iniciar sessió</button>
        }
      </div>
    </div>
  `,
  styles: [`
    .share-page {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 24px; background: var(--c-bg);
    }
    .share-card {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      padding: 32px 28px; background: var(--c-card); border-radius: 24px;
      box-shadow: 0 4px 24px var(--c-shadow-md);
      max-width: 380px; width: 100%; text-align: center;
    }
    .share-icon {
      font-size: 48px; color: var(--c-brand);
      font-variation-settings: 'FILL' 1, 'wght' 300;
    }
    h1 { margin: 0; font-size: 20px; font-weight: 800; color: var(--c-text); letter-spacing: -0.3px; }
    .share-desc { margin: 0; font-size: 14px; color: var(--c-text-2); line-height: 1.5; }
    .success-icon {
      font-size: 40px; color: #2e7d32;
      font-variation-settings: 'FILL' 1;
    }
    .error-icon {
      font-size: 40px; color: #c62828;
      font-variation-settings: 'FILL' 1;
    }

    .share-preview {
      width: 100%; box-sizing: border-box; padding: 14px 16px;
      background: var(--c-subtle); border: 1.5px solid var(--c-border-2); border-radius: 14px;
      text-align: left;
    }
    .share-preview-header {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin-bottom: 8px;
    }
    .share-preview-name { font-size: 14px; font-weight: 700; color: var(--c-text); }
    .share-preview-cat {
      font-size: 11px; font-weight: 700; color: var(--c-brand);
      background: rgba(var(--c-brand-rgb), 0.1); border-radius: 10px; padding: 2px 8px;
    }
    .share-ex-list {
      margin: 0; padding: 0 0 0 18px; display: flex; flex-direction: column; gap: 6px;
      li { display: flex; flex-direction: column; gap: 1px; }
    }
    .share-ex-name { font-size: 13px; font-weight: 600; color: var(--c-text); }
    .share-ex-sets { font-size: 11.5px; color: var(--c-text-3); }
    .share-empty { margin: 0; font-size: 12px; color: var(--c-text-3); font-style: italic; }

    .share-actions { display: flex; gap: 10px; width: 100%; }
    .btn-primary, .btn-secondary {
      flex: 1; padding: 10px 20px; border-radius: 10px;
      font-size: 14px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation; border: none;
    }
    .btn-primary { background: var(--c-brand); color: white; &:hover { background: var(--c-brand-dk); } }
    .btn-secondary {
      background: transparent; color: var(--c-text-2); border: 1.5px solid var(--c-border);
      &:hover { background: var(--c-hover); }
    }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; font-size: 32px; color: var(--c-brand); }
  `],
})
export class ShareImportComponent implements OnInit {
  private route               = inject(ActivatedRoute);
  private router              = inject(Router);
  private auth                = inject(AuthService);
  private sharedWorkoutService = inject(SharedWorkoutService);
  private settingsService      = inject(UserSettingsService);

  readonly status       = signal<Status>('loading');
  readonly errorMessage = signal('');
  readonly workout      = signal<SharedWorkout | null>(null);
  readonly skippedCount = signal(0);

  private shareId = '';

  async ngOnInit(): Promise<void> {
    this.shareId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.shareId) {
      this.status.set('error');
      this.errorMessage.set('Enllaç invàlid.');
      return;
    }

    const user = await this.auth.waitForAuth();
    if (!user) {
      this.status.set('needs-auth');
      return;
    }

    await this.loadWorkout();
  }

  private async loadWorkout(): Promise<void> {
    this.status.set('loading');
    try {
      const shared = await this.sharedWorkoutService.fetchById(this.shareId);
      if (!shared) {
        this.status.set('error');
        this.errorMessage.set('Aquest entrenament ja no està disponible.');
        return;
      }
      this.workout.set(shared);
      this.status.set('confirm');
    } catch {
      this.status.set('error');
      this.errorMessage.set('No s\'ha pogut carregar l\'entrenament.');
    }
  }

  async confirmImport(): Promise<void> {
    const shared = this.workout();
    if (!shared) return;
    this.status.set('importing');
    try {
      const { skipped } = await this.sharedWorkoutService.importAsWorkout(shared);
      this.skippedCount.set(skipped.length);
      this.status.set('success');
    } catch {
      this.status.set('error');
      this.errorMessage.set('No s\'ha pogut importar l\'entrenament.');
    }
  }

  categoryLabel(cat: SharedWorkout['category']): string {
    return cat === 'mixed' ? 'Mixt' : CATEGORY_LABELS[cat];
  }

  setsSummary(entry: SharedWorkoutEntry): string {
    const unit = this.settingsService.weightUnit();
    return entry.sets
      .map(s => `${s.reps}×${kgToDisplay(s.weight, unit)}${unit}`)
      .join(', ');
  }

  skippedNote(): string {
    const n = this.skippedCount();
    const plural = n !== 1;
    return `(${n} exercici${plural ? 's' : ''} no ${plural ? 's\'han' : 's\'ha'} pogut afegir `
      + `perquè no ${plural ? 'existeixen' : 'existeix'} a la teva llista d'exercicis.)`;
  }

  goHome(): void  { this.router.navigate(['/home']); }
  goTrain(): void { this.router.navigate(['/train']); }
  goLogin(): void { this.router.navigate(['/login']); }
}
