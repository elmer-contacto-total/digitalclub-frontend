import { Routes } from '@angular/router';
import { publicOnlyGuard, authGuard } from '../../core/guards/auth.guard';

export const AUTH_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent),
    canActivate: [publicOnlyGuard],
    title: 'Iniciar Sesión - MWS'
  },
  {
    path: 'verify-otp',
    loadComponent: () => import('./otp-verification/otp-verification.component').then(m => m.OtpVerificationComponent),
    canActivate: [publicOnlyGuard],
    title: 'Verificar Código - MWS'
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
    canActivate: [publicOnlyGuard],
    title: 'Recuperar Contraseña - MWS'
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./reset-password/reset-password.component').then(m => m.ResetPasswordComponent),
    canActivate: [publicOnlyGuard],
    title: 'Restablecer Contraseña - MWS'
  },
  {
    path: 'change-password',
    loadComponent: () => import('./change-password/change-password.component').then(m => m.ChangePasswordComponent),
    canActivate: [authGuard],
    title: 'Cambiar Contraseña - MWS'
  }
];
