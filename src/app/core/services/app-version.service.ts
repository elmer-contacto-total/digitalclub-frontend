import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpEvent } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * App version model
 */
export interface AppVersion {
  id: number;
  version: string;
  downloadUrl: string;
  platform: string;
  releaseNotes: string | null;
  fileSize: number | null;
  sha256Hash: string | null;
  s3Key: string | null;
  mandatory: boolean;
  active: boolean;
  publishedAt: string;
  createdAt: string;
}

/**
 * Paginated response
 */
export interface PagedResponse<T> {
  data: T[];
  meta: {
    totalItems: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

/**
 * Create app version request
 */
export interface CreateAppVersionRequest {
  version: string;
  downloadUrl: string;
  platform?: string;
  releaseNotes?: string;
  fileSize?: number;
  sha256Hash?: string;
  s3Key?: string;
  mandatory?: boolean;
  active?: boolean;
  publishedAt?: string;
}

/**
 * Update app version request
 */
export interface UpdateAppVersionRequest {
  version?: string;
  downloadUrl?: string;
  platform?: string;
  releaseNotes?: string;
  fileSize?: number;
  sha256Hash?: string;
  s3Key?: string;
  mandatory?: boolean;
  active?: boolean;
  publishedAt?: string;
}

/**
 * Upload installer response
 */
export interface UploadInstallerResponse {
  s3Key: string;
  fileSize: number;
  fileName: string;
  downloadUrl: string;
}

/**
 * Service for managing app versions (admin)
 */
@Injectable({
  providedIn: 'root'
})
export class AppVersionService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/app/app_versions`;

  /**
   * Get paginated list of app versions
   */
  getVersions(params: {
    page?: number;
    pageSize?: number;
    platform?: string;
  } = {}): Observable<PagedResponse<AppVersion>> {
    let httpParams = new HttpParams();

    if (params.page) {
      httpParams = httpParams.set('page', params.page.toString());
    }
    if (params.pageSize) {
      httpParams = httpParams.set('pageSize', params.pageSize.toString());
    }
    if (params.platform) {
      httpParams = httpParams.set('platform', params.platform);
    }

    return this.http.get<PagedResponse<AppVersion>>(this.baseUrl, { params: httpParams });
  }

  /**
   * Get a single app version by ID
   */
  getVersion(id: number): Observable<AppVersion> {
    return this.http.get<AppVersion>(`${this.baseUrl}/${id}`);
  }

  /**
   * Create a new app version
   */
  createVersion(request: CreateAppVersionRequest): Observable<AppVersion> {
    return this.http.post<AppVersion>(this.baseUrl, request);
  }

  /**
   * Update an existing app version
   */
  updateVersion(id: number, request: UpdateAppVersionRequest): Observable<AppVersion> {
    return this.http.put<AppVersion>(`${this.baseUrl}/${id}`, request);
  }

  /**
   * Delete an app version
   */
  deleteVersion(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${id}`);
  }

  /**
   * Toggle active status
   */
  toggleActive(id: number): Observable<AppVersion> {
    return this.http.post<AppVersion>(`${this.baseUrl}/${id}/toggle_active`, {});
  }

  /**
   * Upload installer file to S3
   */
  uploadInstaller(file: File, platform: string): Observable<HttpEvent<UploadInstallerResponse>> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('platform', platform);

    return this.http.post<UploadInstallerResponse>(
      `${this.baseUrl}/upload_installer`,
      formData,
      { reportProgress: true, observe: 'events' }
    );
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes: number | null): string {
    if (!bytes) return '-';

    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
