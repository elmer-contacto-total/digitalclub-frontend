/**
 * Ticket Service
 * Handles all ticket-related API operations
 * PARIDAD RAILS: Admin::TicketsController
 * PARIDAD SPRING BOOT: TicketAdminController
 */
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
  Ticket,
  TicketStatus,
  TicketListItem,
  CloseTicketRequest,
  ReassignTicketRequest,
  TicketTranscript,
  TicketCloseType
} from '../../../core/models/ticket.model';
import { PagedResponse } from '../../../core/models/pagination.model';

// ===== API RESPONSE INTERFACES =====

interface CloseTicketResponse {
  success: boolean;
  message?: string;
  ticket?: Ticket;
}

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private api = inject(ApiService);

  // ===== TICKET CRUD =====

  /**
   * Get tickets list with pagination (PagedResponse format)
   * PARIDAD: GET /app/tickets
   */
  getTickets(params: {
    page?: number;
    pageSize?: number;
    status?: 'open' | 'closed' | 'all';
    agentId?: number;
    clientId?: number;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Observable<PagedResponse<TicketListItem>> {
    const queryParams: Record<string, string | number | boolean | undefined> = {
      page: params.page || 1,
      pageSize: params.pageSize || 25
    };

    if (params.status && params.status !== 'all') {
      queryParams['status'] = params.status;
    }
    if (params.agentId) {
      queryParams['agent_id'] = params.agentId;
    }
    if (params.clientId) {
      queryParams['client_id'] = params.clientId;
    }
    if (params.search) {
      queryParams['search'] = params.search;
    }
    if (params.dateFrom) {
      queryParams['date_from'] = params.dateFrom;
    }
    if (params.dateTo) {
      queryParams['date_to'] = params.dateTo;
    }

    return this.api.get<PagedResponse<any>>('/app/tickets', { params: queryParams }).pipe(
      map(response => ({
        data: response.data.map(item => this.mapTicketListItem(item)),
        meta: response.meta
      }))
    );
  }

  /**
   * Get single ticket by ID with messages
   * PARIDAD: GET /app/tickets/{id}
   */
  getTicket(ticketId: number): Observable<Ticket> {
    return this.api.get<Ticket>(`/app/tickets/${ticketId}`);
  }

  /**
   * Get ticket for a specific client
   * PARIDAD: GET /app/tickets?client_id=X
   */
  getTicketByClient(clientId: number): Observable<Ticket | null> {
    return this.api.get<{ ticket: Ticket | null }>('/app/tickets', {
      params: { client_id: clientId, latest: true }
    }).pipe(
      map(response => response.ticket)
    );
  }

  /**
   * Get open ticket for a client (if exists)
   */
  getOpenTicketByClient(clientId: number): Observable<Ticket | null> {
    return this.api.get<{ ticket: Ticket | null }>('/app/tickets', {
      params: { client_id: clientId, status: 'open' }
    }).pipe(
      map(response => response.ticket)
    );
  }

  // ===== TICKET ACTIONS =====

  /**
   * Close a ticket
   * PARIDAD: POST /app/tickets/close or POST /app/close_ticket
   */
  closeTicket(request: CloseTicketRequest): Observable<CloseTicketResponse> {
    const body: Record<string, unknown> = {};

    if (request.ticketId) {
      body['ticket_id'] = request.ticketId;
    }
    if (request.lastMessageId) {
      body['last_message_id'] = request.lastMessageId;
    }
    if (request.closeType) {
      body['close_type'] = request.closeType;
      body['kpi_name'] = request.closeType; // Rails uses kpi_name
    }
    if (request.notes) {
      body['notes'] = request.notes;
    }

    return this.api.post<CloseTicketResponse>('/app/tickets/close', body);
  }

  /**
   * Close ticket by ID (alternative endpoint)
   * PARIDAD: POST /app/tickets/{id}/close
   */
  closeTicketById(ticketId: number, closeType?: string, notes?: string): Observable<CloseTicketResponse> {
    return this.api.post<CloseTicketResponse>(`/app/tickets/${ticketId}/close`, {
      close_type: closeType,
      notes
    });
  }

  /**
   * Reassign ticket to another agent
   * PARIDAD: POST /app/tickets/{id}/reassign
   */
  reassignTicket(request: ReassignTicketRequest): Observable<Ticket> {
    return this.api.post<Ticket>(`/app/tickets/${request.ticketId}/reassign`, {
      new_agent_id: request.newAgentId
    });
  }

  /**
   * Add notes to a ticket
   * PARIDAD: PATCH /app/tickets/{id}
   */
  updateTicketNotes(ticketId: number, notes: string): Observable<Ticket> {
    return this.api.patch<Ticket>(`/app/tickets/${ticketId}`, { notes });
  }

  // ===== EXPORT =====

  /**
   * Export ticket transcripts as ZIP
   * PARIDAD: POST /app/tickets/export_transcripts
   */
  exportTranscripts(params: {
    ticketIds?: number[];
    agentId?: number;
    clientId?: number;
    dateFrom?: string;
    dateTo?: string;
    status?: 'open' | 'closed' | 'all';
  } = {}): Observable<Blob> {
    const body: Record<string, unknown> = {};

    if (params.ticketIds?.length) {
      body['ticket_ids'] = params.ticketIds;
    }
    if (params.agentId) {
      body['agent_id'] = params.agentId;
    }
    if (params.clientId) {
      body['client_id'] = params.clientId;
    }
    if (params.dateFrom) {
      body['date_from'] = params.dateFrom;
    }
    if (params.dateTo) {
      body['date_to'] = params.dateTo;
    }
    if (params.status) {
      body['status'] = params.status;
    }

    return this.api.post<Blob>('/app/tickets/export_transcripts', body, {
      responseType: 'blob'
    });
  }

  /**
   * Download ticket transcripts
   */
  downloadTranscripts(params: Parameters<typeof this.exportTranscripts>[0] = {}): void {
    this.exportTranscripts(params).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ticket_transcripts_${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      },
      error: (err) => {
        console.error('Error downloading transcripts:', err);
      }
    });
  }

  // ===== CLOSE TYPES =====

  /**
   * Get available close types from client settings
   * This is typically included in conversation detail, but can be fetched separately
   */
  getCloseTypes(): Observable<TicketCloseType[]> {
    return this.api.get<{ close_types: any[] }>('/app/tickets/close_types').pipe(
      map(response => (response.close_types || []).map(ct => ({
        name: ct.name,
        kpiName: ct.kpi_name || ct.kpiName
      })))
    );
  }

  // ===== MESSAGES (PARIDAD: Rails admin/messages/index) =====

  /**
   * Get messages list with pagination and direction filter
   * PARIDAD: GET /app/messages
   */
  getMessages(params: {
    page?: number;
    pageSize?: number;
    direction?: 'incoming' | 'outgoing';
    search?: string;
  } = {}): Observable<PagedResponse<{
    id: number;
    senderName?: string;
    receiverName?: string;
    content: string;
    createdAt: string;
    direction: 'incoming' | 'outgoing';
  }>> {
    const queryParams: Record<string, string | number | boolean | undefined> = {
      page: params.page || 1,
      pageSize: params.pageSize || 25
    };

    if (params.direction) {
      queryParams['direction'] = params.direction;
    }
    if (params.search) {
      queryParams['search'] = params.search;
    }

    return this.api.get<PagedResponse<any>>('/app/messages', { params: queryParams }).pipe(
      map(response => ({
        data: response.data.map((item: any) => ({
          id: item.id,
          senderName: item.sender_name || item.senderName || item.from_name || item.fromName,
          receiverName: item.receiver_name || item.receiverName || item.to_name || item.toName,
          content: item.content || item.body || item.text || '',
          createdAt: item.created_at || item.createdAt,
          direction: item.direction || (item.outgoing ? 'outgoing' : 'incoming')
        })),
        meta: response.meta
      }))
    );
  }

  // ===== STATISTICS =====

  /**
   * Get ticket statistics for dashboard
   */
  getTicketStats(params: {
    agentId?: number;
    dateFrom?: string;
    dateTo?: string;
  } = {}): Observable<{
    open: number;
    closed: number;
    avgResponseTime: number;
    avgTmo: number;
  }> {
    return this.api.get<any>('/app/tickets/stats', {
      params: {
        agent_id: params.agentId,
        date_from: params.dateFrom,
        date_to: params.dateTo
      }
    }).pipe(
      map(response => ({
        open: response.open || response.open_count || 0,
        closed: response.closed || response.closed_count || 0,
        avgResponseTime: response.avg_response_time || response.avgResponseTime || 0,
        avgTmo: response.avg_tmo || response.avgTmo || 0
      }))
    );
  }

  // ===== HELPERS =====

  /**
   * Map API response to TicketListItem
   */
  private mapTicketListItem(item: any): TicketListItem {
    // Handle both object format and array format (DataTables)
    if (Array.isArray(item)) {
      return {
        id: item[0],
        subject: item[1],
        status: item[2] === 'open' ? TicketStatus.OPEN : TicketStatus.CLOSED,
        clientName: item[3],
        clientPhone: item[4],
        agentName: item[5],
        lastMessageAt: item[6],
        messageCount: item[7] || 0,
        createdAt: item[8],
        closedAt: item[9]
      };
    }

    return {
      id: item.id,
      subject: item.subject,
      status: item.status === 'open' || item.status === 0 ? TicketStatus.OPEN : TicketStatus.CLOSED,
      clientName: item.client_name || item.clientName || item.user?.name || '',
      clientPhone: item.client_phone || item.clientPhone || item.user?.phone || '',
      agentName: item.agent_name || item.agentName || item.agent?.name || '',
      lastMessageAt: item.last_message_at || item.lastMessageAt,
      messageCount: item.message_count || item.messageCount || 0,
      createdAt: item.created_at || item.createdAt,
      closedAt: item.closed_at || item.closedAt
    };
  }
}
