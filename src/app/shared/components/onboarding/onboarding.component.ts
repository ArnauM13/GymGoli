import { Component, inject, output, signal } from '@angular/core';

import {
  FitnessGoal,
  FITNESS_GOAL_EMOJIS,
  FITNESS_GOAL_LABELS,
  FITNESS_GOAL_WEEKLY_DEFAULTS,
} from '../../../core/models/user-settings.model';
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
    title: 'Personalitzat per a tu',
    body: 'Diga\'ns quin és el teu objectiu i l\'app t\'acompanyarà al teu ritme, sense alarmes ni pressions.',
  },
];

const GOAL_OPTIONS: { value: FitnessGoal; emoji: string; label: string }[] = (
  Object.keys(FITNESS_GOAL_LABELS) as FitnessGoal[]
).map(v => ({ value: v, emoji: FITNESS_GOAL_EMOJIS[v], label: FITNESS_GOAL_LABELS[v] }));

const TOTAL_STEPS = SLIDES.length + 1; // +1 for goal step

@Component({
  selector: 'app-onboarding',
  standalone: true,
  template: `
    <div class="ob-backdrop" (click)="skipToGoal()">
      <div class="ob-card" (click)="$event.stopPropagation()">

        @if (step() < SLIDES_LEN) {
          <!-- Info slides -->
          <div class="ob-slide">
            <div class="ob-emoji">{{ currentSlide().emoji }}</div>
            <h2 class="ob-title">{{ currentSlide().title }}</h2>
            <p class="ob-body">{{ currentSlide().body }}</p>
          </div>
        } @else {
          <!-- Goal selection step -->
          <div class="ob-goal-slide">
            <h2 class="ob-title">Quin és el teu objectiu?</h2>
            <p class="ob-body">Ho farem servir per acompanyar-te millor.</p>
            <div class="ob-goal-grid">
              @for (g of goalOptions; track g.value) {
                <button
                  class="ob-goal-btn"
                  [class.selected]="selectedGoal() === g.value"
                  (click)="selectedGoal.set(g.value)">
                  <span class="ob-goal-emoji">{{ g.emoji }}</span>
                  <span class="ob-goal-label">{{ g.label }}</span>
                </button>
              }
            </div>
          </div>
        }

        <!-- Pagination dots -->
        <div class="ob-dots">
          @for (i of dotIndices; track i) {
            <div class="ob-dot" [class.active]="i === step()"></div>
          }
        </div>

        <!-- Navigation -->
        <div class="ob-actions">
          @if (step() < SLIDES_LEN - 1) {
            <button class="ob-skip" (click)="skipToGoal()">Salta</button>
            <button class="ob-next" (click)="next()">
              Següent
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          } @else if (step() === SLIDES_LEN - 1) {
            <button class="ob-next" (click)="next()">
              Continua
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          } @else {
            <button class="ob-finish" [disabled]="!selectedGoal()" (click)="finish()">
              {{ selectedGoal() ? 'Comencem! 🚀' : 'Tria un objectiu' }}
            </button>
          }
        </div>

        @if (step() === TOTAL_STEPS - 1 && !selectedGoal()) {
          <button class="ob-skip-goal" (click)="finishWithoutGoal()">
            Continuar sense objectiu
          </button>
        }

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
      background: var(--c-card);
      border-radius: 28px 28px 0 0;
      padding: 32px 28px 24px;
      display: flex; flex-direction: column; align-items: center; gap: 20px;
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
      font-size: 22px; font-weight: 800; color: var(--c-text); letter-spacing: -0.4px;
      line-height: 1.2; text-align: center;
    }

    .ob-body {
      margin: 0;
      font-size: 15px; color: var(--c-text-3); line-height: 1.6;
      max-width: 320px; text-align: center;
    }

    /* Goal step */
    .ob-goal-slide {
      display: flex; flex-direction: column; align-items: center; gap: 12px; width: 100%;
    }

    .ob-goal-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; margin-top: 4px;
    }

    .ob-goal-btn {
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      padding: 16px 12px; border-radius: 16px;
      border: 2px solid var(--c-border-2); background: var(--c-subtle);
      cursor: pointer; transition: all 0.18s; touch-action: manipulation;

      &:hover { border-color: var(--c-brand); background: rgba(var(--c-brand-rgb), 0.05); }
      &.selected {
        border-color: var(--c-brand);
        background: rgba(var(--c-brand-rgb), 0.1);
      }
    }

    .ob-goal-emoji { font-size: 32px; line-height: 1; }
    .ob-goal-label {
      font-size: 13px; font-weight: 700; color: var(--c-text); text-align: center; line-height: 1.2;
    }
    .ob-goal-btn.selected .ob-goal-label { color: var(--c-brand); }

    /* Dots */
    .ob-dots { display: flex; gap: 6px; }
    .ob-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--c-border-2); transition: all 0.2s;
      &.active { background: var(--c-brand); width: 20px; border-radius: 3px; }
    }

    /* Actions */
    .ob-actions { display: flex; gap: 10px; width: 100%; }

    .ob-skip {
      flex: 0; padding: 12px 16px; border-radius: 14px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      font-size: 14px; font-weight: 600; color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { border-color: var(--c-border); color: var(--c-text-2); }
    }

    .ob-next {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 14px; border-radius: 14px; border: none;
      background: var(--c-brand); color: var(--c-card);
      font-size: 15px; font-weight: 700; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover { background: var(--c-brand-dk); }
    }

    .ob-finish {
      flex: 1; padding: 14px; border-radius: 14px; border: none;
      background: var(--c-brand); color: var(--c-card);
      font-size: 15px; font-weight: 700; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { background: var(--c-border-2); color: var(--c-text-3); cursor: default; }
    }

    .ob-skip-goal {
      border: none; background: transparent; padding: 4px 8px;
      font-size: 13px; color: var(--c-text-3); cursor: pointer;
      text-decoration: underline; touch-action: manipulation;
    }
  `],
})
export class OnboardingComponent {
  private settingsService = inject(UserSettingsService);

  readonly done = output<void>();

  readonly SLIDES_LEN  = SLIDES.length;
  readonly TOTAL_STEPS = TOTAL_STEPS;
  readonly slides      = SLIDES;
  readonly goalOptions = GOAL_OPTIONS;
  readonly dotIndices  = Array.from({ length: TOTAL_STEPS }, (_, i) => i);

  readonly step         = signal(0);
  readonly selectedGoal = signal<FitnessGoal | null>(null);

  readonly currentSlide = () => SLIDES[this.step()] ?? SLIDES[SLIDES.length - 1];

  next(): void {
    if (this.step() < TOTAL_STEPS - 1) this.step.update(s => s + 1);
  }

  skipToGoal(): void {
    this.step.set(SLIDES.length);
  }

  finish(): void {
    const goal = this.selectedGoal();
    if (!goal) return;
    this.settingsService.update({
      onboardingDone:      true,
      fitnessGoal:         goal,
      metricsEnabled:      true,
      weeklyActivityGoal:  FITNESS_GOAL_WEEKLY_DEFAULTS[goal],
    });
    this.done.emit();
  }

  finishWithoutGoal(): void {
    this.settingsService.update({ onboardingDone: true });
    this.done.emit();
  }
}
