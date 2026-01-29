/**
 * Template Bulk Send Service
 * PARIDAD: Rails Admin::TemplateBulkSendsController
 * Servicio para envíos masivos de plantillas WhatsApp
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface TemplateForBulkSend {
  id: number;
  name: string;
  category: number;
  language: string;
  header_content: string;
  body_content: string;
  footer_content: string;
}

export interface BulkSendRecipient {
  id: number;
  name: string;
  phone: string;
  email: string;
}

export interface BulkSendJob {
  job_id: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  total: number;
  sent: number;
  failed: number;
  progress_percent: number;
  started_at: string;
  completed_at?: string;
  errors: string[];
}

export interface BulkSendJobSummary {
  job_id: string;
  status: string;
  total: number;
  sent: number;
  failed: number;
  started_at: string;
}

export interface PreviewResponse {
  template_name: string;
  preview: string;
  language: string;
}

export interface StartBulkSendResponse {
  result: string;
  job_id: string;
  total_recipients: number;
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class TemplateBulkSendService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/template_bulk_sends`;

  /**
   * Obtener plantillas aprobadas para envío
   */
  getTemplates(): Observable<{ templates: TemplateForBulkSend[] }> {
    return this.http.get<{ templates: TemplateForBulkSend[] }>(`${this.baseUrl}/templates`);
  }

  /**
   * Obtener destinatarios disponibles
   */
  getRecipients(filter?: string, page: number = 0, size: number = 50): Observable<{ recipients: BulkSendRecipient[]; total: number }> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (filter) {
      params = params.set('filter', filter);
    }

    return this.http.get<{ recipients: BulkSendRecipient[]; total: number }>(`${this.baseUrl}/recipients`, { params });
  }

  /**
   * Vista previa de plantilla
   */
  previewTemplate(templateId: number, variables: Record<string, string> = {}): Observable<PreviewResponse> {
    return this.http.post<PreviewResponse>(`${this.baseUrl}/preview`, {
      templateId,
      variables
    });
  }

  /**
   * Iniciar envío masivo
   */
  startBulkSend(
    templateId: number,
    recipientIds: number[],
    variables: Record<string, string> = {}
  ): Observable<StartBulkSendResponse> {
    return this.http.post<StartBulkSendResponse>(`${this.baseUrl}/send`, {
      templateId,
      recipientIds,
      variables
    });
  }

  /**
   * Obtener estado de trabajo de envío
   */
  getJobStatus(jobId: string): Observable<BulkSendJob> {
    return this.http.get<BulkSendJob>(`${this.baseUrl}/status/${jobId}`);
  }

  /**
   * Listar trabajos de envío recientes
   */
  getJobs(): Observable<{ jobs: BulkSendJobSummary[] }> {
    return this.http.get<{ jobs: BulkSendJobSummary[] }>(`${this.baseUrl}/jobs`);
  }

  /**
   * Cancelar trabajo de envío
   */
  cancelJob(jobId: string): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/cancel/${jobId}`, {});
  }

  /**
   * Helper: Obtener etiqueta de estado
   */
  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      'PENDING': 'Pendiente',
      'PROCESSING': 'Procesando',
      'COMPLETED': 'Completado',
      'FAILED': 'Fallido',
      'CANCELLED': 'Cancelado'
    };
    return labels[status] || status;
  }

  /**
   * Helper: Obtener clase CSS de estado
   */
  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      'PENDING': 'badge-secondary',
      'PROCESSING': 'badge-warning',
      'COMPLETED': 'badge-success',
      'FAILED': 'badge-danger',
      'CANCELLED': 'badge-secondary'
    };
    return classes[status] || 'badge-secondary';
  }
}
