/**
 * Prospect Service
 * PARIDAD: Rails Admin::ProspectsController
 * Servicio para gestión de prospectos (leads potenciales)
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Prospect {
  id: number;
  name: string;
  phone: string;
  clientId: number;
  status: ProspectStatus;
  upgradedToUser: boolean;
  managerId?: number;
  managerName?: string;
  createdAt: string;
  updatedAt: string;
}

export type ProspectStatus = 'active' | 'inactive' | 'pending';

export interface ProspectListResponse {
  prospects: Prospect[];
  total: number;
  page: number;
  totalPages: number;
}

export interface CreateProspectRequest {
  phone: string;
  name: string;
}

export interface UpdateProspectRequest {
  name?: string;
  status?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProspectService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/prospects`;

  /**
   * Lista de prospectos paginada
   * PARIDAD: Rails Admin::ProspectsController#index
   */
  getProspects(
    page: number = 0,
    size: number = 20,
    status?: string,
    search?: string
  ): Observable<ProspectListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    if (status) {
      params = params.set('status', status);
    }
    if (search) {
      params = params.set('search', search);
    }

    return this.http.get<ProspectListResponse>(this.baseUrl, { params });
  }

  /**
   * Obtener prospecto por ID
   * PARIDAD: Rails Admin::ProspectsController#show
   */
  getProspect(id: number): Observable<Prospect> {
    return this.http.get<Prospect>(`${this.baseUrl}/${id}`);
  }

  /**
   * Crear nuevo prospecto
   * PARIDAD: Rails Admin::ProspectsController#create
   */
  createProspect(request: CreateProspectRequest): Observable<{ result: string; prospect: Prospect }> {
    return this.http.post<{ result: string; prospect: Prospect }>(this.baseUrl, request);
  }

  /**
   * Actualizar prospecto
   * PARIDAD: Rails Admin::ProspectsController#update
   */
  updateProspect(id: number, request: UpdateProspectRequest): Observable<{ result: string; prospect: Prospect }> {
    return this.http.put<{ result: string; prospect: Prospect }>(`${this.baseUrl}/${id}`, request);
  }

  /**
   * Eliminar prospecto
   * PARIDAD: Rails Admin::ProspectsController#destroy
   */
  deleteProspect(id: number): Observable<{ result: string; message: string }> {
    return this.http.delete<{ result: string; message: string }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Convertir prospecto a usuario
   * PARIDAD: Rails Admin::ProspectsController#upgrade (si existe)
   */
  upgradeToUser(id: number, managerId?: number): Observable<{ result: string; user_id: number; message: string }> {
    const body = managerId ? { managerId } : {};
    return this.http.post<{ result: string; user_id: number; message: string }>(`${this.baseUrl}/${id}/upgrade`, body);
  }

  /**
   * Asignar prospecto a manager
   */
  assignToManager(id: number, managerId: number): Observable<{ result: string; prospect: Prospect }> {
    return this.http.post<{ result: string; prospect: Prospect }>(`${this.baseUrl}/${id}/assign`, { managerId });
  }

  /**
   * Helper: Obtener texto de estado en español
   * PARIDAD: Rails status labels
   */
  getStatusLabel(status: ProspectStatus): string {
    const labels: Record<ProspectStatus, string> = {
      'active': 'Activo',
      'inactive': 'Inactivo',
      'pending': 'Pendiente'
    };
    return labels[status] || status || '-';
  }

  /**
   * Helper: Obtener clase CSS de estado
   */
  getStatusClass(status: ProspectStatus): string {
    const classes: Record<ProspectStatus, string> = {
      'active': 'badge-success',
      'inactive': 'badge-danger',
      'pending': 'badge-warning'
    };
    return classes[status] || 'badge-secondary';
  }
}
