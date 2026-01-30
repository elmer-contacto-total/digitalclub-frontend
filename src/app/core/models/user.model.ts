/**
 * User roles matching Spring Boot UserRole enum
 * PARIDAD: digitalgroup-web-main-spring-boot/domain/common/enums/UserRole.java
 */
export enum UserRole {
  STANDARD = 0,
  SUPER_ADMIN = 1,
  ADMIN = 2,
  MANAGER_LEVEL_1 = 3,
  MANAGER_LEVEL_2 = 4,
  MANAGER_LEVEL_3 = 5,
  MANAGER_LEVEL_4 = 6,
  AGENT = 7,
  STAFF = 8,
  WHATSAPP_BUSINESS = 9
}

/**
 * User status matching Spring Boot Status enum
 */
export enum UserStatus {
  ACTIVE = 0,
  INACTIVE = 1,
  PENDING = 2
}

/**
 * Role helper functions
 */
export const RoleUtils = {
  isAdmin: (role: UserRole): boolean => {
    return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
  },

  isSuperAdmin: (role: UserRole): boolean => {
    return role === UserRole.SUPER_ADMIN;
  },

  isManager: (role: UserRole): boolean => {
    return [
      UserRole.MANAGER_LEVEL_1,
      UserRole.MANAGER_LEVEL_2,
      UserRole.MANAGER_LEVEL_3,
      UserRole.MANAGER_LEVEL_4
    ].includes(role);
  },

  isManagerLevel4: (role: UserRole): boolean => {
    return role === UserRole.MANAGER_LEVEL_4;
  },

  isAgent: (role: UserRole): boolean => {
    return role === UserRole.AGENT;
  },

  isStaff: (role: UserRole): boolean => {
    return role === UserRole.STAFF;
  },

  isInternal: (role: UserRole): boolean => {
    return role !== UserRole.STANDARD && role !== UserRole.WHATSAPP_BUSINESS;
  },

  canManageUsers: (role: UserRole): boolean => {
    return role === UserRole.SUPER_ADMIN ||
           role === UserRole.ADMIN ||
           role === UserRole.STAFF ||
           RoleUtils.isManager(role);
  },

  /**
   * Get role display name in Spanish
   */
  getDisplayName: (role: UserRole): string => {
    const names: Record<UserRole, string> = {
      [UserRole.STANDARD]: 'Estándar',
      [UserRole.SUPER_ADMIN]: 'Super Admin',
      [UserRole.ADMIN]: 'Administrador',
      [UserRole.MANAGER_LEVEL_1]: 'Manager Nivel 1',
      [UserRole.MANAGER_LEVEL_2]: 'Manager Nivel 2',
      [UserRole.MANAGER_LEVEL_3]: 'Manager Nivel 3',
      [UserRole.MANAGER_LEVEL_4]: 'Manager Nivel 4',
      [UserRole.AGENT]: 'Agente',
      [UserRole.STAFF]: 'Staff',
      [UserRole.WHATSAPP_BUSINESS]: 'WhatsApp Business'
    };
    return names[role] || 'Desconocido';
  },

  /**
   * Get sidebar type for role
   */
  getSidebarType: (role: UserRole): string => {
    switch (role) {
      case UserRole.SUPER_ADMIN:
        return 'super_admin';
      case UserRole.ADMIN:
        return 'admin';
      case UserRole.AGENT:
        return 'agent';
      case UserRole.MANAGER_LEVEL_4:
        return 'manager_level_4';
      case UserRole.STAFF:
        return 'staff';
      default:
        return 'standard';
    }
  }
};

/**
 * User interface matching Spring Boot User entity
 * PARIDAD: digitalgroup-web-main-spring-boot/domain/user/entity/User.java
 */
export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  username?: string;
  phone: string;
  avatarData?: string;
  uuidToken?: string;
  role: UserRole;
  status: UserStatus;
  clientId: number;
  managerId?: number;
  countryId?: number;
  timeZone: string;
  locale: string;
  canCreateUsers: boolean;
  tempPassword?: string;
  initialPasswordChanged: boolean;
  requireResponse: boolean;
  requireCloseTicket: boolean;
  codigo?: string;
  customFields?: Record<string, unknown>;
  lastMessageAt?: string;
  lastHeartbeatAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * User for list/table display (subset of fields)
 * PARIDAD: Rails admin/users index muestra columna Manager
 */
export interface UserListItem {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: UserRole;
  status: UserStatus;
  clientId: number;
  managerId?: number;
  managerName?: string;  // Nombre del manager para mostrar en lista
  managerRole?: UserRole; // Rol del manager
  friendlyRole?: string; // PARIDAD RAILS: Nombre amigable del rol desde client_structure
  createdAt: string;
  // Additional fields for agent clients view
  fullName?: string;     // Computed: firstName + lastName
  codigo?: string;       // Customer code
  requireResponse?: boolean;  // Last message from client (needs response)
  hasOpenTicket?: boolean;    // Has an open support ticket
}

/**
 * User for dropdown/select
 */
export interface UserOption {
  id: number;
  fullName: string;
  email: string;
  role: UserRole;
}

/**
 * Helper to get full name
 */
export function getFullName(user: Pick<User, 'firstName' | 'lastName'>): string {
  return `${user.firstName} ${user.lastName}`.trim();
}

/**
 * Helper to get initials for avatar
 */
export function getInitials(user: Pick<User, 'firstName' | 'lastName'>): string {
  const first = user.firstName?.charAt(0) || '';
  const last = user.lastName?.charAt(0) || '';
  return (first + last).toUpperCase();
}
