/**
 * Campaign Service
 * Servicio para gestión de campañas de envío masivo
 * Soporta Cloud API (plantillas) y Electron (mensajes de texto)
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// --- Interfaces ---

export interface Campaign {
  id: number;
  send_method: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  progress_percent: number;
  started_at: string | null;
  completed_at: string | null;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
  client_id: number | null;
  user_id: number | null;
  user_name: string | null;
  bulk_message_id?: number;
  message_template_id?: number;
  template_name?: string;
  message_preview?: string;
}

export interface CampaignRecipient {
  id: number;
  phone: string;
  status: string;
  sent_at: string | null;
  error_message: string | null;
  user_id: number | null;
  user_name: string | null;
}

export interface CampaignDetail extends Campaign {
  recipients: CampaignRecipient[];
  recipients_total: number;
  recipients_page: number;
  recipients_total_pages: number;
}

export interface CampaignListResponse {
  campaigns: Campaign[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateCampaignRequest {
  sendMethod: string;
  bulkMessageId?: number;
  messageTemplateId?: number;
  recipientIds: number[];
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
  cloud_api_delay_ms: number;
  enabled: boolean;
}

export interface NextRecipientResponse {
  has_next: boolean;
  recipient_id?: number;
  phone?: string;
  user_name?: string;
  content?: string;
  template_name?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CampaignService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/campaigns`;

  /**
   * Lista de campañas
   */
  getCampaigns(page: number = 0, size: number = 20, status?: string): Observable<CampaignListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (status) {
      params = params.set('status', status);
    }

    return this.http.get<CampaignListResponse>(this.baseUrl, { params });
  }

  /**
   * Detalle de campaña con destinatarios
   */
  getCampaign(id: number, recipientPage: number = 0, recipientSize: number = 50): Observable<CampaignDetail> {
    const params = new HttpParams()
      .set('recipientPage', recipientPage.toString())
      .set('recipientSize', recipientSize.toString());

    return this.http.get<CampaignDetail>(`${this.baseUrl}/${id}`, { params });
  }

  /**
   * Crear nueva campaña
   */
  createCampaign(request: CreateCampaignRequest): Observable<{ result: string; campaign: Campaign; message: string }> {
    return this.http.post<{ result: string; campaign: Campaign; message: string }>(this.baseUrl, request);
  }

  /**
   * Pausar campaña
   */
  pauseCampaign(id: number): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/${id}/pause`, {});
  }

  /**
   * Reanudar campaña
   */
  resumeCampaign(id: number): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/${id}/resume`, {});
  }

  /**
   * Cancelar campaña
   */
  cancelCampaign(id: number): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/${id}/cancel`, {});
  }

  /**
   * Siguiente destinatario (para Electron polling)
   */
  getNextRecipient(id: number): Observable<NextRecipientResponse> {
    return this.http.get<NextRecipientResponse>(`${this.baseUrl}/${id}/next-recipient`);
  }

  /**
   * Reportar resultado de envío (Electron)
   */
  reportRecipientResult(campaignId: number, recipientId: number, success: boolean, errorMessage?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/${campaignId}/recipient-result`, {
      recipientId,
      success,
      errorMessage
    });
  }

  /**
   * Obtener reglas de envío
   */
  getRules(): Observable<{ rules: BulkSendRules }> {
    return this.http.get<{ rules: BulkSendRules }>(`${this.baseUrl}/rules`);
  }

  /**
   * Actualizar reglas de envío
   */
  updateRules(rules: Partial<BulkSendRules>): Observable<{ result: string; rules: BulkSendRules }> {
    return this.http.put<{ result: string; rules: BulkSendRules }>(`${this.baseUrl}/rules`, rules);
  }

  // --- Helpers ---

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'PENDING': 'Pendiente',
      'PROCESSING': 'En proceso',
      'PAUSED': 'Pausada',
      'COMPLETED': 'Completada',
      'CANCELLED': 'Cancelada',
      'FAILED': 'Fallida'
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

  getMethodLabel(method: string): string {
    return method === 'CLOUD_API' ? 'Cloud API' : 'Electron';
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
}
