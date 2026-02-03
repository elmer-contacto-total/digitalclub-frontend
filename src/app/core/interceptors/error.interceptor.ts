import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

/**
 * Error interceptor for handling HTTP errors.
 * NOTE: 401 errors are handled by auth.interceptor.ts with automatic token refresh.
 * This interceptor handles all other error codes.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An error occurred';
      let showToast = true;

      if (error.error instanceof ErrorEvent) {
        // Client-side error
        errorMessage = error.error.message;
      } else {
        // Server-side error
        switch (error.status) {
          case 0:
            errorMessage = 'No se puede conectar al servidor. Verifique su conexión.';
            break;
          case 401:
            // 401 is handled by auth.interceptor.ts - do NOT handle here
            // Just pass through without showing toast
            showToast = false;
            break;
          case 403:
            errorMessage = 'Acceso denegado. No tiene permiso para realizar esta acción.';
            break;
          case 404:
            errorMessage = 'Recurso no encontrado.';
            break;
          case 422:
            // Validation error - extract message from response
            if (error.error?.error) {
              errorMessage = error.error.error;
            } else if (error.error?.message) {
              errorMessage = error.error.message;
            } else {
              errorMessage = 'Error de validación. Verifique sus datos.';
            }
            break;
          case 500:
            errorMessage = 'Error del servidor. Por favor intente más tarde.';
            break;
          default:
            errorMessage = error.error?.message || `Error: ${error.status}`;
        }
      }

      // Show toast notification (except for 401 which is handled by auth interceptor)
      if (showToast) {
        toastService.error(errorMessage);
      }

      return throwError(() => ({ ...error, message: errorMessage }));
    })
  );
};
