import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { FilterBarComponent } from './filter-bar.component';

describe('FilterBarComponent', () => {
  let component: FilterBarComponent;
  let fixture: ComponentFixture<FilterBarComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [FilterBarComponent] });
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
    it('defaults to an empty list of filterable categories until the parent passes one in', () => {
      expect(component.categories()).toEqual([]);
    });

    it('is settable directly, e.g. from the template chips', () => {
      component.category.set('push');
      expect(component.category()).toBe('push');
    });
  });
});
