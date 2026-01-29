/**
 * Chat Feature Routes
 * PARIDAD RAILS: /app/messages routes
 */
import { Routes } from '@angular/router';

export const CHAT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./chat-layout.component').then(m => m.ChatLayoutComponent)
  },
  {
    path: ':clientId',
    loadComponent: () => import('./chat-layout.component').then(m => m.ChatLayoutComponent)
  }
];
