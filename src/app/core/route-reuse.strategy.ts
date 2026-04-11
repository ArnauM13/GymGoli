import { ActivatedRouteSnapshot, DetachedRouteHandle, RouteReuseStrategy } from '@angular/router';

/** Routes to keep alive across navigations (all authenticated pages). */
const REUSE_ROUTES = new Set(['train', 'history', 'library', 'charts', 'sports']);

export class AppReuseStrategy implements RouteReuseStrategy {
  private readonly cache = new Map<string, DetachedRouteHandle>();

  /** Should we detach (keep alive) when leaving this route? */
  shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return REUSE_ROUTES.has(route.routeConfig?.path ?? '');
  }

  /** Store the detached component tree. */
  store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle | null): void {
    const key = route.routeConfig?.path;
    if (key && handle) this.cache.set(key, handle);
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
