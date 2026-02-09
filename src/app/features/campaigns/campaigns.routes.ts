/**
 * Campaigns Module Routes
 * Rutas para gestión de campañas de envío masivo
 */
import { Routes } from '@angular/router';

export const CAMPAIGNS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/campaign-list/campaign-list.component').then(m => m.CampaignListComponent),
    title: 'Campañas - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/campaign-create/campaign-create.component').then(m => m.CampaignCreateComponent),
    title: 'Nueva Campaña - MWS'
  },
  {
    path: 'rules',
    loadComponent: () => import('./components/send-rules/send-rules.component').then(m => m.SendRulesComponent),
    title: 'Reglas de Envío - MWS'
  },
  {
    path: ':id',
    loadComponent: () => import('./components/campaign-detail/campaign-detail.component').then(m => m.CampaignDetailComponent),
    title: 'Detalle Campaña - MWS'
  }
];
