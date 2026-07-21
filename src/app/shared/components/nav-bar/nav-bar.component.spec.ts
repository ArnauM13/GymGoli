import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';

import { NavBarComponent } from './nav-bar.component';
import { TrainerService } from '../../../core/services/trainer.service';

describe('NavBarComponent', () => {
  let isTrainer: ReturnType<typeof signal<boolean>>;
  let component: NavBarComponent;

  function setup(): void {
    isTrainer = signal(false);
    TestBed.configureTestingModule({
      imports: [NavBarComponent],
      providers: [
        provideRouter([]),
        { provide: TrainerService, useValue: { isTrainer } },
      ],
    });
    component = TestBed.createComponent(NavBarComponent).componentInstance;
  }

  beforeEach(setup);

  it('shows the three base tabs for a regular user', () => {
    const paths = component.navItems().map(i => i.path);
    expect(paths).toEqual(['/home', '/calendar', '/settings']);
  });

  it('inserts the Clients tab before Perfil for a trainer', () => {
    isTrainer.set(true);
    const items = component.navItems();
    expect(items.map(i => i.path)).toEqual(['/home', '/calendar', '/trainer', '/settings']);
    expect(items[2].label).toBe('Clients');
  });
});
