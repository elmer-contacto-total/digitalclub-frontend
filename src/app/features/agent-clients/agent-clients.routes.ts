/**
 * Agent Clients Feature Routes
 * PARIDAD RAILS: /app/agent_clients routes (UsersController#agent_clients)
 */
import { Routes } from '@angular/router';

export const AGENT_CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./agent-clients.component').then(m => m.AgentClientsComponent)
  },
  {
    path: ':clientId',
    loadComponent: () => import('./agent-clients.component').then(m => m.AgentClientsComponent)
  }
];
