/**
 * CRM Info Setting Service
 * PARIDAD: Rails CrmInfoSettingsController + Spring Boot CrmInfoSettingsController
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CrmInfoSetting,
  CrmInfoSettingListResponse,
  CrmInfoSettingResponse,
  CreateCrmInfoSettingRequest,
  UpdateCrmInfoSettingRequest,
  ReorderRequest,
  AvailableFieldsResponse,
  ColumnType
} from '../models/crm-info-setting.model';

@Injectable({
  providedIn: 'root'
})
export class CrmInfoSettingService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/crm_info_settings`;

  /**
   * Get all CRM settings for current client
   */
  getCrmInfoSettings(): Observable<CrmInfoSettingListResponse> {
    return this.http.get<CrmInfoSettingListResponse>(this.baseUrl);
  }

  /**
   * Get single CRM setting by ID
   */
  getCrmInfoSetting(id: number): Observable<CrmInfoSetting> {
    return this.http.get<CrmInfoSetting>(`${this.baseUrl}/${id}`);
  }

  /**
   * Create new CRM setting
   */
  createCrmInfoSetting(data: CreateCrmInfoSettingRequest): Observable<CrmInfoSettingResponse> {
    return this.http.post<CrmInfoSettingResponse>(this.baseUrl, data);
  }

  /**
   * Update CRM setting
   */
  updateCrmInfoSetting(id: number, data: UpdateCrmInfoSettingRequest): Observable<CrmInfoSettingResponse> {
    return this.http.put<CrmInfoSettingResponse>(`${this.baseUrl}/${id}`, data);
  }

  /**
   * Delete (soft delete) CRM setting
   */
  deleteCrmInfoSetting(id: number): Observable<{ result: string }> {
    return this.http.delete<{ result: string }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Reorder CRM settings
   */
  reorderCrmInfoSettings(settingIds: number[]): Observable<{ result: string }> {
    const request: ReorderRequest = { settingIds };
    return this.http.post<{ result: string }>(`${this.baseUrl}/reorder`, request);
  }

  /**
   * Get available data fields for templates
   */
  getAvailableFields(): Observable<AvailableFieldsResponse> {
    return this.http.get<AvailableFieldsResponse>(`${this.baseUrl}/available_fields`);
  }

  /**
   * Get column type label in Spanish
   * PARIDAD: Rails terminología
   */
  getColumnTypeLabel(type: string): string {
    switch (type) {
      case ColumnType.TEXT:
        return 'Texto';
      case ColumnType.NUMBER:
        return 'Número';
      case ColumnType.DATE:
        return 'Fecha';
      case ColumnType.BOOLEAN:
        return 'Sí/No';
      default:
        return type;
    }
  }

  /**
   * Get column type options for select
   */
  getColumnTypeOptions(): { value: string; label: string }[] {
    return [
      { value: ColumnType.TEXT, label: 'Texto' },
      { value: ColumnType.NUMBER, label: 'Número' },
      { value: ColumnType.DATE, label: 'Fecha' },
      { value: ColumnType.BOOLEAN, label: 'Sí/No' }
    ];
  }
}
