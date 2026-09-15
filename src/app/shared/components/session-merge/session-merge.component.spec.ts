import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { SessionMergeComponent } from './session-merge.component';
import { SessionGroupService } from '../../../core/services/session-group.service';
import { FeedbackService } from '../../services/feedback.service';
import { Sport, SportSession } from '../../../core/models/sport.model';
import { Workout } from '../../../core/models/workout.model';
import { ActivityItem, groupDayFeed } from '../../utils/session-group.utils';

const DAY = '2025-04-21';

const SPORT = {
  id: 'sp1', name: 'Córrer', icon: 'directions_run', color: '#000',
  subtypes: [], metricDefs: [], createdAt: new Date(),
} as Sport;

function workout(id: string, sessionGroupId?: string): Workout {
  return { id, date: DAY, entries: [], createdAt: new Date(), sessionGroupId };
}

function sportPair(id: string, sessionGroupId?: string): { sport: Sport; session: SportSession } {
  return { sport: SPORT, session: { id, date: DAY, sportId: 'sp1', createdAt: new Date(), sessionGroupId } };
}

/**
 * Unir aquesta activitat amb una altra del dia.
 *
 * El cas de sempre és que les dues ja estiguin apuntades —el gimnàs i la cinta
 * de després—, o sigui que l'oferiment surt de l'activitat, no del feed.
 */
describe('SessionMergeComponent', () => {
  let merge: jasmine.Spy;
  let success: jasmine.Spy;

  function setup(opts: {
    item: ActivityItem;
    workouts?: Workout[];
    sports?: { sport: Sport; session: SportSession }[];
  }) {
    const workouts = opts.workouts ?? [];
    const sports   = opts.sports ?? [];
    merge   = jasmine.createSpy('merge').and.resolveTo('g1');
    success = jasmine.createSpy('success');

    TestBed.configureTestingModule({
      imports: [SessionMergeComponent],
      providers: [
        // Amb què es pot unir ho diu el servei; aquí s'hi posa el dia sencer,
        // que és el que ell contesta a partir dels dos magatzems.
        {
          provide: SessionGroupService,
          useValue: { merge, groupsForDay: () => groupDayFeed(workouts, sports) },
        },
        { provide: FeedbackService, useValue: { success, error: jasmine.createSpy() } },
      ],
    }).overrideComponent(SessionMergeComponent, { set: { schemas: [NO_ERRORS_SCHEMA] } });

    const fixture = TestBed.createComponent(SessionMergeComponent);
    fixture.componentRef.setInput('item', opts.item);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance };
  }

  it('les altres sessions del dia són les candidates', () => {
    const w = workout('w1');
    const { fixture, component } = setup({
      item: { kind: 'workout', workout: w },
      workouts: [w, workout('w2')],
      sports:   [sportPair('s1')],
    });

    // La que s'està mirant no és candidata d'ella mateixa.
    expect(component.targets().map(g => g.key)).toEqual(['w2', 's1']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('.sm-btn').length).toBe(2);
  });

  it('les de la mateixa sessió tampoc: ja hi són', () => {
    const w = workout('w1', 'g1');
    const { component } = setup({
      item: { kind: 'workout', workout: w },
      workouts: [w],
      sports:   [sportPair('s1', 'g1')],
    });

    expect(component.targets()).toEqual([]);
  });

  it('triar-ne una les uneix, i ho diu qui toca', async () => {
    const w = workout('w1');
    const { component } = setup({
      item: { kind: 'workout', workout: w },
      workouts: [w],
      sports:   [sportPair('s1')],
    });

    await component.unify(component.targets()[0]);

    const [mine, target] = merge.calls.mostRecent().args as [ActivityItem[], ActivityItem[]];
    expect((mine[0] as { workout: Workout }).workout.id).toBe('w1');
    expect((target[0] as { session: SportSession }).session.id).toBe('s1');
    // Gimnàs i esport en una sola anada: ho diuen tots dos gossos.
    expect(success).toHaveBeenCalledWith('Una sola sessió.', jasmine.any(Number), 'both');
  });

  it('sense cap altra sessió al dia no hi ha res a oferir', () => {
    const w = workout('w1');
    const { fixture, component } = setup({ item: { kind: 'workout', workout: w }, workouts: [w] });

    expect(component.targets()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.sm-card')).toBeNull();
  });

  it('«ara no» l\'aparta i no torna a sortir', () => {
    const w = workout('w1');
    const { fixture, component } = setup({
      item: { kind: 'workout', workout: w },
      workouts: [w], sports: [sportPair('s1')],
    });

    component.dismiss();
    fixture.detectChanges();

    expect(component.targets()).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).querySelector('.sm-card')).toBeNull();
  });

  // Una anada es prepara igual que es viu: el pàdel i la cinta que penses fer
  // seguits es poden deixar apuntats junts.
  it('un pla s\'uneix com qualsevol altra cosa', () => {
    const planned = { ...workout('w9'), status: 'planned' as const };
    const { component } = setup({
      item: { kind: 'workout', workout: planned },
      workouts: [planned, workout('w1')],
    });

    expect(component.mine()?.key).toBe('w9');
    expect(component.targets().map(g => g.key)).toEqual(['w1']);
  });

  // La targeta sencera surt sota l'activitat acabada de registrar; desplegada
  // des del peu d'una del feed, la pregunta ja l'ha feta el botó que l'obre.
  it('compacta, només la llista', () => {
    const w = workout('w1');
    const { fixture } = setup({
      item: { kind: 'workout', workout: w },
      workouts: [w], sports: [sportPair('s1')],
    });
    fixture.componentRef.setInput('compact', true);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.sm-head')).toBeNull();
    expect(host.querySelectorAll('.sm-btn').length).toBe(1);
  });
});
