/**
 * Alerts Module Routes
 * PARIDAD: Rails admin/alerts routes
 */
import { Routes } from '@angular/router';

export const ALERTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/alert-list/alert-list.component').then(m => m.AlertListComponent),
    title: 'Alertas - MWS'
  }
];
