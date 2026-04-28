import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import { PreloadAllModules, RouteReuseStrategy, provideRouter, withPreloading } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import localeCA from '@angular/common/locales/ca';

import { routes } from './app.routes';
import { AppReuseStrategy } from './core/route-reuse.strategy';

registerLocaleData(localeCA, 'ca');

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideAnimationsAsync(),
    { provide: RouteReuseStrategy, useClass: AppReuseStrategy },
    { provide: LOCALE_ID, useValue: 'ca' },
  ],
};
