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
    expect(component.dogs().length).toBe(1);
    expect(component.dogs()[0].avatar).toContain('marley');
  });

  it('shows only Xoco', () => {
    fixture.componentRef.setInput('mascot', 'xoco');
    expect(component.dogs().length).toBe(1);
    expect(component.dogs()[0].avatar).toContain('xoco');
  });

  it('shows both, Marley first, for a cross-cutting message', () => {
    fixture.componentRef.setInput('mascot', 'both');
    expect(component.dogs().map(d => d.name)).toEqual(['Marley', 'Xoco']);
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
