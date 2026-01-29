/**
 * Bulk Message List Component
 * PARIDAD: Rails admin/bulk_messages/index.html.erb
 * Lista de mensajes masivos predefinidos
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { BulkMessageService, BulkMessage } from '../../../../core/services/bulk-message.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-bulk-message-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  template: `
    <div class="bulk-message-list-container">
      <!-- Header - PARIDAD: Rails admin/bulk_messages/index.html.erb -->
      <div class="page-header">
        <div class="row">
          <div class="view-index-title-container col">
            <h1>Lista de mensajes masivos</h1>
          </div>
          @if (canCreate()) {
            <div class="view-index-button-container col">
              <a routerLink="new" class="btn btn-primary">
                <i class="ph ph-plus"></i>
                <span>Crear Mensaje Masivo</span>
              </a>
            </div>
          }
        </div>
      </div>

      <!-- Content -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando mensajes..." />
      } @else if (bulkMessages().length === 0) {
        <app-empty-state
          icon="ph-megaphone"
          title="No hay mensajes masivos"
          description="Cree un mensaje masivo para campañas"
        >
          @if (canCreate()) {
            <a routerLink="new" class="btn btn-primary">
              <i class="ph ph-plus"></i>
              Crear Mensaje Masivo
            </a>
          }
        </app-empty-state>
      } @else {
        <!-- Table - PARIDAD: Rails DataTable -->
        <div class="table-responsive">
          <table class="table table-striped table-bordered table-hover">
            <thead>
              <tr>
                <th>Mensaje</th>
                @if (canEdit()) {
                  <th class="no-sort">Editar</th>
                  <th class="no-sort">Eliminar</th>
                } @else {
                  <th class="no-sort">Enviar</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (message of bulkMessages(); track message.id) {
                <tr>
                  <td class="message-cell">{{ message.message }}</td>
                  @if (canEdit()) {
                    <td class="action-cell">
                      <a [routerLink]="[message.id, 'edit']" class="btn btn-sm btn-link" title="Editar">
                        <i class="ph ph-pencil-simple"></i>
                      </a>
                    </td>
                    <td class="action-cell">
                      <button
                        type="button"
                        class="btn btn-sm btn-link text-danger"
                        (click)="confirmDelete(message)"
                        title="Eliminar"
                      >
                        <i class="ph ph-trash"></i>
                      </button>
                    </td>
                  } @else {
                    <td class="action-cell">
                      <button
                        type="button"
                        class="btn btn-sm btn-link"
                        (click)="sendMessage(message)"
                        title="Enviar"
                      >
                        <i class="ph ph-paper-plane-tilt"></i>
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Records count -->
        <div class="table-footer">
          <div class="records-info">
            {{ bulkMessages().length }} mensaje(s) masivo(s)
          </div>
        </div>
      }

      <!-- Delete Confirmation Modal -->
      @if (showDeleteModal()) {
        <div class="modal-backdrop" (click)="cancelDelete()"></div>
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h5 class="modal-title">Confirmar Eliminación</h5>
              <button type="button" class="btn-close" (click)="cancelDelete()"></button>
            </div>
            <div class="modal-body">
              <p>¿Está seguro que desea eliminar este mensaje masivo?</p>
              <p class="text-muted">{{ messageToDelete()?.message }}</p>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" (click)="cancelDelete()">
                Cancelar
              </button>
              <button
                type="button"
                class="btn btn-danger"
                (click)="deleteMessage()"
                [disabled]="isDeleting()"
              >
                @if (isDeleting()) {
                  <span class="spinner-border spinner-border-sm"></span>
                  Eliminando...
                } @else {
                  Eliminar
                }
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .bulk-message-list-container {
      padding: 24px;
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-header .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .view-index-title-container h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--text-primary, #212529);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border: 1px solid transparent;
      border-radius: 4px;
      font-size: 14px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;

      &:disabled {
        opacity: 0.65;
        cursor: not-allowed;
      }
    }

    .btn-primary {
      background-color: var(--primary-color, #0d6efd);
      border-color: var(--primary-color, #0d6efd);
      color: white;

      &:hover:not(:disabled) {
        background-color: var(--primary-dark, #0b5ed7);
      }
    }

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      border-color: var(--secondary-color, #6c757d);
      color: white;

      &:hover:not(:disabled) {
        background-color: #5c636a;
      }
    }

    .btn-danger {
      background-color: #dc3545;
      border-color: #dc3545;
      color: white;

      &:hover:not(:disabled) {
        background-color: #bb2d3b;
      }
    }

    .btn-link {
      background: none;
      border: none;
      color: var(--primary-color, #0d6efd);
      padding: 4px 8px;

      &:hover {
        text-decoration: underline;
      }

      &.text-danger {
        color: #dc3545;
      }
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: 12px;
    }

    .spinner-border-sm {
      width: 16px;
      height: 16px;
      border-width: 2px;
    }

    /* Table */
    .table-responsive {
      background: white;
      border-radius: 4px;
      overflow: auto;
    }

    .table {
      width: 100%;
      margin: 0;
      border-collapse: collapse;
      font-size: 14px;
    }

    .table th,
    .table td {
      padding: 12px;
      border: 1px solid var(--border-color, #dee2e6);
      vertical-align: middle;
    }

    .table thead th {
      background: var(--bg-light, #f8f9fa);
      font-weight: 600;
      color: var(--text-primary, #212529);
      text-align: left;
      white-space: nowrap;
    }

    .table-striped tbody tr:nth-of-type(odd) {
      background: rgba(0, 0, 0, 0.02);
    }

    .table-hover tbody tr:hover {
      background: rgba(0, 0, 0, 0.05);
    }

    .message-cell {
      max-width: 500px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .action-cell {
      width: 60px;
      text-align: center;
    }

    .no-sort {
      width: 60px;
      text-align: center;
    }

    .table-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      background: white;
      border: 1px solid var(--border-color, #dee2e6);
      border-top: none;
      font-size: 13px;
    }

    .records-info {
      color: var(--text-secondary, #6c757d);
    }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1040;
    }

    .modal-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 1050;
      width: 100%;
      max-width: 500px;
    }

    .modal-content {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border-color, #dee2e6);

      .modal-title {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 500;
      }

      .btn-close {
        background: none;
        border: none;
        font-size: 1.5rem;
        line-height: 1;
        cursor: pointer;
        opacity: 0.5;

        &:hover { opacity: 1; }
        &::before { content: '×'; }
      }
    }

    .modal-body {
      padding: 20px;

      p { margin: 0 0 8px 0; }
      .text-muted {
        color: var(--text-secondary, #6c757d);
        font-size: 14px;
      }
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 16px 20px;
      border-top: 1px solid var(--border-color, #dee2e6);
    }

    @media (max-width: 768px) {
      .bulk-message-list-container { padding: 16px; }
      .page-header .row { flex-direction: column; align-items: flex-start; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 400px; }
    }
  `]
})
export class BulkMessageListComponent implements OnInit, OnDestroy {
  private bulkMessageService = inject(BulkMessageService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  bulkMessages = signal<BulkMessage[]>([]);
  isLoading = signal(false);

  // Delete modal
  showDeleteModal = signal(false);
  messageToDelete = signal<BulkMessage | null>(null);
  isDeleting = signal(false);

  // Permissions
  canCreate = signal(false);
  canEdit = signal(false);

  ngOnInit(): void {
    this.checkPermissions();
    this.loadBulkMessages();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const user = this.authService.currentUser();
    if (user) {
      // PARIDAD: Rails current_user.admin? || current_user.staff? || current_user.manager_level_4? || current_user.agent?
      const canManage = user.role === UserRole.ADMIN ||
                        user.role === UserRole.SUPER_ADMIN ||
                        user.role === UserRole.STAFF ||
                        user.role === UserRole.MANAGER_LEVEL_4 ||
                        user.role === UserRole.AGENT;
      this.canCreate.set(canManage);
      // PARIDAD: Rails current_user.admin? || current_user.staff?
      this.canEdit.set(
        user.role === UserRole.ADMIN ||
        user.role === UserRole.SUPER_ADMIN ||
        user.role === UserRole.STAFF
      );
    }
  }

  loadBulkMessages(): void {
    this.isLoading.set(true);

    this.bulkMessageService.getBulkMessages().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.bulkMessages.set(response.bulk_messages || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading bulk messages:', err);
        this.toast.error('Error al cargar mensajes masivos');
        this.isLoading.set(false);
      }
    });
  }

  sendMessage(message: BulkMessage): void {
    // TODO: Implement send confirmation and action
    this.toast.info('Funcionalidad de envío en desarrollo');
  }

  confirmDelete(message: BulkMessage): void {
    this.messageToDelete.set(message);
    this.showDeleteModal.set(true);
  }

  cancelDelete(): void {
    this.showDeleteModal.set(false);
    this.messageToDelete.set(null);
  }

  deleteMessage(): void {
    const message = this.messageToDelete();
    if (!message) return;

    this.isDeleting.set(true);

    this.bulkMessageService.deleteBulkMessage(message.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.showDeleteModal.set(false);
        this.messageToDelete.set(null);
        this.toast.success('Mensaje masivo eliminado');
        this.loadBulkMessages();
      },
      error: (err) => {
        console.error('Error deleting bulk message:', err);
        this.isDeleting.set(false);
        this.toast.error('Error al eliminar mensaje');
      }
    });
  }
}
