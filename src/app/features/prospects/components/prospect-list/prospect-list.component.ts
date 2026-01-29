/**
 * Prospect List Component
 * PARIDAD: Rails admin/prospects/index.html.erb
 * Lista de prospectos con DataTable
 */
import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { ProspectService, Prospect, ProspectStatus } from '../../../../core/services/prospect.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UserRole, RoleUtils } from '../../../../core/models/user.model';
import { LoadingSpinnerComponent } from '../../../../shared/components/loading-spinner/loading-spinner.component';
import { EmptyStateComponent } from '../../../../shared/components/empty-state/empty-state.component';
import { PaginationComponent } from '../../../../shared/components/pagination/pagination.component';
import { ConfirmDialogComponent } from '../../../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-prospect-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    FormsModule,
    LoadingSpinnerComponent,
    EmptyStateComponent,
    PaginationComponent,
    ConfirmDialogComponent
  ],
  template: `
    <div class="prospect-list-container">
      <!-- Header - PARIDAD: Rails admin/prospects/index.html.erb -->
      <div class="page-header">
        <div class="row">
          <div class="view-index-title-container col">
            <h1>Lista de prospectos</h1>
          </div>
          <div class="view-index-button-container col">
            @if (canCreateProspect()) {
              <a routerLink="new" class="btn btn-primary">
                <i class="ph ph-plus"></i>
                <span>Crear prospecto</span>
              </a>
            }
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-bar">
        <div class="search-box">
          <i class="ph ph-magnifying-glass"></i>
          <input
            type="text"
            placeholder="Buscar por nombre, teléfono..."
            [(ngModel)]="searchTerm"
            (input)="onSearch()"
          />
          @if (searchTerm()) {
            <button class="clear-search" (click)="clearSearch()">
              <i class="ph ph-x"></i>
            </button>
          }
        </div>

        <div class="filter-group">
          <select [(ngModel)]="statusFilter" (change)="onFilterChange()">
            <option value="">Todos los estados</option>
            <option value="active">Activo</option>
            <option value="inactive">Inactivo</option>
            <option value="pending">Pendiente</option>
          </select>
        </div>
      </div>

      <!-- Content -->
      @if (isLoading()) {
        <app-loading-spinner [overlay]="false" message="Cargando prospectos..." />
      } @else if (prospects().length === 0) {
        <app-empty-state
          icon="ph-users"
          title="No hay prospectos"
          [description]="searchTerm() ? 'No se encontraron prospectos con ese criterio' : 'Aún no hay prospectos registrados'"
        >
          @if (canCreateProspect() && !searchTerm()) {
            <a routerLink="new" class="btn btn-primary">
              <i class="ph ph-plus"></i>
              Crear primer prospecto
            </a>
          }
        </app-empty-state>
      } @else {
        <!-- Table - PARIDAD: Rails DataTable -->
        <div class="table-responsive">
          <table class="table table-striped table-bordered table-hover">
            <thead>
              <tr>
                <th>Manager</th>
                <th>Nombre</th>
                <th>Teléfono</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Convertido a Usuario</th>
                <th class="no-sort"></th>
                <th class="no-sort"></th>
                <th class="no-sort"></th>
              </tr>
            </thead>
            <tbody>
              @for (prospect of prospects(); track prospect.id) {
                <tr>
                  <td>{{ prospect.managerName || '-' }}</td>
                  <td>{{ prospect.name || '-' }}</td>
                  <td>{{ prospect.phone }}</td>
                  <td>{{ prospect.clientId }}</td>
                  <td>
                    <span class="badge" [ngClass]="getStatusClass(prospect.status)">
                      {{ getStatusLabel(prospect.status) }}
                    </span>
                  </td>
                  <td>
                    @if (prospect.upgradedToUser) {
                      <span class="badge badge-success">Sí</span>
                    } @else {
                      <span class="badge badge-secondary">No</span>
                    }
                  </td>
                  <td>
                    <a [routerLink]="[prospect.id]" class="btn btn-sm btn-link" title="Ver">
                      <i class="ph ph-eye"></i>
                    </a>
                  </td>
                  <td>
                    <a [routerLink]="[prospect.id, 'edit']" class="btn btn-sm btn-link" title="Editar">
                      <i class="ph ph-pencil"></i>
                    </a>
                  </td>
                  <td>
                    <button
                      class="btn btn-sm btn-link text-danger"
                      (click)="confirmDelete(prospect)"
                      title="Eliminar"
                    >
                      <i class="ph ph-trash"></i>
                    </button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="table-footer">
          <div class="records-info">
            Mostrando {{ startRecord() }} - {{ endRecord() }} de {{ totalRecords() }} prospectos
          </div>
          <app-pagination
            [currentPage]="currentPage()"
            [totalItems]="totalRecords()"
            [pageSize]="pageSize()"
            [pageSizeOptions]="[10, 20, 50]"
            (pageChange)="onPageChange($event)"
            (pageSizeChange)="onPageSizeChange($event)"
          />
        </div>
      }

      <!-- Delete Confirmation Dialog -->
      @if (prospectToDelete()) {
        <app-confirm-dialog
          title="Eliminar Prospecto"
          [message]="'¿Estás seguro de eliminar a ' + (prospectToDelete()?.name || 'este prospecto') + '? Esta acción no se puede deshacer.'"
          confirmText="Eliminar"
          confirmClass="btn-danger"
          (confirm)="deleteProspect()"
          (cancel)="prospectToDelete.set(null)"
        />
      }
    </div>
  `,
  styles: [`
    .prospect-list-container {
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
    }

    .view-index-title-container h1 {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 500;
      color: var(--text-primary, #212529);
    }

    .view-index-button-container {
      text-align: right;
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

    .btn-primary {
      background-color: var(--primary-color, #0d6efd);
      border-color: var(--primary-color, #0d6efd);
      color: white;

      &:hover {
        background-color: var(--primary-dark, #0b5ed7);
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

    /* Filters */
    .filters-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1;
      min-width: 200px;
      position: relative;

      i {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--text-secondary);
        font-size: 18px;
      }

      input {
        width: 100%;
        padding: 6px 36px 6px 40px;
        border: 1px solid var(--border-color, #ced4da);
        border-radius: 4px;
        font-size: 14px;

        &:focus {
          outline: none;
          border-color: var(--primary-color, #86b7fe);
          box-shadow: 0 0 0 0.25rem rgba(13, 110, 253, 0.25);
        }
      }

      .clear-search {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 4px;

        &:hover { color: var(--text-primary); }
      }
    }

    .filter-group {
      display: flex;
      gap: 12px;

      select {
        padding: 6px 12px;
        border: 1px solid var(--border-color, #ced4da);
        border-radius: 4px;
        font-size: 14px;
        background: white;
        cursor: pointer;

        &:focus {
          outline: none;
          border-color: var(--primary-color, #86b7fe);
        }
      }
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
    .badge-danger { background: #fee2e2; color: #991b1b; }
    .badge-warning { background: #fff3cd; color: #856404; }

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
      .prospect-list-container { padding: 16px; }
      .page-header .row { flex-direction: column; gap: 16px; }
      .view-index-button-container { text-align: left; }
      .filters-bar { flex-direction: column; }
      .search-box { min-width: 100%; }
      .table-responsive { overflow-x: auto; }
      .table { min-width: 800px; }
    }
  `]
})
export class ProspectListComponent implements OnInit, OnDestroy {
  private prospectService = inject(ProspectService);
  private authService = inject(AuthService);
  private toast = inject(ToastService);
  private destroy$ = new Subject<void>();

