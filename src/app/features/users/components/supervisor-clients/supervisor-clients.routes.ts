/**
 * Supervisor Clients Feature Routes
 * PARIDAD RAILS: /app/supervisor_clients routes
 */
import { Routes } from '@angular/router';

export const SUPERVISOR_CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./supervisor-clients.component').then(m => m.SupervisorClientsComponent)
  },
  {
    path: ':clientId',
    loadComponent: () => import('./supervisor-clients.component').then(m => m.SupervisorClientsComponent)
  }
];
