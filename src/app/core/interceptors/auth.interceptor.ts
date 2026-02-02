import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

const AUTH_TOKEN_KEY = 'holape_auth_token';
const USER_KEY = 'holape_current_user';
const REFRESH_TOKEN_KEY = 'holape_refresh_token';
const OTP_SESSION_KEY = 'holape_otp_session';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);

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
  const authReq = token
    ? req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // Handle 401 Unauthorized errors
      if (error.status === 401) {
        console.warn('[Auth] 401 Unauthorized - Sesión expirada');

        // Don't redirect if already on login page or making login request
        const isLoginRequest = req.url.includes('/prelogin') ||
                               req.url.includes('/verify_otp') ||
                               req.url.includes('/login');

        if (!isLoginRequest) {
          // Clear all auth data
          clearAuthData();

          // Redirect to login
          router.navigate(['/login'], {
            queryParams: { sessionExpired: 'true' }
          });
        }
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
