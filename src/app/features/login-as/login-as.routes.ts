/**
 * Login As Module Routes
 * PARIDAD: Rails admin/users login_as routes
 */
import { Routes } from '@angular/router';

export const LOGIN_AS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./components/login-as/login-as.component').then(m => m.LoginAsComponent),
    title: 'Iniciar Sesión Como - MWS'
  }
];
