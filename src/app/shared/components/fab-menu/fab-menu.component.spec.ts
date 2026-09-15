import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FabMenuComponent } from './fab-menu.component';

@Component({
  standalone: true,
  imports: [FabMenuComponent],
  template: `
    <app-fab-menu [(open)]="open" label="Opcions de la sessió">
      <button class="fab-menu-item" (click)="open.set(false)">Unir</button>
    </app-fab-menu>
  `,
})
class HostComponent {
  readonly open = signal(false);
}

describe('FabMenuComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host    = fixture.componentInstance;
    el      = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  it('tancat només ensenya el botó de tres punts', () => {
    expect(el.querySelector('.fab-menu-btn')).toBeTruthy();
    expect(el.querySelector('.fab-menu-dropdown')).toBeNull();
    expect(el.querySelector('.fab-menu-item')).toBeNull();
  });

  it('el botó obre les opcions', () => {
    el.querySelector<HTMLElement>('.fab-menu-btn')!.click();
    fixture.detectChanges();

    expect(host.open()).toBeTrue();
    expect(el.querySelector('.fab-menu-dropdown')?.textContent).toContain('Unir');
  });

  // Tocar fora és la manera de dir «res»: no ha de caldre encertar el botó
  // una segona vegada.
  it('tocar fora el tanca', () => {
    host.open.set(true);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('.fab-menu-backdrop')!.click();
    fixture.detectChanges();

    expect(host.open()).toBeFalse();
    expect(el.querySelector('.fab-menu-dropdown')).toBeNull();
  });

  // La pàgina també el tanca: en triar una opció, en obrir una fulla.
  it('la pàgina el pot tancar', () => {
    host.open.set(true);
    fixture.detectChanges();

    el.querySelector<HTMLElement>('.fab-menu-item')!.click();
    fixture.detectChanges();

    expect(host.open()).toBeFalse();
  });

  it('diu què és per a qui no el veu', () => {
    const btn = el.querySelector<HTMLElement>('.fab-menu-btn')!;
    expect(btn.getAttribute('aria-label')).toBe('Opcions de la sessió');
    expect(btn.getAttribute('aria-expanded')).toBe('false');

    btn.click();
    fixture.detectChanges();
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });
});
