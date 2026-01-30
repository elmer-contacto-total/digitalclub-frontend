/**
 * Users Module Routes
 * PARIDAD: Rails admin/users routes
 */
import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/models/user.model';

export const USERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/user-list/user-list.component').then(m => m.UserListComponent),
    title: 'Usuarios - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/user-form/user-form.component').then(m => m.UserFormComponent),
    title: 'Nuevo Usuario - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF, UserRole.MANAGER_LEVEL_4])]
  },
  {
    path: ':id',
    loadComponent: () => import('./components/user-detail/user-detail.component').then(m => m.UserDetailComponent),
    title: 'Detalle Usuario - MWS'
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/user-form/user-form.component').then(m => m.UserFormComponent),
    title: 'Editar Usuario - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.STAFF, UserRole.MANAGER_LEVEL_4])]
  }
];

export const INTERNAL_USERS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/internal-users/internal-users.component').then(m => m.InternalUsersComponent),
    title: 'Usuarios Internos - MWS'
  }
];

export const SUPERVISOR_ROUTES: Routes = [
  {
    path: 'clients',
    loadComponent: () => import('./components/supervisor-clients/supervisor-clients.component').then(m => m.SupervisorClientsComponent),
    title: 'Clientes - MWS'
  },
  {
    path: 'agents',
    loadComponent: () => import('./components/supervisor-agents/supervisor-agents.component').then(m => m.SupervisorAgentsComponent),
    title: 'Agentes - MWS'
  }
];
