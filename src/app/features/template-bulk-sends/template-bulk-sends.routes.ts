/**
 * Template Bulk Sends Module Routes
 * PARIDAD: Rails admin/template_bulk_sends routes
 */
import { Routes } from '@angular/router';

export const TEMPLATE_BULK_SENDS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/template-bulk-send-list/template-bulk-send-list.component').then(m => m.TemplateBulkSendListComponent),
    title: 'Envíos Masivos - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/template-bulk-send-form/template-bulk-send-form.component').then(m => m.TemplateBulkSendFormComponent),
    title: 'Crear Envío Masivo - MWS'
  }
];
