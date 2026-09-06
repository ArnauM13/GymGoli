import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { OnboardingTourService } from './onboarding-tour.service';
import { TOUR_STOPS } from '../models/onboarding-tour.model';
import { UserSettingsService } from './user-settings.service';

describe('OnboardingTourService', () => {
  let service: OnboardingTourService;
  let navigate: jasmine.Spy;
  let update: jasmine.Spy;
  let url: string;

  beforeEach(() => {
    navigate = jasmine.createSpy('navigate');
    update   = jasmine.createSpy('update');
    url      = '/settings';

    TestBed.configureTestingModule({
      providers: [
        OnboardingTourService,
        { provide: Router, useValue: { navigate, get url() { return url; } } },
        { provide: UserSettingsService, useValue: { update, guidedTourDone: () => false } },
      ],
    });
    service = TestBed.inject(OnboardingTourService);
  });

  it('is idle until it is started', () => {
    expect(service.active()).toBeFalse();
    expect(service.stop()).toBeNull();
  });

  // ── El recorregut ────────────────────────────────────────────────────────

  describe('the tour itself', () => {
    it('visits the tabs, the configuration, the planner and a wrap-up', () => {
      expect(TOUR_STOPS.map(s => s.id)).toEqual([
        'nav-home', 'day-action', 'nav-history-progress', 'nav-settings',
        'cfg-gym', 'cfg-sports', 'cfg-routines', 'planner', 'wrap-up',
      ]);
    });

    it('gives every stop a real screen to stand on', () => {
      for (const stop of TOUR_STOPS) expect(stop.route.startsWith('/')).toBeTrue();
    });

    it('points at something on every stop but the closing one', () => {
      for (const stop of TOUR_STOPS.slice(0, -1)) expect(stop.targets.length).toBeGreaterThan(0);
    });

    it('leaves the dog line to whoever speaks alone — shared stops carry data, not voice', () => {
      for (const stop of TOUR_STOPS) {
        if (stop.mascot !== 'both') expect(stop.line).withContext(stop.id).toBeTruthy();
      }
    });

    it('gives the gym setup to Marley and the sports one to Xoco', () => {
      expect(TOUR_STOPS.find(s => s.id === 'cfg-gym')!.mascot).toBe('marley');
      expect(TOUR_STOPS.find(s => s.id === 'cfg-sports')!.mascot).toBe('xoco');
    });

    it('has no duplicate ids', () => {
      expect(new Set(TOUR_STOPS.map(s => s.id)).size).toBe(TOUR_STOPS.length);
    });

    // El Perfil arrenca plegat: una parada que assenyali una fila de dins
    // d'una secció ha de demanar-la a la URL, o no hi haurà res per il·luminar.
    it('asks the Perfil for the section holding the rows it points at', () => {
      for (const stop of TOUR_STOPS.filter(s => s.route === '/settings')) {
        expect(stop.queryParams).withContext(stop.id).toEqual({ section: 'config' });
      }
    });
  });

  // ── Navegació ────────────────────────────────────────────────────────────

  describe('start()', () => {
    it('opens on the first stop', () => {
      service.start();
      expect(service.active()).toBeTrue();
      expect(service.index()).toBe(0);
      expect(service.stop()!.id).toBe(TOUR_STOPS[0].id);
    });

    it('navigates to the first stop screen', () => {
      service.start();
      expect(navigate).toHaveBeenCalledWith(['/home'], {});
    });

    it('restarts from the beginning when run again', () => {
      service.start();
      service.next();
      service.start();
      expect(service.index()).toBe(0);
    });
  });

  describe('next() / prev()', () => {
    beforeEach(() => service.start());

    it('advances one stop at a time', () => {
      service.next();
      expect(service.index()).toBe(1);
    });

    it('goes back', () => {
      service.next();
      service.prev();
      expect(service.index()).toBe(0);
    });

    it('cannot go back past the first stop', () => {
      service.prev();
      expect(service.index()).toBe(0);
    });

    it('does not re-navigate when the next stop is on the same screen', () => {
      url = TOUR_STOPS[1].route;
      navigate.calls.reset();
      service.next();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('navigates when the stop changes screen', () => {
      url = '/home';
      while (!service.isLast() && service.stop()!.route === '/home') service.next();
      // Les parades del Perfil demanen la secció on són les files que
      // il·luminen: plegada, no hi hauria res per assenyalar.
      expect(navigate).toHaveBeenCalledWith(['/settings'], { queryParams: { section: 'config' } });
    });

    it('finishes instead of running off the end', () => {
      while (!service.isLast()) service.next();
      service.next();
      expect(service.active()).toBeFalse();
    });
  });

  // ── Tancament ────────────────────────────────────────────────────────────

  for (const how of ['finish', 'skip'] as const) {
    describe(`${how}()`, () => {
      beforeEach(() => { service.start(); navigate.calls.reset(); service[how](); });

      it('closes the tour', () => {
        expect(service.active()).toBeFalse();
        expect(service.stop()).toBeNull();
      });

      // Saltar-lo compta com a fet: no se li ha de tornar a oferir sol, i el
      // té sempre a Perfil si el vol reprendre.
      it('records it as done', () => {
        expect(update).toHaveBeenCalledWith({ guidedTourDone: true });
      });

      it('leaves the user on Inici', () => {
        expect(navigate).toHaveBeenCalledWith(['/home']);
      });
    });
  }
});
