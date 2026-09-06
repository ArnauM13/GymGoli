import { Component, computed, inject, output, signal } from '@angular/core';

import { MASCOTS, Mascot } from '../../../core/models/mascot.model';
import {
  FitnessGoal,
  CATALOG_VERSION,
  FITNESS_GOAL_EMOJIS,
  FITNESS_GOAL_LABELS,
  FITNESS_GOAL_WEEKLY_DEFAULTS,
} from '../../../core/models/user-settings.model';
import { OnboardingTourService } from '../../../core/services/onboarding-tour.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';

/**
 * Una diapositiva de la presentació. Qui parla mana: el Marley es presenta
 * ell, el Xoco es presenta ell, i les dues transversals les fan tots dos
 * sense veu pròpia (MASCOTES.md §Regles de veu).
 */
interface OnboardingSlide {
  mascot: Mascot;
  title: string;
  body: string;
  /** La frase del gos, de dues a cinc paraules. Només quan parla un de sol. */
  line?: string;
}

/**
 * La presentació. Aquí no s'explica com funciona l'app — això ho fa el tour
 * guiat, ensenyant-ho a la pantalla de debò. Aquí només es presenten els dos
 * gossos i es promet com serà la cosa, que és el que costa d'entendre d'una
 * captura i el que es recorda.
 */
const SLIDES: OnboardingSlide[] = [
  {
    mascot: 'both',
    title: 'Hola! Som el Marley i el Xoco',
    body: 'Aquesta és la GymGoli, i nosaltres t\'hi acompanyem. Aquí hi va tot l\'esport que fas: el gimnàs i la resta.',
  },
  {
    mascot: 'marley',
    title: 'Jo soc el Marley',
    body: 'Porto els entrenaments de gimnàs: els exercicis, les sèries, les plantilles. I el descans, que per mi també és feina.',
    line: 'Tu diràs.',
  },
  {
    mascot: 'xoco',
    title: 'I jo el Xoco!',
    body: 'Jo porto l\'esport: pàdel, córrer, escalada, natació… el que sigui. Tot compta i tot va al mateix lloc.',
    line: 'Sortim?',
  },
  {
    mascot: 'both',
    title: 'Sense alarmes ni pressions',
    body: 'Registres el que fas i prou. Ens alegrem de veure\'t tant si has entrenat com si no.',
  },
];

const GOAL_OPTIONS: { value: FitnessGoal; emoji: string; label: string }[] = (
  Object.keys(FITNESS_GOAL_LABELS) as FitnessGoal[]
).map(v => ({ value: v, emoji: FITNESS_GOAL_EMOJIS[v], label: FITNESS_GOAL_LABELS[v] }));

/** Índex del pas on es tria l'objectiu, i del que ofereix el tour. */
const GOAL_STEP   = SLIDES.length;
const INVITE_STEP = SLIDES.length + 1;
const TOTAL_STEPS = SLIDES.length + 2;

