/**
 * Ticket Models
 * PARIDAD RAILS: Ticket model (app/models/ticket.rb)
 * PARIDAD SPRING BOOT: Ticket entity (domain/ticket/entity/Ticket.java)
 */

import { Message } from './message.model';
import { User } from './user.model';

// ===== ENUMS =====

/**
 * Ticket status matching backend enum
 */
export enum TicketStatus {
  OPEN = 0,
  CLOSED = 1
}

// ===== INTERFACES =====

/**
 * Ticket interface matching backend entity
 */
export interface Ticket {
  id: number;
  userId: number;       // Client/customer
  agentId: number;      // Agent handling ticket
  subject: string;
  notes?: string;
  status: TicketStatus;
  closeType?: string;   // e.g., 'closed_con_acuerdo', 'closed_sin_acuerdo'
  closedAt?: string;
  createdAt: string;
  updatedAt: string;

  // Expanded relations (optional)
  user?: TicketUser;
  agent?: TicketUser;
  messages?: Message[];
  lastMessage?: Message;
  messageCount?: number;
}

/**
 * Simplified user for ticket display
 */
export interface TicketUser {
  id: number;
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
}

/**
 * Ticket for list display
 */
export interface TicketListItem {
  id: number;
  subject: string;
  status: TicketStatus;
  clientName: string;
  clientPhone: string;
  agentName: string;
  lastMessageAt?: string;
  messageCount: number;
  createdAt: string;
  closedAt?: string;
}

/**
 * Request to close a ticket
 */
export interface CloseTicketRequest {
  ticketId?: number;
  lastMessageId?: number;
  closeType?: string;
  notes?: string;
}

/**
 * Ticket close type configuration (from client_settings)
 */
export interface TicketCloseType {
  name: string;       // Display name: "Con Acuerdo"
  kpiName: string;    // KPI identifier: "closed_con_acuerdo"
}

/**
 * Request to reassign ticket to another agent
 */
export interface ReassignTicketRequest {
  ticketId: number;
  newAgentId: number;
}

/**
 * Ticket transcript for export
 */
export interface TicketTranscript {
  ticketId: number;
  clientName: string;
  clientPhone: string;
  agentName: string;
  status: string;
  createdAt: string;
  closedAt?: string;
  messages: TranscriptMessage[];
}

/**
 * Message in transcript format
 */
export interface TranscriptMessage {
  timestamp: string;
  sender: string;
  direction: 'incoming' | 'outgoing';
  content: string;
}

// ===== HELPER FUNCTIONS =====

/**
 * Check if ticket is open
 */
export function isOpen(ticket: Pick<Ticket, 'status'>): boolean {
  return ticket.status === TicketStatus.OPEN;
}

/**
 * Check if ticket is closed
 */
export function isClosed(ticket: Pick<Ticket, 'status'>): boolean {
  return ticket.status === TicketStatus.CLOSED;
}

/**
 * Get status display text
 */
export function getTicketStatusText(status: TicketStatus): string {
  return status === TicketStatus.OPEN ? 'Abierto' : 'Cerrado';
}

/**
 * Get status CSS class
 */
export function getTicketStatusClass(status: TicketStatus): string {
  return status === TicketStatus.OPEN ? 'status-open' : 'status-closed';
}

/**
 * Get close type display text
 */
export function getCloseTypeText(closeType: string | undefined): string {
  if (!closeType) return 'N/A';

  const closeTypeTexts: Record<string, string> = {
    'closed_con_acuerdo': 'Con Acuerdo',
    'closed_sin_acuerdo': 'Sin Acuerdo',
    'auto_closed': 'Auto-cerrado',
    'transferred': 'Transferido'
  };

  return closeTypeTexts[closeType] || closeType;
}

/**
 * Calculate ticket duration in minutes
 */
export function calculateDurationMinutes(ticket: Pick<Ticket, 'createdAt' | 'closedAt'>): number | null {
  if (!ticket.closedAt) return null;

  const created = new Date(ticket.createdAt);
  const closed = new Date(ticket.closedAt);
  const diffMs = closed.getTime() - created.getTime();

  return Math.floor(diffMs / 60000);
}

/**
 * Format duration as DD:HH:MM
 */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return 'En curso';

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  return `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Parse close types from client setting hash_value
 */
export function parseCloseTypes(hashValue: any): TicketCloseType[] {
  if (!hashValue || !Array.isArray(hashValue)) return [];

  return hashValue.map((item: any) => ({
    name: item.name || item['name'] || '',
    kpiName: item.kpi_name || item.kpiName || item['kpi_name'] || ''
  })).filter(ct => ct.name && ct.kpiName);
}
