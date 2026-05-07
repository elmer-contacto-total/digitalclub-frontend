import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { translateError } from './error-translations';

/**
 * Sanea mensajes de error que vienen del backend antes de mostrarlos al usuario.
 * El ToastService usa text binding (seguro), pero esto agrega defensa en profundidad
 * por si en el futuro alguien cambia a innerHTML, o si hay error toasts en otros
 * componentes que sí rendericen HTML. También trunca mensajes excesivamente largos.
 */
function sanitizeErrorMessage(raw: string): string {
  return String(raw ?? '')
    .replace(/<[^>]*>/g, '')   // remover tags HTML balanceados
    .replace(/[\r\n\t]/g, ' ')  // normalizar whitespace (evita header injection en logs)
    .substring(0, 500);          // truncar para evitar mensajes gigantes
}

/**
 * Error interceptor for handling HTTP errors.
 * NOTE: 401 errors are handled by auth.interceptor.ts with automatic token refresh.
 * This interceptor handles all other error codes.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toastService = inject(ToastService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'Ocurrió un error';
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
            // Si el backend devuelve un mensaje específico (ej: "No tiene acceso a este ticket"),
            // úsalo. Si no, mensaje genérico. Cubre IDORs y restricciones de ownership multi-tenant.
            if (error.error?.error) {
              errorMessage = translateError(error.error.error);
            } else if (error.error?.message) {
              errorMessage = translateError(error.error.message);
            } else {
              errorMessage = 'Acceso denegado. No tiene permiso para realizar esta acción.';
            }
            break;
          case 404:
            errorMessage = 'Recurso no encontrado.';
            break;
          case 400:
          case 422:
            // Validation / bad-request error - extract message from response
            if (error.error?.error) {
              errorMessage = translateError(error.error.error);
            } else if (error.error?.message) {
              errorMessage = translateError(error.error.message);
            } else {
              errorMessage = 'Error de validación. Verifique sus datos.';
            }
            break;
          case 500:
            errorMessage = 'Error del servidor. Por favor intente más tarde.';
            break;
          default:
            errorMessage = translateError(error.error?.error || error.error?.message || '') || `Error: ${error.status}`;
        }
      }

      // Sanitizar antes de mostrar al usuario (defensa en profundidad).
      const safeMessage = sanitizeErrorMessage(errorMessage);

      // Show toast notification (except for 401 which is handled by auth interceptor)
      if (showToast) {
        toastService.error(safeMessage);
      }

      return throwError(() => ({ ...error, message: safeMessage }));
    })
  );
};
