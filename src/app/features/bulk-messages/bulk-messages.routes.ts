/**
 * Bulk Messages Module Routes
 * PARIDAD: Rails admin/bulk_messages routes
 */
import { Routes } from '@angular/router';

export const BULK_MESSAGES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/bulk-message-list/bulk-message-list.component').then(m => m.BulkMessageListComponent),
    title: 'Mensajes Masivos - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/bulk-message-form/bulk-message-form.component').then(m => m.BulkMessageFormComponent),
    title: 'Crear Mensaje Masivo - MWS'
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/bulk-message-form/bulk-message-form.component').then(m => m.BulkMessageFormComponent),
    title: 'Editar Mensaje Masivo - MWS'
  }
];
