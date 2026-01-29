/**
 * Canned Message Service
 * PARIDAD: Rails Admin::CannedMessagesController
 * Servicio para gestión de mensajes enlatados (respuestas rápidas)
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CannedMessage {
  id: number;
  message: string;
  client_global: boolean;
  status: string;
  user_id: number | null;
  client_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CannedMessageListResponse {
  canned_messages: CannedMessage[];
}

export interface CreateCannedMessageRequest {
  message: string;
  clientGlobal?: boolean;
}

export interface UpdateCannedMessageRequest {
  message?: string;
  clientGlobal?: boolean;
  status?: string;
}

@Injectable({
  providedIn: 'root'
})
export class CannedMessageService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/canned_messages`;

  /**
   * Lista de mensajes enlatados
   * PARIDAD: Rails Admin::CannedMessagesController#index
   */
  getCannedMessages(): Observable<CannedMessageListResponse> {
    return this.http.get<CannedMessageListResponse>(this.baseUrl);
  }

  /**
   * Obtener mensaje enlatado por ID
   * PARIDAD: Rails Admin::CannedMessagesController#show
   */
  getCannedMessage(id: number): Observable<CannedMessage> {
    return this.http.get<CannedMessage>(`${this.baseUrl}/${id}`);
  }

  /**
   * Crear nuevo mensaje enlatado
   * PARIDAD: Rails Admin::CannedMessagesController#create
   */
  createCannedMessage(request: CreateCannedMessageRequest): Observable<{ result: string; canned_message: CannedMessage }> {
    return this.http.post<{ result: string; canned_message: CannedMessage }>(this.baseUrl, request);
  }

  /**
   * Actualizar mensaje enlatado
   * PARIDAD: Rails Admin::CannedMessagesController#update
   */
  updateCannedMessage(id: number, request: UpdateCannedMessageRequest): Observable<{ result: string; canned_message: CannedMessage }> {
    return this.http.put<{ result: string; canned_message: CannedMessage }>(`${this.baseUrl}/${id}`, request);
  }

  /**
   * Eliminar mensaje enlatado
   * PARIDAD: Rails Admin::CannedMessagesController#destroy
   */
  deleteCannedMessage(id: number): Observable<{ result: string }> {
    return this.http.delete<{ result: string }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Buscar mensajes enlatados
   */
  searchCannedMessages(query: string): Observable<CannedMessageListResponse> {
    const params = new HttpParams().set('q', query);
    return this.http.get<CannedMessageListResponse>(`${this.baseUrl}/search`, { params });
  }
}
