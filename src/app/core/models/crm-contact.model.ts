/**
 * CRM Contact Model for Electron Clients Module
 * Used for displaying contact information in the CRM panel alongside WhatsApp Web
 */

/**
 * Personal labels for local contacts (stored in localStorage)
 */
export type PersonalLabel =
  | 'jefe'
  | 'rrhh'
  | 'companero'
  | 'cliente'
  | 'proveedor'
  | 'amigo'
  | 'familia'
  | 'otro';

/**
 * Label configuration with display names
 */
export const PERSONAL_LABELS: { value: PersonalLabel; label: string; icon: string }[] = [
  { value: 'jefe', label: 'Jefe', icon: 'ph-crown' },
  { value: 'rrhh', label: 'RRHH', icon: 'ph-identification-badge' },
  { value: 'companero', label: 'Compañero', icon: 'ph-users' },
  { value: 'cliente', label: 'Cliente', icon: 'ph-storefront' },
  { value: 'proveedor', label: 'Proveedor', icon: 'ph-truck' },
  { value: 'amigo', label: 'Amigo', icon: 'ph-heart' },
  { value: 'familia', label: 'Familia', icon: 'ph-house-line' },
  { value: 'otro', label: 'Otro', icon: 'ph-tag' }
];

/**
 * Local contact stored in localStorage
 * For contacts not registered in the system
 */
export interface LocalContact {
  phone: string;
  name?: string;
  label?: PersonalLabel;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Registered contact from the backend API
 */
export interface RegisteredContact {
  id: number;
  phone: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email?: string;
  codigo?: string;
  avatarUrl?: string;
  managerId?: number;
  managerName?: string;
  issueNotes?: string;
  hasOpenTicket?: boolean;
  openTicketId?: number;
  customFields?: Record<string, unknown>;
  lastMessageAt?: string;
  createdAt: string;
}

/**
 * User action history from audit log
 */
export interface UserActionHistory {
  id: number;
  action: string; // 'create' | 'update' | 'destroy'
  username: string; // Agent who performed the action
  auditedChanges: Record<string, unknown>;
  createdAt: string;
}

/**
 * Combined CRM contact (can be local or registered)
 */
export interface CrmContact {
  type: 'local' | 'registered';
  phone: string;
  name: string;
  local?: LocalContact;
  registered?: RegisteredContact;
}

/**
 * Chat selected event from Electron
 */
export interface ChatSelectedEvent {
  phone: string | null;
  name: string | null;
  isPhone: boolean;
}

/**
 * Phone detected event from Electron
 */
export interface PhoneDetectedEvent {
  phone: string;
  original: string;
}

/**
 * Phone formatting utilities
 */
export const PhoneUtils = {
  /**
   * Normalize phone number by removing non-digit characters
   */
  normalize(phone: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
  },

  /**
   * Format phone for display (e.g., +51 999 888 777)
   */
  formatDisplay(phone: string): string {
    const normalized = PhoneUtils.normalize(phone);
    if (!normalized) return '';

    // Peru format (assuming 51 country code)
    if (normalized.length === 11 && normalized.startsWith('51')) {
      return `+51 ${normalized.slice(2, 5)} ${normalized.slice(5, 8)} ${normalized.slice(8)}`;
    }

    // Generic format with country code
    if (normalized.length > 10) {
      const countryCode = normalized.slice(0, normalized.length - 9);
      const rest = normalized.slice(-9);
      return `+${countryCode} ${rest.slice(0, 3)} ${rest.slice(3, 6)} ${rest.slice(6)}`;
    }

    // Local format
    if (normalized.length === 9) {
      return `${normalized.slice(0, 3)} ${normalized.slice(3, 6)} ${normalized.slice(6)}`;
    }

    return phone;
  },

  /**
   * Check if phone is valid (has enough digits)
   */
  isValid(phone: string): boolean {
    const normalized = PhoneUtils.normalize(phone);
    return normalized.length >= 9 && normalized.length <= 15;
  },

  /**
   * Extract phone from WhatsApp JID or string
   * WhatsApp JID format: 51999888777@c.us
   */
  extractFromJid(jid: string): string {
    if (!jid) return '';
    // Remove @c.us or @s.whatsapp.net suffix
    const phone = jid.split('@')[0];
    return PhoneUtils.normalize(phone);
  }
};

/**
 * Get label configuration by value
 */
export function getLabelConfig(value: PersonalLabel | undefined): typeof PERSONAL_LABELS[0] | undefined {
  if (!value) return undefined;
  return PERSONAL_LABELS.find(l => l.value === value);
}

/**
 * Get initials from name
 */
export function getContactInitials(name: string | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}
