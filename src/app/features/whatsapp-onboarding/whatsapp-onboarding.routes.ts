/**
 * WhatsApp Onboarding Module Routes
 * PARIDAD: Rails admin/whatsapp_onboarding routes
 */
import { Routes } from '@angular/router';

export const WHATSAPP_ONBOARDING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/whatsapp-onboarding/whatsapp-onboarding.component').then(m => m.WhatsAppOnboardingComponent),
    title: 'Alta WhatsApp - MWS'
  }
];
