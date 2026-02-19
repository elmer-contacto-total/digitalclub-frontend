import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';

const ERROR_TRANSLATIONS: Record<string, string> = {
  'Email already exists': 'El email ya está registrado',
  'Phone already exists': 'El teléfono ya está registrado',
  'Email is required': 'El email es requerido',
  'Invalid email format': 'Formato de email inválido',
  'Email must not exceed 255 characters': 'El email no debe exceder 255 caracteres',
  'First name is required': 'El nombre es requerido',
  'First name must be between 1 and 100 characters': 'El nombre debe tener entre 1 y 100 caracteres',
  'Last name is required': 'El apellido es requerido',
  'Last name must be between 1 and 100 characters': 'El apellido debe tener entre 1 y 100 caracteres',
  'Phone is required': 'El teléfono es requerido',
  'Invalid phone format': 'Formato de teléfono inválido',
  'Phone must not exceed 20 characters': 'El teléfono no debe exceder 20 caracteres',
  'Role is required': 'El rol es requerido',
  'Validation failed': 'Error de validación',
  'An unexpected error occurred': 'Ocurrió un error inesperado',
  'Access denied': 'Acceso denegado',
  'Failed to send password reset email': 'Error al enviar email de restablecimiento',
  'Current password is incorrect': 'La contraseña actual es incorrecta',
  'Invalid or expired reset token': 'Token de restablecimiento inválido o expirado',
  'Reset token has expired': 'El token de restablecimiento ha expirado',
  'Assigned user must be a manager or agent': 'El usuario asignado debe ser manager o agente',
};

function translateError(msg: string): string {
  return ERROR_TRANSLATIONS[msg] || msg;
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
            errorMessage = 'Acceso denegado. No tiene permiso para realizar esta acción.';
            break;
          case 404:
            errorMessage = 'Recurso no encontrado.';
            break;
          case 422:
            // Validation error - extract message from response
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
            errorMessage = translateError(error.error?.message || '') || `Error: ${error.status}`;
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
