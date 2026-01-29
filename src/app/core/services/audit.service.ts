/**
 * Audit Service
 * PARIDAD: Rails AuditsController + Spring Boot AuditAdminController
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Audit, AuditListResponse, AuditTypesResponse } from '../models/audit.model';

@Injectable({
  providedIn: 'root'
})
export class AuditService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/audits`;

  /**
   * Get paginated list of audits
   */
  getAudits(params?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    size?: number;
  }): Observable<AuditListResponse> {
    let httpParams = new HttpParams();

    if (params?.startDate) {
      httpParams = httpParams.set('startDate', params.startDate);
    }
    if (params?.endDate) {
      httpParams = httpParams.set('endDate', params.endDate);
    }
    if (params?.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.size !== undefined) {
      httpParams = httpParams.set('size', params.size.toString());
    }

    return this.http.get<AuditListResponse>(this.baseUrl, { params: httpParams });
  }

  /**
   * Get single audit by ID
   */
  getAudit(id: number): Observable<Audit> {
    return this.http.get<Audit>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get audits for a specific entity
   */
  getAuditsByEntity(entityType: string, entityId: number, params?: {
    page?: number;
    size?: number;
  }): Observable<AuditListResponse> {
    let httpParams = new HttpParams();

    if (params?.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.size !== undefined) {
      httpParams = httpParams.set('size', params.size.toString());
    }

    return this.http.get<AuditListResponse>(
      `${this.baseUrl}/entity/${entityType}/${entityId}`,
      { params: httpParams }
    );
  }

  /**
   * Export audits as CSV
   * Returns the URL to download the CSV file
   */
  getExportUrl(startDate?: string, endDate?: string): string {
    let url = `${this.baseUrl}/export`;
    const params: string[] = [];

    if (startDate) {
      params.push(`startDate=${startDate}`);
    }
    if (endDate) {
      params.push(`endDate=${endDate}`);
    }

    if (params.length > 0) {
      url += '?' + params.join('&');
    }

    return url;
  }

  /**
   * Get available auditable types
   */
  getAuditableTypes(): Observable<AuditTypesResponse> {
    return this.http.get<AuditTypesResponse>(`${this.baseUrl}/types`);
  }

  /**
   * Get action label in Spanish
   * PARIDAD: Rails terminología
   */
  getActionLabel(action: string): string {
    switch (action) {
      case 'create':
        return 'Crear';
      case 'update':
        return 'Actualizar';
      case 'destroy':
        return 'Eliminar';
      default:
        return action;
    }
  }

  /**
   * Get action badge class
   */
  getActionBadgeClass(action: string): string {
    switch (action) {
      case 'create':
        return 'bg-success';
      case 'update':
        return 'bg-primary';
      case 'destroy':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }

  /**
   * Format changes object for display
   */
  formatChanges(changes: Record<string, unknown>): string {
    if (!changes || Object.keys(changes).length === 0) {
      return '-';
    }
    return JSON.stringify(changes, null, 2);
  }
}
