import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { WorkoutDetailComponent } from './workout-detail.component';
import { ExerciseService } from '../../../core/services/exercise.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { WorkoutService } from '../../../core/services/workout.service';
import { Workout, WorkoutEntry } from '../../../core/models/workout.model';

function entry(overrides: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return { exerciseId: 'e1', exerciseName: 'Press banca', sets: [], ...overrides };
}

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: 'w1', date: '2024-03-05', entries: [], createdAt: new Date(), ...overrides } as Workout;
}

describe('WorkoutDetailComponent', () => {
  let ensureWorkoutEntries: jasmine.Spy;

  function build(workout: Workout): HTMLElement {
    const fixture = TestBed.createComponent(WorkoutDetailComponent);
    fixture.componentRef.setInput('workout', workout);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const summaries = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.wd-sum-row')).map(row => ({
      name:  row.querySelector('.wd-sum-name')?.textContent?.trim() ?? '',
      value: row.querySelector('.wd-sum-val')?.textContent?.trim() ?? '',
    }));

  beforeEach(async () => {
    ensureWorkoutEntries = jasmine.createSpy().and.resolveTo(undefined);

    await TestBed.configureTestingModule({
      imports: [WorkoutDetailComponent],
      providers: [
        { provide: WorkoutService, useValue: { ensureWorkoutEntries } },
        { provide: ExerciseService, useValue: { getById: () => undefined } },
        {
          provide: UserSettingsService,
          useValue: {
            weightUnit: signal<'kg' | 'lb'>('kg'),
            bodyweightKg: signal(null),
            difficultyScale: signal('emoji'),
          },
        },
      ],
    }).compileComponents();
  });

  // Desplegat dins una targeta del feed és una ullada, i res més: la lectura
  // sencera viu a la pàgina de l'entrenament, que és l'editor en consulta.
  describe('l\'ullada del feed', () => {
    it('resumeix cada exercici en una línia', () => {
      const el = build(makeWorkout({
        entries: [
          entry({ sets: [{ weight: 80, reps: 10 }, { weight: 80, reps: 8 }, { weight: 70, reps: 8 }] }),
          entry({ exerciseId: 'e2', exerciseName: 'Fons', sets: [{ weight: 0, reps: 12 }] }),
        ],
      }));

      expect(summaries(el)).toEqual([
        { name: 'Press banca', value: '3×8-10 · 80 kg' },
        { name: 'Fons', value: '1×12' },
      ]);
    });

    it('no baixa a les sèries, ni al peu, ni a la nota', () => {
      const el = build(makeWorkout({
        notes: 'Bon dia', feeling: 4,
        entries: [entry({ notes: 'Fluix', sets: [{ weight: 80, reps: 10 }] })],
      }));

      expect(el.querySelector('.entry-set-line')).toBeNull();
      expect(el.querySelector('.entry-card')).toBeNull();
      expect(el.querySelector('.wd-footer')).toBeNull();
      expect(el.querySelector('.wd-notes')).toBeNull();
      expect(el.textContent).not.toContain('Bon dia');
      expect(el.textContent).not.toContain('Fluix');
    });

    it('les sèries d\'escalfament no compten al resum', () => {
      const el = build(makeWorkout({
        entries: [entry({ sets: [{ weight: 40, reps: 12, warmup: true }, { weight: 90, reps: 5 }] })],
      }));

      expect(summaries(el)[0].value).toBe('1×5 · 90 kg');
    });

    it('talla els exercicis que no caben a una ullada i diu quants en queden', () => {
      const el = build(makeWorkout({
        entries: Array.from({ length: 7 }, (_, i) =>
          entry({ exerciseId: `e${i}`, exerciseName: `Exercici ${i}`, sets: [{ weight: 20, reps: 10 }] })),
      }));

      expect(summaries(el).length).toBe(5);
      expect(el.querySelector('.wd-more')?.textContent).toContain('+2');
    });
  });

  // De l'historial vell només se'n baixa el resum de la targeta: desplegar-la
  // és el moment de demanar-ne les sèries.
  it('demana les sèries quan la sessió només porta el resum', () => {
    const el = build(makeWorkout({ entriesLoaded: false, exerciseCount: 3 } as Partial<Workout>));
    expect(ensureWorkoutEntries).toHaveBeenCalledWith('w1');
    expect(el.querySelector('.wd-pending')).toBeTruthy();
  });
});
