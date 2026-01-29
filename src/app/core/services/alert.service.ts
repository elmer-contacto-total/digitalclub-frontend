/**
 * Alert Service
 * PARIDAD: Rails AlertsController + Spring Boot AlertAdminController
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Alert,
  AlertListResponse,
  AlertCountResponse,
  AcknowledgeResponse,
  AlertType
} from '../models/alert.model';

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/alerts`;

  /**
   * Get paginated list of alerts
   */
  getAlerts(params?: {
    type?: AlertType;
    acknowledged?: boolean;
    page?: number;
    size?: number;
  }): Observable<AlertListResponse> {
    let httpParams = new HttpParams();

    if (params?.type) {
      httpParams = httpParams.set('type', params.type);
    }
    if (params?.acknowledged !== undefined) {
      httpParams = httpParams.set('acknowledged', params.acknowledged.toString());
    }
    if (params?.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.size !== undefined) {
      httpParams = httpParams.set('size', params.size.toString());
    }

    return this.http.get<AlertListResponse>(this.baseUrl, { params: httpParams });
  }

  /**
   * Get single alert by ID
   */
  getAlert(id: number): Observable<Alert> {
    return this.http.get<Alert>(`${this.baseUrl}/${id}`);
  }

  /**
   * Get count of unacknowledged alerts
   */
  getUnacknowledgedCount(): Observable<AlertCountResponse> {
    return this.http.get<AlertCountResponse>(`${this.baseUrl}/count`);
  }

  /**
   * Acknowledge (mark as read) a single alert
   */
  acknowledgeAlert(id: number): Observable<AcknowledgeResponse> {
    return this.http.post<AcknowledgeResponse>(`${this.baseUrl}/${id}/acknowledge`, {});
  }

  /**
   * Acknowledge multiple alerts at once
   */
  acknowledgeAlerts(alertIds: number[]): Observable<AcknowledgeResponse> {
    return this.http.post<AcknowledgeResponse>(`${this.baseUrl}/acknowledge_bulk`, {
      alertIds
    });
  }

  /**
   * Get alerts for a specific ticket
   */
  getAlertsByTicket(ticketId: number): Observable<Alert[]> {
    return this.http.get<Alert[]>(`${this.baseUrl}/ticket/${ticketId}`);
  }

  /**
   * Get alerts for a specific user
   */
  getAlertsByUser(userId: number, params?: {
    acknowledged?: boolean;
    page?: number;
    size?: number;
  }): Observable<AlertListResponse> {
    let httpParams = new HttpParams();

    if (params?.acknowledged !== undefined) {
      httpParams = httpParams.set('acknowledged', params.acknowledged.toString());
    }
    if (params?.page !== undefined) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params?.size !== undefined) {
      httpParams = httpParams.set('size', params.size.toString());
    }

    return this.http.get<AlertListResponse>(`${this.baseUrl}/user/${userId}`, { params: httpParams });
  }

  /**
   * Get severity CSS class for styling
   * PARIDAD: Rails alert_severity_helper
   */
  getSeverityClass(severity: string): string {
    switch (severity) {
      case 'success':
        return 'text-success';
      case 'priority':
      case 'high':
        return 'text-danger';
      case 'warning':
        return 'text-warning';
      case 'info':
      default:
        return 'text-secondary';
    }
  }

  /**
   * Get severity badge class
   */
  getSeverityBadgeClass(severity: string): string {
    switch (severity) {
      case 'success':
        return 'bg-success';
      case 'priority':
      case 'high':
        return 'bg-danger';
      case 'warning':
        return 'bg-warning text-dark';
      case 'info':
      default:
        return 'bg-secondary';
    }
  }

  /**
   * Get alert type label in Spanish
   */
  getTypeLabel(type: string): string {
    switch (type) {
      case 'conversation_response_overdue':
        return 'Respuesta vencida';
      case 'require_response':
        return 'Requiere respuesta';
      case 'escalation':
        return 'Escalación';
      default:
        return type;
    }
  }
}
