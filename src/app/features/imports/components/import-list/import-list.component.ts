/**
 * Import List Component
 * PARIDAD: Rails admin/imports/index.html.erb
 * Lista de importaciones con DataTable
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ImportService, Import, ImportStatus } from '../../../../core/services/import.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole, RoleUtils } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-import-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    PaginationComponent,
    ConfirmDialogComponent
  ],
  template: `
    <div class="import-list-container">
      <!-- Header - PARIDAD: Rails admin/imports/index.html.erb -->
      <div class="page-header">
        <div class="row">
          <div class="view-index-button-container">
            <div class="view-index-title-container">
              <h1>Lista de importaciones</h1>
            </div>
            @if (canCreateImport()) {
              <a routerLink="new" class="btn btn-secondary" [queryParams]="{import_type: 'users'}">
                <i class="ph ph-plus"></i>
                <span>Importar usuarios</span>
              </a>
            }
          </div>
        </div>
      </div>

      <!-- Content -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando importaciones..." />
      } @else if (imports().length === 0) {
        <app-empty-state
          icon="ph-upload"
          title="No hay importaciones"
          description="Aún no se han realizado importaciones"
        >
          @if (canCreateImport()) {
            <a routerLink="new" class="btn btn-secondary" [queryParams]="{import_type: 'users'}">
              <i class="ph ph-plus"></i>
              Importar usuarios
            </a>
          }
        </app-empty-state>
      } @else {
        <!-- Table - PARIDAD: Rails DataTable -->
        <div class="table-responsive">
          <table class="table table-striped table-bordered table-hover">
            <thead>
              <tr>
                @if (isSuperAdmin()) {
                  <th>Cliente</th>
                }
                <th>Fecha</th>
                <th>Usuario</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Archivo</th>
                <th>Total Registros</th>
                <th>Estado</th>
                <th class="no-sort"></th>
                <th class="no-sort"></th>
              </tr>
            </thead>
            <tbody>
              @for (importItem of imports(); track importItem.id) {
                <tr>
                  @if (isSuperAdmin()) {
                    <td>{{ importItem.clientName || '-' }}</td>
                  }
                  <td>{{ formatDate(importItem.createdAt) }}</td>
                  <td>{{ importItem.userName || '-' }}</td>
                  <td>{{ importItem.clientName || '-' }}</td>
                  <td>{{ getImportTypeLabel(importItem.importType) }}</td>
                  <td>
                    @if (importItem.importFileName) {
                      <a [href]="importItem.importFileUrl" target="_blank">
                        {{ importItem.importFileName }}
                      </a>
                    } @else {
                      -
                    }
                  </td>
                  <td>{{ importItem.totRecords || 0 }}</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusClass(importItem.status)">
                      {{ getStatusLabel(importItem.status) }}
                    </span>
                  </td>
                  <td>
                    <a [routerLink]="[importItem.id]" class="btn btn-sm btn-link" title="Ver">
                      <i class="ph ph-eye"></i>
                    </a>
                  </td>
                  <td>
                    @if (!isCompleted(importItem.status)) {
                      <button
                        class="btn btn-sm btn-link text-danger"
                        (click)="confirmDelete(importItem)"
                        title="Eliminar"
                      >
                        <i class="ph ph-trash"></i>
                      </button>
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="table-footer">
          <div class="records-info">
            Mostrando {{ startRecord() }} - {{ endRecord() }} de {{ totalRecords() }} importaciones
          </div>
          <app-pagination
            [currentPage]="currentPage()"
            [totalItems]="totalRecords()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 25, 50]"
            (pageChange)="onPageChange($event)"
            (pageSizeChange)="onPageSizeChange($event)"
          />
        </div>
      }

      <!-- Delete Confirmation Dialog -->
      @if (importToDelete()) {
        <app-confirm-dialog
          title="Eliminar Importación"
          message="¿Estás seguro de eliminar esta importación? Esta acción no se puede deshacer."
          confirmText="Eliminar"
          confirmClass="btn-danger"
          (confirm)="deleteImport()"
          (cancel)="importToDelete.set(null)"
        />
      }
    </div>
  `,
  styles: [`
    .import-list-container {
      padding: 24px;
    }

    /* Page Header - PARIDAD: Rails page-header */
    .page-header {
      margin-bottom: 24px;
    }

    .view-index-button-container {
      display: flex;
      align-items: center;
      gap: 20px;
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
    }

    .btn-secondary {
      background-color: var(--secondary-color, #6c757d);
      border-color: var(--secondary-color, #6c757d);
      color: white;

      &:hover {
        background-color: #5c636a;
        border-color: #565e64;
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
        color: var(--danger-color, #dc3545);
      }
    }

    .btn-sm {
      padding: 4px 8px;
      font-size: 12px;
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
      width: 40px;
      text-align: center;
    }

    /* Status Badge - PARIDAD: Rails status badges */
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
    }

    .badge-secondary {
      background: #e9ecef;
      color: #495057;
    }

    .badge-warning {
      background: #fff3cd;
      color: #856404;
    }

    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }

    .badge-danger {
      background: #fee2e2;
      color: #991b1b;
    }

    .badge-info {
      background: #dbeafe;
      color: #1e40af;
    }

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

    @media (max-width: 768px) {
      .import-list-container { padding: 16px; }
      .view-index-button-container { flex-direction: column; align-items: flex-start; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 800px; }
    }
  `]
})
export class ImportListComponent implements OnInit, OnDestroy {
  private importService = inject(ImportService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  imports = signal<(Import & { clientName?: string; importFileName?: string; importFileUrl?: string })[]>([]);
  totalRecords = signal(0);
  isLoading = signal(false);
  importToDelete = signal<Import | null>(null);

  // Pagination
  currentPage = signal(1);
  pageSize = signal(10);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()));

  // Computed
  startRecord = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  // Current user
  currentUser = this.authService.currentUser;

  ngOnInit(): void {
    this.loadImports();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadImports(): void {
    this.isLoading.set(true);

    this.importService.getImports(this.currentPage() - 1, this.pageSize()).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.imports.set(response.imports);
        this.totalRecords.set(response.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading imports:', err);
        this.toast.error('Error al cargar importaciones');
        this.isLoading.set(false);
      }
    });
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadImports();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadImports();
  }

  canCreateImport(): boolean {
    const user = this.currentUser();
    if (!user) return false;
    return RoleUtils.canManageUsers(user.role);
  }

  isSuperAdmin(): boolean {
    const user = this.currentUser();
    return user?.role === UserRole.SUPER_ADMIN;
  }

  isCompleted(status: ImportStatus): boolean {
    return status === 'status_completed';
  }

  confirmDelete(importItem: Import): void {
    this.importToDelete.set(importItem);
  }

  deleteImport(): void {
    const importItem = this.importToDelete();
    if (!importItem) return;

    this.importService.cancelImport(importItem.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.importToDelete.set(null);
        this.toast.success('Importación eliminada correctamente');
        this.loadImports();
      },
      error: (err) => {
        console.error('Error deleting import:', err);
        this.toast.error('Error al eliminar importación');
        this.importToDelete.set(null);
      }
    });
  }

  getStatusLabel(status: ImportStatus): string {
    return this.importService.getStatusLabel(status);
  }

  getStatusClass(status: ImportStatus): string {
    return this.importService.getStatusClass(status);
  }

  getImportTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      'users': 'Usuarios',
      'user': 'Usuarios',
      'prospects': 'Prospectos'
    };
    return labels[type?.toLowerCase()] || type || '-';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-PE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
