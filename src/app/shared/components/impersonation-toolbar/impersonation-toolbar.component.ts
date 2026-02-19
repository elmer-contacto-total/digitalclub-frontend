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
        <i class="ph ph-user-switch"></i>
        <span class="toolbar-text">
          Sesionado como <strong>{{ loginAsService.impersonationState().currentUserName }}</strong>
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
    }
  `,
  styles: [`
    .impersonation-toolbar {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 36px;
      z-index: calc(var(--z-header, 1030) + 5);
      background: linear-gradient(135deg, #d32f2f, #e53935);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: var(--text-sm, 12px);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      padding: 0 16px;

      i {
        font-size: 16px;
        flex-shrink: 0;
      }
    }

    .toolbar-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      strong {
        font-weight: 600;
      }
    }

    .btn-return {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: 1px solid rgba(255, 255, 255, 0.4);
      border-radius: 4px;
      font-size: var(--text-sm, 12px);
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;

      &:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.3);
      }

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
      }

      i {
        font-size: 14px;
      }
    }

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
