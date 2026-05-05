/**
 * CRM Contact Model for Electron Clients Module
 * Used for displaying contact information in the CRM panel alongside WhatsApp Web
 */

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
  requireResponse?: boolean;
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
  auditableType?: string; // 'User' | 'Ticket'
  comment?: string; // e.g. "Ticket #123 cerrado — closed_con_acuerdo"
  createdAt: string;
}

/**
 * Combined CRM contact (registered in backend)
 */
export interface CrmContact {
  type: 'registered';
  phone: string;
  name: string;
  registered: RegisteredContact;
}

/**
 * Chat selected event from Electron
 */
export interface ChatSelectedEvent {
  phone: string | null;
  name: string | null;
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
