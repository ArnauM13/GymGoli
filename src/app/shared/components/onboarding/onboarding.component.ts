import { Component, inject, output, signal } from '@angular/core';

import { UserSettingsService } from '../../../core/services/user-settings.service';

interface OnboardingSlide {
  emoji: string;
  title: string;
  body: string;
}

const SLIDES: OnboardingSlide[] = [
  {
    emoji: '💪',
    title: 'Benvingut/da a GymGoli',
    body: 'El teu registre d\'entrenaments personal. Sense complicacions, sense pressió.',
  },
  {
    emoji: '📅',
    title: 'Registra el teu moviment',
    body: 'Gym, esports, cardio... tot compta. Afegeix sessions en segons i consulta el teu historial quan vulguis.',
  },
  {
    emoji: '🎯',
    title: 'Al teu ritme',
    body: 'Posa\'t un objectiu setmanal si vols i els consells t\'animaran. Sense alarmes ni pressions, tu manes.',
  },
];

@Component({
  selector: 'app-onboarding',
  standalone: true,
  template: `
    <div class="ob-backdrop" (click)="skipToEnd()">
      <div class="ob-card" (click)="$event.stopPropagation()">

        <!-- Slide content -->
        <div class="ob-slide">
          <div class="ob-emoji">{{ currentSlide().emoji }}</div>
          <h2 class="ob-title">{{ currentSlide().title }}</h2>
          <p class="ob-body">{{ currentSlide().body }}</p>
        </div>

        <!-- Pagination dots -->
        <div class="ob-dots">
          @for (s of slides; track $index) {
            <div class="ob-dot" [class.active]="$index === step()"></div>
          }
        </div>

        <!-- Navigation -->
        <div class="ob-actions">
          @if (step() < slides.length - 1) {
            <button class="ob-skip" (click)="skipToEnd()">Salta</button>
            <button class="ob-next" (click)="next()">
              Següent
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          } @else {
            <button class="ob-finish" (click)="finish()">Comencem! 🚀</button>
          }
        </div>

      </div>
    </div>
  `,
  styles: [`
    .ob-backdrop {
      position: fixed; inset: 0; z-index: 2000;
      background: rgba(0, 30, 35, 0.55);
      display: flex; align-items: flex-end; justify-content: center;
      padding-bottom: env(safe-area-inset-bottom, 0);
      animation: ob-bg-in 0.25s ease;
    }

    @keyframes ob-bg-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .ob-card {
      width: 100%; max-width: 480px;
      background: white;
      border-radius: 28px 28px 0 0;
      padding: 32px 28px 36px;
      display: flex; flex-direction: column; align-items: center; gap: 24px;
      animation: ob-slide-up 0.3s cubic-bezier(0.34, 1.15, 0.64, 1);
    }

    @keyframes ob-slide-up {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }

    .ob-slide {
      display: flex; flex-direction: column; align-items: center; gap: 16px;
      text-align: center; width: 100%;
      min-height: 180px; justify-content: center;
    }

    .ob-emoji {
      font-size: 56px; line-height: 1;
      animation: ob-emoji-in 0.3s ease;
    }
    @keyframes ob-emoji-in {
      from { transform: scale(0.7); opacity: 0; }
      to   { transform: scale(1);   opacity: 1; }
    }

    .ob-title {
      margin: 0;
      font-size: 22px; font-weight: 800; color: #1a1a1a; letter-spacing: -0.4px;
      line-height: 1.2;
    }

    .ob-body {
      margin: 0;
      font-size: 15px; color: #666; line-height: 1.6;
      max-width: 320px;
    }

    /* Dots */
    .ob-dots {
      display: flex; gap: 6px;
    }
    .ob-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #e0e0e0; transition: all 0.2s;
      &.active { background: #006874; width: 20px; border-radius: 3px; }
    }

    /* Actions */
    .ob-actions {
      display: flex; gap: 10px; width: 100%;
    }

    .ob-skip {
      flex: 0; padding: 12px 16px; border-radius: 14px;
      border: 1.5px solid #e0e0e0; background: white;
      font-size: 14px; font-weight: 600; color: #888;
      cursor: pointer; touch-action: manipulation;
      transition: all 0.15s;
      &:hover { border-color: #bbb; color: #555; }
    }

    .ob-next {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 14px; border-radius: 14px; border: none;
      background: #006874; color: white;
      font-size: 15px; font-weight: 700; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: #00565f; }
    }

    .ob-finish {
      flex: 1; padding: 14px; border-radius: 14px; border: none;
      background: #006874; color: white;
      font-size: 15px; font-weight: 700; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      &:hover { background: #00565f; }
    }
  `],
})
export class OnboardingComponent {
  private settingsService = inject(UserSettingsService);

  readonly done = output<void>();

  readonly slides = SLIDES;
  readonly step   = signal(0);
  readonly currentSlide = () => SLIDES[this.step()];

  next(): void {
    if (this.step() < SLIDES.length - 1) this.step.update(s => s + 1);
  }

  skipToEnd(): void {
    this.step.set(SLIDES.length - 1);
  }

  finish(): void {
    this.settingsService.update({ onboardingDone: true });
    this.done.emit();
  }
}
