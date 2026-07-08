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
    path: 'train/planner',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/train/weekly-planner.component').then(m => m.WeeklyPlannerComponent),
  },
  {
    path: 'calendar',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/calendar/calendar-page.component').then(m => m.CalendarPageComponent),
  },
  {
    path: 'library',
    redirectTo: 'exercises',
    pathMatch: 'full',
  },
  {
    path: 'exercises',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exercises/exercises.component').then(m => m.ExercisesComponent),
  },
  {
    path: 'sports-config',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/sports-config/sports-config.component').then(m => m.SportsConfigComponent),
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
  {
    path: 'trainer',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/trainer/trainer.component').then(m => m.TrainerComponent),
  },
  {
    path: 'join/:token',
    loadComponent: () =>
      import('./features/trainer/join/join.component').then(m => m.JoinComponent),
  },
  {
    path: 'share/:id',
    loadComponent: () =>
      import('./features/share/share-import.component').then(m => m.ShareImportComponent),
  },
  { path: '**', redirectTo: 'train' },
];