@Component({
  selector: 'app-onboarding',
  standalone: true,
  template: `
    <div class="ob-backdrop" (click)="skipToGoal()">
      <div class="ob-card" (click)="$event.stopPropagation()">

        @if (step() < SLIDES_LEN) {
          <!-- Presentació: qui són -->
          <div class="ob-slide">
            <img class="ob-dog" [class.ob-dog--pair]="currentSlide().mascot === 'both'"
                 [src]="slideDog().figure" [alt]="slideDog().alt">
            <h2 class="ob-title">{{ currentSlide().title }}</h2>
            <p class="ob-body">{{ currentSlide().body }}</p>
            @if (currentSlide().line) {
              <p class="ob-line">{{ currentSlide().line }}</p>
            }
          </div>

        } @else if (step() === GOAL_STEP) {
          <!-- Objectiu -->
          <div class="ob-goal-slide">
            <h2 class="ob-title">Quin és el teu objectiu?</h2>
            <p class="ob-body">Ho farem servir per acompanyar-te millor. Es pot canviar sempre des de Perfil.</p>
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

        } @else {
          <!-- L'oferta del tour: la part important de tot això -->
          <div class="ob-slide">
            <img class="ob-dog ob-dog--pair" [src]="pairDog.figure" [alt]="pairDog.alt">
            <h2 class="ob-title">T'ensenyem on és tot?</h2>
            <p class="ob-body">
              {{ tourSteps }} parades per l'app de veritat: t'anem portant a cada
              pantalla i t'assenyalem les coses. El pots deixar quan vulguis.
            </p>
            <p class="ob-line">Vine!</p>
          </div>
        }

        <!-- Punts de progrés -->
        <div class="ob-dots">
          @for (i of dotIndices; track i) {
            <div class="ob-dot" [class.active]="i === step()"></div>
          }
        </div>

        <!-- Navegació -->
        <div class="ob-actions">
          @if (step() < SLIDES_LEN - 1) {
            <button class="ob-skip" (click)="skipToGoal()">Salta</button>
            <button class="ob-next" (click)="next()">
              Següent
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          } @else if (step() < GOAL_STEP) {
            <button class="ob-next" (click)="next()">
              Continua
              <span class="material-symbols-outlined">arrow_forward</span>
            </button>
          } @else if (step() === GOAL_STEP) {
            <button class="ob-next" [disabled]="!selectedGoal()" (click)="next()">
              {{ selectedGoal() ? 'Continua' : 'Tria un objectiu' }}
              @if (selectedGoal()) {
                <span class="material-symbols-outlined">arrow_forward</span>
              }
            </button>
          } @else {
            <button class="ob-finish" (click)="finish(true)">
              Va, ensenyeu-m'ho 🐾
            </button>
          }
        </div>

        @if (step() === GOAL_STEP && !selectedGoal()) {
          <button class="ob-quiet" (click)="next()">
            Continuar sense objectiu
          </button>
        } @else if (step() === INVITE_STEP) {
          <button class="ob-quiet" (click)="finish(false)">
            Ara no, ja hi ballaré sol
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
      padding: 28px 28px 24px;
      display: flex; flex-direction: column; align-items: center; gap: 18px;
      animation: ob-slide-up 0.3s cubic-bezier(0.34, 1.15, 0.64, 1);
    }

    @keyframes ob-slide-up {
      from { transform: translateY(100%); }
      to   { transform: translateY(0); }
    }

    .ob-slide {
      display: flex; flex-direction: column; align-items: center; gap: 10px;
      text-align: center; width: 100%;
      min-height: 200px; justify-content: center;
    }

    /* Es presenten ells: aquí surten grans i retallats del fons, sense cercle
     * ni marc — la silueta ja diu qui és. Cap emoji hi pot competir. */
    .ob-dog {
      height: 118px; width: auto; display: block;
      filter: drop-shadow(0 4px 10px var(--c-shadow-md));
      mask-image: linear-gradient(to bottom, #000 86%, transparent 100%);
      -webkit-mask-image: linear-gradient(to bottom, #000 86%, transparent 100%);
      animation: ob-dog-in 0.34s cubic-bezier(0.34, 1.3, 0.64, 1) both;
    }
    .ob-dog--pair { height: 104px; }

    @keyframes ob-dog-in {
      from { transform: translateY(10px) scale(0.9); opacity: 0; }
      to   { transform: none; opacity: 1; }
    }

    .ob-title {
      margin: 0;
      font-size: 22px; font-weight: 800; color: var(--c-text); letter-spacing: -0.4px;
      line-height: 1.2; text-align: center;
    }

    .ob-body {
      margin: 0;
      font-size: 15px; color: var(--c-text-3); line-height: 1.55;
      max-width: 340px; text-align: center;
    }

    /* La seva frase, no la de l'app. */
    .ob-line {
      margin: 0; font-size: 15px; font-weight: 700; font-style: italic;
      color: var(--c-brand);
    }

    /* Objectiu */
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

    /* Punts */
    .ob-dots { display: flex; gap: 6px; }
    .ob-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--c-border-2); transition: all 0.2s;
      &.active { background: var(--c-brand); width: 20px; border-radius: 3px; }
    }

    /* Accions */
    .ob-actions { display: flex; gap: 10px; width: 100%; }

    .ob-skip {
      flex: 0; padding: 12px 16px; border-radius: 14px;
      border: 1.5px solid var(--c-border-2); background: var(--c-card);
      font-size: 14px; font-weight: 600; color: var(--c-text-3);
      cursor: pointer; touch-action: manipulation; transition: all 0.15s;
      &:hover { border-color: var(--c-border); color: var(--c-text-2); }
    }

    .ob-next, .ob-finish {
      flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px;
      padding: 14px; border-radius: 14px; border: none;
      background: var(--c-brand); color: white;
      font-size: 15px; font-weight: 700; cursor: pointer;
      transition: all 0.15s; touch-action: manipulation;
      .material-symbols-outlined { font-size: 18px; }
      &:hover:not(:disabled) { background: var(--c-brand-dk); }
      &:disabled { background: var(--c-border-2); color: var(--c-text-3); cursor: default; }
    }

    .ob-quiet {
      border: none; background: transparent; padding: 4px 8px;
      font-size: 13px; color: var(--c-text-3); cursor: pointer;
      text-decoration: underline; touch-action: manipulation;
    }
  `],
})
export class OnboardingComponent {
  private settingsService = inject(UserSettingsService);
  private tourService     = inject(OnboardingTourService);

