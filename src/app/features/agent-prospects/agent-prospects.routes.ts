/**
 * Agent Prospects Routes
 * PARIDAD: Rails /app/agent_prospects
 */
import { Routes } from '@angular/router';

export const AGENT_PROSPECTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./agent-prospects.component').then(m => m.AgentProspectsComponent),
    title: 'Prospectos - MWS'
  },
  {
    path: ':prospectId',
    loadComponent: () => import('./agent-prospects.component').then(m => m.AgentProspectsComponent),
    title: 'Prospectos - MWS'
  }
];
