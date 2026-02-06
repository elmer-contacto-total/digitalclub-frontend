/**
 * Media Audit Log Service
 * PARIDAD: Spring Boot MediaAuditLogAdminController
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MediaAuditLog, MediaAuditStatsResponse } from '../models/media-audit.model';
import { PagedResponse } from '../models/pagination.model';

@Injectable({
  providedIn: 'root'
})
export class MediaAuditService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/media_audit_logs`;

  getAuditLogs(params?: {
    action?: string;
    agentId?: number;
    from?: string;
    to?: string;
    page?: number;
    size?: number;
  }): Observable<PagedResponse<MediaAuditLog>> {
    let httpParams = new HttpParams();

    if (params?.action) {
      httpParams = httpParams.set('action', params.action);
    }
    if (params?.agentId) {
      httpParams = httpParams.set('agentId', params.agentId.toString());
    }
    if (params?.from) {
      httpParams = httpParams.set('from', params.from);
    }
    if (params?.to) {
      httpParams = httpParams.set('to', params.to);
    }
    if (params?.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.size !== undefined) {
      httpParams = httpParams.set('size', params.size.toString());
    }

    return this.http.get<PagedResponse<MediaAuditLog>>(this.baseUrl, { params: httpParams });
  }

  getStats(): Observable<MediaAuditStatsResponse> {
    return this.http.get<MediaAuditStatsResponse>(`${this.baseUrl}/stats`);
  }

  getActionLabel(action: string): string {
    switch (action) {
      case 'DOWNLOAD_BLOCKED': return 'Bloqueado';
      case 'MEDIA_CAPTURED': return 'Capturado';
      case 'MEDIA_VIEWED': return 'Visto';
      case 'BLOCKED_FILE_ATTEMPT': return 'Intento Bloq.';
      case 'VIDEO_BLOCKED': return 'Video Bloq.';
      default: return action;
    }
  }

  getActionBadgeClass(action: string): string {
    switch (action) {
      case 'DOWNLOAD_BLOCKED': return 'bg-danger';
      case 'MEDIA_CAPTURED': return 'bg-info text-dark';
      case 'MEDIA_VIEWED': return 'bg-success';
      case 'BLOCKED_FILE_ATTEMPT': return 'bg-danger';
      case 'VIDEO_BLOCKED': return 'bg-warning text-dark';
      default: return 'bg-secondary';
    }
  }
}
