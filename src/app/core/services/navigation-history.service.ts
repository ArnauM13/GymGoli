import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';

const MAX_ENTRIES = 5;

/**
 * App-wide "where did I actually come from" stack, used instead of ad-hoc
 * `?from=...` query params. Visits to the same route (ignoring query
 * params, e.g. /train -> /train?workout=x) collapse into a single slot,
 * so `goBack()` can skip straight past an intermediate screen the user
 * never really landed on (e.g. inici -> train -> train detail -> back
 * lands on inici, not the bare train dashboard).
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistoryService {
  private readonly router = inject(Router);
  private readonly stack: string[] = [];

  constructor() {
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.record(e.urlAfterRedirects));
  }

  private record(url: string): void {
    const base = url.split('?')[0];
    const top  = this.stack[this.stack.length - 1];
    if (top && top.split('?')[0] === base) {
      this.stack[this.stack.length - 1] = url;
      return;
    }
    this.stack.push(url);
    if (this.stack.length > MAX_ENTRIES) this.stack.shift();
  }

  /** Navigates to the last visited place with a different route than the
   *  current one. Falls back to `fallback` when there's nowhere to go. */
  goBack(fallback = '/home'): void {
    if (this.stack.length < 2) {
      this.router.navigateByUrl(fallback);
      return;
    }
    this.stack.pop();
    this.router.navigateByUrl(this.stack[this.stack.length - 1]);
  }
}
