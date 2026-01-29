/**
 * Imports Module Routes
 * PARIDAD: Rails admin/imports routes
 */
import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/models/user.model';

export const IMPORTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/import-list/import-list.component').then(m => m.ImportListComponent),
    title: 'Importaciones - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/import-form/import-form.component').then(m => m.ImportFormComponent),
    title: 'Nueva Importación - MWS',
    canActivate: [roleGuard([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.MANAGER_LEVEL_1,
      UserRole.MANAGER_LEVEL_2,
      UserRole.MANAGER_LEVEL_3,
      UserRole.MANAGER_LEVEL_4
    ])]
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
