import { TestBed } from '@angular/core/testing';

import { TodayService } from './today.service';

describe('TodayService', () => {
  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 8, 3, 23, 59, 0));
    TestBed.configureTestingModule({ providers: [TodayService] });
  });

  afterEach(() => jasmine.clock().uninstall());

  it('starts on the user\'s local day', () => {
    expect(TestBed.inject(TodayService).today()).toBe('2026-09-03');
  });

  it('rolls over at the user\'s local midnight, not on a 24h timer', () => {
    const service = TestBed.inject(TodayService);
    expect(service.today()).toBe('2026-09-03');

    // A minute past midnight the timer has fired and the day has moved on.
    jasmine.clock().tick(2 * 60 * 1000);

    expect(service.today()).toBe('2026-09-04');
  });

  it('does not move before midnight', () => {
    const service = TestBed.inject(TodayService);
    jasmine.clock().tick(30 * 1000);
    expect(service.today()).toBe('2026-09-03');
  });

  it('catches up when the app comes back to the foreground', () => {
    const service = TestBed.inject(TodayService);
    jasmine.clock().mockDate(new Date(2026, 8, 5, 9, 0, 0));

    service.refresh();

    expect(service.today()).toBe('2026-09-05');
  });
});
