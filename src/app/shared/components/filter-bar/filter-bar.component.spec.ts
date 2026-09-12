import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { signal } from '@angular/core';

import { FilterBarComponent } from './filter-bar.component';
import { TrainingTypeService } from '../../../core/services/training-type.service';
import { DEFAULT_TRAINING_TYPES } from '../../../core/models/training-type.model';
import { Sport } from '../../../core/models/sport.model';

function makeSport(overrides: Partial<Sport> = {}): Sport {
  return {
    id: 's1', name: 'Córrer', icon: 'directions_run', color: '#43A047',
    subtypes: [], metricDefs: [], createdAt: new Date(), ...overrides,
  };
}

describe('FilterBarComponent', () => {
  let component: FilterBarComponent;
  let fixture: ComponentFixture<FilterBarComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FilterBarComponent],
      providers: [
        { provide: TrainingTypeService, useValue: { types: signal(DEFAULT_TRAINING_TYPES) } },
      ],
    });
    fixture = TestBed.createComponent(FilterBarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('defaults to an empty search, ascending-off sort and no category filter', () => {
    expect(component.searchQuery()).toBe('');
    expect(component.sortDesc()).toBeTrue();
    expect(component.category()).toBeNull();
  });

  describe('search input', () => {
    it('does not update searchQuery immediately on keystroke (debounced)', fakeAsync(() => {
      component.inputValue = 'press';
      expect(component.searchQuery()).toBe('');
      tick(300);
      expect(component.searchQuery()).toBe('press');
    }));

    it('resets the debounce timer on rapid successive keystrokes', fakeAsync(() => {
      component.inputValue = 'pr';
      tick(150);
      component.inputValue = 'press';
      tick(150);
      expect(component.searchQuery()).toBe(''); // still within the debounce window
      tick(150);
      expect(component.searchQuery()).toBe('press');
    }));

    it('clearSearch() empties both the visible input and searchQuery immediately', fakeAsync(() => {
      component.inputValue = 'press';
      tick(300);
      component.clearSearch();
      expect(component.inputValue).toBe('');
      expect(component.searchQuery()).toBe('');
    }));

    it('reflects external resets of searchQuery back into the visible input', () => {
      component.searchQuery.set('squat');
      fixture.detectChanges();
      expect(component.inputValue).toBe('squat');
    });
  });

  describe('toggleSort()', () => {
    it('flips sortDesc', () => {
      component.toggleSort();
      expect(component.sortDesc()).toBeFalse();
      component.toggleSort();
      expect(component.sortDesc()).toBeTrue();
    });
  });

  describe('category', () => {
    it("exposes the user's training types as the filterable categories", () => {
      expect(component.categories()).toEqual(['push', 'pull', 'legs']);
    });

    it('is settable directly, e.g. from the template chips', () => {
      component.category.set('push');
      expect(component.category()).toBe('push');
    });
  });

  // ── Tipus d'entrenament i esports: exclusius ─────────────────────────────

  describe('selectCategory() / selectSport()', () => {
    it('selectCategory() posa el tipus i el treu si es torna a prémer', () => {
      component.selectCategory('push');
      expect(component.category()).toBe('push');
      component.selectCategory('push');
      expect(component.category()).toBeNull();
    });

    it('selectSport() posa l\'esport i el treu si es torna a prémer', () => {
      component.selectSport('s1');
      expect(component.sport()).toBe('s1');
      component.selectSport('s1');
      expect(component.sport()).toBeNull();
    });

    // Cap activitat és un tipus de gimnàs *i* un esport: amb els dos posats la
    // llista no hauria ensenyat mai res.
    it('triar un esport treu el tipus que hi hagués', () => {
      component.selectCategory('push');
      component.selectSport('s1');
      expect(component.sport()).toBe('s1');
      expect(component.category()).toBeNull();
    });

    it('i triar un tipus treu l\'esport', () => {
      component.selectSport('s1');
      component.selectCategory('legs');
      expect(component.category()).toBe('legs');
      expect(component.sport()).toBeNull();
    });
  });

  describe('filtres d\'esport a la fila', () => {
    it('no en pinta cap quan no se li passa cap esport', () => {
      expect(fixture.nativeElement.querySelectorAll('.filter-icon').length).toBe(3);
      expect(fixture.nativeElement.querySelector('.fb-sep')).toBeNull();
    });

    it('pinta una rodona per esport, separada dels tipus', () => {
      fixture.componentRef.setInput('sports', [
        makeSport(),
        makeSport({ id: 's2', name: 'Pàdel', icon: 'sports_tennis' }),
      ]);
      fixture.detectChanges();

      // Tres tipus per defecte + dos esports.
      expect(fixture.nativeElement.querySelectorAll('.filter-icon').length).toBe(5);
      expect(fixture.nativeElement.querySelector('.fb-sep')).not.toBeNull();
      const titles = [...fixture.nativeElement.querySelectorAll('.filter-icon')]
        .map((b: HTMLElement) => b.getAttribute('title'));
      expect(titles).toContain('Pàdel');
    });
  });
});
