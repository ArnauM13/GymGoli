import { TestBed } from '@angular/core/testing';

import { OfflineService } from './offline.service';

describe('OfflineService', () => {
  const LS_KEY = 'gymgoli_force_offline';

  beforeEach(() => localStorage.removeItem(LS_KEY));
  afterEach(() => localStorage.removeItem(LS_KEY));

  it('defaults forceOffline to false when nothing is stored', () => {
    const service = TestBed.inject(OfflineService);
    expect(service.forceOffline()).toBeFalse();
  });

  it('restores forceOffline=true from localStorage', () => {
    localStorage.setItem(LS_KEY, 'true');
    const service = TestBed.inject(OfflineService);
    expect(service.forceOffline()).toBeTrue();
  });

  it('treats any non-"true" stored value as false', () => {
    localStorage.setItem(LS_KEY, 'nope');
    const service = TestBed.inject(OfflineService);
    expect(service.forceOffline()).toBeFalse();
  });

  describe('toggleForceOffline()', () => {
    it('flips forceOffline and persists the new value to localStorage', () => {
      const service = TestBed.inject(OfflineService);

      service.toggleForceOffline();
      expect(service.forceOffline()).toBeTrue();
      expect(localStorage.getItem(LS_KEY)).toBe('true');

      service.toggleForceOffline();
      expect(service.forceOffline()).toBeFalse();
      expect(localStorage.getItem(LS_KEY)).toBe('false');
    });
  });

  describe('isOffline()', () => {
    it('is true when forceOffline is on, regardless of network state', () => {
      const service = TestBed.inject(OfflineService);
      service.toggleForceOffline();
      expect(service.isOffline()).toBeTrue();
    });

    it('follows the network "offline" / "online" events', () => {
      const service = TestBed.inject(OfflineService);

      window.dispatchEvent(new Event('offline'));
      expect(service.isOffline()).toBeTrue();

      window.dispatchEvent(new Event('online'));
      expect(service.isOffline()).toBeFalse();
    });

    it('stays true if the network comes back while forceOffline is on', () => {
      const service = TestBed.inject(OfflineService);
      service.toggleForceOffline();

      window.dispatchEvent(new Event('online'));
      expect(service.isOffline()).toBeTrue();
    });
  });
});
