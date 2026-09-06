import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';

import { OnboardingTourComponent } from './onboarding-tour.component';
import { OnboardingTourService } from '../../../core/services/onboarding-tour.service';
import { TourStop } from '../../../core/models/onboarding-tour.model';

const STOP: TourStop = {
  id: 'test', route: '/home', targets: ['[data-tour="probe"]'],
  mascot: 'marley', title: 'Una parada', body: 'El que hi ha aquí.', line: 'Ves-hi.',
};

/** Espera dos frames: un per trobar l'element i un per mesurar-lo. */
const frames = (n = 3) => new Promise<void>(resolve => {
  const step = (left: number) =>
    left <= 0 ? resolve() : requestAnimationFrame(() => step(left - 1));
  step(n);
});

describe('OnboardingTourComponent', () => {
  let fixture: ComponentFixture<OnboardingTourComponent>;
  let component: OnboardingTourComponent;
  let stop: ReturnType<typeof signal<TourStop | null>>;
  let tour: any;

  beforeEach(async () => {
    stop = signal<TourStop | null>(null);
    tour = {
      stop, total: 9, index: signal(0),
      isFirst: signal(true), isLast: signal(false),
      skip: jasmine.createSpy('skip'),
      next: jasmine.createSpy('next'),
      prev: jasmine.createSpy('prev'),
    };

    await TestBed.configureTestingModule({
      imports: [OnboardingTourComponent],
      providers: [{ provide: OnboardingTourService, useValue: tour }],
    }).compileComponents();

    fixture   = TestBed.createComponent(OnboardingTourComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => document.querySelectorAll('[data-tour="probe"]').forEach(el => el.remove()));

  function probe(top: number, height = 40): HTMLElement {
    const el = document.createElement('div');
    el.setAttribute('data-tour', 'probe');
    Object.assign(el.style, {
      position: 'fixed', top: `${top}px`, left: '20px', width: '120px', height: `${height}px`,
    });
    document.body.appendChild(el);
    return el;
  }

  it('renders nothing while the tour is closed', () => {
    expect(fixture.nativeElement.querySelector('.tour')).toBeNull();
  });

  it('renders the stop once it opens', () => {
    stop.set(STOP);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tour-title').textContent).toContain('Una parada');
    expect(fixture.nativeElement.querySelector('.tour-desc').textContent).toContain('El que hi ha aquí.');
  });

  it('gives the dog its own line, in its own voice', () => {
    stop.set(STOP);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tour-line').textContent).toContain('Ves-hi.');
  });

  it('leaves the line out when the stop has none', () => {
    stop.set({ ...STOP, line: undefined });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tour-line')).toBeNull();
  });

  it('shows the cut-out figure of whoever is speaking', () => {
    stop.set(STOP);
    fixture.detectChanges();
    expect(component.dog().figure).toContain('marley-full');
  });

  it('says where in the tour the user is', () => {
    stop.set(STOP);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tour-eyebrow').textContent).toContain('1 de 9');
  });

  // ── Trobar i seguir l'element ────────────────────────────────────────────

  describe('the spotlight', () => {
    it('lands on the real element the stop points at', async () => {
      probe(200);
      stop.set(STOP);
      fixture.detectChanges();
      await frames();

      const spot = component.spot();
      expect(spot).withContext('the target was never found').not.toBeNull();
      // Marge inclòs: el forat envolta l'element, no el retalla.
      expect(spot!.top).toBeLessThan(200);
      expect(spot!.height).toBeGreaterThan(40);
    });

    it('follows the element when it moves', async () => {
      const el = probe(200);
      stop.set(STOP);
      fixture.detectChanges();
      await frames();
      const first = component.spot()!.top;

      el.style.top = '320px';
      await frames();
      expect(component.spot()!.top).toBeGreaterThan(first);
    });

    it('covers every target of the stop at once', async () => {
      probe(200, 40);
      const second = probe(260, 40);
      second.setAttribute('data-tour', 'probe2');
      stop.set({ ...STOP, targets: ['[data-tour="probe"]', '[data-tour="probe2"]'] });
      fixture.detectChanges();
      await frames();

      // Del primer al segon hi ha 100px: la unió els ha d'abastar tots dos.
      expect(component.spot()!.height).toBeGreaterThan(100);
      second.remove();
    });

    // Dues parades seguides a la mateixa pantalla es llegeixen com un sol
    // moviment; en canviar de pantalla el que s'il·luminava ja no existeix.
    it('keeps the previous hole while moving within one screen', async () => {
      probe(200);
      stop.set(STOP);
      fixture.detectChanges();
      await frames();

      stop.set({ ...STOP, id: 'test2', targets: ['[data-tour="nope"]'] });
      fixture.detectChanges();
      expect(component.spot()).not.toBeNull();
    });

    it('drops the hole when the stop changes screen', async () => {
      probe(200);
      stop.set(STOP);
      fixture.detectChanges();
      await frames();

      stop.set({ ...STOP, id: 'test2', route: '/settings', targets: ['[data-tour="nope"]'] });
      fixture.detectChanges();
      expect(component.spot()).toBeNull();
    });

    it('has no spotlight on a stop that points nowhere', async () => {
      stop.set({ ...STOP, targets: [] });
      fixture.detectChanges();
      await frames();
      expect(component.spot()).toBeNull();
      expect(fixture.nativeElement.querySelector('.tour-dim')).not.toBeNull();
    });
  });

  // ── Col·locació de la targeta ────────────────────────────────────────────

  describe('card placement', () => {
    beforeEach(() => {
      stop.set(STOP);
      fixture.detectChanges();
      component.viewport.set({ w: 400, h: 800 });
    });

    it('goes above a target sitting in the bottom half — the nav bar, say', () => {
      component.spot.set({ top: 700, left: 20, width: 100, height: 50 });
      expect(component.above()).toBeTrue();
      expect(component.cardBottom()).toBe(800 - 700 + 14);
      expect(component.cardTop()).toBeNull();
    });

    it('goes below a target in the top half', () => {
      component.spot.set({ top: 100, left: 20, width: 100, height: 50 });
      expect(component.above()).toBeFalse();
      expect(component.cardTop()).toBe(100 + 50 + 14);
      expect(component.cardBottom()).toBeNull();
    });

    it('points its arrow at the centre of the target', () => {
      component.spot.set({ top: 100, left: 100, width: 100, height: 50 });
      // Centre a 150px; la targeta arrenca a (400-372)/2 = 14.
      expect(component.arrowLeft()).toBe(150 - component.cardLeft());
    });

    it('keeps the arrow inside the rounded corners', () => {
      component.spot.set({ top: 100, left: 0, width: 6, height: 50 });
      expect(component.arrowLeft()).toBeGreaterThanOrEqual(22);
    });

    it('centres the card when there is nothing to point at', () => {
      component.spot.set(null);
      expect(component.cardTop()).toBeNull();
      expect(component.cardBottom()).toBeNull();
    });
  });

  // ── Controls ─────────────────────────────────────────────────────────────

  describe('controls', () => {
    beforeEach(() => { stop.set(STOP); fixture.detectChanges(); });

    it('advances with the primary button', () => {
      fixture.nativeElement.querySelector('.tour-next').click();
      expect(tour.next).toHaveBeenCalled();
    });

    it('lets the user leave at any point', () => {
      fixture.nativeElement.querySelector('.tour-skip').click();
      expect(tour.skip).toHaveBeenCalled();
    });

    it('hides the back button on the first stop', () => {
      expect(fixture.nativeElement.querySelector('.tour-back')).toBeNull();
    });

    it('offers going back once past the first stop', () => {
      tour.isFirst.set(false);
      fixture.detectChanges();
      fixture.nativeElement.querySelector('.tour-back').click();
      expect(tour.prev).toHaveBeenCalled();
    });

    it('closes with a finishing label on the last stop', () => {
      tour.isLast.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.tour-next').textContent).toContain('Ja ho tinc!');
    });

    // El tour el porten els seus botons: si es pogués tocar el que hi ha a
    // sota, l'usuari acabaria en una pantalla que la parada no espera.
    it('blocks what is underneath', () => {
      expect(fixture.nativeElement.querySelector('.tour-blocker')).not.toBeNull();
    });
  });
});
