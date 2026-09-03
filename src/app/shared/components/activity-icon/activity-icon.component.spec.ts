import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActivityIconComponent } from './activity-icon.component';

describe('ActivityIconComponent', () => {
  let fixture: ComponentFixture<ActivityIconComponent>;

  const dog  = (): HTMLImageElement | null => fixture.nativeElement.querySelector('.ai-dog');
  const icon = (): HTMLElement => fixture.nativeElement.querySelector('.ai-icon');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ActivityIconComponent] }).compileComponents();
    fixture = TestBed.createComponent(ActivityIconComponent);
    fixture.componentRef.setInput('icon', 'directions_run');
  });

  it('renders the activity glyph', () => {
    fixture.detectChanges();
    expect(icon().textContent?.trim()).toBe('directions_run');
  });

  it('puts the Marley next to a gym icon', () => {
    fixture.componentRef.setInput('mascot', 'marley');
    fixture.detectChanges();
    expect(dog()?.src).toContain('marley');
  });

  it('puts the Xoco next to a sport icon', () => {
    fixture.componentRef.setInput('mascot', 'xoco');
    fixture.detectChanges();
    expect(dog()?.src).toContain('xoco');
  });

  it('leaves the icon alone when no mascot is given', () => {
    fixture.detectChanges();
    expect(dog()).toBeNull();
  });

  it('ignores "both" — an activity is either gym or sport, never the two', () => {
    fixture.componentRef.setInput('mascot', 'both');
    fixture.detectChanges();
    expect(dog()).toBeNull();
  });

  it('takes the activity colour', () => {
    fixture.componentRef.setInput('color', '#81c784');
    fixture.detectChanges();
    expect(fixture.nativeElement.style.getPropertyValue('--ai-c')).toBe('#81c784');
  });

  it('is decorative: the card around it carries the label', () => {
    fixture.detectChanges();
    expect(fixture.nativeElement.getAttribute('aria-hidden')).toBe('true');
  });
});
