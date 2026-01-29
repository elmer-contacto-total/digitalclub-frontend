/**
 * Prospects Module Routes
 * PARIDAD: Rails admin/prospects routes
 */
import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/models/user.model';

export const PROSPECTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/prospect-list/prospect-list.component').then(m => m.ProspectListComponent),
    title: 'Prospectos - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/prospect-form/prospect-form.component').then(m => m.ProspectFormComponent),
    title: 'Nuevo Prospecto - MWS',
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
    loadComponent: () => import('./components/prospect-detail/prospect-detail.component').then(m => m.ProspectDetailComponent),
    title: 'Detalle Prospecto - MWS'
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/prospect-form/prospect-form.component').then(m => m.ProspectFormComponent),
    title: 'Editar Prospecto - MWS',
    canActivate: [roleGuard([
      UserRole.SUPER_ADMIN,
      UserRole.ADMIN,
      UserRole.MANAGER_LEVEL_1,
      UserRole.MANAGER_LEVEL_2,
      UserRole.MANAGER_LEVEL_3,
      UserRole.MANAGER_LEVEL_4
    ])]
  }
];
