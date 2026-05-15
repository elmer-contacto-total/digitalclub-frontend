/**
 * Chat Feature Routes
 * PARIDAD RAILS: /app/messages routes
 */
import { Routes } from '@angular/router';

// Shared loader: '' y ':clientId' deben referenciar la MISMA función para que
// SharedComponentRouteReuseStrategy reutilice el componente al seleccionar una
// conversación (sin recrearlo ni perder búsqueda/filtros de la lista).
const loadChatLayout = () =>
  import('./chat-layout.component').then(m => m.ChatLayoutComponent);

export const CHAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: loadChatLayout
  },
  {
    path: ':clientId',
    loadComponent: loadChatLayout
  }
];
