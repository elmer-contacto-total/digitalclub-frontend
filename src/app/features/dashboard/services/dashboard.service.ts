import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
  KpiResponse,
  KpiRequestParams,
  ExportKpiParams,
  PeriodType,
  KpiObjectType,
  IndividualKpiRow,
  getPeriodDays
} from '../../../core/models/dashboard.model';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private api = inject(ApiService);

  /**
   * Get KPIs for dashboard
   * PARIDAD RAILS: Admin::DashboardController#ajax_get_kpis (calculate_kpis endpoint)
   */
  getKpis(params: KpiRequestParams): Observable<KpiResponse> {
    return this.api.get<KpiResponse>('/app/calculate_kpis', {
      params: this.buildKpiParams(params)
    });
  }

  /**
   * Export KPIs as CSV
   * PARIDAD RAILS: Admin::DashboardController#export_kpis
   */
  exportKpis(params: ExportKpiParams): Observable<Blob> {
    return this.api.download('/app/export_kpis', {
      params: this.buildExportParams(params)
    });
  }

  /**
   * Get initial dashboard data (from show action)
   * This could be useful if backend provides initial data
   */
  getDashboardInitialData(): Observable<KpiResponse> {
    // For now, just call calculate_kpis with default params
    return this.getKpis({
      button_id: 'today',
      object: 'agent',
      object_option: 'Todos'
    });
  }

  /**
   * Transform individual KPIs record to array format for table
   */
  transformIndividualKpis(
    kpis: Record<number, any>,
    userNames: Map<number, string>
  ): IndividualKpiRow[] {
    return Object.entries(kpis).map(([userId, kpiData]) => ({
      userId: parseInt(userId),
      userName: userNames.get(parseInt(userId)) || `Usuario ${userId}`,
      kpis: kpiData
    }));
  }

  /**
   * Parse dropdown options from API response
   */
  parseDropdownOptions(options: [string, string, string | number][]): { label: string; value: string | number }[] {
    return options.map(([firstName, lastName, value]) => ({
      label: `${firstName} ${lastName}`.trim(),
      value
    }));
  }

  /**
   * Download exported file
   */
  downloadExport(params: ExportKpiParams): void {
    this.exportKpis(params).subscribe({
      next: (blob) => {
        this.downloadFile(blob, `kpi_export_${new Date().toISOString().split('T')[0]}.csv`);
      },
      error: (err) => {
        console.error('Error exporting KPIs:', err);
      }
    });
  }

  /**
   * Export contacts as CSV
   * PARIDAD RAILS: Admin::DashboardController#export_contacts
   */
  exportContacts(managerId?: number): Observable<Blob> {
    const params: Record<string, string | number | boolean | undefined> = {};
    if (managerId !== undefined) {
      params['managerId'] = managerId;
    }
    return this.api.download('/app/export_contacts', { params });
  }

  /**
   * Download contacts export
   */
  downloadContacts(managerId?: number): void {
    this.exportContacts(managerId).subscribe({
      next: (blob) => {
        this.downloadFile(blob, `contacts_export_${new Date().toISOString().split('T')[0]}.csv`);
      },
      error: (err) => {
        console.error('Error exporting contacts:', err);
      }
    });
  }

  /**
   * Helper to download a file blob
   */
  private downloadFile(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  /**
   * Build params for KPI request
   */
  private buildKpiParams(params: KpiRequestParams): Record<string, string | number | boolean | undefined> {
    const result: Record<string, string | number | boolean | undefined> = {
      button_id: params.button_id
    };

    if (params.object) {
      result['object'] = params.object;
    }

    if (params.object_option !== undefined) {
      result['object_option'] = String(params.object_option);
    }

    if (params.button_id === 'last_custom' && params.from_date && params.to_date) {
      result['from_date'] = params.from_date;
      result['to_date'] = params.to_date;
    }

    return result;
  }

  /**
   * Build params for export request
   */
  private buildExportParams(params: ExportKpiParams): Record<string, string | number | boolean | undefined> {
    const result: Record<string, string | number | boolean | undefined> = {};

    if (params.from_date && params.to_date) {
      result['from_date'] = params.from_date;
      result['to_date'] = params.to_date;
    } else if (params.last_x_days !== undefined) {
      result['last_x_days'] = params.last_x_days;
    }

    if (params.object) {
      result['object'] = params.object;
    }

    if (params.object_option !== undefined) {
      result['object_option'] = String(params.object_option);
    }

    return result;
  }
}
