/**
 * Ticket Service
 * Comunicacion con Spring Boot /app/tickets endpoints
 * PARIDAD: digitalgroup-web-main-spring-boot/.../web/admin/TicketAdminController.java
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Ticket, TicketStatus, CloseTicketRequest, ReassignTicketRequest } from '../models/ticket.model';
import { Message } from '../models/message.model';
import { PagedResponse, PaginationParams } from '../models/pagination.model';

// ===== REQUEST DTOs =====

export interface ExportTranscriptsRequest {
  ticketIds: number[];
}

// ===== RESPONSE DTOs =====

export interface TicketDetailResponse extends Ticket {
  messages: Message[];
}

export interface CloseTicketResponse {
  result: string;
  ticket: Ticket;
}

export interface ReassignTicketResponse {
  result: string;
  ticket: Ticket;
}

// ===== EXTENDED PAGINATION PARAMS =====

export interface TicketPaginationParams extends PaginationParams {
  status?: 'open' | 'closed';
}

@Injectable({
  providedIn: 'root'
})
export class TicketService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/tickets`;

  /**
   * Get tickets list with pagination
   */
  getTickets(params: TicketPaginationParams = {}): Observable<PagedResponse<Ticket>> {
    let httpParams = new HttpParams();

    if (params.page !== undefined) httpParams = httpParams.set('page', params.page.toString());
    if (params.pageSize !== undefined) httpParams = httpParams.set('pageSize', params.pageSize.toString());
    if (params.status) httpParams = httpParams.set('status', params.status);
    if (params.search) httpParams = httpParams.set('search', params.search);

    return this.http.get<PagedResponse<Ticket>>(this.baseUrl, { params: httpParams });
  }

  /**
   * Get single ticket by ID with messages
   */
  getTicket(id: number): Observable<TicketDetailResponse> {
    return this.http.get<TicketDetailResponse>(`${this.baseUrl}/${id}`);
  }

  /**
   * Close ticket
   */
  closeTicket(ticketId: number, closeType: string = 'manual'): Observable<CloseTicketResponse> {
    return this.http.post<CloseTicketResponse>(`${this.baseUrl}/close`, { ticketId, closeType });
  }

  /**
   * Close ticket by ID (alternative endpoint)
   */
  closeTicketById(id: number, closeType: string = 'manual'): Observable<CloseTicketResponse> {
    return this.http.post<CloseTicketResponse>(
      `${this.baseUrl}/${id}/close`,
      null,
      { params: new HttpParams().set('closeType', closeType) }
    );
  }

  /**
   * Reassign ticket to another agent
   */
  reassignTicket(id: number, newAgentId: number): Observable<ReassignTicketResponse> {
    return this.http.post<ReassignTicketResponse>(`${this.baseUrl}/${id}/reassign`, { newAgentId });
  }

  /**
   * Export ticket transcripts to ZIP
   */
  exportTranscripts(ticketIds: number[]): Observable<Blob> {
    return this.http.post(`${this.baseUrl}/export_transcripts`, { ticketIds }, {
      responseType: 'blob'
    });
  }

  /**
   * Export ticket transcripts via GET (alternative)
   */
  exportTranscriptsGet(ticketIds: number[]): Observable<Blob> {
    const params = new HttpParams().set('ticketIds', ticketIds.join(','));
    return this.http.get(`${this.baseUrl}/export_transcripts`, {
      params,
      responseType: 'blob'
    });
  }
}
