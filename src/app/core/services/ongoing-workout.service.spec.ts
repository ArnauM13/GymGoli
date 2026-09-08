import { TestBed } from '@angular/core/testing';

import { OngoingWorkoutService } from './ongoing-workout.service';

const LS_KEY = 'gymgoli_ongoing_workouts';

describe('OngoingWorkoutService', () => {
  function build(): OngoingWorkoutService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    return TestBed.inject(OngoingWorkoutService);
  }

  beforeEach(() => localStorage.removeItem(LS_KEY));
  afterEach(() => localStorage.removeItem(LS_KEY));

  // Sense cap notícia d'aquest dispositiu es dona per acabat: és el que és
  // cert gairebé sempre, i equivocar-s'hi només costa un tap de més.
  it("un entrenament del qual no en sap res ja s'ha acabat", () => {
    expect(build().isOngoing('w1')).toBeFalse();
  });

  it('comença en marxa i s\'acaba quan es diu', () => {
    const svc = build();
    svc.start('w1');
    expect(svc.isOngoing('w1')).toBeTrue();

    svc.finish('w1');
    expect(svc.isOngoing('w1')).toBeFalse();
  });

  it('sobreviu a tancar l\'app: es guarda al dispositiu', () => {
    build().start('w1');
    expect(build().isOngoing('w1')).toBeTrue();
  });

  it('no es puja enlloc: només toca la seva clau local', () => {
    const svc = build();
    svc.start('w1');
    expect(JSON.parse(localStorage.getItem(LS_KEY) ?? '{}')['w1']).toEqual(jasmine.any(Number));
  });

  // Un entrenament es fa en hores: el que ningú no ha acabat tampoc no es
  // queda «en marxa» per sempre.
  it('oblida el que fa més d\'un dia que dura', () => {
    const old = Date.now() - OngoingWorkoutService.MAX_AGE_MS - 1000;
    localStorage.setItem(LS_KEY, JSON.stringify({ vell: old, nou: Date.now() }));

    const svc = build();
    expect(svc.isOngoing('vell')).toBeFalse();
    expect(svc.isOngoing('nou')).toBeTrue();
  });

  it('esborrar un entrenament el treu del registre', () => {
    const svc = build();
    svc.start('w1');
    svc.forget('w1');
    expect(svc.isOngoing('w1')).toBeFalse();
  });

  it('aguanta un magatzem il·legible', () => {
    localStorage.setItem(LS_KEY, 'no-és-json');
    expect(build().isOngoing('w1')).toBeFalse();
  });
});
