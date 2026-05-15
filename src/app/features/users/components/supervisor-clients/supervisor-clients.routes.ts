/**
 * Supervisor Clients Feature Routes
 * PARIDAD RAILS: /app/supervisor_clients routes
 */
import { Routes } from '@angular/router';

// Shared loader: '' y ':clientId' deben referenciar la MISMA función para que
// SharedComponentRouteReuseStrategy reutilice el componente al seleccionar un
// cliente (sin recrearlo ni perder el filtro de búsqueda).
const loadSupervisorClients = () =>
  import('./supervisor-clients.component').then(m => m.SupervisorClientsComponent);

export const SUPERVISOR_CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: loadSupervisorClients
  },
  {
    path: ':clientId',
    loadComponent: loadSupervisorClients
  }
];
