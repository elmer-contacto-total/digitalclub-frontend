import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/models/user.model';

export const APP_VERSIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/app-version-list/app-version-list.component')
      .then(m => m.AppVersionListComponent),
    title: 'Versiones de App - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN])]
  },
  {
    path: 'new',
    loadComponent: () => import('./components/app-version-form/app-version-form.component')
      .then(m => m.AppVersionFormComponent),
    title: 'Nueva Versión - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN])]
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/app-version-form/app-version-form.component')
      .then(m => m.AppVersionFormComponent),
    title: 'Editar Versión - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN])]
  }
];
