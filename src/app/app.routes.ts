import { Routes } from '@angular/router';

import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'privacy',
    loadComponent: () =>
      import('./features/privacy/privacy.component').then(m => m.PrivacyComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password.component').then(m => m.ResetPasswordComponent),
  },
  {
    path: '',
    redirectTo: 'train',
    pathMatch: 'full',
  },
  {
    path: 'train',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/train/train.component').then(m => m.TrainComponent),
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
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then(m => m.SettingsComponent),
  },
  {
    path: 'templates',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/templates/templates.component').then(m => m.TemplatesComponent),
  },
  { path: '**', redirectTo: 'train' },
];
