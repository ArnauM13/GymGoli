import { TestBed } from '@angular/core/testing';

import { ClockService } from './clock.service';

describe('ClockService', () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('exposes the current calendar day', () => {
    jasmine.clock().mockDate(new Date('2026-07-20T10:00:00Z'));
    const service = TestBed.inject(ClockService);
    expect(service.today()).toBe('2026-07-20');
  });

  it('rolls today over after midnight on refresh()', () => {
    jasmine.clock().mockDate(new Date('2026-07-20T23:59:00Z'));
    const service = TestBed.inject(ClockService);
    expect(service.today()).toBe('2026-07-20');

    jasmine.clock().mockDate(new Date('2026-07-21T00:01:00Z'));
    service.refresh();
    expect(service.today()).toBe('2026-07-21');
  });

  it('rolls today over via the periodic interval', () => {
    jasmine.clock().mockDate(new Date('2026-07-20T23:59:30Z'));
    const service = TestBed.inject(ClockService);

    jasmine.clock().mockDate(new Date('2026-07-21T00:00:30Z'));
    jasmine.clock().tick(60_000);
    expect(service.today()).toBe('2026-07-21');
  });

  it('does not touch the signal when the day has not changed', () => {
    jasmine.clock().mockDate(new Date('2026-07-20T10:00:00Z'));
    const service = TestBed.inject(ClockService);
    const before = service.today();
    jasmine.clock().mockDate(new Date('2026-07-20T11:00:00Z'));
    service.refresh();
    expect(service.today()).toBe(before);
  });
});
