import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DayFeedCardsComponent } from './day-feed-cards.component';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FeedbackService } from '../../services/feedback.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { Workout } from '../../../core/models/workout.model';

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: '2024-01-01', entries: [], createdAt: new Date(), ...overrides };
}

describe('DayFeedCardsComponent', () => {
  let component: DayFeedCardsComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<DayFeedCardsComponent>>;
  let startPlannedWorkout: jasmine.Spy;
  let deleteWorkout: jasmine.Spy;
  let updateSession: jasmine.Spy;
  let deleteSession: jasmine.Spy;
  let confirm: jasmine.Spy;

  beforeEach(async () => {
    startPlannedWorkout = jasmine.createSpy().and.resolveTo(undefined);
    deleteWorkout = jasmine.createSpy().and.resolveTo(undefined);
    updateSession = jasmine.createSpy().and.resolveTo(undefined);
    deleteSession = jasmine.createSpy().and.resolveTo(undefined);
    confirm = jasmine.createSpy().and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [DayFeedCardsComponent],
      providers: [
        { provide: WorkoutService, useValue: { startPlannedWorkout, deleteWorkout } },
        { provide: SportService, useValue: { updateSession, deleteSession } },
        { provide: UserSettingsService, useValue: { difficultyScale: signal('emoji'), bodyweightKg: signal(null), weightUnit: signal<'kg' | 'lb'>('kg') } },
        { provide: ExerciseService, useValue: { loadTypeOf: () => undefined, getById: () => undefined } },
        { provide: FeedbackService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
        { provide: ConfirmDialogService, useValue: { confirm } },
      ],
    })
      .overrideComponent(DayFeedCardsComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } })
      .compileComponents();

    fixture = TestBed.createComponent(DayFeedCardsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  describe('handleWorkoutClick()', () => {
    it('starts a planned workout instead of opening it directly', async () => {
      const openSpy = spyOn(component.open, 'emit');
      const w = makeWorkout({ status: 'planned' });
      component.handleWorkoutClick(w);
      expect(startPlannedWorkout).toHaveBeenCalledWith('1');
      expect(openSpy).not.toHaveBeenCalled();
      await fixture.whenStable();
    });

    it('emits open immediately for a done workout', () => {
      const openSpy = spyOn(component.open, 'emit');
      component.handleWorkoutClick(makeWorkout());
      expect(openSpy).toHaveBeenCalledWith('1');
      expect(startPlannedWorkout).not.toHaveBeenCalled();
    });
  });

  describe('startPlan()', () => {
    it('emits open once the plan has started', async () => {
      const openSpy = spyOn(component.open, 'emit');
      await component.startPlan(makeWorkout({ id: 'plan1', status: 'planned' }));
      expect(startPlannedWorkout).toHaveBeenCalledWith('plan1');
      expect(openSpy).toHaveBeenCalledWith('plan1');
    });
  });

  describe('deletePlan()', () => {
    it('deletes the planned workout after confirmation', async () => {
      await component.deletePlan(makeWorkout({ id: 'plan1', status: 'planned' }));
      expect(confirm).toHaveBeenCalled();
      expect(deleteWorkout).toHaveBeenCalledWith('plan1');
    });

    it('does nothing when the confirmation is declined', async () => {
      confirm.and.resolveTo(false);
      await component.deletePlan(makeWorkout({ id: 'plan1', status: 'planned' }));
      expect(deleteWorkout).not.toHaveBeenCalled();
    });
  });

  describe('unified activity card', () => {
    const day = {
      date: '2024-03-05',
      workouts: [makeWorkout({
        id: 'w1', categories: ['push'], feeling: 3 as const,
        entries: [{ exerciseId: 'e1', exerciseName: 'Press banca', sets: [] }],
      })],
      sports: [{
        sport: { id: 'run', name: 'Running', icon: 'directions_run', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() },
        session: { id: 'sess1', date: '2024-03-05', sportId: 'run', duration: 30, createdAt: new Date() },
      }],
    };

    it('gives workouts and sports the same card shell', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('.act-card').length).toBe(2);
      expect(el.querySelectorAll('.ac-bar').length).toBe(2);
      expect(el.querySelectorAll('.ac-main').length).toBe(2);
    });

    it('titles a workout with its training type, not the exercise list', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const title = (fixture.nativeElement as HTMLElement).querySelector('.ac-title') as HTMLElement;
      expect(title.textContent?.trim()).toBe('Empenta');
    });

    it('gives the feeling its own slot on the right, just before the chevron', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const el      = fixture.nativeElement as HTMLElement;
      const feeling = el.querySelector('.ac-main > .ac-feeling') as HTMLElement;
      expect(feeling).toBeTruthy();
      expect(feeling.nextElementSibling?.classList).toContain('ac-chevron');
      expect(el.querySelector('.ac-title-row .ac-feeling')).toBeNull();
      expect(el.querySelector('.ac-stats .ac-feeling')).toBeNull();
    });

    it('keeps the exercise list out of the card preview', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).not.toContain('Press banca');
      // Les xifres resum sí que s'hi queden.
      expect(el.querySelector('.ac-stats')).toBeTruthy();
    });

    it('points a workout out of the feed by default, and expands it in place when asked to', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();
      expect((fixture.nativeElement as HTMLElement).querySelector('.ac-chevron')?.textContent?.trim())
        .toBe('chevron_right');

      fixture.componentRef.setInput('expandWorkouts', true);
      fixture.detectChanges();

      const row = (fixture.nativeElement as HTMLElement).querySelector('.ac-main') as HTMLElement;
      row.click();
      fixture.detectChanges();
      expect(component.expandedWorkoutId()).toBe('w1');
      expect((fixture.nativeElement as HTMLElement).querySelector('app-workout-detail')).toBeTruthy();

      row.click();
      fixture.detectChanges();
      expect(component.expandedWorkoutId()).toBeNull();
    });

    it('still opens the workout from the expanded panel', () => {
      const openSpy = spyOn(component.open, 'emit');
      fixture.componentRef.setInput('day', day);
      fixture.componentRef.setInput('expandWorkouts', true);
      fixture.detectChanges();
      component.handleWorkoutClick(day.workouts[0]);
      fixture.detectChanges();

      const btn = (fixture.nativeElement as HTMLElement).querySelector('.ac-open-btn') as HTMLElement;
      btn.click();
      expect(openSpy).toHaveBeenCalledWith('w1');
    });
  });

  describe('sport row', () => {
    const day = {
      date: '2024-03-05',
      workouts: [],
      sports: [{
        sport: { id: 'run', name: 'Running', icon: 'directions_run', color: '#000', subtypes: [], metricDefs: [], createdAt: new Date() },
        session: { id: 'sess1', date: '2024-03-05', sportId: 'run', duration: 30, createdAt: new Date() },
      }],
    };

    it('expands inline in place of navigating away when clicked, and collapses on a second click', () => {
      fixture.componentRef.setInput('day', day);
      fixture.detectChanges();

      const row = (fixture.nativeElement as HTMLElement).querySelector('.ac-main') as HTMLElement;
      row.click();
      fixture.detectChanges();
      expect(component.expandedSportId()).toBe('sess1');
      expect((fixture.nativeElement as HTMLElement).querySelector('.sport-detail')).toBeTruthy();

      row.click();
      fixture.detectChanges();
      expect(component.expandedSportId()).toBeNull();
    });

    it('saveSportEdit() updates the session with the edited fields and collapses', async () => {
      component.toggleSportExpand(day.sports[0]);
      component.editDuration.set(45);

      await component.saveSportEdit(day.sports[0]);

      expect(updateSession).toHaveBeenCalledWith('sess1', '2024-03-05', jasmine.objectContaining({ duration: 45 }));
      expect(component.expandedSportId()).toBeNull();
    });

    it('deleteSportEdit() deletes the session and collapses', async () => {
      component.toggleSportExpand(day.sports[0]);

      await component.deleteSportEdit(day.sports[0]);

      expect(deleteSession).toHaveBeenCalledWith('sess1', '2024-03-05');
      expect(component.expandedSportId()).toBeNull();
    });
  });
});
