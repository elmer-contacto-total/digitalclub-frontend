/**
 * Client Service
 * Comunicacion con Spring Boot /app/clients endpoints
 * PARIDAD: digitalgroup-web-main-spring-boot/.../web/admin/ClientAdminController.java
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Client, ClientStructure } from '../models/client.model';
import { PagedResponse, PaginationParams } from '../models/pagination.model';

// ===== REQUEST DTOs =====

/**
 * Client structure attributes for create/update
 * PARIDAD: Rails client_structure_attributes
 */
export interface ClientStructureRequest {
  existsAdminLevel0?: boolean;
  adminLevel0?: string;
  existsManagerLevel1?: boolean;
  managerLevel1?: string;
  existsManagerLevel2?: boolean;
  managerLevel2?: string;
  existsManagerLevel3?: boolean;
  managerLevel3?: string;
  existsManagerLevel4?: boolean;
  managerLevel4?: string;
  existsAgent?: boolean;
  agent?: string;
  existsClientLevel6?: boolean;
  clientLevel6?: string;
}

export interface UpdateClientRequest {
  name?: string;
  companyName?: string;
  docType?: string;
  docNumber?: string;
  clientType?: string;
  status?: string;
  active?: boolean;
  clientStructure?: ClientStructureRequest;
}

export interface CreateClientRequest {
  name: string;
  companyName?: string;
  docType?: string;
  docNumber?: string;
  clientType?: string;
  status?: string;
  clientStructure?: ClientStructureRequest;
}

export interface UpdateSettingsRequest {
  settings: Record<string, unknown>;
}

export interface UpdateWhatsAppConfigRequest {
  whatsappPhoneNumberId?: string;
  whatsappBusinessAccountId?: string;
  whatsappAccessToken?: string;
  whatsappWebhookVerifyToken?: string;
}

// ===== RESPONSE DTOs =====

export interface ClientSettings {
  [key: string]: unknown;
}

export interface WhatsAppConfig {
  whatsapp_phone_number_id?: string;
  whatsapp_business_account_id?: string;
  whatsapp_access_token_configured?: boolean;
  whatsapp_webhook_verify_token?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClientService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/clients`;

  /**
   * Get all clients (Super Admin only)
   */
  getClients(params: PaginationParams = {}): Observable<PagedResponse<Client>> {
    let httpParams = new HttpParams();
    if (params.page !== undefined) httpParams = httpParams.set('page', params.page.toString());
    if (params.pageSize !== undefined) httpParams = httpParams.set('pageSize', params.pageSize.toString());
    return this.http.get<PagedResponse<Client>>(this.baseUrl, { params: httpParams });
  }

  /**
   * Get current user's client
   */
  getCurrentClient(): Observable<Client> {
    return this.http.get<Client>(`${this.baseUrl}/current`);
  }

  /**
   * Get client by ID
   */
  getClient(id: number): Observable<Client> {
    return this.http.get<Client>(`${this.baseUrl}/${id}`);
  }

  /**
   * Create new client (Super Admin only)
   */
  createClient(request: CreateClientRequest): Observable<Client> {
    return this.http.post<Client>(this.baseUrl, request);
  }

  /**
   * Update client
   */
  updateClient(id: number, request: UpdateClientRequest): Observable<Client> {
    return this.http.put<Client>(`${this.baseUrl}/${id}`, request);
  }

  /**
   * Get client settings
   */
  getClientSettings(id: number): Observable<ClientSettings> {
    return this.http.get<ClientSettings>(`${this.baseUrl}/${id}/settings`);
  }

  /**
   * Update client settings
   */
  updateClientSettings(id: number, request: UpdateSettingsRequest): Observable<ClientSettings> {
    return this.http.put<ClientSettings>(`${this.baseUrl}/${id}/settings`, request);
  }

  /**
   * Get WhatsApp configuration
   */
  getWhatsAppConfig(id: number): Observable<WhatsAppConfig> {
    return this.http.get<WhatsAppConfig>(`${this.baseUrl}/${id}/whatsapp`);
  }

  /**
   * Update WhatsApp configuration
   */
  updateWhatsAppConfig(id: number, request: UpdateWhatsAppConfigRequest): Observable<WhatsAppConfig> {
    return this.http.put<WhatsAppConfig>(`${this.baseUrl}/${id}/whatsapp`, request);
  }

  /**
   * Delete client (Super Admin only)
   * PARIDAD: Rails Admin::ClientsController#destroy
   */
  deleteClient(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Delete all prospects for a client
   * PARIDAD: Rails Admin::ClientsController#destroy_prospects
   */
  deleteProspects(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${id}/prospects`);
  }
}