  /** `true` quan l'usuari accepta el tour guiat: qui l'engega és l'app. */
  readonly done = output<boolean>();

  readonly SLIDES_LEN  = SLIDES.length;
  readonly GOAL_STEP   = GOAL_STEP;
  readonly INVITE_STEP = INVITE_STEP;
  readonly TOTAL_STEPS = TOTAL_STEPS;
  readonly slides      = SLIDES;
  readonly goalOptions = GOAL_OPTIONS;
  readonly dotIndices  = Array.from({ length: TOTAL_STEPS }, (_, i) => i);
  /** Es llegeix del tour perquè la promesa no menteixi si el recorregut creix. */
  readonly tourSteps   = this.tourService.total;

  readonly step         = signal(0);
  readonly selectedGoal = signal<FitnessGoal | null>(null);

  readonly currentSlide = computed(() => SLIDES[this.step()] ?? SLIDES[SLIDES.length - 1]);
  readonly slideDog     = computed(() => MASCOTS[this.currentSlide().mascot]);
  readonly pairDog      = MASCOTS['both'];

  next(): void {
    if (this.step() < TOTAL_STEPS - 1) this.step.update(s => s + 1);
  }

  /** Saltar-se la presentació. Un cop passat l'objectiu ja no fa res: tocar
   *  el fons no ha de retrocedir ningú a un pas que ja ha contestat. */
  skipToGoal(): void {
    if (this.step() < GOAL_STEP) this.step.set(GOAL_STEP);
  }

  /**
   * Tanca l'onboarding. L'objectiu és opcional: qui no en tria cap entra
   * igualment i el pot posar més tard des de Perfil.
   */
  finish(startTour: boolean): void {
    const goal = this.selectedGoal();
    this.settingsService.update({
      onboardingDone: true,
      // Els usuaris nous entren amb el catàleg actual: no se'ls ha d'oferir
      // actualitzar-lo el primer dia.
      catalogSyncedVersion: CATALOG_VERSION,
      ...(goal ? {
        fitnessGoal:        goal,
        metricsEnabled:     true,
        weeklyActivityGoal: FITNESS_GOAL_WEEKLY_DEFAULTS[goal],
      } : {}),
      // Qui no vol el tour ara el té sempre a Perfil; no se li torna a oferir sol.
      ...(startTour ? {} : { guidedTourDone: true }),
    });
    this.done.emit(startTour);
  }
}
