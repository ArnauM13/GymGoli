import { TestBed } from '@angular/core/testing';

import { OfflineService } from './offline.service';

describe('OfflineService', () => {
  describe('isOffline()', () => {
    it('follows the network "offline" / "online" events', () => {
      const service = TestBed.inject(OfflineService);

      window.dispatchEvent(new Event('offline'));
      expect(service.isOffline()).toBeTrue();

      window.dispatchEvent(new Event('online'));
      expect(service.isOffline()).toBeFalse();
    });
  });
});
