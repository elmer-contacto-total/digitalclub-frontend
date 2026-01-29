/**
 * Canned Message List Component
 * PARIDAD: Rails admin/canned_messages/index.html.erb
 * Lista de mensajes enlatados (respuestas rápidas)
 */
import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CannedMessageService, CannedMessage } from '../../../../core/services/canned-message.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole, RoleUtils } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'app-canned-message-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    EmptyStateComponent
  ],
  template: `
    <div class="canned-message-list-container">
      <!-- Header - PARIDAD: Rails admin/canned_messages/index.html.erb -->
      <div class="page-header">
        <div class="row">
          <div class="view-index-title-container col">
            <h1>Lista de mensajes enlatados</h1>
          </div>
          @if (canCreate()) {
            <div class="view-index-button-container col">
              <a routerLink="new" class="btn btn-primary">
                <i class="ph ph-plus"></i>
                <span>Crear mensaje enlatado</span>
              </a>
            </div>
          }
        </div>
      </div>

      <!-- Content -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando mensajes..." />
      } @else if (cannedMessages().length === 0) {
        <app-empty-state
          icon="ph-chat-centered-text"
          title="No hay mensajes enlatados"
          description="Cree un mensaje enlatado para respuestas rápidas"
        >
          @if (canCreate()) {
            <a routerLink="new" class="btn btn-primary">
              <i class="ph ph-plus"></i>
              Crear mensaje enlatado
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
                <th>Disponible para Todos</th>
                @if (canEdit()) {
                  <th class="no-sort">Editar</th>
                  <th class="no-sort">Eliminar</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (message of cannedMessages(); track message.id) {
                <tr>
                  <td>{{ message.message }}</td>
                  <td>
                    <span class="badge" [class.badge-success]="message.client_global" [class.badge-secondary]="!message.client_global">
                      {{ message.client_global ? 'Sí' : 'No' }}
                    </span>
                  </td>
                  @if (canEdit()) {
                    <td class="dt-body-nowrap">
                      <a [routerLink]="[message.id, 'edit']" class="btn btn-sm btn-link">
                        Editar
                      </a>
                    </td>
                    <td>
                      <button
                        type="button"
                        class="btn btn-sm btn-link text-danger"
                        (click)="confirmDelete(message)"
                      >
                        Eliminar
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
            {{ cannedMessages().length }} mensaje(s) enlatado(s)
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
              <p>¿Está seguro que desea eliminar este mensaje enlatado?</p>
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
    .canned-message-list-container {
      padding: 24px;
    }

    /* Page Header - PARIDAD: Rails page-header */
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

    /* Table - PARIDAD: Rails DataTable */
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

    .no-sort {
      width: 80px;
      text-align: center;
    }

    .dt-body-nowrap {
      white-space: nowrap;
    }

    /* Badge */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .badge-secondary { background: #e9ecef; color: #495057; }
    .badge-success { background: #d1fae5; color: #065f46; }

    /* Table Footer */
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

        &:hover {
          opacity: 1;
        }

        &::before {
          content: '×';
        }
      }
    }

    .modal-body {
      padding: 20px;

      p {
        margin: 0 0 8px 0;
      }

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
      .canned-message-list-container { padding: 16px; }
      .page-header .row { flex-direction: column; align-items: flex-start; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 500px; }
    }
  `]
})
export class CannedMessageListComponent implements OnInit, OnDestroy {
  private cannedMessageService = inject(CannedMessageService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  cannedMessages = signal<CannedMessage[]>([]);
  isLoading = signal(false);

  // Delete modal
  showDeleteModal = signal(false);
  messageToDelete = signal<CannedMessage | null>(null);
  isDeleting = signal(false);

  // Permissions - PARIDAD: Rails current_user.admin? || current_user.staff? || current_user.manager_level_4?
  canCreate = signal(false);
  canEdit = signal(false);

  ngOnInit(): void {
    this.checkPermissions();
    this.loadCannedMessages();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private checkPermissions(): void {
    const user = this.authService.currentUser();
    if (user) {
      // PARIDAD: Rails current_user.admin? || current_user.staff? || current_user.agent? || current_user.manager_level_4?
      const canManage = user.role === UserRole.ADMIN ||
                        user.role === UserRole.SUPER_ADMIN ||
                        user.role === UserRole.STAFF ||
                        user.role === UserRole.MANAGER_LEVEL_4 ||
                        user.role === UserRole.AGENT;
      this.canCreate.set(canManage);
      // PARIDAD: Rails current_user.admin? || current_user.staff? || current_user.manager_level_4?
      this.canEdit.set(
        user.role === UserRole.ADMIN ||
        user.role === UserRole.SUPER_ADMIN ||
        user.role === UserRole.STAFF ||
        user.role === UserRole.MANAGER_LEVEL_4
      );
    }
  }

  loadCannedMessages(): void {
    this.isLoading.set(true);

    this.cannedMessageService.getCannedMessages().pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.cannedMessages.set(response.canned_messages || []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading canned messages:', err);
        this.toast.error('Error al cargar mensajes enlatados');
        this.isLoading.set(false);
      }
    });
  }

  confirmDelete(message: CannedMessage): void {
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

    this.cannedMessageService.deleteCannedMessage(message.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.showDeleteModal.set(false);
        this.messageToDelete.set(null);
        this.toast.success('Mensaje enlatado eliminado');
        this.loadCannedMessages();
      },
      error: (err) => {
        console.error('Error deleting canned message:', err);
        this.isDeleting.set(false);
        this.toast.error('Error al eliminar mensaje');
      }
    });
  }
}
