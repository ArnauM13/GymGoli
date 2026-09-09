import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/** Routes to keep alive across navigations (all authenticated pages). */
const REUSE_ROUTES = new Set(['home', 'train', 'calendar', 'library', 'charts']);

export class AppReuseStrategy implements RouteReuseStrategy {
  private readonly cache = new Map<string, DetachedRouteHandle>();

  /** Should we detach (keep alive) when leaving this route? */
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return REUSE_ROUTES.has(route.routeConfig?.path ?? '');
  }

  /**
   * Guarda l'arbre desenganxat.
   *
   * Amb `handle` a null l'entrada s'ha de treure: és com el router avisa que
   * acaba de reenganxar l'arbre que hi teníem, i que allò ja no és cap còpia
   * guardada sinó la pàgina que ara mateix es veu. Deixant-la-hi, la cau
   * apuntava a una vista ja enganxada i la següent navegació que la volgués
   * tornar a enganxar petava a mig activar: la navegació moria allà i el
   * botó que l'havia demanada semblava no fer res.
   */
  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = route.routeConfig?.path;
    if (!key) return;
    if (handle) this.cache.set(key, handle);
    else this.cache.delete(key);
  }

  /** Should we reattach a cached component tree for this route? */
  shouldAttach(route: ActivatedRouteSnapshot): boolean {
    const key = route.routeConfig?.path ?? '';
    return REUSE_ROUTES.has(key) && this.cache.has(key);
  }

  /** Return the cached component tree. */
  retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return this.cache.get(route.routeConfig?.path ?? '') ?? null;
  }

  /** Same route config → always reuse (normal Angular behaviour). */
  shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
    return future.routeConfig === curr.routeConfig;
  }
}