  // Data
  prospects = signal<Prospect[]>([]);
  totalRecords = signal(0);
  isLoading = signal(false);
  prospectToDelete = signal<Prospect | null>(null);

  // Filters
  searchTerm = signal('');
  statusFilter = '';

  // Pagination
  currentPage = signal(1);
  pageSize = signal(20);
  totalPages = computed(() => Math.ceil(this.totalRecords() / this.pageSize()));

  // Computed
  startRecord = computed(() => (this.currentPage() - 1) * this.pageSize() + 1);
  endRecord = computed(() => Math.min(this.currentPage() * this.pageSize(), this.totalRecords()));

  // Current user
  currentUser = this.authService.currentUser;

  private searchTimeout: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.loadProspects();
  }

  ngOnDestroy(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadProspects(): void {
    this.isLoading.set(true);

    this.prospectService.getProspects(
      this.currentPage() - 1,
      this.pageSize(),
      this.statusFilter || undefined,
      this.searchTerm() || undefined
    ).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: (response) => {
        this.prospects.set(response.prospects);
        this.totalRecords.set(response.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Error loading prospects:', err);
        this.toast.error('Error al cargar prospectos');
        this.isLoading.set(false);
      }
    });
  }

  onSearch(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }
    this.searchTimeout = setTimeout(() => {
      this.currentPage.set(1);
      this.loadProspects();
    }, 300);
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.currentPage.set(1);
    this.loadProspects();
  }

  onFilterChange(): void {
    this.currentPage.set(1);
    this.loadProspects();
  }

  onPageChange(page: number): void {
    this.currentPage.set(page);
    this.loadProspects();
  }

  onPageSizeChange(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(1);
    this.loadProspects();
  }

  canCreateProspect(): boolean {
    const user = this.currentUser();
    if (!user) return false;
    return RoleUtils.canManageUsers(user.role);
  }

  confirmDelete(prospect: Prospect): void {
    this.prospectToDelete.set(prospect);
  }

  deleteProspect(): void {
    const prospect = this.prospectToDelete();
    if (!prospect) return;

    this.prospectService.deleteProspect(prospect.id).pipe(
      takeUntil(this.destroy$)
    ).subscribe({
      next: () => {
        this.prospectToDelete.set(null);
        this.toast.success('Prospecto eliminado correctamente');
        this.loadProspects();
      },
      error: (err) => {
        console.error('Error deleting prospect:', err);
        this.toast.error('Error al eliminar prospecto');
        this.prospectToDelete.set(null);
      }
    });
  }

  getStatusLabel(status: ProspectStatus): string {
    return this.prospectService.getStatusLabel(status);
  }

  getStatusClass(status: ProspectStatus): string {
    return this.prospectService.getStatusClass(status);
  }
}
