import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { ExerciseSuggestionService } from './exercise-suggestion.service';
import { WorkoutService } from './workout.service';
import { TemplateService } from './template.service';
import { ExerciseService } from './exercise.service';
import { Exercise, ExerciseCategory, ExerciseSubcategory } from '../models/exercise.model';
import { Workout } from '../models/workout.model';
import { WorkoutTemplate } from '../models/template.model';

function ex(id: string, category: ExerciseCategory, subcategory?: ExerciseSubcategory): Exercise {
  return { id, name: id, category, subcategory, createdAt: new Date() };
}

function workout(date: string, category: ExerciseCategory, ids: string[]): Workout {
  return {
    id: date, date, category, categories: [category],
    entries: ids.map(exerciseId => ({ exerciseId, exerciseName: exerciseId, sets: [] })),
    createdAt: new Date(), status: 'done',
  };
}

const CATALOG: Exercise[] = [
  ex('back1', 'pull', 'back'),
  ex('back2', 'pull', 'back'),
  ex('bi1',   'pull', 'biceps'),
  ex('bi2',   'pull', 'biceps'),
];

describe('ExerciseSuggestionService', () => {
  let doneWorkouts: ReturnType<typeof signal<Workout[]>>;
  let templates: ReturnType<typeof signal<WorkoutTemplate[]>>;
  let exercises: ReturnType<typeof signal<Exercise[]>>;
  let service: ExerciseSuggestionService;

  beforeEach(() => {
    doneWorkouts = signal<Workout[]>([]);
    templates    = signal<WorkoutTemplate[]>([]);
    exercises    = signal<Exercise[]>(CATALOG);

    TestBed.configureTestingModule({
      providers: [
        { provide: WorkoutService,  useValue: { doneWorkouts } },
        { provide: TemplateService, useValue: { templates } },
        { provide: ExerciseService, useValue: { exercises } },
      ],
    });
    service = TestBed.inject(ExerciseSuggestionService);
  });

  it('stays quiet until there is enough history to learn from', () => {
    doneWorkouts.set([workout('2024-01-01', 'pull', ['back1', 'bi1'])]);
    expect(service.suggest('pull', [])).toEqual([]);
  });

  it('suggests from history once there are enough sources', () => {
    doneWorkouts.set([
      workout('2024-01-01', 'pull', ['back1', 'bi1']),
      workout('2024-01-05', 'pull', ['back1', 'bi1']),
    ]);
    const out = service.suggest('pull', ['back1']);
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].exerciseId).toBe('bi1');
  });

  it('learns from saved templates as well as workouts', () => {
    templates.set([
      { id: 't1', name: 'Pull', category: 'pull', createdAt: '2024-01-01',
        entries: [{ exerciseId: 'back1', exerciseName: 'back1' }, { exerciseId: 'bi1', exerciseName: 'bi1' }] },
      { id: 't2', name: 'Pull B', category: 'pull', createdAt: '2024-01-02',
        entries: [{ exerciseId: 'back1', exerciseName: 'back1' }, { exerciseId: 'bi1', exerciseName: 'bi1' }] },
    ]);
    const out = service.suggest('pull', ['back1']);
    expect(out[0].exerciseId).toBe('bi1');
  });

  it('stops suggesting once the session reaches the typical size', () => {
    doneWorkouts.set([
      workout('2024-01-01', 'pull', ['back1', 'bi1']),
      workout('2024-01-05', 'pull', ['back1', 'bi1']),
    ]);
    // Typical pull day = 2 exercises. With 2 already added, stay quiet…
    expect(service.suggest('pull', ['back1', 'bi1'])).toEqual([]);
    // …but with just 1, it still helps fill out the day.
    expect(service.suggest('pull', ['back1']).length).toBeGreaterThan(0);
  });

  it('ignores workouts of other categories', () => {
    doneWorkouts.set([
      workout('2024-01-01', 'push', ['back1', 'bi1']),
      workout('2024-01-02', 'push', ['back1', 'bi1']),
    ]);
    expect(service.suggest('pull', [])).toEqual([]);
  });

  it('returns [] without throwing for a non-gym category', () => {
    // A workout can carry a legacy/foreign category string cast to
    // ExerciseCategory; feeding it in must never crash the suggestion engine.
    doneWorkouts.set([
      workout('2024-01-01', 'pull', ['back1', 'bi1']),
      workout('2024-01-05', 'pull', ['back1', 'bi1']),
    ]);
    expect(() => service.suggest('mixed' as ExerciseCategory, ['back1'])).not.toThrow();
    expect(service.suggest('mixed' as ExerciseCategory, ['back1'])).toEqual([]);
  });
});
