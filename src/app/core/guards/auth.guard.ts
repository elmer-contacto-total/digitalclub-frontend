import { inject } from '@angular/core';
import { Router, CanActivateFn, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Guard that protects routes requiring authentication
 * Redirects to login if user is not authenticated
 */
export const authGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  // Store the attempted URL for redirecting after login
  // Could be stored in a service if needed

  return router.createUrlTree(['/login']);
};

/**
 * Guard that prevents authenticated users from accessing public routes
 * Redirects to dashboard if user is already authenticated
 */
export const publicOnlyGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/app/dashboard']);
};

/**
 * Guard that checks if user requires password change
 * Redirects to temp password page if required
 */
export const tempPasswordGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.requiresPasswordChange()) {
    return router.createUrlTree(['/temp-password']);
  }

  return true;
};
