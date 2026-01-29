import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from '../services/loading.service';

/**
 * HTTP interceptor that manages global loading state
 * Tracks active requests and updates LoadingService
 */
export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  const loadingService = inject(LoadingService);

  // Skip loading indicator for certain requests
  const skipLoading = req.headers.has('X-Skip-Loading');

  if (skipLoading) {
    // Remove the header and proceed without loading indicator
    const headers = req.headers.delete('X-Skip-Loading');
    return next(req.clone({ headers }));
  }

  // Start loading
  loadingService.start();

  return next(req).pipe(
    finalize(() => {
      // Stop loading when request completes (success or error)
      loadingService.stop();
    })
  );
};
