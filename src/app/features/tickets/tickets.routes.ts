/**
 * Tickets Module Routes
 * PARIDAD: Rails admin/tickets routes
 */
import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { UserRole } from '../../core/models/user.model';

export const TICKETS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/ticket-list/ticket-list.component').then(m => m.TicketListComponent),
    title: 'Tickets - MWS'
  },
  {
    path: 'export',
    loadComponent: () => import('./components/ticket-export/ticket-export.component').then(m => m.TicketExportComponent),
    title: 'Exportar Tickets - MWS',
    canActivate: [roleGuard([UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER_LEVEL_1, UserRole.MANAGER_LEVEL_2])]
  },
  {
    path: ':id',
    loadComponent: () => import('./components/ticket-detail/ticket-detail.component').then(m => m.TicketDetailComponent),
    title: 'Detalle Ticket - MWS'
  }
];
