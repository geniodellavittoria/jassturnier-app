import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'praesentation' },
  {
    path: 'einrichtung',
    title: 'Einrichtung · Jassturnier',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/setup/setup-page').then((m) => m.SetupPage),
  },
  {
    path: 'gruppen',
    title: 'Gruppenphase · Jassturnier',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/groups/groups-page').then((m) => m.GroupsPage),
  },
  {
    path: 'finalrunde',
    title: 'Finalrunde · Jassturnier',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/finals/finals-page').then((m) => m.FinalsPage),
  },
  {
    path: 'praesentation',
    title: 'Präsentation · Jassturnier',
    loadComponent: () => import('./features/present/present-page').then((m) => m.PresentPage),
  },
  {
    path: 'anmelden',
    title: 'Anmeldung · Jassturnier',
    loadComponent: () => import('./features/register/register-page').then((m) => m.RegisterPage),
  },
  {
    path: 'verwaltung',
    title: 'Verwaltung · Jassturnier',
    loadComponent: () => import('./features/admin/admin-page').then((m) => m.AdminPage),
  },
  { path: '**', redirectTo: 'praesentation' },
];
