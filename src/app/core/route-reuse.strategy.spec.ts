import { ActivatedRouteSnapshot, DetachedRouteHandle } from '@angular/router';

import { AppReuseStrategy } from './route-reuse.strategy';

/** El router només en mira el `routeConfig.path`. */
function snapshotFor(path: string): ActivatedRouteSnapshot {
  return { routeConfig: { path } } as ActivatedRouteSnapshot;
}

describe('AppReuseStrategy', () => {
  let strategy: AppReuseStrategy;
  let handle: DetachedRouteHandle;

  beforeEach(() => {
    strategy = new AppReuseStrategy();
    handle   = {} as DetachedRouteHandle;
  });

  it('manté viva una pàgina de les que es van i es tornen', () => {
    expect(strategy.shouldDetach(snapshotFor('train'))).toBeTrue();
  });

  it('no en manté cap altra', () => {
    expect(strategy.shouldDetach(snapshotFor('settings'))).toBeFalse();
  });

  it('torna l\'arbre guardat quan s\'hi torna', () => {
    const route = snapshotFor('train');
    strategy.store(route, handle);

    expect(strategy.shouldAttach(route)).toBeTrue();
    expect(strategy.retrieve(route)).toBe(handle);
  });

  // Reenganxar dues vegades el mateix arbre peta a mig activar la ruta, i la
  // navegació mor allà: el botó que l'havia demanada sembla no fer res. El
  // router avisa que ja l'ha reenganxat guardant-hi un `null`, i llavors
  // l'entrada ha de marxar.
  it('deixa d\'oferir l\'arbre un cop el router diu que ja l\'ha reenganxat', () => {
    const route = snapshotFor('train');
    strategy.store(route, handle);
    strategy.retrieve(route);

    strategy.store(route, null);

    expect(strategy.shouldAttach(route)).toBeFalse();
    expect(strategy.retrieve(route)).toBeNull();
  });

  it('la torna a guardar la propera vegada que se\'n marxa', () => {
    const route = snapshotFor('train');
    strategy.store(route, handle);
    strategy.store(route, null);

    const next = {} as DetachedRouteHandle;
    strategy.store(route, next);

    expect(strategy.shouldAttach(route)).toBeTrue();
    expect(strategy.retrieve(route)).toBe(next);
  });

  it('no en guarda cap de les que no es mantenen vives', () => {
    const route = snapshotFor('settings');
    strategy.store(route, handle);

    expect(strategy.shouldAttach(route)).toBeFalse();
  });

  it('reutilitza la ruta quan la configuració és la mateixa', () => {
    const config = { path: 'train' };
    const a = { routeConfig: config } as ActivatedRouteSnapshot;
    const b = { routeConfig: config } as ActivatedRouteSnapshot;

    expect(strategy.shouldReuseRoute(a, b)).toBeTrue();
    expect(strategy.shouldReuseRoute(a, snapshotFor('home'))).toBeFalse();
  });
});
