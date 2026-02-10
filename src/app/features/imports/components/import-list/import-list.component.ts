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
    <div class="imports-page">
      <!-- Header -->
      <div class="page-header">
        <div class="page-header-left">
          <h1 class="page-title">Importaciones</h1>
          <p class="page-subtitle">Gestión de importaciones masivas de usuarios</p>
        </div>
        @if (canCreateImport()) {
          <div class="page-actions">
            <a routerLink="new" class="btn-primary" [queryParams]="{import_type: 'users'}">
              <i class="ph ph-plus"></i>
              Nueva importación
            </a>
          </div>
        }
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
            <a routerLink="new" class="btn-primary" [queryParams]="{import_type: 'users'}">
              <i class="ph ph-plus"></i>
              Importar usuarios
            </a>
          }
        </app-empty-state>
      } @else {
        <!-- Table Card -->
        <div class="table-card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Usuario</th>
                @if (isSuperAdmin()) {
                  <th>Cliente</th>
                }
                <th>Tipo</th>
                <th>Archivo</th>
                <th class="text-right">Registros</th>
                <th>Estado</th>
                <th class="col-actions"></th>
              </tr>
            </thead>
            <tbody>
              @for (importItem of imports(); track importItem.id) {
                <tr>
                  <td class="text-nowrap">{{ formatDate(importItem.createdAt) }}</td>
                  <td>{{ importItem.userName || '-' }}</td>
                  @if (isSuperAdmin()) {
                    <td>{{ importItem.clientName || '-' }}</td>
                  }
                  <td>
                    <span class="type-tag">{{ getImportTypeLabel(importItem.importType) }}</span>
                  </td>
                  <td>
                    @if (importItem.importFileName) {
                      <a [href]="importItem.importFileUrl" target="_blank" class="file-link">
                        <i class="ph ph-file-csv"></i>
                        {{ importItem.importFileName }}
                      </a>
                    } @else {
                      <span class="text-subtle">-</span>
                    }
                  </td>
                  <td class="text-right">{{ importItem.totRecords || 0 }}</td>
                  <td>
                    <span class="status-badge" [ngClass]="getStatusClass(importItem.status)">
                      {{ getStatusLabel(importItem.status) }}
                    </span>
                  </td>
                  <td class="col-actions">
                    <div class="row-actions">
                      <a [routerLink]="[importItem.id]" class="action-btn" title="Ver detalle">
                        <i class="ph ph-eye"></i>
                      </a>
                      @if (!isCompleted(importItem.status)) {
                        <button class="action-btn action-btn-danger" (click)="confirmDelete(importItem)" title="Eliminar">
                          <i class="ph ph-trash"></i>
                        </button>
                      }
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>

          <!-- Table Footer -->
          <div class="table-footer">
            <span class="records-info">
              Mostrando {{ startRecord() }}-{{ endRecord() }} de {{ totalRecords() }}
            </span>
            <app-pagination
              [currentPage]="currentPage()"
              [totalItems]="totalRecords()"
              [pageSize]="pageSize()"
              [pageSizeOptions]="[10, 25, 50]"
              (pageChange)="onPageChange($event)"
              (pageSizeChange)="onPageSizeChange($event)"
            />
          </div>
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
    .imports-page {
      padding: var(--space-6);
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Page Header */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: var(--space-6);
      gap: var(--space-4);
    }

    .page-title {
      margin: 0;
      font-size: var(--text-2xl);
      font-weight: var(--font-semibold);
      color: var(--fg-default);
    }

    .page-subtitle {
      margin: var(--space-1) 0 0;
      font-size: var(--text-sm);
      color: var(--fg-muted);
    }

    .page-actions {
      flex-shrink: 0;
    }

    /* Buttons */
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2) var(--space-4);
      height: var(--btn-height);
      background: var(--accent-default);
      color: #fff;
      border: none;
      border-radius: var(--radius-md);
      font-size: var(--text-base);
      font-weight: var(--font-medium);
      cursor: pointer;
      text-decoration: none;
      transition: background var(--duration-fast);

      &:hover { background: var(--accent-emphasis); }
    }

    /* Table Card */
    .table-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: var(--radius-lg);
      overflow: hidden;
    }

    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: var(--text-base);
    }

    .data-table thead th {
      padding: var(--space-3) var(--space-4);
      background: var(--table-header-bg);
      color: var(--fg-muted);
      font-size: var(--text-sm);
      font-weight: var(--font-semibold);
      text-transform: uppercase;
      letter-spacing: 0.3px;
      text-align: left;
      white-space: nowrap;
      border-bottom: 1px solid var(--table-border);
    }

    .data-table tbody td {
      padding: var(--space-3) var(--space-4);
      color: var(--fg-default);
      border-bottom: 1px solid var(--table-border);
      vertical-align: middle;
    }

    .data-table tbody tr {
      transition: background var(--duration-fast);
    }

    .data-table tbody tr:hover {
      background: var(--table-row-hover);
    }

    .data-table tbody tr:last-child td {
      border-bottom: none;
    }

    .text-right { text-align: right; }
    .text-nowrap { white-space: nowrap; }
    .text-subtle { color: var(--fg-subtle); }

    .col-actions {
      width: 80px;
      text-align: center;
    }

    /* Type Tag */
    .type-tag {
      display: inline-block;
      padding: 2px var(--space-2);
      background: var(--bg-muted);
      color: var(--fg-muted);
      border-radius: var(--radius-sm);
      font-size: var(--text-sm);
    }

    /* File Link */
    .file-link {
      display: inline-flex;
      align-items: center;
      gap: var(--space-1);
      color: var(--accent-default);
      text-decoration: none;
      font-size: var(--text-sm);

      &:hover { text-decoration: underline; }

      i { font-size: 16px; }
    }

    /* Status Badge */
    .status-badge {
      display: inline-flex;
      align-items: center;
      padding: 2px var(--space-3);
      border-radius: var(--radius-full);
      font-size: var(--text-xs);
      font-weight: var(--font-medium);
      white-space: nowrap;
    }

    .badge-secondary { background: var(--bg-muted); color: var(--fg-muted); }
    .badge-warning { background: var(--warning-subtle); color: var(--warning-text); }
    .badge-success { background: var(--success-subtle); color: var(--success-text); }
    .badge-danger { background: var(--error-subtle); color: var(--error-text); }
    .badge-info { background: var(--info-subtle); color: var(--info-text); }

    /* Row Actions */
    .row-actions {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
    }

    .action-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--fg-muted);
      cursor: pointer;
      text-decoration: none;
      transition: all var(--duration-fast);

      &:hover {
        background: var(--bg-muted);
        color: var(--fg-default);
      }

      i { font-size: 18px; }
    }

    .action-btn-danger:hover {
      background: var(--error-subtle);
      color: var(--error-default);
    }

    /* Table Footer */
    .table-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--space-3) var(--space-4);
      border-top: 1px solid var(--table-border);
    }

    .records-info {
      font-size: var(--text-sm);
      color: var(--fg-subtle);
    }

    @media (max-width: 768px) {
      .imports-page { padding: var(--space-4); }
      .page-header { flex-direction: column; }
      .table-card { overflow-x: auto; }
      .data-table { min-width: 700px; }
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
