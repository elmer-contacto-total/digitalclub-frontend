/**
 * Agent Clients Feature Routes
 * PARIDAD RAILS: /app/agent_clients routes (UsersController#agent_clients)
 */
import { Routes } from '@angular/router';

// Shared loader: '' y ':clientId' deben referenciar la MISMA función para que
// SharedComponentRouteReuseStrategy reutilice el componente al seleccionar un
// cliente (sin recrearlo ni perder el filtro de búsqueda).
const loadAgentClients = () =>
  import('./agent-clients.component').then(m => m.AgentClientsComponent);

export const AGENT_CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: loadAgentClients
  },
  {
    path: ':clientId',
    loadComponent: loadAgentClients
  }
];
