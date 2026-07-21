import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { AppHintService } from './app-hint.service';
import { UserSettingsService } from './user-settings.service';

describe('AppHintService', () => {
  let dismissed: ReturnType<typeof signal<string[]>>;
  let update: jasmine.Spy;
  let service: AppHintService;

  beforeEach(() => {
    dismissed = signal<string[]>([]);
    update = jasmine.createSpy('update').and.callFake((patch: { dismissedHints?: string[] }) => {
      if (patch.dismissedHints) dismissed.set(patch.dismissedHints);
      return Promise.resolve();
    });

    TestBed.configureTestingModule({
      providers: [
        { provide: UserSettingsService, useValue: { dismissedHints: dismissed, update } },
      ],
    });
    service = TestBed.inject(AppHintService);
  });

  it('offers the first discovery hint when none are dismissed', () => {
    expect(service.nextDiscoveryHint()?.id).toBe('discover-sports');
  });

  it('isDismissed reflects the persisted set', () => {
    expect(service.isDismissed('discover-sports')).toBeFalse();
    dismissed.set(['discover-sports']);
    expect(service.isDismissed('discover-sports')).toBeTrue();
  });

  it('dismiss() persists the id and advances to the next hint', () => {
    service.dismiss('discover-sports');
    expect(update).toHaveBeenCalledWith({ dismissedHints: ['discover-sports'] });
    expect(service.nextDiscoveryHint()?.id).toBe('discover-exercises');
  });

  it('returns null once every hint is dismissed', () => {
    const all = [
      'discover-sports', 'discover-exercises', 'discover-templates', 'discover-goal',
      'discover-progress', 'discover-preferences', 'discover-advanced',
    ];
    dismissed.set(all);
    expect(service.nextDiscoveryHint()).toBeNull();
  });

  it('dismiss() is a no-op for an already-dismissed id', () => {
    dismissed.set(['discover-sports']);
    service.dismiss('discover-sports');
    expect(update).not.toHaveBeenCalled();
  });
});
