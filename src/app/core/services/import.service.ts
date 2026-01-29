/**
 * Import Service
 * PARIDAD: Rails Admin::ImportsController
 * Servicio para gestión de importaciones masivas de usuarios
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Import {
  id: number;
  status: ImportStatus;
  importType: string;
  totRecords: number;
  progress: number;
  progressPercent: number;
  errorsText: string | null;
  userId: number;
  userName: string;
  createdAt: string;
  updatedAt: string;
}

export type ImportStatus =
  | 'status_new'
  | 'status_validating'
  | 'status_valid'
  | 'status_error'
  | 'status_processing'
  | 'status_completed';

export interface ImportListResponse {
  imports: Import[];
  total: number;
  page: number;
  totalPages: number;
}

export interface ImportProgress {
  id: number;
  status: ImportStatus;
  totRecords: number;
  progress: number;
  progressPercent: number;
  isComplete: boolean;
}

export interface ValidatedUsersResponse {
  id: number;
  validCount: number;
  invalidCount: number;
  status: ImportStatus;
}

export interface TempImportUser {
  id: number;
  codigo: string;
  firstName: string;
  lastName: string;
  phone: string;
  phoneCode: string;
  email: string;
  managerEmail: string;
  crmFields: string;
  errorMessage: string | null;
  role: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImportService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/imports`;

  /**
   * Lista de importaciones paginada
   * PARIDAD: Rails Admin::ImportsController#index
   */
  getImports(page: number = 0, size: number = 10): Observable<ImportListResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    return this.http.get<ImportListResponse>(this.baseUrl, { params });
  }

  /**
   * Obtener importación por ID
   * PARIDAD: Rails Admin::ImportsController#show
   */
  getImport(id: number): Observable<Import> {
    return this.http.get<Import>(`${this.baseUrl}/${id}`);
  }

  /**
   * Crear nueva importación con archivo CSV
   * PARIDAD: Rails Admin::ImportsController#create
   */
  createImport(file: File, importType: string = 'user'): Observable<{ result: string; import: Import; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('importType', importType);

    return this.http.post<{ result: string; import: Import; message: string }>(this.baseUrl, formData);
  }

  /**
   * Obtener estado/progreso de importación
   * PARIDAD: Rails Admin::ImportsController#status
   */
  getStatus(id: number): Observable<ImportProgress> {
    return this.http.get<ImportProgress>(`${this.baseUrl}/${id}/status`);
  }

  /**
   * Obtener progreso detallado de importación
   * PARIDAD: Rails Admin::ImportsController#progress
   */
  getProgress(id: number): Observable<{
    progress: number;
    message: string;
    errors: string;
    status: ImportStatus;
  }> {
    return this.http.get<{
      progress: number;
      message: string;
      errors: string;
      status: ImportStatus;
    }>(`${this.baseUrl}/${id}/progress`);
  }

  /**
   * Confirmar y procesar importación validada
   * PARIDAD: Rails Admin::ImportsController#create_import_user
   */
  confirmImport(id: number): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/${id}/confirm`, {});
  }

  /**
   * Obtener preview de usuarios validados
   * PARIDAD: Rails Admin::ImportsController#validated_import_user
   */
  getValidatedUsers(id: number, page: number = 0, size: number = 20): Observable<ValidatedUsersResponse> {
    const params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString());

    return this.http.get<ValidatedUsersResponse>(`${this.baseUrl}/${id}/validated_users`, { params });
  }

  /**
   * Descargar CSV de muestra
   * PARIDAD: Rails Admin::ImportsController#sample_csv
   */
  downloadSampleCsv(importType: string = 'user'): void {
    window.open(`${this.baseUrl}/sample_csv?importType=${importType}`, '_blank');
  }

  /**
   * Cancelar importación
   * PARIDAD: Rails - no existe equivalente directo
   */
  cancelImport(id: number): Observable<{ result: string; import: Import }> {
    return this.http.post<{ result: string; import: Import }>(`${this.baseUrl}/${id}/cancel`, {});
  }

  /**
   * Obtener errores de importación
   */
  getErrors(id: number): Observable<{ id: number; errors_text: string }> {
    return this.http.get<{ id: number; errors_text: string }>(`${this.baseUrl}/${id}/errors`);
  }

  /**
   * Helper: Obtener texto de estado en español
   * PARIDAD: Rails status labels
   */
  getStatusLabel(status: ImportStatus): string {
    const labels: Record<ImportStatus, string> = {
      'status_new': 'Nuevo',
      'status_validating': 'Validando',
      'status_valid': 'Válido',
      'status_error': 'Error',
      'status_processing': 'Procesando',
      'status_completed': 'Completado'
    };
    return labels[status] || status;
  }

  /**
   * Helper: Obtener clase CSS de estado
   */
  getStatusClass(status: ImportStatus): string {
    const classes: Record<ImportStatus, string> = {
      'status_new': 'badge-secondary',
      'status_validating': 'badge-warning',
      'status_valid': 'badge-success',
      'status_error': 'badge-danger',
      'status_processing': 'badge-info',
      'status_completed': 'badge-success'
    };
    return classes[status] || 'badge-secondary';
  }

  /**
   * Helper: Verificar si la importación está en progreso
   */
  isInProgress(status: ImportStatus): boolean {
    return status === 'status_new' || status === 'status_validating' || status === 'status_processing';
  }

  /**
   * Helper: Verificar si la importación está completa
   */
  isComplete(status: ImportStatus): boolean {
    return status === 'status_completed' || status === 'status_error';
  }
}
