import { Routes } from '@angular/router';
import { authGuard, publicOnlyGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // Root redirect to login
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full'
  },

  // Auth routes (login, forgot password, etc.) - uses AuthLayout
  {
    path: 'auth',
    loadComponent: () => import('./shared/layouts/auth-layout/auth-layout.component').then(m => m.AuthLayoutComponent),
    children: [
      {
        path: '',
        loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
      }
    ]
  },

  // App routes (protected, uses AdminLayout)
  {
    path: 'app',
    loadComponent: () => import('./shared/layouts/admin-layout/admin-layout.component').then(m => m.AdminLayoutComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      // Dashboard (implemented)
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
        title: 'Tablero - MWS'
      },
      // Chat/Messaging (implemented)
      {
        path: 'chat',
        loadChildren: () => import('./features/chat/chat.routes').then(m => m.CHAT_ROUTES),
        title: 'Mensajes - MWS'
      },
      // Agent Clients view (PARIDAD: Rails /app/agent_clients)
      {
        path: 'agent_clients',
        loadChildren: () => import('./features/agent-clients/agent-clients.routes').then(m => m.AGENT_CLIENTS_ROUTES),
        title: 'Clientes - MWS'
      },
      // Agent Prospects view (PARIDAD: Rails /app/agent_prospects)
      // Two-column layout with prospects list + chat panel (like agent_clients)
      {
        path: 'agent_prospects',
        loadChildren: () => import('./features/agent-prospects/agent-prospects.routes').then(m => m.AGENT_PROSPECTS_ROUTES),
        title: 'Prospectos - MWS'
      },
      // Messages list view (PARIDAD: Rails /app/messages - tabs incoming/outgoing)
      {
        path: 'messages',
        loadChildren: () => import('./features/messages-list/messages-list.routes').then(m => m.MESSAGES_LIST_ROUTES),
        title: 'Mensajes - MWS'
      },

      // ===== PLACEHOLDER ROUTES (En Construcción) =====

      // Analytics
      {
        path: 'analytics',
        loadComponent: () => import('./shared/components/coming-soon/coming-soon.component').then(m => m.ComingSoonComponent),
        title: 'Analíticas - MWS'
      },
      // Users (implemented)
      {
        path: 'users',
        loadChildren: () => import('./features/users/users.routes').then(m => m.USERS_ROUTES),
        title: 'Usuarios - MWS'
      },
      {
        path: 'internal_users',
        loadChildren: () => import('./features/users/users.routes').then(m => m.INTERNAL_USERS_ROUTES),
        title: 'Usuarios Internos - MWS'
      },
      // Clients (implemented)
      {
        path: 'clients',
        loadChildren: () => import('./features/clients/clients.routes').then(m => m.CLIENTS_ROUTES),
        title: 'Clientes - MWS'
      },
      {
        path: 'supervisor_clients',
        loadComponent: () => import('./features/users/components/supervisor-clients/supervisor-clients.component').then(m => m.SupervisorClientsComponent),
        title: 'Clientes - MWS'
      },
      {
        path: 'supervisor_agents',
        loadComponent: () => import('./features/users/components/supervisor-agents/supervisor-agents.component').then(m => m.SupervisorAgentsComponent),
        title: 'Agentes - MWS'
      },
      {
        path: 'managers',
        loadComponent: () => import('./shared/components/coming-soon/coming-soon.component').then(m => m.ComingSoonComponent),
        title: 'Managers - MWS'
      },
      // Imports (implemented)
      {
        path: 'imports',
        loadChildren: () => import('./features/imports/imports.routes').then(m => m.IMPORTS_ROUTES),
        title: 'Importaciones - MWS'
      },
      // Templates (implemented)
      {
        path: 'message_templates',
        loadChildren: () => import('./features/message-templates/message-templates.routes').then(m => m.MESSAGE_TEMPLATES_ROUTES),
        title: 'Plantillas - MWS'
      },
      // Bulk Messages (implemented)
      {
        path: 'bulk_messages',
        loadChildren: () => import('./features/bulk-messages/bulk-messages.routes').then(m => m.BULK_MESSAGES_ROUTES),
        title: 'Mensajes Masivos - MWS'
      },
      // Template Bulk Sends (implemented)
      {
        path: 'template_bulk_sends',
        loadChildren: () => import('./features/template-bulk-sends/template-bulk-sends.routes').then(m => m.TEMPLATE_BULK_SENDS_ROUTES),
        title: 'Envíos Masivos - MWS'
      },
      // Canned Messages (implemented)
      {
        path: 'canned_messages',
        loadChildren: () => import('./features/canned-messages/canned-messages.routes').then(m => m.CANNED_MESSAGES_ROUTES),
        title: 'Mensajes Enlatados - MWS'
      },
      // Prospects (implemented)
      {
        path: 'prospects',
        loadChildren: () => import('./features/prospects/prospects.routes').then(m => m.PROSPECTS_ROUTES),
        title: 'Prospectos - MWS'
      },
      // Tickets (implemented)
      {
        path: 'tickets',
        loadChildren: () => import('./features/tickets/tickets.routes').then(m => m.TICKETS_ROUTES),
        title: 'Tickets - MWS'
      },
      // Alerts (implemented)
      {
        path: 'alerts',
        loadChildren: () => import('./features/alerts/alerts.routes').then(m => m.ALERTS_ROUTES),
        title: 'Alertas - MWS'
      },
      // Audits (implemented)
      {
        path: 'audits',
        loadChildren: () => import('./features/audits/audits.routes').then(m => m.AUDITS_ROUTES),
        title: 'Auditorías - MWS'
      },
      // WhatsApp (implemented)
      {
        path: 'whatsapp_onboarding',
        loadChildren: () => import('./features/whatsapp-onboarding/whatsapp-onboarding.routes').then(m => m.WHATSAPP_ONBOARDING_ROUTES),
        title: 'Alta WhatsApp - MWS'
      },
      // Settings & Profile
      {
        path: 'profile',
        loadComponent: () => import('./shared/components/coming-soon/coming-soon.component').then(m => m.ComingSoonComponent),
        title: 'Mi Perfil - MWS'
      },
      {
        path: 'settings',
        loadComponent: () => import('./shared/components/coming-soon/coming-soon.component').then(m => m.ComingSoonComponent),
        title: 'Ajustes - MWS'
      },
      {
        path: 'login_as',
        loadChildren: () => import('./features/login-as/login-as.routes').then(m => m.LOGIN_AS_ROUTES),
        title: 'Iniciar Sesión Como - MWS'
      },
      {
        path: 'export_contacts',
        loadComponent: () => import('./shared/components/coming-soon/coming-soon.component').then(m => m.ComingSoonComponent),
        title: 'Exportar Contactos - MWS'
      }
    ]
  },

  // Legacy route redirects (from Rails)
  { path: 'login', redirectTo: 'auth/login', pathMatch: 'full' },
  { path: 'pre_login', redirectTo: 'auth/login', pathMatch: 'full' },

  // Catch-all redirect
  {
    path: '**',
    redirectTo: 'auth/login'
  }
];
