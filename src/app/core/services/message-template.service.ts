/**
 * Message Template Service
 * PARIDAD: Rails Admin::MessageTemplatesController
 * Servicio para gestión de plantillas de mensajes WhatsApp
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface MessageTemplate {
  id: number;
  name: string;
  language: string;
  languageName: string;
  category: number;
  templateWhatsappType: number;
  status: TemplateStatus;
  headerMediaType: number;
  headerContent: string | null;
  bodyContent: string | null;
  footerContent: string | null;
  totButtons: number;
  closesTicket: boolean;
  visibility: number;
  paramsStatus: string;
  params?: MessageTemplateParam[];
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplateParam {
  id: number;
  component: string;
  position: number;
  dataField: string;
  defaultValue: string;
}

export type TemplateStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'disabled';

export interface TemplateListResponse {
  templates: MessageTemplate[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateTemplateRequest {
  name: string;
  language: string;
  category: number;
  headerMediaType?: number;
  headerContent?: string;
  bodyContent?: string;
  footerContent?: string;
  totButtons?: number;
}

export interface UpdateTemplateRequest {
  headerContent?: string;
  bodyContent?: string;
  footerContent?: string;
  totButtons?: number;
}

@Injectable({
  providedIn: 'root'
})
export class MessageTemplateService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/message_templates`;

  /**
   * Lista de plantillas paginada
   * PARIDAD: Rails Admin::MessageTemplatesController#index
   */
  getTemplates(
    page: number = 0,
    size: number = 20,
    search?: string
  ): Observable<TemplateListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (search) {
      params = params.set('search', search);
    }

    return this.http.get<TemplateListResponse>(this.baseUrl, { params });
  }

  /**
   * Obtener plantilla por ID
   * PARIDAD: Rails Admin::MessageTemplatesController#show
   */
  getTemplate(id: number): Observable<MessageTemplate> {
    return this.http.get<MessageTemplate>(`${this.baseUrl}/${id}`);
  }

  /**
   * Crear nueva plantilla
   * PARIDAD: Rails Admin::MessageTemplatesController#create
   */
  createTemplate(request: CreateTemplateRequest): Observable<{ result: string; template: MessageTemplate }> {
    return this.http.post<{ result: string; template: MessageTemplate }>(this.baseUrl, request);
  }

  /**
   * Actualizar plantilla
   * PARIDAD: Rails Admin::MessageTemplatesController#update
   */
  updateTemplate(id: number, request: UpdateTemplateRequest): Observable<{ result: string; template: MessageTemplate }> {
    return this.http.put<{ result: string; template: MessageTemplate }>(`${this.baseUrl}/${id}`, request);
  }

  /**
   * Eliminar plantilla
   * PARIDAD: Rails Admin::MessageTemplatesController#destroy
   */
  deleteTemplate(id: number): Observable<{ result: string; message: string }> {
    return this.http.delete<{ result: string; message: string }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Sincronizar con WhatsApp Cloud API
   * PARIDAD: Rails Admin::MessageTemplatesController - sync action
   */
  syncWithCloudApi(): Observable<{ result: string; synced_count: number; message: string }> {
    return this.http.post<{ result: string; synced_count: number; message: string }>(`${this.baseUrl}/sync`, {});
  }

  /**
   * Enviar plantilla para aprobación
   */
  submitForApproval(id: number): Observable<{ result: string; template: MessageTemplate; message: string }> {
    return this.http.post<{ result: string; template: MessageTemplate; message: string }>(`${this.baseUrl}/${id}/submit`, {});
  }

  /**
   * Actualizar parámetros de plantilla
   * PARIDAD: Rails Admin::MessageTemplateParamsController#update
   */
  updateParams(templateId: number, params: { id: number; dataField: string; defaultValue: string }[]): Observable<any> {
    return this.http.put(`${this.baseUrl}/${templateId}/params`, params);
  }

  /**
   * Helper: Obtener texto de estado en español
   * PARIDAD: Rails status labels
   */
  getStatusLabel(status: TemplateStatus): string {
    const labels: Record<TemplateStatus, string> = {
      'draft': 'Borrador',
      'pending': 'Pendiente',
      'approved': 'Aprobado',
      'rejected': 'Rechazado',
      'disabled': 'Deshabilitado'
    };
    return labels[status] || status || '-';
  }

  /**
   * Helper: Obtener clase CSS de estado
   */
  getStatusClass(status: TemplateStatus): string {
    const classes: Record<TemplateStatus, string> = {
      'draft': 'badge-secondary',
      'pending': 'badge-warning',
      'approved': 'badge-success',
      'rejected': 'badge-danger',
      'disabled': 'badge-secondary'
    };
    return classes[status] || 'badge-secondary';
  }

  /**
   * Helper: Obtener texto de categoría
   * PARIDAD: Rails MessageTemplate.translated_category
   */
  getCategoryLabel(category: number): string {
    const labels: Record<number, string> = {
      0: 'Marketing',
      1: 'Utilidad',
      2: 'Autenticación'
    };
    return labels[category] || `Categoría ${category}`;
  }

  /**
   * Helper: Obtener texto de tipo de template
   * PARIDAD: Rails MessageTemplate.translated_template_whatsapp_type
   */
  getTemplateTypeLabel(type: number): string {
    const labels: Record<number, string> = {
      0: 'Estándar',
      1: 'Carrusel',
      2: 'Catálogo'
    };
    return labels[type] || `Tipo ${type}`;
  }

  /**
   * Helper: Obtener texto de tipo de media del header
   */
  getHeaderMediaTypeLabel(type: number): string {
    const labels: Record<number, string> = {
      0: 'Ninguno',
      1: 'Texto',
      2: 'Imagen',
      3: 'Video',
      4: 'Documento'
    };
    return labels[type] || `Tipo ${type}`;
  }
}
