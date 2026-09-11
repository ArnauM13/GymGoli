import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { ScrollRestoreService } from './scroll-restore.service';

describe('ScrollRestoreService', () => {
  let scroller: HTMLElement;
  let router: Router;

  beforeEach(() => {
    scroller = document.createElement('main');
    scroller.className = 'app-content';
    scroller.style.cssText = 'height: 100px; overflow-y: auto;';
    const tall = document.createElement('div');
    tall.style.height = '2000px';
    scroller.appendChild(tall);
    document.body.appendChild(scroller);

    TestBed.configureTestingModule({
      providers: [provideRouter([
        { path: 'a', children: [] },
        { path: 'b', children: [] },
      ])],
    });

    router = TestBed.inject(Router);
    TestBed.inject(ScrollRestoreService);
  });

  afterEach(() => scroller.remove());

  it('obre cada pàgina nova a dalt', fakeAsync(() => {
    router.navigateByUrl('/a');
    tick();
    scroller.scrollTop = 400;

    router.navigateByUrl('/b');
    tick();

    expect(scroller.scrollTop).toBe(0);
  }));

  it('tornant enrere et deixa on eres', fakeAsync(() => {
    router.navigateByUrl('/a');
    tick();
    scroller.scrollTop = 400;

    router.navigateByUrl('/b');
    tick();
    router.navigateByUrl('/a', { state: { restoreScroll: true } });
    tick();

    expect(scroller.scrollTop).toBe(400);
  }));

  it('canviar un query param no mou la pàgina', fakeAsync(() => {
    router.navigateByUrl('/a');
    tick();
    scroller.scrollTop = 400;

    router.navigateByUrl('/a?filtre=1');
    tick();

    expect(scroller.scrollTop).toBe(400);
  }));
});
