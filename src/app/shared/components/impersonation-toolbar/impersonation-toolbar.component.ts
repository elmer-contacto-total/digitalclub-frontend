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
      <div class="impersonation-toolbar">
        <div class="toolbar-content">
          <div class="toolbar-info">
            <i class="ph ph-user-switch"></i>
            <span class="toolbar-text">
              <strong>Modo de suplantación:</strong>
              Sesionado como <strong>{{ loginAsService.impersonationState().currentUserName }}</strong>
            </span>
          </div>
          <div class="toolbar-actions">
            <span class="toolbar-hint">
              Haga clic para volver a su sesión original
            </span>
            <button
              type="button"
              class="btn-return"
              (click)="returnToAdmin()"
              [disabled]="isReturning()">
              @if (isReturning()) {
                <i class="ph ph-spinner spinning"></i>
                Volviendo...
              } @else {
                <i class="ph ph-arrow-u-up-left"></i>
                Volver
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    /* PARIDAD: Rails custom.scss .login-as-toolbar */
    .impersonation-toolbar {
      position: relative;
      z-index: 1050;
      background: linear-gradient(135deg, #E53935, #F74747);
      color: white;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .toolbar-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 10px 24px;
      max-width: 100%;

      @media (max-width: 768px) {
        flex-direction: column;
        align-items: stretch;
        gap: 10px;
        padding: 12px 16px;
      }
    }

    .toolbar-info {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;

      i {
        font-size: 20px;
        flex-shrink: 0;
      }

      .toolbar-text {
        font-size: 14px;

        strong {
          font-weight: 600;
        }

        @media (max-width: 768px) {
          font-size: 13px;
        }
      }
    }

    .toolbar-actions {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;

      @media (max-width: 768px) {
        justify-content: space-between;
      }
    }

    .toolbar-hint {
      font-size: 13px;
      opacity: 0.9;
      font-style: italic;

      @media (max-width: 480px) {
        display: none;
      }
    }

    .btn-return {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 8px 16px;
      background: white;
      color: #E53935;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;

      &:hover:not(:disabled) {
        background: #f5f5f5;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }

      i {
        font-size: 16px;
      }
    }

    /* Animation */
    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .spinning {
      animation: spin 1s linear infinite;
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
          this.toastService.success('Sesión restaurada correctamente');
          // Reload to apply original session
          window.location.href = '/app/dashboard';
        } else {
          this.toastService.error('Error al volver a la sesión original');
          this.isReturning.set(false);
        }
      },
      error: (error) => {
        console.error('Error returning from impersonation:', error);
        this.toastService.error('Error al volver a la sesión original');
        this.isReturning.set(false);
      }
    });
  }
}
