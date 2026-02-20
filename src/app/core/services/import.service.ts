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

export interface UnmatchedColumn {
  index: number;
  name: string;
}

export interface MappingColumn {
  index: number;
  header: string;
  suggestion: string | null;
  sampleData: string[];
}

export interface MappingData {
  importId: number;
  columns: MappingColumn[];
  totalRows: number;
}

export interface MappingTemplate {
  id: number;
  name: string;
  isFoh: boolean;
  columnMapping: Record<string, string>;
  headers: string[];
  createdAt: string;
}

export interface MatchTemplateResponse {
  found: boolean;
  template?: MappingTemplate;
}

export interface CreateImportResponse {
  result: string;
  import: Import;
  mapping: MappingData;
  message: string;
}

export interface ValidatedUsersResponse {
  id: number;
  validCount: number;
  invalidCount: number;
  status: ImportStatus;
  tempUsers: TempImportUser[];
  totalElements: number;
  totalPages: number;
  currentPage: number;
  unmatchedColumns?: UnmatchedColumn[];
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
  crmFields: Record<string, string> | null;
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
   * Crear nueva importación con archivo CSV.
   * Retorna headers + sugerencias de mapeo para la página de mapeo interactivo.
   */
  createImport(file: File, importType: string = 'user'): Observable<CreateImportResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('importType', importType);

    return this.http.post<CreateImportResponse>(this.baseUrl, formData);
  }

  /**
   * Obtener mapeo de headers (para recargas de la página de mapeo)
   */
  getMapping(importId: number, isFoh: boolean = false): Observable<MappingData> {
    const params = new HttpParams().set('isFoh', isFoh.toString());
    return this.http.get<MappingData>(`${this.baseUrl}/${importId}/mapping`, { params });
  }

  /**
   * Confirmar mapeo de columnas y disparar validación
   */
  confirmMapping(importId: number, columnMapping: Record<string, string>, isFoh: boolean = false): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(
      `${this.baseUrl}/${importId}/confirm_mapping`,
      { columnMapping, isFoh }
    );
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
    progressPercent: number;
    totRecords: number;
    message: string;
    errors: string;
    status: ImportStatus;
  }> {
    return this.http.get<{
      progress: number;
      progressPercent: number;
      totRecords: number;
      message: string;
      errors: string;
      status: ImportStatus;
    }>(`${this.baseUrl}/${id}/progress`);
  }

  /**
   * Confirmar y procesar importación validada
   * PARIDAD: Rails Admin::ImportsController#create_import_user
   * Phase F3: Sends sendInvitationEmail parameter
   */
  confirmImport(id: number, sendInvitationEmail: boolean = false): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(`${this.baseUrl}/${id}/confirm`, {
      sendInvitationEmail
    });
  }

  /**
   * Obtener preview de usuarios validados
   * PARIDAD: Rails Admin::ImportsController#validated_import_user
   * Phase D: Includes unmatchedColumns in response
   */
  getValidatedUsers(id: number, page: number = 0, size: number = 50, filter: string = 'all', search: string = ''): Observable<ValidatedUsersResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('size', size.toString())
      .set('filter', filter);

    if (search.trim()) {
      params = params.set('search', search.trim());
    }

    return this.http.get<ValidatedUsersResponse>(`${this.baseUrl}/${id}/validated_users`, { params });
  }

  /**
   * Actualizar campos de un TempImportUser (edición inline)
   */
  updateTempUser(importId: number, tempUserId: number, fields: Record<string, string>): Observable<TempImportUser> {
    return this.http.patch<TempImportUser>(`${this.baseUrl}/${importId}/temp_users/${tempUserId}`, fields);
  }

  /**
   * Eliminar un TempImportUser
   */
  deleteTempUser(importId: number, tempUserId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${importId}/temp_users/${tempUserId}`);
  }

  /**
   * Re-validar todos los TempImportUsers de un import.
   * Resuelve errores cruzados (duplicados) después de editar/eliminar.
   */
  revalidateImport(importId: number): Observable<{ validCount: number; invalidCount: number }> {
    return this.http.post<{ validCount: number; invalidCount: number }>(`${this.baseUrl}/${importId}/revalidate`, {});
  }

  /**
   * Re-validar solo los TempImportUsers afectados tras editar/eliminar.
   * Mucho más rápido que revalidateImport — O(k) en vez de O(n).
   */
  revalidateAffected(importId: number, params: {
    tempUserId?: number;
    deletedPhone?: string;
    deletedEmail?: string;
  }): Observable<{ validCount: number; invalidCount: number }> {
    return this.http.post<{ validCount: number; invalidCount: number }>(
      `${this.baseUrl}/${importId}/revalidate_affected`, params);
  }

  /**
   * Aceptar columnas desconocidas como campos CRM
   * Phase D: Interactive column selection
   */
  acceptColumns(importId: number, columns: string[]): Observable<{ result: string; message: string }> {
    return this.http.post<{ result: string; message: string }>(
      `${this.baseUrl}/${importId}/accept_columns`,
      { columns }
    );
  }

  /**
   * Descargar archivo CSV original de una importación.
   * Usa HttpClient (con auth headers) y dispara descarga via blob URL.
   */
  downloadFile(id: number, filename?: string): void {
    this.http.get(`${this.baseUrl}/${id}/download`, { responseType: 'blob', observe: 'response' })
      .subscribe({
        next: (response) => {
          const blob = response.body;
          if (!blob) return;
          const downloadFilename = filename || `import_${id}.csv`;
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = downloadFilename;
          a.click();
          window.URL.revokeObjectURL(url);
        },
        error: (err) => console.error('Error downloading file:', err)
      });
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
   * Eliminar importación
   * PARIDAD: Rails Admin::ImportsController#destroy
   */
  deleteImport(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /**
   * Obtener errores de importación
   */
  getErrors(id: number): Observable<{ id: number; errors_text: string }> {
    return this.http.get<{ id: number; errors_text: string }>(`${this.baseUrl}/${id}/errors`);
  }

  // ========== Mapping Templates ==========

  /**
   * List mapping templates for the current client
   */
  getMappingTemplates(): Observable<MappingTemplate[]> {
    return this.http.get<MappingTemplate[]>(`${this.baseUrl}/mapping_templates`);
  }

  /**
   * Find a matching template for given CSV headers
   */
  findMatchingTemplate(headers: string[], isFoh: boolean = false): Observable<MatchTemplateResponse> {
    return this.http.post<MatchTemplateResponse>(
      `${this.baseUrl}/mapping_templates/match`,
      { headers, isFoh }
    );
  }

  /**
   * Save a new mapping template
   */
  saveMappingTemplate(name: string, isFoh: boolean, columnMapping: Record<string, string>, headers: string[]): Observable<{ result: string; template: MappingTemplate }> {
    return this.http.post<{ result: string; template: MappingTemplate }>(
      `${this.baseUrl}/mapping_templates`,
      { name, isFoh, columnMapping, headers }
    );
  }

  /**
   * Delete a mapping template
   */
  deleteMappingTemplate(templateId: number): Observable<{ result: string; message: string }> {
    return this.http.delete<{ result: string; message: string }>(`${this.baseUrl}/mapping_templates/${templateId}`);
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
