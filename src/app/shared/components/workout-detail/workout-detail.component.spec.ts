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

  function build(workout: Workout, compact = false): HTMLElement {
    const fixture = TestBed.createComponent(WorkoutDetailComponent);
    fixture.componentRef.setInput('workout', workout);
    fixture.componentRef.setInput('compact', compact);
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

  // Desplegat dins una targeta del feed és una ullada, com el detall d'una
  // sessió d'esport: què has fet a cada exercici i prou.
  describe('plegat dins la targeta (compact)', () => {
    it('resumeix cada exercici en una línia', () => {
      const el = build(makeWorkout({
        entries: [
          entry({ sets: [{ weight: 80, reps: 10 }, { weight: 80, reps: 8 }, { weight: 70, reps: 8 }] }),
          entry({ exerciseId: 'e2', exerciseName: 'Fons', sets: [{ weight: 0, reps: 12 }] }),
        ],
      }), true);

      expect(summaries(el)).toEqual([
        { name: 'Press banca', value: '3×8-10 · 80 kg' },
        { name: 'Fons', value: '1×12' },
      ]);
    });

    it('no baixa a les sèries, ni al peu, ni a la nota', () => {
      const el = build(makeWorkout({
        notes: 'Bon dia', feeling: 4,
        entries: [entry({ notes: 'Fluix', sets: [{ weight: 80, reps: 10 }] })],
      }), true);

      expect(el.querySelector('.entry-set-line')).toBeNull();
      expect(el.querySelector('.workout-volume-footer')).toBeNull();
      expect(el.querySelector('.workout-notes')).toBeNull();
      expect(el.querySelector('.wd-block-title')).toBeNull();
      expect(el.textContent).not.toContain('Bon dia');
    });

    it('les sèries d\'escalfament no compten al resum', () => {
      const el = build(makeWorkout({
        entries: [entry({ sets: [{ weight: 40, reps: 12, warmup: true }, { weight: 90, reps: 5 }] })],
      }), true);

      expect(summaries(el)[0].value).toBe('1×5 · 90 kg');
    });

    it('talla els exercicis que no caben a una ullada i diu quants en queden', () => {
      const el = build(makeWorkout({
        entries: Array.from({ length: 7 }, (_, i) =>
          entry({ exerciseId: `e${i}`, exerciseName: `Exercici ${i}`, sets: [{ weight: 20, reps: 10 }] })),
      }), true);

      expect(summaries(el).length).toBe(5);
      expect(el.querySelector('.wd-more')?.textContent).toContain('+2');
    });
  });

  // A la pàgina de l'entrenament s'hi entra a fons: sèrie a sèrie, com ha
  // anat i el compte del dia.
  describe('sencer', () => {
    it('ensenya cada sèrie i el resum de l\'exercici', () => {
      const el = build(makeWorkout({
        entries: [entry({ sets: [{ weight: 80, reps: 10 }, { weight: 90, reps: 6 }] })],
      }));

      expect(el.querySelectorAll('.entry-set-line').length).toBe(2);
      expect(el.querySelector('.entry-sum')?.textContent?.trim()).toBe('2×6-10 · 90 kg');
      expect(el.querySelector('.esl-pr')).toBeTruthy();
    });

    it('separa com ha anat en un bloc propi, com una sessió d\'esport', () => {
      const el = build(makeWorkout({
        feeling: 4, notes: 'Bon dia',
        entries: [entry({ sets: [{ weight: 80, reps: 10 }] })],
      }));

      const blocks = Array.from(el.querySelectorAll('.wd-block-title')).map(n => n.textContent?.trim());
      expect(blocks).toEqual(['Exercicis', 'Com ha anat']);
      expect(el.querySelector('.wd-feeling-value')?.textContent?.trim()).toBeTruthy();
      expect(el.querySelector('.workout-notes')?.textContent).toContain('Bon dia');
    });

    it('compta exercicis, sèries i volum al peu', () => {
      const el = build(makeWorkout({
        entries: [entry({ sets: [{ weight: 80, reps: 10 }, { weight: 40, reps: 10, warmup: true }] })],
      }));

      const footer = el.querySelector('.workout-volume-footer')?.textContent ?? '';
      expect(footer).toContain('1 exercici');
      expect(footer).toContain('1 sèries');
      expect(footer).toContain('+1 esc');
      expect(footer).toContain('800');
    });
  });

  // De l'historial vell només se'n baixa el resum de la targeta: obrir el
  // detall és el moment de demanar-ne les sèries.
  it('demana les sèries quan la sessió només porta el resum', () => {
    const el = build(makeWorkout({ entriesLoaded: false, exerciseCount: 3 } as Partial<Workout>), true);
    expect(ensureWorkoutEntries).toHaveBeenCalledWith('w1');
    expect(el.querySelector('.wd-pending')).toBeTruthy();
  });
});
