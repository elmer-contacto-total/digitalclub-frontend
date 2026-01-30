import { UserRole } from './user.model';

/**
 * Navigation item for sidebar
 * PARIDAD: Rails sidebar partials structure
 * NOTA: Las rutas usan /app/ (Angular) en lugar de /admin/ (Rails)
 */
export interface NavItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  queryParams?: Record<string, string>;
  badge?: number | string;
  badgeClass?: string;
  children?: NavItem[];
  roles?: UserRole[];
  requiresWhatsApp?: boolean;
  isExternal?: boolean;
  dividerBefore?: boolean;
  dividerAfter?: boolean;
  // For dynamic badges that need to be fetched from API
  badgeKey?: string;
}

/**
 * Navigation section
 */
export interface NavSection {
  id: string;
  title?: string;
  items: NavItem[];
  roles?: UserRole[];
}

/**
 * Feather to Phosphor icon mapping
 * PARIDAD: Rails uses Feather icons, Angular uses Phosphor
 */
export const ICON_MAP: Record<string, string> = {
  // Feather -> Phosphor
  'bell': 'ph-bell',
  'user': 'ph-user',
  'users': 'ph-users',
  'settings': 'ph-gear',
  'sliders': 'ph-sliders',
  'bar-chart-2': 'ph-chart-bar',
  'shopping-cart': 'ph-shopping-cart',
  'download': 'ph-download',
  'file-text': 'ph-file-text',
  'mail': 'ph-envelope',
  'phone': 'ph-phone',
  'git-pull-request': 'ph-git-pull-request',
  'log-in': 'ph-sign-in',
  'log-out': 'ph-sign-out',
  'edit': 'ph-pencil',
  'help-circle': 'ph-question',
  'search': 'ph-magnifying-glass',
  'menu': 'ph-list',
  'x': 'ph-x',
  'check': 'ph-check',
  'plus': 'ph-plus',
  'minus': 'ph-minus',
  'trash-2': 'ph-trash',
  'eye': 'ph-eye',
  'eye-off': 'ph-eye-slash',
  'chevron-down': 'ph-caret-down',
  'chevron-up': 'ph-caret-up',
  'chevron-left': 'ph-caret-left',
  'chevron-right': 'ph-caret-right',
  'calendar': 'ph-calendar',
  'clock': 'ph-clock',
  'filter': 'ph-funnel',
  'refresh-cw': 'ph-arrows-clockwise',
  'upload': 'ph-upload',
  'message-square': 'ph-chat',
  'send': 'ph-paper-plane-tilt',
  'home': 'ph-house',
  'globe': 'ph-globe',
  'flag': 'ph-flag',
  'message-circle': 'ph-chat-circle',
  'clipboard': 'ph-clipboard-text'
};

/**
 * Get Phosphor icon class from Feather icon name
 */
export function getPhosphorIcon(featherIcon: string): string {
  return ICON_MAP[featherIcon] || `ph-${featherIcon}`;
}

/**
 * Sidebar navigation configuration by role
 * PARIDAD: Rails _sidebar_*.html.erb files
 * NOTA: Rutas Angular usan /app/ en lugar de /admin/
 */
