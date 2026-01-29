/**
 * ImpersonationToolbarComponent
 * PARIDAD: Rails admin/shared/_admin_login_as_toolbar.html.erb
 *
 * Red toolbar shown when admin is impersonating another user.
 * Displays current user and "Volver" button to return to admin session.
 */
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LoginAsService } from '../../../core/services/login-as.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-impersonation-toolbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (loginAsService.isImpersonating()) {
      <div class="login-as-toolbar">
        <div class="container-fluid d-flex align-items-center justify-content-between">
          <div>
            <span class="me-2">
              <i class="bi bi-person-badge me-1"></i>
              Sesionado como <strong>{{ loginAsService.impersonationState().currentUserName }}</strong>
            </span>
            <span class="login-as-toolbar-cta">
              Haga click aquí para volver a su sesión admin
            </span>
          </div>
          <button
            type="button"
            class="btn btn-light btn-sm"
            (click)="returnToAdmin()"
            [disabled]="isReturning()">
            @if (isReturning()) {
              <span class="spinner-border spinner-border-sm me-1"></span>
            }
            <i class="bi bi-arrow-return-left me-1"></i>
            Volver
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    /* PARIDAD: Rails custom.scss .login-as-toolbar */
    .login-as-toolbar {
      position: relative;
      z-index: 1050;
      background-color: #F74747;
      color: #eee;
      padding: 10px 0;
    }

    .login-as-toolbar-cta {
      margin-left: 30px;
      opacity: 0.9;
      font-style: italic;
    }

    .btn-light {
      font-weight: 600;
    }
  `]
})
export class ImpersonationToolbarComponent {
  loginAsService = inject(LoginAsService);
  private toastService = inject(ToastService);

  isReturning = signal(false);

  returnToAdmin(): void {
    this.isReturning.set(true);

    this.loginAsService.returnFromImpersonation().subscribe({
      next: (response) => {
        if (response.result === 'success') {
          this.toastService.success('Sesión restaurada');
          // Reload to apply original session
          window.location.href = '/app/dashboard';
        } else {
          this.toastService.error('Error al volver a la sesión admin');
          this.isReturning.set(false);
        }
      },
      error: (error) => {
        console.error('Error returning from impersonation:', error);
        this.toastService.error('Error al volver a la sesión admin');
        this.isReturning.set(false);
      }
    });
  }
}
