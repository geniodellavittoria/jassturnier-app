import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'einrichtung' },
  {
    path: 'einrichtung',
    title: 'Einrichtung · Jassturnier',
    loadComponent: () => import('./features/setup/setup-page').then((m) => m.SetupPage),
  },
  {
    path: 'gruppen',
    title: 'Gruppenphase · Jassturnier',
    loadComponent: () => import('./features/groups/groups-page').then((m) => m.GroupsPage),
  },
  {
    path: 'finalrunde',
    title: 'Finalrunde · Jassturnier',
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
  { path: '**', redirectTo: 'einrichtung' },
];