export const SIDEBAR_CONFIG: Record<string, NavSection[]> = {
  // ===== SUPER ADMIN =====
  // PARIDAD: _sidebar_super_admin.html.erb
  super_admin: [
    {
      id: 'organizations',
      title: 'ORGANIZACIONES',
      items: [
        {
          id: 'organizations',
          label: 'Organizaciones',
          icon: 'ph-buildings',
          route: '/app/clients',
          badgeKey: 'clientsCount'
        }
      ]
    },
    // NOTA: "Organización Activa" se renderiza como componente especial en sidebar, no como NavItem
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' },
        { id: 'analytics', label: 'Analíticas', icon: 'ph-chart-bar', route: '/app/analytics', badge: 'Muy Pronto', badgeClass: 'badge-primary' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        { id: 'users', label: 'Usuarios', icon: 'ph-users', route: '/app/users', badgeKey: 'usersCount' },
        { id: 'imports', label: 'Importaciones', icon: 'ph-download', route: '/app/imports', badgeKey: 'importsCount' },
        { id: 'templates', label: 'Plantillas de Mensajes', icon: 'ph-file-text', route: '/app/message_templates', badgeKey: 'templatesCount' }
      ]
    },
    {
      id: 'reports',
      title: 'REPORTES',
      items: [
        { id: 'transcripts', label: 'Transcripciones de Casos', icon: 'ph-clipboard-text', route: '/app/tickets/export' }
      ]
    },
    {
      id: 'internal',
      title: 'TABLAS INTERNAS',
      items: [
        { id: 'audits', label: 'Tablas de Auditoría', icon: 'ph-list-checks', route: '/app/audits' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user-circle', route: '/app/profile' },
        { id: 'login-as', label: 'Iniciar Sesión Como', icon: 'ph-sign-in', route: '/app/login_as' }
      ]
    }
  ],

  // ===== ADMIN =====
  // PARIDAD: _sidebar_admin.html.erb
  admin: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' },
        { id: 'analytics', label: 'Analíticas', icon: 'ph-chart-bar', route: '/app/analytics', badge: 'Muy Pronto', badgeClass: 'badge-primary' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        { id: 'users', label: 'Usuarios', icon: 'ph-users', route: '/app/users', badgeKey: 'usersCount' }
      ]
    },
    {
      id: 'internal',
      title: 'TABLAS INTERNAS',
      items: [
        { id: 'internal-users', label: 'Usuarios Internos', icon: 'ph-user-gear', route: '/app/internal_users', badgeKey: 'internalUsersCount' },
        { id: 'audits', label: 'Tablas de Auditoría', icon: 'ph-list-checks', route: '/app/audits' }
      ]
    },
    {
      id: 'whatsapp',
      title: 'WHATSAPP BUSINESS',
      items: [
        { id: 'onboarding', label: 'Alta Whatsapp', icon: 'ph-whatsapp-logo', route: '/app/whatsapp_onboarding' },
        { id: 'templates', label: 'Plantillas de Mensajes', icon: 'ph-file-text', route: '/app/message_templates', badgeKey: 'templatesCount' },
        { id: 'bulk-sends', label: 'Envíos Masivos', icon: 'ph-broadcast', route: '/app/template_bulk_sends', requiresWhatsApp: true }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user-circle', route: '/app/profile' },
        { id: 'settings', label: 'Ajustes', icon: 'ph-gear', route: '/app/settings' },
        { id: 'login-as', label: 'Iniciar sesión como', icon: 'ph-sign-in', route: '/app/login_as' }
      ]
    }
  ],

  // ===== MANAGER LEVEL 4 (Supervisor) =====
  // PARIDAD: _sidebar_manager_level_4.html.erb
  manager_level_4: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' },
        { id: 'analytics', label: 'Analíticas', icon: 'ph-chart-bar', route: '/app/analytics', badge: 'Muy Pronto', badgeClass: 'badge-primary' }
      ]
    },
    {
      id: 'messages',
      title: 'MENSAJES',
      items: [
        { id: 'assignments', label: 'Asignaciones', icon: 'ph-user-switch', route: '/app/managers' },
        { id: 'agents', label: 'Agentes', icon: 'ph-users', route: '/app/supervisor_agents', badgeKey: 'subordinatesCount' },
        { id: 'clients', label: 'Clientes', icon: 'ph-identification-card', route: '/app/supervisor_clients', badgeKey: 'subordinatesClientsCount' },
        // PARIDAD: Rails admin_supervisor_clients_path(active_only: true)
        { id: 'conversations', label: 'Conversaciones Activas', icon: 'ph-chat-circle', route: '/app/supervisor_clients', queryParams: { active_only: 'true' }, badgeKey: 'activeConversationsCount' },
        { id: 'messages-list', label: 'Mensajes', icon: 'ph-envelope', route: '/app/messages', badgeKey: 'messagesCount' },
        // PARIDAD: Rails admin_agent_prospects_path
        { id: 'prospects', label: 'Prospectos', icon: 'ph-user-plus', route: '/app/agent_prospects', badgeKey: 'prospectsCount' }
      ]
    },
    {
      id: 'users',
      title: 'USUARIOS',
      items: [
        { id: 'users-list', label: 'Usuarios', icon: 'ph-user', route: '/app/users', badgeKey: 'standardUsersCount' },
        { id: 'imports', label: 'Importaciones', icon: 'ph-download', route: '/app/imports', badgeKey: 'importsCount' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        { id: 'bulk-sends', label: 'Envíos Masivos', icon: 'ph-users', route: '/app/template_bulk_sends', requiresWhatsApp: true },
        { id: 'canned', label: 'Mensajes Enlatados', icon: 'ph-chat', route: '/app/canned_messages', badgeKey: 'cannedMessagesCount' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user', route: '/app/profile' }
      ]
    }
  ],

  // ===== AGENT =====
  // PARIDAD: _sidebar_agent.html.erb
  agent: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' },
        { id: 'analytics', label: 'Analíticas', icon: 'ph-chart-bar', route: '/app/analytics', badge: 'Muy Pronto', badgeClass: 'badge-primary' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        // Electron Clients (CRM Panel for use with WhatsApp Web in Electron)
        { id: 'electron-clients', label: 'Clientes (new)', icon: 'ph-whatsapp-logo', route: '/app/electron_clients', badge: 'new', badgeClass: 'badge-success' },
        // PARIDAD: Rails admin_agent_clients_path
        { id: 'clients', label: 'Clientes', icon: 'ph-user', route: '/app/agent_clients', badgeKey: 'subordinatesCount' },
        // PARIDAD: Rails admin_agent_clients_path(active_only: true)
        { id: 'conversations', label: 'Conversaciones Activas', icon: 'ph-chat-circle', route: '/app/agent_clients', queryParams: { active_only: 'true' }, badgeKey: 'activeConversationsCount' },
        // PARIDAD: Rails admin_messages_path
        { id: 'messages', label: 'Mensajes', icon: 'ph-envelope', route: '/app/messages', badgeKey: 'messagesCount' },
        // PARIDAD: Rails admin_agent_prospects_path
        { id: 'prospects', label: 'Prospectos', icon: 'ph-git-pull-request', route: '/app/agent_prospects', badgeKey: 'prospectsCount' },
        { id: 'bulk-sends', label: 'Envíos Masivos', icon: 'ph-broadcast', route: '/app/template_bulk_sends', requiresWhatsApp: true },
        { id: 'canned', label: 'Mensajes Predefinidos', icon: 'ph-chat-text', route: '/app/canned_messages' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'export', label: 'Exportar Contactos', icon: 'ph-pencil', route: '/app/export_contacts' },
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-pencil', route: '/app/profile' }
      ]
    }
  ],

  // ===== STAFF =====
  // PARIDAD: _sidebar_staff.html.erb
  staff: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        { id: 'users', label: 'Usuarios', icon: 'ph-users', route: '/app/users', badgeKey: 'usersCount' },
        { id: 'imports', label: 'Importaciones', icon: 'ph-download', route: '/app/imports', badgeKey: 'importsCount' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user-circle', route: '/app/profile' }
      ]
    }
  ],

  // ===== STANDARD =====
  // PARIDAD: _sidebar_standard.html.erb
  standard: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user-circle', route: '/app/profile' },
        { id: 'settings', label: 'Ajustes', icon: 'ph-gear', route: '/app/settings' }
      ]
    }
  ],

  // ===== MANAGER LEVELS 1-3 (similar to Level 4) =====
  manager_level_1: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' },
        { id: 'analytics', label: 'Analíticas', icon: 'ph-chart-bar', route: '/app/analytics', badge: 'Muy Pronto', badgeClass: 'badge-primary' }
      ]
    },
    {
      id: 'messages',
      title: 'MENSAJES',
      items: [
        { id: 'assignments', label: 'Asignaciones', icon: 'ph-user-switch', route: '/app/managers' },
        { id: 'agents', label: 'Agentes', icon: 'ph-users', route: '/app/supervisor_agents', badgeKey: 'subordinatesCount' },
        { id: 'clients', label: 'Clientes', icon: 'ph-identification-card', route: '/app/supervisor_clients', badgeKey: 'subordinatesClientsCount' },
        // PARIDAD: Rails admin_supervisor_clients_path(active_only: true)
        { id: 'conversations', label: 'Conversaciones Activas', icon: 'ph-chat-circle', route: '/app/supervisor_clients', queryParams: { active_only: 'true' } },
        { id: 'messages-list', label: 'Mensajes', icon: 'ph-envelope', route: '/app/messages', badgeKey: 'messagesCount' },
        // PARIDAD: Rails admin_agent_prospects_path
        { id: 'prospects', label: 'Prospectos', icon: 'ph-user-plus', route: '/app/agent_prospects', badgeKey: 'prospectsCount' }
      ]
    },
    {
      id: 'users',
      title: 'USUARIOS',
      items: [
        { id: 'users-list', label: 'Usuarios', icon: 'ph-users', route: '/app/users', badgeKey: 'standardUsersCount' },
        { id: 'imports', label: 'Importaciones', icon: 'ph-download', route: '/app/imports', badgeKey: 'importsCount' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        { id: 'bulk-sends', label: 'Envíos Masivos', icon: 'ph-broadcast', route: '/app/template_bulk_sends', requiresWhatsApp: true },
        { id: 'canned', label: 'Mensajes Enlatados', icon: 'ph-chat-text', route: '/app/canned_messages', badgeKey: 'cannedMessagesCount' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user-circle', route: '/app/profile' }
      ]
    }
  ],

  manager_level_2: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' },
        { id: 'analytics', label: 'Analíticas', icon: 'ph-chart-bar', route: '/app/analytics', badge: 'Muy Pronto', badgeClass: 'badge-primary' }
      ]
    },
    {
      id: 'messages',
      title: 'MENSAJES',
      items: [
        { id: 'assignments', label: 'Asignaciones', icon: 'ph-user-switch', route: '/app/managers' },
        { id: 'agents', label: 'Agentes', icon: 'ph-users', route: '/app/supervisor_agents', badgeKey: 'subordinatesCount' },
        { id: 'clients', label: 'Clientes', icon: 'ph-identification-card', route: '/app/supervisor_clients', badgeKey: 'subordinatesClientsCount' },
        // PARIDAD: Rails admin_supervisor_clients_path(active_only: true)
        { id: 'conversations', label: 'Conversaciones Activas', icon: 'ph-chat-circle', route: '/app/supervisor_clients', queryParams: { active_only: 'true' } },
        { id: 'messages-list', label: 'Mensajes', icon: 'ph-envelope', route: '/app/messages', badgeKey: 'messagesCount' },
        // PARIDAD: Rails admin_agent_prospects_path
        { id: 'prospects', label: 'Prospectos', icon: 'ph-user-plus', route: '/app/agent_prospects', badgeKey: 'prospectsCount' }
      ]
    },
    {
      id: 'users',
      title: 'USUARIOS',
      items: [
        { id: 'users-list', label: 'Usuarios', icon: 'ph-users', route: '/app/users', badgeKey: 'standardUsersCount' },
        { id: 'imports', label: 'Importaciones', icon: 'ph-download', route: '/app/imports', badgeKey: 'importsCount' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        { id: 'bulk-sends', label: 'Envíos Masivos', icon: 'ph-broadcast', route: '/app/template_bulk_sends', requiresWhatsApp: true },
        { id: 'canned', label: 'Mensajes Enlatados', icon: 'ph-chat-text', route: '/app/canned_messages', badgeKey: 'cannedMessagesCount' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user-circle', route: '/app/profile' }
      ]
    }
  ],

  manager_level_3: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' },
        { id: 'analytics', label: 'Analíticas', icon: 'ph-chart-bar', route: '/app/analytics', badge: 'Muy Pronto', badgeClass: 'badge-primary' }
      ]
    },
    {
      id: 'messages',
      title: 'MENSAJES',
      items: [
        { id: 'assignments', label: 'Asignaciones', icon: 'ph-user-switch', route: '/app/managers' },
        { id: 'agents', label: 'Agentes', icon: 'ph-users', route: '/app/supervisor_agents', badgeKey: 'subordinatesCount' },
        { id: 'clients', label: 'Clientes', icon: 'ph-identification-card', route: '/app/supervisor_clients', badgeKey: 'subordinatesClientsCount' },
        // PARIDAD: Rails admin_supervisor_clients_path(active_only: true)
        { id: 'conversations', label: 'Conversaciones Activas', icon: 'ph-chat-circle', route: '/app/supervisor_clients', queryParams: { active_only: 'true' } },
        { id: 'messages-list', label: 'Mensajes', icon: 'ph-envelope', route: '/app/messages', badgeKey: 'messagesCount' },
        // PARIDAD: Rails admin_agent_prospects_path
        { id: 'prospects', label: 'Prospectos', icon: 'ph-user-plus', route: '/app/agent_prospects', badgeKey: 'prospectsCount' }
      ]
    },
    {
      id: 'users',
      title: 'USUARIOS',
      items: [
        { id: 'users-list', label: 'Usuarios', icon: 'ph-users', route: '/app/users', badgeKey: 'standardUsersCount' },
        { id: 'imports', label: 'Importaciones', icon: 'ph-download', route: '/app/imports', badgeKey: 'importsCount' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        { id: 'bulk-sends', label: 'Envíos Masivos', icon: 'ph-broadcast', route: '/app/template_bulk_sends', requiresWhatsApp: true },
        { id: 'canned', label: 'Mensajes Enlatados', icon: 'ph-chat-text', route: '/app/canned_messages', badgeKey: 'cannedMessagesCount' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user-circle', route: '/app/profile' }
      ]
    }
  ],

  // ===== WHATSAPP BUSINESS =====
  whatsapp_business: [
    {
      id: 'dashboard',
      title: 'TABLERO',
      items: [
        { id: 'dashboard', label: 'Tablero', icon: 'ph-house', route: '/app/dashboard' },
        { id: 'analytics', label: 'Analíticas', icon: 'ph-chart-bar', route: '/app/analytics', badge: 'Muy Pronto', badgeClass: 'badge-primary' }
      ]
    },
    {
      id: 'tables',
      title: 'TABLAS',
      items: [
        { id: 'clients', label: 'Clientes', icon: 'ph-identification-card', route: '/app/chat', badgeKey: 'subordinatesCount' },
        { id: 'conversations', label: 'Conversaciones Activas', icon: 'ph-chat-circle', route: '/app/chat' },
        { id: 'messages', label: 'Mensajes', icon: 'ph-envelope', route: '/app/messages', badgeKey: 'messagesCount' },
        // PARIDAD: Rails admin_agent_prospects_path
        { id: 'prospects', label: 'Prospectos', icon: 'ph-user-plus', route: '/app/agent_prospects', badgeKey: 'prospectsCount' },
        { id: 'bulk-sends', label: 'Envíos Masivos', icon: 'ph-broadcast', route: '/app/template_bulk_sends' },
        { id: 'canned', label: 'Mensajes Enlatados', icon: 'ph-chat-text', route: '/app/canned_messages' }
      ]
    },
    {
      id: 'settings',
      title: 'AJUSTES',
      items: [
        { id: 'export', label: 'Exportar Contactos', icon: 'ph-export', route: '/app/export_contacts' },
        { id: 'profile', label: 'Mi Perfil', icon: 'ph-user-circle', route: '/app/profile' }
      ]
    }
  ]
};

