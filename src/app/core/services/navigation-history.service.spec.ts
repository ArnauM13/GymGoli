import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';

import { NavigationHistoryService } from './navigation-history.service';

describe('NavigationHistoryService', () => {
  let events: Subject<NavigationEnd>;
  let navigateByUrl: jasmine.Spy;
  let service: NavigationHistoryService;

  /** Com si l'usuari hi hagués anat: el servei només escolta el router. */
  const visit = (url: string) => events.next(new NavigationEnd(1, url, url));

  beforeEach(() => {
    events        = new Subject<NavigationEnd>();
    navigateByUrl = jasmine.createSpy('navigateByUrl');

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { events, navigateByUrl } }],
    });
    service = TestBed.inject(NavigationHistoryService);
  });

  it('torna al lloc anterior', () => {
    visit('/home');
    visit('/calendar');

    service.goBack();

    expect(navigateByUrl).toHaveBeenCalledWith('/home', jasmine.anything());
  });

  it('cau al fallback quan no hi ha d\'on venir', () => {
    visit('/sport-session/s1');

    service.goBack('/home');

    expect(navigateByUrl).toHaveBeenCalledWith('/home', jasmine.anything());
  });

  describe('goBackFromSession()', () => {
    it('salta el taulell d\'Entrenament i torna al lloc de debò', () => {
      visit('/home');
      visit('/calendar');
      visit('/train');
      visit('/sport-session/s1');

      service.goBackFromSession();

      expect(navigateByUrl).toHaveBeenCalledWith('/calendar', jasmine.anything());
    });

    it('va a Inici quan només es venia d\'Entrenament', () => {
      visit('/train');
      visit('/sport-session/s1');

      service.goBackFromSession();

      expect(navigateByUrl).toHaveBeenCalledWith('/home', jasmine.anything());
    });
  });
});
