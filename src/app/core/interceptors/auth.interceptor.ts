import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { BehaviorSubject, Observable, throwError } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

const AUTH_TOKEN_KEY = 'holape_auth_token';
const USER_KEY = 'holape_current_user';
const REFRESH_TOKEN_KEY = 'holape_refresh_token';
const OTP_SESSION_KEY = 'holape_otp_session';

// Shared state for coordinating refresh across requests
let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

/**
 * URLs that should not trigger token refresh on 401
 */
const SKIP_REFRESH_URLS = [
  '/prelogin',
  '/verify_otp',
  '/login',
  '/auth/refresh',
  '/auth/logout',
  '/password/forgot',
  '/password/reset'
];

/**
 * Check if request URL should skip refresh logic
 */
function shouldSkipRefresh(url: string): boolean {
  return SKIP_REFRESH_URLS.some(skipUrl => url.includes(skipUrl));
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);

  // Direct localStorage access - more reliable than inject in interceptors
  let token: string | null = null;

  try {
    token = localStorage.getItem(AUTH_TOKEN_KEY);

    // Validate token format (should be a JWT-like string)
    if (token && (token.startsWith('"') || token.length < 10)) {
      // Corrupted token - clear it
      console.warn('[Auth] Corrupted token detected, clearing...');
      clearAuthData();
      token = null;
    }
  } catch (e) {
    console.error('[Auth] Error reading token:', e);
    token = null;
  }

  // Clone request with auth header if token exists
  const authReq = addTokenToRequest(req, token);

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle 401 Unauthorized errors
      if (error.status === 401) {
        return handle401Error(req, next, authService, token);
      }

      // Handle 403 Forbidden errors
      if (error.status === 403) {
        console.warn('[Auth] 403 Forbidden - Acceso denegado');
      }

      return throwError(() => error);
    })
  );
};

/**
 * Add token to request headers
 */
function addTokenToRequest(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  if (!token) {
    return req;
  }

  return req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });
}

/**
 * Handle 401 Unauthorized errors with automatic token refresh
 */
function handle401Error(
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
  authService: AuthService,
  currentToken: string | null
): Observable<any> {
  // Don't attempt refresh for auth-related requests
  if (shouldSkipRefresh(req.url)) {
    console.warn('[Auth] 401 on auth request - not refreshing');
    return throwError(() => new HttpErrorResponse({
      error: 'Unauthorized',
      status: 401,
      statusText: 'Unauthorized'
    }));
  }

  // If not currently refreshing, initiate refresh
  if (!isRefreshing) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    console.log('[Auth] 401 received - attempting token refresh');

    return authService.refreshToken().pipe(
      switchMap((success: boolean) => {
        isRefreshing = false;

        if (success) {
          // Get new token and retry the request
          const newToken = localStorage.getItem(AUTH_TOKEN_KEY);
          refreshTokenSubject.next(newToken);
          console.log('[Auth] Token refresh successful - retrying request');

          // Notify Electron of refreshed token
          if (newToken && (window as any).electronAPI?.setAuthToken) {
            (window as any).electronAPI.setAuthToken(newToken);
          }

          return next(addTokenToRequest(req, newToken));
        } else {
          // Refresh failed - logout and redirect
          console.warn('[Auth] Token refresh failed - logging out');
          refreshTokenSubject.next('');
          authService.forceLogout(true);
          return throwError(() => new HttpErrorResponse({
            error: 'Session expired',
            status: 401,
            statusText: 'Unauthorized'
          }));
        }
      }),
      catchError((refreshError) => {
        isRefreshing = false;
        refreshTokenSubject.next('');
        console.error('[Auth] Token refresh error:', refreshError);
        authService.forceLogout(true);
        return throwError(() => refreshError);
      })
    );
  }

  // If refresh is already in progress, wait for it to complete
  return refreshTokenSubject.pipe(
    filter(token => token !== null),
    take(1),
    switchMap(token => {
      if (token === '') {
        // Refresh failed - propagate error
        return throwError(() => new HttpErrorResponse({
          error: 'Session expired',
          status: 401,
          statusText: 'Unauthorized'
        }));
      }
      // Retry with new token
      return next(addTokenToRequest(req, token));
    })
  );
}

/**
 * Clear all authentication data from localStorage
 */
function clearAuthData(): void {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(OTP_SESSION_KEY);
    console.log('[Auth] Auth data cleared');
  } catch (e) {
    console.error('[Auth] Error clearing auth data:', e);
  }
}
