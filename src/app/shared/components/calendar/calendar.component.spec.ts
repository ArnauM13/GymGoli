import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CalendarComponent } from './calendar.component';
import { WorkoutService } from '../../../core/services/workout.service';
import { SportService } from '../../../core/services/sport.service';
import { TodayService } from '../../../core/services/today.service';
import { addDays, mondayOf } from '../../utils/calendar-utils';

/**
 * El calendari és el mateix a Inici i a l'Historial, i va endavant a totes
 * dues: els dies de davant es poden triar perquè és així com es planifiquen.
 */
describe('CalendarComponent', () => {
  const TODAY = '2024-03-13';   // dimecres
  let component: CalendarComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<CalendarComponent>>;

  beforeEach(async () => {
    const mockWorkoutService = {
      workouts:          signal([]),
      plannedByDate:     signal(new Map()),
      todayDateString:   () => TODAY,
      hasRange:          () => true,
      ensureMonthLoaded: jasmine.createSpy('ensureMonthLoaded'),
    };
    const mockSportService = {
      isLoaded:                       signal(true),
      sessions:                       signal([]),
      sports:                         signal([]),
      getSportsForDate:               () => [],
      getPlannedSportSessionsForDate: () => [],
      ensureLoaded:                   jasmine.createSpy('ensureLoaded'),
      ensureMonthLoaded:              jasmine.createSpy('ensureMonthLoaded'),
    };

    await TestBed.configureTestingModule({
      imports: [CalendarComponent],
      providers: [
        { provide: WorkoutService, useValue: mockWorkoutService },
        { provide: SportService,   useValue: mockSportService },
        { provide: TodayService,   useValue: { today: signal(TODAY) } },
      ],
    }).compileComponents();

    fixture   = TestBed.createComponent(CalendarComponent);
    component = fixture.componentInstance;
    component.weekStart.set(mondayOf(TODAY));
    fixture.detectChanges();
  });

  it('deixa passar a la setmana vinent', () => {
    const monday = component.weekStart();
    component.navigateForward();
    expect(component.weekStart()).toBe(addDays(monday, 7));
  });

  it('no posa cap sostre a la navegació endavant', () => {
    const forwardBtn = fixture.nativeElement
      .querySelectorAll('.cal-nav-btn')[1] as HTMLButtonElement;
    expect(forwardBtn.disabled).toBeFalse();
  });

  it('deixa triar un dia futur: és així com es planifica', () => {
    const selected: string[] = [];
    component.dateSelected.subscribe((d: string) => selected.push(d));
    const tomorrow = addDays(TODAY, 1);

    const cell = component.weekDays().find(c => c.date === tomorrow);
    expect(cell?.isFuture).toBeTrue();

    const btn = Array.from(
      fixture.nativeElement.querySelectorAll('.cal-week-day') as NodeListOf<HTMLButtonElement>,
    )[component.weekDays().findIndex(c => c.date === tomorrow)];
    expect(btn.disabled).toBeFalse();

    btn.click();
    expect(selected).toEqual([tomorrow]);
  });

  it('la vista mensual també va endavant', () => {
    component.view.set('month');
    const month = component.calMonth();
    component.navigateForward();
    expect(component.calMonth()).toBe((month + 1) % 12);
  });
});
