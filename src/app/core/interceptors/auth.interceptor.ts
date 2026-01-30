import { HttpInterceptorFn } from '@angular/common/http';

const AUTH_TOKEN_KEY = 'holape_auth_token';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Direct localStorage access - more reliable than inject in interceptors
  let token: string | null = null;

  try {
    token = localStorage.getItem(AUTH_TOKEN_KEY);

    // Validate token format (should be a JWT-like string)
    if (token && (token.startsWith('"') || token.length < 10)) {
      // Corrupted token - clear it
      console.warn('[Auth] Corrupted token detected, clearing...');
      localStorage.removeItem(AUTH_TOKEN_KEY);
      token = null;
    }
  } catch (e) {
    console.error('[Auth] Error reading token:', e);
    token = null;
  }

  if (token) {
    const authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    return next(authReq);
  }

  return next(req);
};
