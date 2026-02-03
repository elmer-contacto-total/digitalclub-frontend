import { inject } from '@angular/core';
import { Router, CanActivateFn, UrlTree, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole, RoleUtils } from '../models/user.model';
import { ToastService } from '../services/toast.service';

/**
 * Guard factory that creates a guard for specific roles
 * Usage in routes:
 * {
 *   path: 'admin',
 *   canActivate: [roleGuard([UserRole.SUPER_ADMIN, UserRole.ADMIN])]
 * }
 */
export function roleGuard(allowedRoles: UserRole[]): CanActivateFn {
  return (): boolean | UrlTree => {
    const authService = inject(AuthService);
    const router = inject(Router);
    const toast = inject(ToastService);

    if (!authService.isAuthenticated()) {
      return router.createUrlTree(['/login']);
    }

    const userRole = authService.userRole();

    if (userRole !== null && allowedRoles.includes(userRole)) {
      return true;
    }

    toast.error('No tiene permisos para acceder a esta sección');
    return router.createUrlTree(['/app/dashboard']);
  };
}

/**
 * Guard that requires admin role (SUPER_ADMIN or ADMIN)
 */
export const adminGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.isAdmin()) {
    return true;
  }

  toast.error('No tiene permisos para acceder a esta sección');
  return router.createUrlTree(['/app/dashboard']);
};

/**
 * Guard that requires super admin role
 */
export const superAdminGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.isSuperAdmin()) {
    return true;
  }

  toast.error('No tiene permisos para acceder a esta sección');
  return router.createUrlTree(['/app/dashboard']);
};

/**
 * Guard that requires internal user role (not STANDARD or WHATSAPP_BUSINESS)
 */
export const internalGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.isInternal()) {
    return true;
  }

  toast.error('No tiene permisos para acceder a esta sección');
  return router.createUrlTree(['/app/dashboard']);
};

/**
 * Guard that requires user management permissions
 */
export const canManageUsersGuard: CanActivateFn = (): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  if (authService.canManageUsers()) {
    return true;
  }

  toast.error('No tiene permisos para gestionar usuarios');
  return router.createUrlTree(['/app/dashboard']);
};

/**
 * Data-driven role guard using route data
 * Usage:
 * {
 *   path: 'users',
 *   canActivate: [dataRoleGuard],
 *   data: { roles: [UserRole.SUPER_ADMIN, UserRole.ADMIN] }
 * }
 */
export const dataRoleGuard: CanActivateFn = (route: ActivatedRouteSnapshot): boolean | UrlTree => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }

  const allowedRoles = route.data['roles'] as UserRole[] | undefined;

  if (!allowedRoles || allowedRoles.length === 0) {
    // No roles specified, allow access
    return true;
  }

  const userRole = authService.userRole();

  if (userRole !== null && allowedRoles.includes(userRole)) {
    return true;
  }

  toast.error('No tiene permisos para acceder a esta sección');
  return router.createUrlTree(['/app/dashboard']);
};
