/**
 * Message Templates Module Routes
 * PARIDAD: Rails admin/message_templates routes
 */
import { Routes } from '@angular/router';

export const MESSAGE_TEMPLATES_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/message-template-list/message-template-list.component').then(m => m.MessageTemplateListComponent),
    title: 'Plantillas de Mensajes - MWS'
  },
  {
    path: ':id',
    loadComponent: () => import('./components/message-template-detail/message-template-detail.component').then(m => m.MessageTemplateDetailComponent),
    title: 'Detalle Plantilla - MWS'
  },
  {
    path: ':id/params',
    loadComponent: () => import('./components/template-params/template-params.component').then(m => m.TemplateParamsComponent),
    title: 'Parámetros Plantilla - MWS'
  }
];
