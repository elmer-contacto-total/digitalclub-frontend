/**
 * Electron Clients Feature Routes
 * CRM Panel for use alongside WhatsApp Web in Electron
 * Available only to AGENT role users
 */
import { Routes } from '@angular/router';

export const ELECTRON_CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./electron-clients.component').then(m => m.ElectronClientsComponent)
  }
];
