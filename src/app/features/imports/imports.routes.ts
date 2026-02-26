/**
 * Imports Module Routes
 * PARIDAD: Rails admin/imports routes
 *
 * Flow: Upload (new) → auto-mapping → Preview → Progress
 * Template management: /templates (admin/superadmin only)
 */
import { Routes } from '@angular/router';
import { adminGuard } from '../../core/guards/role.guard';

export const IMPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/import-list/import-list.component').then(m => m.ImportListComponent),
    title: 'Importaciones - MWS'
  },
  {
    path: 'templates',
    loadComponent: () => import('./components/import-templates/import-templates.component').then(m => m.ImportTemplatesComponent),
    canActivate: [adminGuard],
    title: 'Templates de Importación - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/import-form/import-form.component').then(m => m.ImportFormComponent),
    title: 'Nueva Importación - MWS'
  },
  {
    path: ':id/mapping',
    loadComponent: () => import('./components/import-mapping/import-mapping.component').then(m => m.ImportMappingComponent),
    title: 'Mapeo de Columnas - MWS'
  },
  {
    path: ':id',
    loadComponent: () => import('./components/import-detail/import-detail.component').then(m => m.ImportDetailComponent),
    title: 'Detalle Importación - MWS'
  },
  {
    path: ':id/preview',
    loadComponent: () => import('./components/import-preview/import-preview.component').then(m => m.ImportPreviewComponent),
    title: 'Validación Importación - MWS'
  },
  {
    path: ':id/progress',
    loadComponent: () => import('./components/import-progress/import-progress.component').then(m => m.ImportProgressComponent),
    title: 'Progreso Importación - MWS'
  }
];
