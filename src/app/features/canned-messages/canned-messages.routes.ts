/**
 * Canned Messages Module Routes
 * PARIDAD: Rails admin/canned_messages routes
 */
import { Routes } from '@angular/router';

export const CANNED_MESSAGES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/canned-message-list/canned-message-list.component').then(m => m.CannedMessageListComponent),
    title: 'Mensajes Enlatados - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/canned-message-form/canned-message-form.component').then(m => m.CannedMessageFormComponent),
    title: 'Crear Mensaje Enlatado - MWS'
  },
  {
    path: ':id',
    loadComponent: () => import('./components/canned-message-detail/canned-message-detail.component').then(m => m.CannedMessageDetailComponent),
    title: 'Ver Mensaje Enlatado - MWS'
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/canned-message-form/canned-message-form.component').then(m => m.CannedMessageFormComponent),
    title: 'Editar Mensaje Enlatado - MWS'
  }
];
