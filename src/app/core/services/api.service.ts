import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ApiOptions {
  params?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  responseType?: 'json' | 'blob' | 'text';
}

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  /**
   * GET request
   */
  get<T>(endpoint: string, options?: ApiOptions): Observable<T> {
    const url = this.buildUrl(endpoint);
    const httpOptions = this.buildHttpOptions(options);

    if (options?.responseType === 'blob') {
      return this.http.get(url, { ...httpOptions, responseType: 'blob' }) as Observable<T>;
    }

    return this.http.get<T>(url, httpOptions);
  }

  /**
   * POST request
   */
  post<T>(endpoint: string, body?: unknown, options?: ApiOptions): Observable<T> {
    const url = this.buildUrl(endpoint);
    const httpOptions = this.buildHttpOptions(options);
    return this.http.post<T>(url, body, httpOptions);
  }

  /**
   * PUT request
   */
  put<T>(endpoint: string, body?: unknown, options?: ApiOptions): Observable<T> {
    const url = this.buildUrl(endpoint);
    const httpOptions = this.buildHttpOptions(options);
    return this.http.put<T>(url, body, httpOptions);
  }

  /**
   * PATCH request
   */
  patch<T>(endpoint: string, body?: unknown, options?: ApiOptions): Observable<T> {
    const url = this.buildUrl(endpoint);
    const httpOptions = this.buildHttpOptions(options);
    return this.http.patch<T>(url, body, httpOptions);
  }

  /**
   * DELETE request
   */
  delete<T>(endpoint: string, options?: ApiOptions): Observable<T> {
    const url = this.buildUrl(endpoint);
    const httpOptions = this.buildHttpOptions(options);
    return this.http.delete<T>(url, httpOptions);
  }

  /**
   * Upload file with FormData
   */
  upload<T>(endpoint: string, formData: FormData, options?: ApiOptions): Observable<T> {
    const url = this.buildUrl(endpoint);
    const httpOptions = this.buildHttpOptions(options);
    // Don't set Content-Type header for FormData - browser will set it with boundary
    return this.http.post<T>(url, formData, httpOptions);
  }

  /**
   * Download file as blob
   */
  download(endpoint: string, options?: ApiOptions): Observable<Blob> {
    const url = this.buildUrl(endpoint);
    const params = this.buildParams(options?.params);
    return this.http.get(url, {
      params,
      responseType: 'blob'
    });
  }

  /**
   * Build full URL
   */
  private buildUrl(endpoint: string): string {
    // If endpoint already starts with http, return as-is
    if (endpoint.startsWith('http')) {
      return endpoint;
    }
    // Ensure endpoint starts with /
    const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${this.baseUrl}${normalizedEndpoint}`;
  }

  /**
   * Build HTTP params from options
   */
  private buildParams(params?: Record<string, string | number | boolean | undefined>): HttpParams {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return httpParams;
  }

  /**
   * Build HTTP options
   */
  private buildHttpOptions(options?: ApiOptions): { params: HttpParams; headers?: HttpHeaders } {
    const result: { params: HttpParams; headers?: HttpHeaders } = {
      params: this.buildParams(options?.params)
    };

    if (options?.headers) {
      result.headers = new HttpHeaders(options.headers);
    }

    return result;
  }
}
