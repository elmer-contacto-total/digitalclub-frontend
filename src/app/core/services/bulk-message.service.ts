/**
 * Bulk Message Service
 * PARIDAD: Rails Admin::BulkMessagesController
 * Servicio para gestión de mensajes masivos (textos predefinidos)
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface BulkMessage {
  id: number;
  message: string;
  client_global: boolean;
  status: string;
  user_id: number | null;
  user_name?: string;
  client_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface BulkMessageListResponse {
  bulk_messages: BulkMessage[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateBulkMessageRequest {
  message: string;
  clientGlobal?: boolean;
}

export interface UpdateBulkMessageRequest {
  message?: string;
  clientGlobal?: boolean;
  status?: string;
}

@Injectable({
  providedIn: 'root'
})
export class BulkMessageService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/bulk_messages`;

  /**
   * Lista de mensajes masivos
   * PARIDAD: Rails Admin::BulkMessagesController#index
   */
  getBulkMessages(page: number = 0, size: number = 20): Observable<BulkMessageListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    return this.http.get<BulkMessageListResponse>(this.baseUrl, { params });
  }

  /**
   * Obtener mensaje masivo por ID
   * PARIDAD: Rails Admin::BulkMessagesController#show
   */
  getBulkMessage(id: number): Observable<BulkMessage> {
    return this.http.get<BulkMessage>(`${this.baseUrl}/${id}`);
  }

  /**
   * Crear nuevo mensaje masivo
   * PARIDAD: Rails Admin::BulkMessagesController#create
   */
  createBulkMessage(request: CreateBulkMessageRequest): Observable<{ result: string; bulk_message: BulkMessage }> {
    return this.http.post<{ result: string; bulk_message: BulkMessage }>(this.baseUrl, request);
  }

  /**
   * Actualizar mensaje masivo
   * PARIDAD: Rails Admin::BulkMessagesController#update
   */
  updateBulkMessage(id: number, request: UpdateBulkMessageRequest): Observable<{ result: string; bulk_message: BulkMessage }> {
    return this.http.put<{ result: string; bulk_message: BulkMessage }>(`${this.baseUrl}/${id}`, request);
  }

  /**
   * Eliminar mensaje masivo
   * PARIDAD: Rails Admin::BulkMessagesController#destroy
   */
  deleteBulkMessage(id: number): Observable<{ result: string }> {
    return this.http.delete<{ result: string }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Create a BulkSend from a BulkMessage template + recipients
   * Recipients are provided as an array of {phone, name?}
   */
  createBulkSendFromMessage(bulkMessageId: number, recipients: { phone: string; name?: string }[], assignedAgentId?: number): Observable<{ result: string; bulk_send: any }> {
    return this.http.post<{ result: string; bulk_send: any }>(`${environment.apiUrl}/app/bulk_sends/from-bulk-message/${bulkMessageId}`, {
      recipients,
      assignedAgentId: assignedAgentId || null
    });
  }
}
