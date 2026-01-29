/**
 * Messages List Feature Routes
 * PARIDAD RAILS: /app/messages routes (MessagesController#index)
 */
import { Routes } from '@angular/router';

export const MESSAGES_LIST_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./messages-list.component').then(m => m.MessagesListComponent)
  }
];
