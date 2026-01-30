/**
 * Close Ticket Modal Component
 * Modal for selecting close type and adding notes when closing a ticket
 * PARIDAD RAILS: app/views/admin/messages/_close_ticket_modal.html.erb
 */
import { Component, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConversationCloseType } from '../../../../core/models/conversation.model';

@Component({
  selector: 'app-close-ticket-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="onOverlayClick($event)">
      <div class="modal-content">
        <!-- Header -->
        <div class="modal-header">
          <h3>Cerrar Ticket</h3>
          <button class="close-btn" (click)="close.emit()">
            <i class="ph ph-x"></i>
          </button>
        </div>

        <!-- Body -->
        <div class="modal-body">
          <p class="description">
            ¿Estás seguro que deseas cerrar el ticket <strong>#{{ ticketId() }}</strong>?
          </p>

          <!-- Close Type Selection -->
          @if (closeTypes().length > 0) {
            <div class="form-group">
              <label>Tipo de cierre <span class="required">*</span></label>
              <div class="close-type-options">
                @for (type of closeTypes(); track type.kpiName) {
                  <label class="radio-option" [class.selected]="selectedCloseType() === type.kpiName">
                    <input
                      type="radio"
                      name="closeType"
                      [value]="type.kpiName"
                      [(ngModel)]="selectedCloseTypeValue"
                      (ngModelChange)="selectedCloseType.set($event)"
                    />
                    <span class="radio-label">{{ type.name }}</span>
                  </label>
                }
              </div>
            </div>
          }

          <!-- Notes -->
          <div class="form-group">
            <label>Notas (opcional)</label>
            <textarea
              class="notes-input"
              placeholder="Agregar notas sobre el cierre..."
              [(ngModel)]="notes"
              rows="3"
            ></textarea>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button class="btn-secondary" (click)="close.emit()">
            Cancelar
          </button>
          <button
            class="btn-danger"
            [disabled]="!canConfirm()"
            (click)="confirmClose()"
          >
            <i class="ph-fill ph-check-circle"></i>
            Cerrar Ticket
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 450px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color, #e0e0e0);

      h3 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
      }

      .close-btn {
        width: 32px;
        height: 32px;
        border: none;
        background: transparent;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover {
          background: var(--bg-hover, #f5f5f5);
        }
      }
    }

    .modal-body {
      padding: 20px;
    }

    .description {
      margin: 0 0 20px 0;
      font-size: 14px;
      color: var(--text-primary, #333);

      strong {
        color: var(--primary-dark, #128c7e);
      }
    }

    .form-group {
      margin-bottom: 16px;

      label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary, #333);
        margin-bottom: 8px;

        .required {
          color: var(--danger-color, #f44336);
        }
      }
    }

    .close-type-options {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .radio-option {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;

      &:hover {
        border-color: var(--primary-color, #25d366);
      }

      &.selected {
        border-color: var(--primary-color, #25d366);
        background: var(--primary-light, #e8f5e9);
      }

      input[type="radio"] {
        display: none;
      }

      .radio-label {
        font-size: 13px;
        color: var(--text-primary, #333);
      }
    }

    .notes-input {
      width: 100%;
      padding: 12px;
      border: 1px solid var(--border-color, #e0e0e0);
      border-radius: 8px;
      font-size: 14px;
      font-family: inherit;
      resize: vertical;
      outline: none;

      &:focus {
        border-color: var(--primary-color, #25d366);
      }

      &::placeholder {
        color: var(--text-muted, #999);
      }
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 16px 20px;
      border-top: 1px solid var(--border-color, #e0e0e0);
    }

    .btn-secondary,
    .btn-danger {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-secondary {
      background: white;
      border: 1px solid var(--border-color, #e0e0e0);
      color: var(--text-primary, #333);

      &:hover {
        background: var(--bg-hover, #f5f5f5);
      }
    }

    .btn-danger {
      background: var(--success-color, #4caf50);
      border: none;
      color: white;

      &:hover:not(:disabled) {
        background: var(--success-dark, #388e3c);
      }

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  `]
})
export class CloseTicketModalComponent {
  // Inputs
  ticketId = input.required<number>();
  closeTypes = input<ConversationCloseType[]>([]);

  // Outputs
  close = output<void>();
  confirm = output<{ closeType?: string; notes?: string }>();

  // State
  selectedCloseType = signal<string | null>(null);
  selectedCloseTypeValue: string | null = null;
  notes = '';

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.close.emit();
    }
  }

  canConfirm(): boolean {
    // If close types are required, one must be selected
    if (this.closeTypes().length > 0) {
      return this.selectedCloseType() !== null;
    }
    return true;
  }

  confirmClose(): void {
    if (!this.canConfirm()) return;

    this.confirm.emit({
      closeType: this.selectedCloseType() || undefined,
      notes: this.notes.trim() || undefined
    });
  }
}
