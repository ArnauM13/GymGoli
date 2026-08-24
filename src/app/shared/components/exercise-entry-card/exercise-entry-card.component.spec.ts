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
      expect(el.querySelector('[aria-label="Eliminar exercici"]')).toBeFalsy();
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
      (el.querySelector('[aria-label="Eliminar exercici"]') as HTMLButtonElement).click();

      expect(statsSpy).toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalled();
      expect(headerSpy).not.toHaveBeenCalled();
    });
  });

  describe('keyboard access', () => {
    it('exposes the name/meta area as a button with the exercise as its name', () => {
      setInputs({ collapsed: true, entry: entry({ exerciseName: 'Press banca', sets: [{ weight: 60, reps: 8 }] }) });
      const main = (fixture.nativeElement as HTMLElement).querySelector('button.eec-header-main');
      expect(main).toBeTruthy();
      expect(main!.getAttribute('aria-label')).toContain('Press banca');
    });

    it('reports the collapsed state through aria-expanded', () => {
      setInputs({ collapsed: true, entry: entry() });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.eec-header-main')!.getAttribute('aria-expanded')).toBe('false');

      fixture.componentRef.setInput('collapsed', false);
      fixture.detectChanges();
      expect(el.querySelector('.eec-header-main')!.getAttribute('aria-expanded')).toBe('true');
    });

    it('activating the header button by keyboard emits headerClick', () => {
      setInputs({ collapsed: true, entry: entry() });
      const spy = jasmine.createSpy('header');
      component.headerClick.subscribe(spy);

      const main = (fixture.nativeElement as HTMLElement).querySelector('button.eec-header-main') as HTMLButtonElement;
      main.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      main.click(); // what the browser does for Enter/Space on a <button>

      expect(spy).toHaveBeenCalled();
    });

    it('hides the decorative meta from screen readers', () => {
      setInputs({ collapsed: false, entry: entry({ sets: [{ weight: 60, reps: 8 }] }) });
      const el = fixture.nativeElement as HTMLElement;
      for (const sel of ['.eec-bar', '.eec-max', '.eec-sets-badge', '.eec-chevron']) {
        expect(el.querySelector(sel)?.getAttribute('aria-hidden')).toBe('true', `${sel} should be aria-hidden`);
      }
    });

    it('announces selection state instead of expansion while grouping', () => {
      fixture.componentRef.setInput('entry', entry());
      fixture.componentRef.setInput('selectable', true);
      fixture.componentRef.setInput('selected', true);
      fixture.detectChanges();

      const main = (fixture.nativeElement as HTMLElement).querySelector('.eec-header-main')!;
      expect(main.getAttribute('aria-pressed')).toBe('true');
      expect(main.getAttribute('aria-expanded')).toBeNull();
      expect(main.getAttribute('aria-label')).toContain('Seleccionar');
    });
  });

  describe('selectable (superset grouping mode)', () => {
    it('shows an unchecked circle instead of the chevron when selectable and not selected', () => {
      fixture.componentRef.setInput('entry', entry());
      fixture.componentRef.setInput('selectable', true);
      fixture.componentRef.setInput('selected', false);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.eec-select-check')?.textContent?.trim()).toBe('radio_button_unchecked');
      expect(el.querySelector('.eec-chevron')).toBeFalsy();
    });

    it('shows a filled check and highlights the card when selected', () => {
      fixture.componentRef.setInput('entry', entry());
      fixture.componentRef.setInput('selectable', true);
      fixture.componentRef.setInput('selected', true);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.eec-select-check')?.textContent?.trim()).toBe('check_circle');
      expect(el.querySelector('.eec-card--selected')).toBeTruthy();
    });

    it('renders the normal chevron when not selectable', () => {
      fixture.componentRef.setInput('entry', entry());
      fixture.componentRef.setInput('selectable', false);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.eec-chevron')).toBeTruthy();
      expect(el.querySelector('.eec-select-check')).toBeFalsy();
    });
  });
});
