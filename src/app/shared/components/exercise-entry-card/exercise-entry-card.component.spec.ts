import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExerciseEntryCardComponent } from './exercise-entry-card.component';
import { WorkoutEntry } from '../../../core/models/workout.model';

function entry(overrides: Partial<WorkoutEntry> = {}): WorkoutEntry {
  return { exerciseId: 'ex1', exerciseName: 'Press banca', sets: [], ...overrides };
}

describe('ExerciseEntryCardComponent', () => {
  let fixture: ComponentFixture<ExerciseEntryCardComponent>;
  let component: ExerciseEntryCardComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ExerciseEntryCardComponent] });
    fixture = TestBed.createComponent(ExerciseEntryCardComponent);
    component = fixture.componentInstance;
  });

  function setInputs(overrides: Partial<{
    entry: WorkoutEntry; collapsed: boolean; showStatsAction: boolean; showDeleteAction: boolean;
  }>): void {
    fixture.componentRef.setInput('entry', overrides.entry ?? entry());
    fixture.componentRef.setInput('collapsed', overrides.collapsed ?? true);
    fixture.componentRef.setInput('showStatsAction', overrides.showStatsAction ?? false);
    fixture.componentRef.setInput('showDeleteAction', overrides.showDeleteAction ?? false);
    fixture.detectChanges();
  }

  describe('header stats/delete actions (collapsed + no sets)', () => {
    it('renders stats and delete buttons in the header when collapsed with no sets', () => {
      setInputs({ collapsed: true, entry: entry({ sets: [] }), showStatsAction: true, showDeleteAction: true });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.eec-header-action-btn')).toBeTruthy();
      expect(el.querySelectorAll('.eec-header-action-btn').length).toBe(2);
    });

    it('does not render header actions when the entry already has sets', () => {
      setInputs({
        collapsed: true,
        entry: entry({ sets: [{ weight: 60, reps: 10 }] }),
        showStatsAction: true, showDeleteAction: true,
      });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.eec-header-action-btn')).toBeFalsy();
    });

    it('does not render header actions when expanded, even with no sets', () => {
      setInputs({ collapsed: false, entry: entry({ sets: [] }), showStatsAction: true, showDeleteAction: true });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.eec-header-action-btn')).toBeFalsy();
    });

    it('respects showStatsAction/showDeleteAction independently', () => {
      setInputs({ collapsed: true, entry: entry({ sets: [] }), showStatsAction: true, showDeleteAction: false });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('.eec-header-action-btn').length).toBe(1);
      expect(el.querySelector('[aria-label="Estadístiques"]')).toBeTruthy();
      expect(el.querySelector('[aria-label="Eliminar"]')).toBeFalsy();
    });

    it('emits statsClick and deleteClick without triggering headerClick', () => {
      setInputs({ collapsed: true, entry: entry({ sets: [] }), showStatsAction: true, showDeleteAction: true });
      const statsSpy  = jasmine.createSpy('stats');
      const deleteSpy = jasmine.createSpy('delete');
      const headerSpy = jasmine.createSpy('header');
      component.statsClick.subscribe(statsSpy);
      component.deleteClick.subscribe(deleteSpy);
      component.headerClick.subscribe(headerSpy);

      const el = fixture.nativeElement as HTMLElement;
      (el.querySelector('[aria-label="Estadístiques"]') as HTMLButtonElement).click();
      (el.querySelector('[aria-label="Eliminar"]') as HTMLButtonElement).click();

      expect(statsSpy).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalled();
      expect(headerSpy).not.toHaveBeenCalled();
    });
  });
});
