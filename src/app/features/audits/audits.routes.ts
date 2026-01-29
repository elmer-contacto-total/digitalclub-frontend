/**
 * Audits Module Routes
 * PARIDAD: Rails admin/audits routes
 */
import { Routes } from '@angular/router';

export const AUDITS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/audit-list/audit-list.component').then(m => m.AuditListComponent),
    title: 'Auditorías - MWS'
  }
];
