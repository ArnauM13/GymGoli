import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ActivityCardComponent } from './activity-card.component';
import { ActivityStat } from '../../utils/workout-card.utils';

/** Un amfitrió mínim, per provar també el que s'hi projecta. */
@Component({
  standalone: true,
  imports: [ActivityCardComponent],
  template: `
    <app-activity-card [accent]="'#43A047'" [icon]="'directions_run'" mascot="xoco"
        [title]="title" [subtype]="subtype" [note]="note" [stats]="stats"
        [feeling]="feeling" [planned]="planned" [plannedPill]="plannedPill"
        [interactive]="interactive" [expandable]="expandable" [expanded]="expanded"
        [feelingEditable]="feelingEditable"
        (cardClick)="clicks = clicks + 1" (feelingClick)="feelingClicks = feelingClicks + 1">
      @if (withActions) { <div class="host-actions" cardActions>accions</div> }
      @if (expanded) { <div class="host-detail">detall</div> }
    </app-activity-card>
  `,
})
class HostComponent {
  title = 'Running';
  subtype = '';
  note = '';
  stats: ActivityStat[] = [];
  feeling = '';
  planned = false;
  plannedPill = false;
  interactive = false;
  expandable = false;
  expanded = false;
  feelingEditable = false;
  withActions = false;
  clicks = 0;
  feelingClicks = 0;
}

describe('ActivityCardComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
  let host: HostComponent;

  function render(patch: Partial<HostComponent> = {}): HTMLElement {
    Object.assign(host, patch);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
  });

  it('diu qui és: barra, icona amb gos i títol', () => {
    const el = render({ subtype: 'Tirada llarga', note: 'Bon ritme' });

    expect(el.querySelector('.ac-bar')).toBeTruthy();
    expect(el.querySelector('app-activity-icon')).toBeTruthy();
    expect(el.querySelector('.ac-title')?.textContent?.trim()).toBe('Running');
    expect(el.querySelector('.ac-subtype')?.textContent?.trim()).toBe('Tirada llarga');
    // La nota va al costat del títol, no en una línia pròpia.
    expect(el.querySelector('.ac-detail')?.parentElement?.classList).toContain('ac-title-row');
  });

  it('pinta les xifres amb la seva icona, els escalfaments i el volum tenyit', () => {
    const el = render({ stats: [
      { icon: 'fitness_center', text: '5 exerc' },
      { icon: 'repeat', text: '18 sèr', warmup: 2 },
      { icon: 'weight', text: '4.2t', accent: true },
    ]});

    expect(el.querySelectorAll('.ac-stat').length).toBe(3);
    expect(el.querySelector('.ac-stat-warmup')?.textContent).toContain('+2');
    expect(el.querySelector('.ac-stat--vol')?.textContent).toContain('4.2t');
  });

  // Al feed la targeta és un botó; coronant una pàgina és el que estàs
  // mirant, i no ha de semblar que porti enlloc.
  describe('quan porta a algun lloc i quan no', () => {
    it('desplegable: és un botó, amb chevron i estat', () => {
      const el = render({ interactive: true, expandable: true, expanded: true });
      const main = el.querySelector('.ac-main') as HTMLElement;

      expect(main.tagName).toBe('BUTTON');
      expect(main.getAttribute('aria-expanded')).toBe('true');
      expect(el.querySelector('.ac-chevron')?.textContent?.trim()).toBe('expand_less');

      main.click();
      expect(host.clicks).toBe(1);
    });

    it('coronant una pàgina: ni botó ni chevron', () => {
      const el = render({ interactive: false });
      expect((el.querySelector('.ac-main') as HTMLElement).tagName).toBe('DIV');
      expect(el.querySelector('.ac-chevron')).toBeNull();
      expect(el.querySelector('.act-card')?.classList).toContain('act-card--static');
    });
  });

  describe('un pla i una sessió feta', () => {
    it('un pla porta vora de ratlles i, si toca, la xapa de Planificat', () => {
      const el = render({ planned: true, plannedPill: true });
      expect(el.querySelector('.act-card')?.classList).toContain('act-card--planned');
      expect(el.querySelector('.ac-pill')?.textContent).toContain('Planificat');
    });

    it('la sensació té columna pròpia, hi sigui o no', () => {
      const withFeeling = render({ feeling: '😮‍💨' });
      expect(withFeeling.querySelector('.ac-feeling')?.textContent?.trim()).toBe('😮‍💨');

      const without = render({ feeling: '' });
      expect(without.querySelector('.ac-feeling')).toBeTruthy();
    });

    it('a la pàgina, la sensació és un botó que la demana', () => {
      const el = render({ feelingEditable: true });
      const btn = el.querySelector('.aw-feeling-btn') as HTMLElement;

      expect(btn).toBeTruthy();
      btn.click();
      expect(host.feelingClicks).toBe(1);
      // El clic és de la sensació, no de la targeta.
      expect(host.clicks).toBe(0);
    });
  });

  it('deixa lloc als botons del costat i al detall de sota', () => {
    const el = render({ withActions: true, expanded: true });
    expect(el.querySelector('.ac-head .host-actions')).toBeTruthy();
    expect(el.querySelector('.act-card > .host-detail')).toBeTruthy();
  });
});
