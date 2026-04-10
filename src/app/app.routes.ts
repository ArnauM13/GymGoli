import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    redirectTo: 'today',
    pathMatch: 'full',
  },
  {
    path: 'today',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/today/today.component').then(m => m.TodayComponent),
  },
  {
    path: 'history',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/history/history.component').then(m => m.HistoryComponent),
  },
  {
    path: 'library',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/library/library.component').then(m => m.LibraryComponent),
  },
  {
    path: 'charts',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/charts/charts.component').then(m => m.ChartsComponent),
  },
  { path: '**', redirectTo: 'today' },
];
