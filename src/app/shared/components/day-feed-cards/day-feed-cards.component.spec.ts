import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { DayFeedCardsComponent } from './day-feed-cards.component';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { UserSettingsService } from '../../../core/services/user-settings.service';
import { ExerciseService } from '../../../core/services/exercise.service';
import { FeedbackService } from '../../services/feedback.service';
import { Workout } from '../../../core/models/workout.model';

function makeWorkout(overrides: Partial<Workout> = {}): Workout {
  return { id: '1', date: '2024-01-01', entries: [], createdAt: new Date(), ...overrides };
}

describe('DayFeedCardsComponent', () => {
  let component: DayFeedCardsComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<DayFeedCardsComponent>>;
  let startPlannedWorkout: jasmine.Spy;
  let updateSession: jasmine.Spy;
  let deleteSession: jasmine.Spy;

  beforeEach(async () => {
    startPlannedWorkout = jasmine.createSpy().and.resolveTo(undefined);
    updateSession = jasmine.createSpy().and.resolveTo(undefined);
    deleteSession = jasmine.createSpy().and.resolveTo(undefined);

    await TestBed.configureTestingModule({
      imports: [DayFeedCardsComponent],
      providers: [
        { provide: WorkoutService, useValue: { startPlannedWorkout } },
        { provide: SportService, useValue: { updateSession, deleteSession } },
        { provide: UserSettingsService, useValue: { difficultyScale: signal('emoji'), bodyweightKg: signal(null) } },
        { provide: ExerciseService, useValue: { loadTypeOf: () => undefined, getById: () => undefined } },
        { provide: FeedbackService, useValue: { success: jasmine.createSpy(), error: jasmine.createSpy(), info: jasmine.createSpy() } },
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

      const row = (fixture.nativeElement as HTMLElement).querySelector('.feed-sport-row') as HTMLElement;
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
