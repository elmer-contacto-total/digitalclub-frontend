/**
 * Clients Module Routes
 * PARIDAD: Rails admin/clients routes
 */
import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';
import { UserRole } from '../../core/models/user.model';

export const CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/client-list/client-list.component').then(m => m.ClientListComponent),
    title: 'Clientes - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN])]
  },
  {
    path: 'new',
    loadComponent: () => import('./components/client-form/client-form.component').then(m => m.ClientFormComponent),
    title: 'Nuevo Cliente - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN])]
  },
  {
    path: ':id',
    loadComponent: () => import('./components/client-detail/client-detail.component').then(m => m.ClientDetailComponent),
    title: 'Detalle Cliente - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN, UserRole.ADMIN])]
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/client-form/client-form.component').then(m => m.ClientFormComponent),
    title: 'Editar Cliente - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN])]
  },
  // Client Settings - PARIDAD: Rails admin/client_settings
  {
    path: ':id/settings',
    loadComponent: () => import('./components/client-settings/client-settings.component').then(m => m.ClientSettingsComponent),
    title: 'Configuración del Cliente - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN, UserRole.ADMIN])],
    canDeactivate: [unsavedChangesGuard]
  },
  // CRM Settings nested routes - PARIDAD: Rails admin/clients/:client_id/crm_info_settings
  {
    path: ':id/crm_info_settings',
    loadChildren: () => import('../crm-settings/crm-settings.routes').then(m => m.CRM_SETTINGS_ROUTES),
    title: 'Configuraciones CRM - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN, UserRole.ADMIN])]
  }
];
