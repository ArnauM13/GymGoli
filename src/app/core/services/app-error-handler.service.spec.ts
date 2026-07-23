import { Injector, NgZone, runInInjectionContext } from '@angular/core';

import { AppErrorHandler } from './app-error-handler.service';
import { FeedbackService } from '../../shared/services/feedback.service';

/** Built with a bare Injector (not TestBed) so the change-detection scheduler
 *  isn't pulled in — it would try to subscribe to a real NgZone we don't need
 *  here. `NgZone.run` is faked to run its callback synchronously. */
function makeHandler(errorSpy: jasmine.Spy): AppErrorHandler {
  const injector = Injector.create({
    providers: [
      { provide: FeedbackService, useValue: { error: errorSpy } },
      { provide: NgZone, useValue: { run: (fn: () => void) => fn() } },
    ],
  });
  return runInInjectionContext(injector, () => new AppErrorHandler());
}

describe('AppErrorHandler', () => {
  let errorSpy: jasmine.Spy;

  beforeEach(() => {
    errorSpy = jasmine.createSpy('error');
  });

  it('shows a toast for an unexpected error', () => {
    makeHandler(errorSpy).handleError(new Error('boom'));
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('collapses a burst of the same error into a single toast', () => {
    // Simulates a template expression that re-throws on every change-detection
    // pass — the failure mode that used to spiral into a page crash.
    const handler = makeHandler(errorSpy);
    for (let i = 0; i < 50; i++) handler.handleError(new Error('boom'));
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('still surfaces distinct errors', () => {
    const handler = makeHandler(errorSpy);
    handler.handleError(new Error('first'));
    handler.handleError(new Error('second'));
    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('ignores chunk-load errors from a service-worker update', () => {
    makeHandler(errorSpy).handleError(new Error('ChunkLoadError: Loading chunk 5 failed'));
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
