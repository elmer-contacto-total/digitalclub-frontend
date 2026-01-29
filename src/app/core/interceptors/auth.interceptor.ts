import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { StorageService } from '../services/storage.service';

const AUTH_TOKEN_KEY = 'auth_token';
const STORAGE_PREFIX = 'holape_';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  let token: string | null = null;

  try {
    const storageService = inject(StorageService);
    token = storageService.getString(AUTH_TOKEN_KEY);
  } catch {
    // Fallback: direct localStorage access if inject fails
    token = localStorage.getItem(STORAGE_PREFIX + AUTH_TOKEN_KEY);
  }

  // Debug log (remove in production)
  if (!req.url.includes('/assets/')) {
    console.log('[Auth Interceptor]', {
      url: req.url,
      hasToken: !!token,
      tokenPreview: token ? `${token.substring(0, 20)}...` : 'none'
    });
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
