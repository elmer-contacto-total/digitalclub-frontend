/**
 * Bulk Sends Module Routes
 * Rutas para gestión de envíos masivos
 */
import { Routes } from '@angular/router';

export const BULK_SENDS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/envio-list/envio-list.component').then(m => m.EnvioListComponent),
    title: 'Envíos Masivos - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/envio-create/envio-create.component').then(m => m.EnvioCreateComponent),
    title: 'Nuevo Envío Masivo - MWS'
  },
  {
    path: 'rules',
    loadComponent: () => import('./components/send-rules/send-rules.component').then(m => m.SendRulesComponent),
    title: 'Reglas de Envío - MWS'
  },
  {
    path: ':id',
    loadComponent: () => import('./components/envio-detail/envio-detail.component').then(m => m.EnvioDetailComponent),
    title: 'Detalle Envío - MWS'
  }
];
