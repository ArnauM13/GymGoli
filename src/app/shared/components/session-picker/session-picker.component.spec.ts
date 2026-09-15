import { TestBed } from '@angular/core/testing';

import { SessionPickerComponent } from './session-picker.component';
import { Sport, SportSession } from '../../../core/models/sport.model';
import { Workout } from '../../../core/models/workout.model';
import { SessionGroup, groupDayFeed } from '../../utils/session-group.utils';

const DAY = '2025-04-21';
const SPORT = {
  id: 'sp1', name: 'Córrer', icon: 'directions_run', color: '#000',
  subtypes: [], metricDefs: [], createdAt: new Date(),
} as Sport;

function workout(id: string): Workout {
  return { id, date: DAY, entries: [], categories: ['push'], createdAt: new Date() };
}
function sportPair(id: string): { sport: Sport; session: SportSession } {
  return { sport: SPORT, session: { id, date: DAY, sportId: 'sp1', createdAt: new Date() } };
}

/**
 * Les sessions d'un dia, per triar-ne una.
 *
 * La llista és la mateixa a Entrenar (a quina sessió va el que crearàs) i al
 * menú d'una activitat oberta (amb quina l'uneixes): una sola pregunta, un
 * sol marcatge.
 */
describe('SessionPickerComponent', () => {
  function setup(sessions: SessionGroup[], opts: { allowNew?: boolean; selectedKey?: string } = {}) {
    TestBed.configureTestingModule({ imports: [SessionPickerComponent] });
    const fixture = TestBed.createComponent(SessionPickerComponent);
    fixture.componentRef.setInput('sessions', sessions);
    if (opts.allowNew) fixture.componentRef.setInput('allowNew', true);
    if (opts.selectedKey) fixture.componentRef.setInput('selectedKey', opts.selectedKey);
    fixture.detectChanges();
    return { fixture, host: fixture.nativeElement as HTMLElement, component: fixture.componentInstance };
  }

  const sessions = () => groupDayFeed([workout('w1')], [sportPair('s1')]);

  it('una fila per sessió, amb el nom del que porta', () => {
    const { host } = setup(sessions());

    const rows = host.querySelectorAll('.sp-btn');
    expect(rows.length).toBe(2);
    expect(rows[1].querySelector('.sp-name')?.textContent).toContain('Córrer');
  });

  it('tocar-ne una la retorna sencera, no la seva clau', () => {
    const groups = sessions();
    const { host, component } = setup(groups);
    const picked: (SessionGroup | null)[] = [];
    component.pick.subscribe(g => picked.push(g));

    host.querySelectorAll<HTMLElement>('.sp-btn')[0].click();
    expect(picked[0]?.key).toBe(groups[0].key);
  });

  // Triar és reversible: qui toca una sessió sense voler ha de poder
  // tornar a deixar-ho sol.
  it("amb `allowNew`, deixar-ho sol també és una fila, i la triada per defecte", () => {
    const { host, component } = setup(sessions(), { allowNew: true });
    const picked: (SessionGroup | null)[] = [];
    component.pick.subscribe(g => picked.push(g));

    const rows = host.querySelectorAll<HTMLElement>('.sp-btn');
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Sessió nova');
    expect(rows[0].classList).toContain('sp-btn--on');

    rows[0].click();
    expect(picked[0]).toBeNull();
  });

  it('i la que ja està triada es veu triada', () => {
    const groups = sessions();
    const { host } = setup(groups, { allowNew: true, selectedKey: groups[0].key });

    const rows = host.querySelectorAll('.sp-btn');
    expect(rows[0].classList).not.toContain('sp-btn--on');
    expect(rows[1].classList).toContain('sp-btn--on');
  });

  it('sense cap sessió no pinta cap fila', () => {
    const { host } = setup([]);
    expect(host.querySelector('.sp-btn')).toBeNull();
  });
});
