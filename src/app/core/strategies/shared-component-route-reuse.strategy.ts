import { ActivatedRouteSnapshot, BaseRouteReuseStrategy } from '@angular/router';

/**
 * Route reuse strategy that, on top of Angular's default behavior, reuses the
 * component when two route configs share the SAME `loadComponent` reference.
 *
 * Master-detail modules declare `path: ''` and `path: ':id'` pointing to one
 * component. With the default strategy those are distinct route configs, so
 * navigating between them destroys and recreates the component — losing
 * in-memory state such as search filters and pagination.
 *
 * By making both routes reference a single shared loader function, this
 * strategy keeps the component alive across that navigation. Its `params` /
 * `queryParams` observables still emit the new values, so selection logic
 * keeps working without a full rebuild.
 */
export class SharedComponentRouteReuseStrategy extends BaseRouteReuseStrategy {
  override shouldReuseRoute(
    future: ActivatedRouteSnapshot,
    curr: ActivatedRouteSnapshot
  ): boolean {
    if (future.routeConfig === curr.routeConfig) {
      return true;
    }
    const futureLoader = future.routeConfig?.loadComponent;
    const currLoader = curr.routeConfig?.loadComponent;
    return !!futureLoader && futureLoader === currLoader;
  }
}
