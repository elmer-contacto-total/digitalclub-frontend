/**
 * Agent Prospects Routes
 * PARIDAD: Rails /app/agent_prospects
 */
import { Routes } from '@angular/router';

// Shared loader: '' y ':prospectId' deben referenciar la MISMA función para que
// SharedComponentRouteReuseStrategy reutilice el componente al seleccionar un
// prospecto (sin recrearlo ni perder el filtro de búsqueda).
const loadAgentProspects = () =>
  import('./agent-prospects.component').then(m => m.AgentProspectsComponent);

export const AGENT_PROSPECTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: loadAgentProspects,
    title: 'Prospectos - MWS'
  },
  {
    path: ':prospectId',
    loadComponent: loadAgentProspects,
    title: 'Prospectos - MWS'
  }
];
