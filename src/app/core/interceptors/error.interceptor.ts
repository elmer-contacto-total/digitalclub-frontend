import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../services/toast.service';
import { StorageService } from '../services/storage.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const toastService = inject(ToastService);
  const storageService = inject(StorageService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let errorMessage = 'An error occurred';

      if (error.error instanceof ErrorEvent) {
        // Client-side error
        errorMessage = error.error.message;
      } else {
        // Server-side error
        switch (error.status) {
          case 0:
            errorMessage = 'Unable to connect to server. Please check your connection.';
            break;
          case 401:
            errorMessage = 'Session expired. Please login again.';
            // Clear auth data and redirect to login
            storageService.clear(); // Clear all holape_ prefixed data
            router.navigate(['/auth/login']);
            break;
          case 403:
            errorMessage = 'Access denied. You do not have permission to perform this action.';
            break;
          case 404:
            errorMessage = 'Resource not found.';
            break;
          case 422:
            // Validation error - extract message from response
            if (error.error?.error) {
              errorMessage = error.error.error;
            } else if (error.error?.message) {
              errorMessage = error.error.message;
            } else {
              errorMessage = 'Validation error. Please check your input.';
            }
            break;
          case 500:
            errorMessage = 'Server error. Please try again later.';
            break;
          default:
            errorMessage = error.error?.message || `Error: ${error.status}`;
        }
      }

      // Show toast notification (except for 401 which redirects)
      if (error.status !== 401) {
        toastService.error(errorMessage);
      }

      return throwError(() => ({ ...error, message: errorMessage }));
    })
  );
};
