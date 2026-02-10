/**
 * Bulk Send Service
 * Servicio para gestión de envíos masivos via Electron (CSV-based)
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// --- Interfaces ---

export interface BulkSend {
  id: number;
  send_method: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  progress_percent: number;
  message_content: string | null;
  message_preview: string | null;
  attachment_path: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  attachment_original_name: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
  client_id: number | null;
  user_id: number | null;
  user_name: string | null;
  assigned_agent_id: number | null;
  assigned_agent_name: string | null;
}

export interface BulkSendRecipient {
  id: number;
  phone: string;
  recipient_name: string | null;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  custom_variables: Record<string, string> | null;
}

export interface BulkSendDetail extends BulkSend {
  recipients: BulkSendRecipient[];
  recipients_total: number;
  recipients_page: number;
  recipients_total_pages: number;
}

export interface BulkSendListResponse {
  bulk_sends: BulkSend[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CsvPreviewResponse {
  headers: string[];
  preview_rows: string[][];
  total_rows: number;
  phone_column: number;
  name_column: number;
  error?: string;
}

export interface BulkSendRules {
  id: number;
  max_daily_messages: number;
  min_delay_seconds: number;
  max_delay_seconds: number;
  pause_after_count: number;
  pause_duration_minutes: number;
  send_hour_start: number;
  send_hour_end: number;
  enabled: boolean;
}

export interface AssignableAgent {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface NextRecipientResponse {
  has_next: boolean;
  recipient_id?: number;
  phone?: string;
  recipient_name?: string;
  content?: string;
  attachment_path?: string;
  attachment_type?: string;
  attachment_original_name?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BulkSendService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/bulk_sends`;

  /**
   * Preview CSV (parse headers + first rows)
   */
  previewCsv(file: File): Observable<CsvPreviewResponse> {
    const formData = new FormData();
    formData.append('csv', file);
    return this.http.post<CsvPreviewResponse>(`${this.baseUrl}/csv/preview`, formData);
  }

  /**
   * Create bulk send from CSV
   */
  createFromCsv(csvFile: File, messageContent: string, phoneColumn: number,
                nameColumn: number, attachment?: File,
                assignedAgentId?: number): Observable<{ result: string; bulk_send: BulkSend; message: string }> {
    const formData = new FormData();
    formData.append('csv', csvFile);
    formData.append('message_content', messageContent);
    formData.append('phone_column', phoneColumn.toString());
    formData.append('name_column', nameColumn.toString());
    if (assignedAgentId) {
      formData.append('assigned_agent_id', assignedAgentId.toString());
    }
    if (attachment) {
      formData.append('attachment', attachment);
    }
    return this.http.post<{ result: string; bulk_send: BulkSend; message: string }>(`${this.baseUrl}/csv`, formData);
  }

  /**
   * Get agents assignable for bulk sends (based on current user role)
   */
  getAssignableAgents(): Observable<{ agents: AssignableAgent[] }> {
    return this.http.get<{ agents: AssignableAgent[] }>(`${this.baseUrl}/assignable_agents`);
  }

  /**
   * Lista de envíos masivos
   */
  getBulkSends(page: number = 0, size: number = 20, status?: string): Observable<BulkSendListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());
    if (status) {
      params = params.set('status', status);
    }
    return this.http.get<BulkSendListResponse>(this.baseUrl, { params });
  }

  /**
   * Detalle de envío con destinatarios
   */
  getBulkSend(id: number, recipientPage: number = 0, recipientSize: number = 50): Observable<BulkSendDetail> {
    const params = new HttpParams()
      .set('recipientPage', recipientPage.toString())
      .set('recipientSize', recipientSize.toString());
    return this.http.get<BulkSendDetail>(`${this.baseUrl}/${id}`, { params });
  }

  pauseBulkSend(id: number): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/${id}/pause`, {});
  }

  resumeBulkSend(id: number): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/${id}/resume`, {});
  }

  cancelBulkSend(id: number): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/${id}/cancel`, {});
  }

  getNextRecipient(id: number): Observable<NextRecipientResponse> {
    return this.http.get<NextRecipientResponse>(`${this.baseUrl}/${id}/next-recipient`);
  }

  reportRecipientResult(bulkSendId: number, recipientId: number, success: boolean, errorMessage?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${bulkSendId}/recipient-result`, {
      recipientId,
      success,
      errorMessage
    });
  }

  getRules(): Observable<{ rules: BulkSendRules }> {
    return this.http.get<{ rules: BulkSendRules }>(`${this.baseUrl}/rules`);
  }

  updateRules(rules: Partial<BulkSendRules>): Observable<{ result: string; rules: BulkSendRules }> {
    return this.http.put<{ result: string; rules: BulkSendRules }>(`${this.baseUrl}/rules`, rules);
  }

  // --- Helpers ---

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'PENDING': 'Pendiente',
      'PROCESSING': 'En proceso',
      'PAUSED': 'Pausado',
      'COMPLETED': 'Completado',
      'CANCELLED': 'Cancelado',
      'FAILED': 'Fallido'
    };
    return labels[status] || status;
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      'PENDING': 'badge-warning',
      'PROCESSING': 'badge-info',
      'PAUSED': 'badge-secondary',
      'COMPLETED': 'badge-success',
      'CANCELLED': 'badge-dark',
      'FAILED': 'badge-danger'
    };
    return classes[status] || 'badge-secondary';
  }

  getRecipientStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'PENDING': 'Pendiente',
      'SENT': 'Enviado',
      'FAILED': 'Fallido',
      'SKIPPED': 'Omitido'
    };
    return labels[status] || status;
  }

  formatFileSize(bytes: number | null): string {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
}
