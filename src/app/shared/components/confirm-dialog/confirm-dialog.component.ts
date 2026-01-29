import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ModalComponent } from '../modal/modal.component';

export type ConfirmDialogType = 'info' | 'warning' | 'danger';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, ModalComponent],
  template: `
    <app-modal
      [isOpen]="isOpen()"
      [title]="title()"
      [closable]="true"
      [closeOnBackdrop]="false"
      [showFooter]="false"
      size="sm"
      (closed)="onCancel()"
    >
      <div class="confirm-content">
        <div class="confirm-icon" [ngClass]="'confirm-icon-' + type()">
          <i class="ph {{ getIcon() }}"></i>
        </div>
        <p class="confirm-message">{{ message() }}</p>
      </div>

      <div modal-footer class="confirm-actions">
        <button type="button" class="btn btn-secondary" (click)="onCancel()">
          {{ cancelLabel() }}
        </button>
        <button
          type="button"
          class="btn"
          [ngClass]="getConfirmButtonClass()"
          [disabled]="isLoading()"
          (click)="onConfirm()"
        >
          @if (isLoading()) {
            <span class="spinner-sm"></span>
          }
          {{ confirmLabel() }}
        </button>
      </div>
    </app-modal>
  `,
  styles: [`
    .confirm-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: var(--space-2) 0;
    }

    .confirm-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      margin-bottom: var(--space-4);
      border-radius: var(--radius-full);

      i {
        font-size: 1.75rem;
      }

      &.confirm-icon-info {
        background: var(--info-subtle);
        i { color: var(--info-default); }
      }

      &.confirm-icon-warning {
        background: var(--warning-subtle);
        i { color: var(--warning-default); }
      }

      &.confirm-icon-danger {
        background: var(--error-subtle);
        i { color: var(--error-default); }
      }
    }

    .confirm-message {
      margin: 0;
      font-size: 0.9375rem;
      color: var(--fg-default);
      line-height: 1.5;
    }

    .confirm-actions {
      display: flex;
      justify-content: center;
      gap: var(--space-3);
      padding-top: var(--space-4);
    }

    .spinner-sm {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: var(--space-2);
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class ConfirmDialogComponent {
  isOpen = input<boolean>(false);
  title = input<string>('Confirmar');
  message = input<string>('¿Está seguro de realizar esta acción?');
  type = input<ConfirmDialogType>('warning');
  confirmLabel = input<string>('Confirmar');
  cancelLabel = input<string>('Cancelar');
  isLoading = input<boolean>(false);

  confirmed = output<void>();
  cancelled = output<void>();

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }

  getIcon(): string {
    const icons: Record<ConfirmDialogType, string> = {
      info: 'ph-info',
      warning: 'ph-warning',
      danger: 'ph-trash'
    };
    return icons[this.type()];
  }

  getConfirmButtonClass(): string {
    const classes: Record<ConfirmDialogType, string> = {
      info: 'btn-primary',
      warning: 'btn-warning',
      danger: 'btn-danger'
    };
    return classes[this.type()];
  }
}
