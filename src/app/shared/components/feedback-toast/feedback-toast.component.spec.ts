import { TestBed } from '@angular/core/testing';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

import { FeedbackToastComponent, FeedbackToastData } from './feedback-toast.component';

/**
 * El toast, quan el missatge té veu: la cara del gos ocupa el lloc del glif.
 * La barra de color ja diu si ha anat bé, o sigui que la icona no s'hi perd
 * res i qui parla queda dit (vegeu `MASCOTES.md`).
 */
describe('FeedbackToastComponent', () => {
  function setup(data: FeedbackToastData) {
    TestBed.configureTestingModule({
      imports: [FeedbackToastComponent],
      providers: [
        { provide: MAT_SNACK_BAR_DATA, useValue: data },
        { provide: MatSnackBarRef, useValue: { dismiss: jasmine.createSpy('dismiss') } },
      ],
    });
    const fixture = TestBed.createComponent(FeedbackToastComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('sense gos, el toast de sempre', () => {
    const el = setup({ message: 'Guardat', variant: 'success' });

    expect(el.querySelector('.fb-dog')).toBeNull();
    expect(el.querySelector('.fb-icon')?.textContent).toContain('check_circle');
    expect(el.querySelector('.fb-msg')?.textContent).toContain('Guardat');
  });

  it('amb gos, hi surt la seva cara al lloc del glif', () => {
    const el = setup({ message: 'Tot en una sessió.', variant: 'success', mascot: 'marley' });

    expect(el.querySelector('.fb-icon')).toBeNull();
    const dog = el.querySelector<HTMLImageElement>('.fb-dog');
    expect(dog?.src).toContain('marley.png');
    expect(dog?.alt).toBe('El Marley');
  });

  it('els dos gossos quan el missatge és de tots dos', () => {
    const el = setup({ message: 'Una sola sessió.', variant: 'success', mascot: 'both' });
    expect(el.querySelector<HTMLImageElement>('.fb-dog')?.src).toContain('bibis.png');
  });
});
