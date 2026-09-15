import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';

import { FeedbackService } from './feedback.service';
import { FeedbackToastData } from '../components/feedback-toast/feedback-toast.component';

/**
 * Qui diu el que ha passat.
 *
 * Tota confirmació porta gos: el que toca quan qui truca el sap, i tots dos
 * quan no es diu res. Així no hi ha cap camí que acabi en un tic de sistema
 * (vegeu `MASCOTES.md` §El toast).
 */
describe('FeedbackService', () => {
  let service: FeedbackService;
  let openFromComponent: jasmine.Spy;

  /** Les dades amb què s'ha obert l'últim toast. */
  const lastData = (): FeedbackToastData =>
    openFromComponent.calls.mostRecent().args[1].data as FeedbackToastData;

  beforeEach(() => {
    openFromComponent = jasmine.createSpy('openFromComponent');
    TestBed.configureTestingModule({
      providers: [{ provide: MatSnackBar, useValue: { openFromComponent } }],
    });
    service = TestBed.inject(FeedbackService);
  });

  it('sense dir qui ho diu, hi van tots dos', () => {
    service.success('Entrenament creat');
    expect(lastData().mascot).toBe('both');

    service.info('Sèrie copiada');
    expect(lastData().mascot).toBe('both');
  });

  it("i qui sap de què parla, hi posa el seu: el gimnàs és del Marley", () => {
    service.success('Exercici eliminat', 2000, 'marley');
    expect(lastData().mascot).toBe('marley');

    service.success('Pàdel registrat', 2000, 'xoco');
    expect(lastData().mascot).toBe('xoco');
  });

  // Cap dels dos dona males notícies (MASCOTES.md, regla 3).
  it('un error no el diu cap gos', () => {
    service.error('Error en guardar');
    expect(lastData().mascot).toBeUndefined();
    expect(lastData().variant).toBe('error');
  });

  it('i el toast és sempre el de la casa, a baix i al mig', () => {
    service.success('Guardat');
    const config = openFromComponent.calls.mostRecent().args[1];
    expect(config.panelClass).toBe('feedback-toast-panel');
    expect(config.verticalPosition).toBe('bottom');
  });
});
