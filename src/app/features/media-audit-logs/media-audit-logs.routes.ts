/**
 * Media Audit Logs Routes
 * PARIDAD: Auditoría de medios para supervisores
 */
import { Routes } from '@angular/router';

export const MEDIA_AUDIT_LOGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./media-audit-logs.component').then(m => m.MediaAuditLogsComponent),
    title: 'Auditoría de Medios - MWS'
  }
];
