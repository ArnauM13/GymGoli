import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../core/services/auth.service';
import { SharedWorkoutService } from '../../core/services/shared-workout.service';
import { CATEGORY_LABELS } from '../../core/models/exercise.model';
import { SharedWorkout } from '../../core/models/shared-workout.model';

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
              Algú ha compartit aquest entrenament amb tu. Vols importar-lo a les teves plantilles?
            </p>
            <div class="share-preview">
              <div class="share-preview-header">
                <span class="share-preview-name">{{ w.name }}</span>
                <span class="share-preview-cat">{{ categoryLabel(w.category) }}</span>
              </div>
              @if (w.entries.length > 0) {
                <ul class="share-ex-list">
                  @for (e of w.entries; track e.exerciseName) {
                    <li>{{ e.exerciseName }}</li>
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
            Entrenament importat a les teves plantilles.
            @if (skippedCount() > 0) {
              <br>{{ skippedNote() }}
            }
          </p>
          <button class="btn-primary" (click)="goTemplates()">Veure plantilles</button>
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
      padding: 24px; background: #f5f5f7;
    }
    .share-card {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      padding: 32px 28px; background: white; border-radius: 24px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.1);
      max-width: 380px; width: 100%; text-align: center;
    }
    .share-icon {
      font-size: 48px; color: #006874;
      font-variation-settings: 'FILL' 1, 'wght' 300;
    }
    h1 { margin: 0; font-size: 20px; font-weight: 800; color: #1a1a1a; letter-spacing: -0.3px; }
    .share-desc { margin: 0; font-size: 14px; color: #666; line-height: 1.5; }
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
      background: #f7f7f8; border: 1.5px solid #eee; border-radius: 14px;
      text-align: left;
    }
    .share-preview-header {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      margin-bottom: 8px;
    }
    .share-preview-name { font-size: 14px; font-weight: 700; color: #1a1a1a; }
    .share-preview-cat {
      font-size: 11px; font-weight: 700; color: #006874;
      background: rgba(0, 104, 116, 0.1); border-radius: 10px; padding: 2px 8px;
    }
    .share-ex-list {
      margin: 0; padding: 0 0 0 18px; display: flex; flex-direction: column; gap: 4px;
      li { font-size: 13px; color: #444; }
    }
    .share-empty { margin: 0; font-size: 12px; color: #999; font-style: italic; }

    .share-actions { display: flex; gap: 10px; width: 100%; }
    .btn-primary, .btn-secondary {
      flex: 1; padding: 10px 20px; border-radius: 10px;
      font-size: 14px; font-weight: 700; cursor: pointer;
      transition: background 0.15s; touch-action: manipulation; border: none;
    }
    .btn-primary { background: #006874; color: white; &:hover { background: #005a63; } }
    .btn-secondary {
      background: transparent; color: #666; border: 1.5px solid #ddd;
      &:hover { background: #f0f0f0; }
    }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spin { animation: spin 1s linear infinite; font-size: 32px; color: #006874; }
  `],
})
export class ShareImportComponent implements OnInit {
  private route               = inject(ActivatedRoute);
  private router              = inject(Router);
  private auth                = inject(AuthService);
  private sharedWorkoutService = inject(SharedWorkoutService);

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
      const { skipped } = await this.sharedWorkoutService.importAsTemplate(shared);
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

  skippedNote(): string {
    const n = this.skippedCount();
    const plural = n !== 1;
    return `(${n} exercici${plural ? 's' : ''} no ${plural ? 's\'han' : 's\'ha'} pogut afegir `
      + `perquè no ${plural ? 'existeixen' : 'existeix'} a la teva llista d'exercicis.)`;
  }

  goHome(): void      { this.router.navigate(['/train']); }
  goTemplates(): void { this.router.navigate(['/templates']); }
  goLogin(): void     { this.router.navigate(['/login']); }
}
