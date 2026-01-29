/**
 * CRM Settings Module Routes
 * PARIDAD: Rails admin/crm_info_settings routes (nested under clients)
 *
 * Routes:
 * - /app/clients/:clientId/crm_info_settings        → List
 * - /app/clients/:clientId/crm_info_settings/new    → Create
 * - /app/clients/:clientId/crm_info_settings/:id/edit → Edit
 */
import { Routes } from '@angular/router';
import { unsavedChangesGuard } from '../../core/guards/unsaved-changes.guard';

export const CRM_SETTINGS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/crm-settings-list/crm-settings-list.component').then(m => m.CrmSettingsListComponent),
    title: 'Configuraciones CRM - MWS'
  },
  {
    path: 'new',
    loadComponent: () => import('./components/crm-settings-form/crm-settings-form.component').then(m => m.CrmSettingsFormComponent),
    title: 'Nueva Configuración CRM - MWS',
    canDeactivate: [unsavedChangesGuard]
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./components/crm-settings-form/crm-settings-form.component').then(m => m.CrmSettingsFormComponent),
    title: 'Editar Configuración CRM - MWS',
    canDeactivate: [unsavedChangesGuard]
  }
];
