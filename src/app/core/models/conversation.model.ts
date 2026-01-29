/**
 * Conversation Models
 * For chat conversation list display
 * PARIDAD RAILS: _clients_chat_view.html.erb DataTable structure
 */

import { Message } from './message.model';
import { Ticket, TicketStatus } from './ticket.model';

// ===== INTERFACES =====

/**
 * Conversation represents a chat with a client
 */
export interface Conversation {
  // Client info
  clientId: number;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  clientCodigo?: string;
  clientAvatarData?: string;

  // Agent info (for admin view)
  agentId?: number;
  agentName?: string;

  // Last message
  lastMessage?: ConversationLastMessage;
  lastMessageAt?: string;

  // Ticket info
  ticketId?: number;
  ticketStatus?: TicketStatus;

  // Counts
  unreadCount: number;
  totalMessages: number;

  // Flags
  requiresResponse: boolean;
  isWhatsappBusiness: boolean;
}

/**
 * Last message summary for conversation list
 */
export interface ConversationLastMessage {
  id: number;
  content: string;
  direction: 'incoming' | 'outgoing';
  sentAt: string;
  isTemplate: boolean;
}

/**
 * Conversation list item for DataTable display
 * PARIDAD RAILS: Columns in _clients_chat_view.html.erb DataTable
 */
export interface ConversationListItem {
  id: number;          // Client ID
  name: string;        // Full name (Nombre)
  phone: string;       // Mobile (Móvil)
  codigo?: string;     // Client code (Código)
  email?: string;      // Email for detail modal
  lastMessagePreview: string;
  lastMessageAt: string;
  unreadCount: number;
  hasOpenTicket: boolean;
  requiresResponse: boolean;
}

/**
 * Chat view types matching Rails chat_view_type parameter
 */
export type ChatViewType = 'clients' | 'prospects';

/**
 * Conversation filters
 * PARIDAD RAILS: agent_clients.html.erb filter dropdowns
 */
export interface ConversationFilters {
  viewType: ChatViewType;
  search?: string;
  hasUnread?: boolean;
  hasOpenTicket?: boolean;
  agentId?: number;
  dateFrom?: string;
  dateTo?: string;
  // PARIDAD: Filtro tickets dropdown
  ticketStatus?: 'all' | 'open' | 'closed';
  // PARIDAD: Filtro respuestas dropdown
  messageStatus?: 'all' | 'to_respond' | 'responded';
}

/**
 * Conversation list request parameters
 */
export interface ConversationListRequest {
  page?: number;
  pageSize?: number;
  search?: string;
  filters?: ConversationFilters;
  // DataTables compatibility
  draw?: number;
  start?: number;
  length?: number;
}

/**
 * Conversation list response (DataTables format)
 */
export interface ConversationListResponse {
  draw?: number;
  recordsTotal: number;
  recordsFiltered: number;
  data: ConversationListItem[];
}

/**
 * Full conversation data when selected
 */
export interface ConversationDetail {
  client: ConversationClient;
  agent?: ConversationAgent;
  ticket?: Ticket;
  messages: Message[];
  crmFields?: CrmField[];
  /**
   * Custom fields (datos de cobranza)
   * PARIDAD RAILS: header_custom_fields en _chat.html.erb
   * Contains: codigo, saldo_total, saldo_mora, dias_mora, dia_venc, ult_acc, dist_dom, list_tra
   */
  customFields?: Record<string, unknown>;

  // WhatsApp Business specific
  isWhatsappBusiness: boolean;
  lastIncomingMessageAt?: string;
  canSendFreeform: boolean;

  // Close types from client settings
  closeTypes?: ConversationCloseType[];
}

/**
 * Client info in conversation detail
 */
export interface ConversationClient {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  codigo?: string;
  avatarData?: string;
  requireResponse: boolean;
  customFields?: Record<string, unknown>;
  createdAt: string;
  lastMessageAt?: string;
}

/**
 * Agent info in conversation detail
 */
export interface ConversationAgent {
  id: number;
  firstName: string;
  lastName: string;
  phone?: string;
  email: string;
}

/**
 * CRM field for header display
 * PARIDAD RAILS: crm_infos table with column_visible flag
 */
export interface CrmField {
  key: string;
  label: string;
  value: string | number | boolean;
  type: 'text' | 'number' | 'date' | 'boolean' | 'currency';
  /**
   * Whether this field should be visible in header
   * PARIDAD RAILS: column_visible in crm_infos
   */
  visible?: boolean;
}

/**
 * Custom field for header display
 */
export interface CustomField {
  key: string;
  label: string;
  value: string | number;
}

/**
 * Close type available for conversation
 */
export interface ConversationCloseType {
  name: string;
  kpiName: string;
}

// ===== HELPER FUNCTIONS =====

/**
 * Get initials from name
 */
export function getConversationInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Format last message preview (truncate if needed)
 */
export function formatMessagePreview(content: string, maxLength: number = 50): string {
  if (!content) return '';
  if (content.length <= maxLength) return content;
  return content.substring(0, maxLength - 3) + '...';
}

/**
 * Format conversation time for list display
 */
export function formatConversationTime(dateStr: string | undefined): string {
  if (!dateStr) return '';

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return date.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Ayer';
  } else if (diffDays < 7) {
    return date.toLocaleDateString('es-PE', { weekday: 'short' });
  } else {
    return date.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  }
}

/**
 * Sort conversations by last message date (newest first)
 */
export function sortConversationsByRecent(conversations: Conversation[]): Conversation[] {
  return [...conversations].sort((a, b) => {
    const dateA = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const dateB = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return dateB - dateA;
  });
}

/**
 * Filter conversations with unread messages
 */
export function filterUnread(conversations: Conversation[]): Conversation[] {
  return conversations.filter(c => c.unreadCount > 0);
}

/**
 * Filter conversations requiring response
 */
export function filterRequiresResponse(conversations: Conversation[]): Conversation[] {
  return conversations.filter(c => c.requiresResponse);
}
