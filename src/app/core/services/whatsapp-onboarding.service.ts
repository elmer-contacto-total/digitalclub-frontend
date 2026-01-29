/**
 * WhatsApp Onboarding Service
 * PARIDAD: Rails WhatsAppOnboardingController + Spring Boot WhatsAppOnboardingController
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  WhatsAppStatus,
  ExchangeCodeRequest,
  OnboardingResponse,
  DisconnectResponse,
  AccountReviewStatus
} from '../models/whatsapp-onboarding.model';

@Injectable({
  providedIn: 'root'
})
export class WhatsAppOnboardingService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/whatsapp_onboarding`;

  // Facebook App configuration
  // PARIDAD: Rails uses these same values
  readonly FACEBOOK_APP_ID = '886437752963072';
  readonly FACEBOOK_CONFIG_ID = '905091614557252';
  readonly GRAPH_API_VERSION = 'v19.0';

  /**
   * Check current WhatsApp connection status
   */
  checkStatus(): Observable<WhatsAppStatus> {
    return this.http.get<WhatsAppStatus>(this.baseUrl);
  }

  /**
   * Exchange OAuth authorization code for access token
   */
  exchangeCode(code: string): Observable<OnboardingResponse> {
    const request: ExchangeCodeRequest = { code };
    return this.http.post<OnboardingResponse>(`${this.baseUrl}/exchange_code`, request);
  }

  /**
   * Complete the onboarding process
   * Gets WABA data and subscribes to webhooks
   */
  completeOnboarding(): Observable<OnboardingResponse> {
    return this.http.post<OnboardingResponse>(`${this.baseUrl}/complete`, {});
  }

  /**
   * Disconnect WhatsApp integration
   */
  disconnect(): Observable<DisconnectResponse> {
    return this.http.post<DisconnectResponse>(`${this.baseUrl}/disconnect`, {});
  }

  /**
   * Refresh WhatsApp data
   */
  refresh(): Observable<OnboardingResponse> {
    return this.http.post<OnboardingResponse>(`${this.baseUrl}/refresh`, {});
  }

  /**
   * Get status label in Spanish
   * PARIDAD: Rails i18n
   */
  getStatusLabel(status: string): string {
    switch (status?.toUpperCase()) {
      case AccountReviewStatus.APPROVED:
        return 'Aprobado';
      case AccountReviewStatus.PENDING:
        return 'Pendiente';
      case AccountReviewStatus.REJECTED:
        return 'Rechazado';
      default:
        return status || 'Desconocido';
    }
  }

  /**
   * Get status badge class
   */
  getStatusBadgeClass(status: string): string {
    switch (status?.toUpperCase()) {
      case AccountReviewStatus.APPROVED:
        return 'bg-success';
      case AccountReviewStatus.PENDING:
        return 'bg-warning text-dark';
      case AccountReviewStatus.REJECTED:
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }

  /**
   * Get status message in Spanish
   * PARIDAD: Rails i18n whatsapp_onboarding.show.*
   */
  getStatusMessage(status: string): string {
    switch (status?.toUpperCase()) {
      case AccountReviewStatus.APPROVED:
        return 'Su cuenta de Whatsapp Business ha sido dada de alta exitosamente. Ahora puede usar todas las funciones para comunicarse a través de su número de Whatsapp Business que se muestra a continuación.';
      case AccountReviewStatus.PENDING:
        return 'Su cuenta de Whatsapp Business está pendiente de aprobación. Por favor siga las instrucciones para completar el proceso de verificación.';
      case AccountReviewStatus.REJECTED:
        return 'Su cuenta de Whatsapp Business ha sido rechazada. Por favor siga las instrucciones para completar el proceso de verificación.';
      default:
        return 'Estado de cuenta desconocido.';
    }
  }

  /**
   * Get quality rating badge class
   */
  getQualityBadgeClass(rating: string): string {
    switch (rating?.toUpperCase()) {
      case 'GREEN':
        return 'bg-success';
      case 'YELLOW':
        return 'bg-warning text-dark';
      case 'RED':
        return 'bg-danger';
      default:
        return 'bg-secondary';
    }
  }
}