/**
 * Get navigation config for a role
 */
export function getNavigationForRole(role: UserRole, hasWhatsApp: boolean = false): NavSection[] {
  const roleKey = getRoleKey(role);
  const sections = SIDEBAR_CONFIG[roleKey] || SIDEBAR_CONFIG['standard'];

  if (!hasWhatsApp) {
    // Filter out WhatsApp-dependent items
    return sections.map(section => ({
      ...section,
      items: section.items.filter(item => !item.requiresWhatsApp)
    })).filter(section => section.items.length > 0);
  }

  return sections;
}

/**
 * Convert UserRole enum to config key
 */
function getRoleKey(role: UserRole): string {
  switch (role) {
    case UserRole.SUPER_ADMIN:
      return 'super_admin';
    case UserRole.ADMIN:
      return 'admin';
    case UserRole.AGENT:
      return 'agent';
    case UserRole.MANAGER_LEVEL_1:
      return 'manager_level_1';
    case UserRole.MANAGER_LEVEL_2:
      return 'manager_level_2';
    case UserRole.MANAGER_LEVEL_3:
      return 'manager_level_3';
    case UserRole.MANAGER_LEVEL_4:
      return 'manager_level_4';
    case UserRole.STAFF:
      return 'staff';
    case UserRole.WHATSAPP_BUSINESS:
      return 'whatsapp_business';
    default:
      return 'standard';
  }
}

/**
 * Get all unique routes from navigation config
 * Useful for route guards and preloading
 */
export function getAllNavigationRoutes(): string[] {
  const routes = new Set<string>();

  Object.values(SIDEBAR_CONFIG).forEach(sections => {
    sections.forEach(section => {
      section.items.forEach(item => {
        if (item.route) {
          routes.add(item.route);
        }
        if (item.children) {
          item.children.forEach(child => {
            if (child.route) {
              routes.add(child.route);
            }
          });
        }
      });
    });
  });

  return Array.from(routes);
}
