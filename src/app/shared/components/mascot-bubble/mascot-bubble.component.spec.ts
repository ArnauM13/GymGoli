import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MascotBubbleComponent } from './mascot-bubble.component';

describe('MascotBubbleComponent', () => {
  let fixture: ComponentFixture<MascotBubbleComponent>;
  let component: MascotBubbleComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MascotBubbleComponent] }).compileComponents();
    fixture   = TestBed.createComponent(MascotBubbleComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('message', 'Sortim?');
  });

  it('shows only Marley', () => {
    fixture.componentRef.setInput('mascot', 'marley');
    expect(component.figure().figure).toContain('marley-full');
  });

  it('shows only Xoco', () => {
    fixture.componentRef.setInput('mascot', 'xoco');
    expect(component.figure().figure).toContain('xoco-full');
  });

  it('uses the drawing where both already appear together, not two cut-outs', () => {
    fixture.componentRef.setInput('mascot', 'both');
    expect(component.figure().figure).toContain('bibis-full');
  });

  it('never uses the circular avatar here — these are the full cut-outs', () => {
    for (const m of (['marley', 'xoco', 'both'] as const)) {
      fixture.componentRef.setInput('mascot', m);
      expect(component.figure().figure).toContain('-full');
    }
  });

  it('renders the message inside the bubble', () => {
    fixture.componentRef.setInput('mascot', 'xoco');
    fixture.detectChanges();
    const text = fixture.nativeElement.querySelector('.mb-text') as HTMLElement;
    expect(text.textContent?.trim()).toBe('Sortim?');
  });

  it('emits close when the close button is pressed', () => {
    fixture.componentRef.setInput('mascot', 'marley');
    fixture.detectChanges();

    let closed = false;
    component.close.subscribe(() => closed = true);
    (fixture.nativeElement.querySelector('.mb-close') as HTMLButtonElement).click();

    expect(closed).toBe(true);
  });

  it('gives the close button an accessible name', () => {
    fixture.componentRef.setInput('mascot', 'marley');
    fixture.detectChanges();
    const btn = fixture.nativeElement.querySelector('.mb-close') as HTMLButtonElement;
    expect(btn.getAttribute('aria-label')).toBeTruthy();
  });

  it('lifts above whatever the page has fixed at the bottom', () => {
    fixture.componentRef.setInput('mascot', 'marley');
    fixture.componentRef.setInput('lift', 92);
    fixture.detectChanges();
    const wrap = fixture.nativeElement.querySelector('.mb-wrap') as HTMLElement;
    expect(wrap.style.getPropertyValue('--mb-lift')).toBe('92px');
  });
});
