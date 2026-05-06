import { Routes } from '@angular/router';
import { authGuard } from './services/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'devices',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/devices-list.page').then((m) => m.DevicesListPage),
  },
  {
    path: 'devices/:deviceCode',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/device-detail.page').then((m) => m.DeviceDetailPage),
  },
  { path: '', redirectTo: 'devices', pathMatch: 'full' },
  { path: '**', redirectTo: 'devices' },
];
